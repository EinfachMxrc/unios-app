# SPDX-License-Identifier: AGPL-3.0-or-later

"""Synthetic exam changes are previewed, fenced and applied atomically."""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.cycles.repository import CycleRepository
from app.cycles.service import CycleService
from app.db.models import (
    CalendarEvent,
    Course,
    Exam,
    LearningTopic,
    StudyBlockSuggestion,
    StudyCycle,
)
from app.learning.blocks import _find_slot
from app.main import create_app
from app.timeutil import as_utc


def seed(factory):
    now = datetime.now(UTC).replace(microsecond=0)
    old = now + timedelta(days=12)
    new = now + timedelta(days=10)
    with factory() as session:
        course = Course(source="fixture", source_id="impact-course", name="Synthetische Analysis")
        session.add(course)
        session.flush()
        topic = LearningTopic(course_id=course.id, slug="impact", name="Synthetische Ableitungen")
        history_topic = LearningTopic(course_id=course.id, slug="impact-history", name="Synthetische Grundlagen")
        session.add_all([topic, history_topic])
        session.flush()
        exam = Exam(course_id=course.id, source_key="impact-exam", title="Synthetische Prüfung", exam_at=new)
        session.add(exam)
        session.flush()
        practice = StudyCycle(exam_id=exam.id, phase="practice", starts_at=now - timedelta(days=1),
                              ends_at=old - timedelta(days=3), exam_at_snapshot=old, topic_ids=[topic.id],
                              review_goal=7, attempt_goal=3, status="accepted")
        review = StudyCycle(exam_id=exam.id, phase="review", starts_at=old - timedelta(days=3),
                            ends_at=old, exam_at_snapshot=old, topic_ids=[topic.id], status="accepted")
        history = StudyCycle(exam_id=exam.id, phase="gaps", starts_at=now - timedelta(days=10),
                             ends_at=now - timedelta(days=2), exam_at_snapshot=old, topic_ids=[topic.id], status="accepted")
        block = StudyBlockSuggestion(exam_id=exam.id, topic_id=topic.id, starts_at=old - timedelta(days=1),
                                     duration_minutes=45, status="accepted")
        past_block = StudyBlockSuggestion(exam_id=exam.id, topic_id=history_topic.id,
                                          starts_at=now - timedelta(hours=1), duration_minutes=90, status="accepted")
        session.add_all([practice, review, history, block, past_block])
        session.commit()
        return {"now": now, "old": old, "new": new, "exam": exam.id, "cycle": practice.id,
                "review": review.id, "history": history.id, "block": block.id, "past_block": past_block.id,
                "topic": topic.id}


def plan_state(factory, ids):
    with factory() as session:
        cycle = session.get(StudyCycle, ids["cycle"])
        block = session.get(StudyBlockSuggestion, ids["block"])
        return (as_utc(cycle.starts_at), as_utc(cycle.ends_at), as_utc(cycle.exam_at_snapshot),
                as_utc(block.starts_at), block.duration_minutes, block.topic_id, block.exam_id)


def test_preview_does_not_write_and_explicit_confirm_preserves_official_exam_and_history(settings, factory, coordinator):
    ids = seed(factory)
    before = plan_state(factory, ids)
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        path = f"/api/learning/cycles/{ids['cycle']}/exam-impact"
        preview = client.get(path).json()
        assert preview["can_apply"] is True
        assert preview["history_count"] == 2
        assert len(preview["phases"]) == 2 and len(preview["blocks"]) == 1
        assert datetime.fromisoformat(preview["old_exam_at"]) == ids["old"]
        assert datetime.fromisoformat(preview["current_exam_at"]) == ids["new"]
        assert plan_state(factory, ids) == before
        response = client.post(path, json={"revision": preview["revision"], "planned_at": preview["planned_at"]})
        assert response.status_code == 200, response.text
        after = plan_state(factory, ids)
        assert after[0] == before[0]  # Already recorded work remains inside the started phase.
        assert after[1] == ids["new"] - timedelta(days=3)
        assert after[2] == ids["new"]
        assert after[3] != before[3] and after[3] > ids["now"]
        assert after[3] + timedelta(minutes=after[4]) <= ids["new"]
        assert after[4:] == before[4:]
        with factory() as session:
            assert as_utc(session.get(Exam, ids["exam"]).exam_at) == ids["new"]
            assert as_utc(session.get(StudyCycle, ids["history"]).ends_at) == ids["now"] - timedelta(days=2)
            assert as_utc(session.get(StudyCycle, ids["history"]).exam_at_snapshot) == ids["old"]
            assert as_utc(session.get(StudyBlockSuggestion, ids["past_block"]).starts_at) == ids["now"] - timedelta(hours=1)
        assert client.post(path, json={"revision": preview["revision"], "planned_at": preview["planned_at"]}).status_code == 409
        historical = client.get(f"/api/learning/cycles/{ids['history']}/exam-impact").json()
        assert historical["can_apply"] is False and "history_only" in historical["reasons"]


@pytest.mark.parametrize("change", ["exam", "block", "phase", "calendar"])
def test_changed_inputs_reject_a_stale_preview_without_partial_writes(settings, factory, coordinator, change):
    ids = seed(factory)
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        path = f"/api/learning/cycles/{ids['cycle']}/exam-impact"
        preview = client.get(path).json()
        with factory() as session:
            if change == "exam":
                session.get(Exam, ids["exam"]).exam_at += timedelta(days=1)
            elif change == "block":
                session.get(StudyBlockSuggestion, ids["block"]).duration_minutes = 75
            elif change == "phase":
                session.get(StudyCycle, ids["review"]).starts_at += timedelta(hours=1)
            else:
                start = datetime.fromisoformat(preview["blocks"][0]["new_starts_at"])
                session.add(CalendarEvent(source="calendar-personal", source_key="impact-busy", title="Synthetischer Termin",
                                          starts_at=start, ends_at=start + timedelta(hours=1)))
            session.commit()
        before = plan_state(factory, ids)
        response = client.post(path, json={"revision": preview["revision"], "planned_at": preview["planned_at"]})
        assert response.status_code == 409
        assert plan_state(factory, ids) == before


def test_no_slot_and_missing_date_leave_the_entire_accepted_plan_unchanged(settings, factory, coordinator):
    ids = seed(factory)
    with factory() as session:
        session.add(CalendarEvent(source="calendar-personal", source_key="all-busy", title="Synthetisch ausgebucht",
                                  starts_at=ids["now"], ends_at=ids["new"]))
        session.commit()
    before = plan_state(factory, ids)
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        path = f"/api/learning/cycles/{ids['cycle']}/exam-impact"
        preview = client.get(path).json()
        assert preview["can_apply"] is False and preview["reasons"] == ["no_slot"]
        assert preview["blocks"][0]["new_starts_at"] is None
        assert client.post(path, json={"revision": preview["revision"], "planned_at": preview["planned_at"]}).status_code == 409
        assert plan_state(factory, ids) == before
        with factory() as session:
            session.get(Exam, ids["exam"]).exam_at = None
            session.commit()
        preview = client.get(path).json()
        assert preview["can_apply"] is False and "undated" in preview["reasons"]
        assert plan_state(factory, ids) == before


def test_writer_loss_before_commit_rolls_back_all_changes(settings, factory):
    ids = seed(factory)
    service = CycleService(CycleRepository(factory), settings)
    preview = service.exam_impact(ids["cycle"])
    before = plan_state(factory, ids)
    calls = 0

    def writer():
        nonlocal calls
        calls += 1
        if calls == 2:
            raise RuntimeError("Synthetic writer lost")

    with pytest.raises(RuntimeError, match="Synthetic writer lost"):
        service.confirm_exam_impact(ids["cycle"], preview.planned_at, preview.revision, writer)
    assert calls == 2
    assert plan_state(factory, ids) == before


def test_expired_preview_and_invalid_confirmation_are_rejected(settings, factory, coordinator):
    ids = seed(factory)
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        path = f"/api/learning/cycles/{ids['cycle']}/exam-impact"
        preview = client.get(path).json()
        before = plan_state(factory, ids)
        for payload in [
            {"revision": preview["revision"], "planned_at": (ids["now"] - timedelta(minutes=11)).isoformat()},
            {"revision": preview["revision"], "planned_at": (ids["now"] + timedelta(hours=1)).isoformat()},
        ]:
            assert client.post(path, json=payload).status_code == 409
        assert client.post(path, json={"revision": preview["revision"], "planned_at": "2026-10-09T10:00:00"}).status_code == 422
        assert client.post(path, json={"revision": preview["revision"], "planned_at": preview["planned_at"], "exam_at": "forged"}).status_code == 422
        assert plan_state(factory, ids) == before


def test_two_confirmations_of_one_preview_commit_once(settings, factory):
    ids = seed(factory)
    service = CycleService(CycleRepository(factory), settings)
    preview = service.exam_impact(ids["cycle"])

    def confirm():
        try:
            service.confirm_exam_impact(ids["cycle"], preview.planned_at, preview.revision, lambda: None)
            return "applied"
        except ValueError:
            return "stale"

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: confirm(), range(2)))
    assert sorted(results) == ["applied", "stale"]


def test_a_block_must_end_before_the_exam_not_just_start_before_it(settings):
    now = datetime(2026, 10, 20, 8, tzinfo=UTC)
    day = now.astimezone(settings.timezone).date()
    exam = datetime(2026, 10, 20, 16, 30, tzinfo=UTC)  # 18:30 Berlin, evening candidate would run too long.
    slot = _find_slot(settings, day, now, exam, 60, [])
    assert slot is not None
    assert slot + timedelta(minutes=60) <= exam
    assert slot.astimezone(settings.timezone).hour == 16


def test_calendar_overlays_and_other_accepted_blocks_reserve_their_effective_time(settings, factory):
    ids = seed(factory)
    service = CycleService(CycleRepository(factory), settings)
    first = service.exam_impact(ids["cycle"])
    blocked = first.blocks[0].new_starts_at
    assert blocked is not None
    with factory() as session:
        session.add(CalendarEvent(source="fixture", source_key="original-slot", title="Synthetische Vorlesung",
                                  starts_at=ids["now"] + timedelta(days=1), ends_at=ids["now"] + timedelta(days=1, hours=1)))
        session.add(CalendarEvent(source="calendar-adjustment", source_key="fixture:original-slot", title="Synthetisch verschoben",
                                  starts_at=blocked, ends_at=blocked + timedelta(hours=1)))
        session.commit()
    moved = service.exam_impact(ids["cycle"])
    assert moved.blocks[0].new_starts_at != blocked
    other_slot = moved.blocks[0].new_starts_at
    assert other_slot is not None
    with factory() as session:
        course_id = session.get(LearningTopic, ids["topic"]).course_id
        topic = LearningTopic(course_id=course_id, slug="other-impact-slot", name="Andere synthetische Aufgabe")
        exam = Exam(course_id=topic.course_id, source_key="other-impact-exam", title="Andere synthetische Prüfung",
                    exam_at=ids["new"] + timedelta(days=3))
        session.add_all([topic, exam])
        session.flush()
        session.add(StudyBlockSuggestion(exam_id=exam.id, topic_id=topic.id, starts_at=other_slot,
                                         duration_minutes=90, status="accepted"))
        session.commit()
    final = service.exam_impact(ids["cycle"])
    assert final.blocks[0].new_starts_at not in {blocked, other_slot}


def test_an_elapsed_phase_blocks_partial_replanning(settings, factory, coordinator):
    ids = seed(factory)
    with factory() as session:
        session.get(Exam, ids["exam"]).exam_at = ids["now"] + timedelta(days=2)
        session.commit()
    before = plan_state(factory, ids)
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        path = f"/api/learning/cycles/{ids['cycle']}/exam-impact"
        preview = client.get(path).json()
        assert preview["can_apply"] is False
        assert "phase_elapsed" in preview["reasons"]
        assert client.post(path, json={"planned_at": preview["planned_at"], "revision": preview["revision"]}).status_code == 409
        assert plan_state(factory, ids) == before
