# SPDX-License-Identifier: AGPL-3.0-or-later

"""Study blocks are suggested only for weak topics ahead of a real exam, never duplicated."""

from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from sqlalchemy import select, update

from app.db.models import (
    AnkiCard,
    AnkiCardQueue,
    AnkiReview,
    CalendarEvent,
    Course,
    Exam,
    LearningTopic,
    Resource,
    ResourceVersion,
    StudyBlockSuggestion,
    utc_now,
)
from app.learning.blocks import suggest_blocks
from app.main import create_app
from app.timeutil import as_utc


def _course_with_weak_topic(factory) -> tuple[int, int, int]:
    with factory() as session:
        course = Course(source="fixture", source_id="c1", name="Programmieren")
        session.add(course)
        session.flush()
        topic = LearningTopic(course_id=course.id, slug="schleifen", name="Schleifen")
        session.add(topic)
        session.flush()
        proposal = AnkiCardQueue(status="approved", payload="{}", topic_id=topic.id)
        session.add(proposal)
        session.flush()
        card = AnkiCard(queue_id=proposal.id, note_id="note-1")
        session.add(card)
        session.flush()
        # 5 reviews, only 1 retained -> well below the 0.7 weak threshold, enough data to count.
        for index, rating in enumerate([1, 1, 1, 1, 3]):
            session.add(AnkiReview(card_id=card.id,
                                   reviewed_at=datetime(2026, 9, 1 + index, 9, tzinfo=UTC), rating=rating))
        exam = Exam(course_id=course.id, source_key="exam-1", title="Klausur Programmieren 1",
                    exam_at=datetime.now(UTC) + timedelta(days=5))
        session.add(exam)
        session.commit()
        return course.id, topic.id, exam.id


def test_weak_topic_gets_a_block_suggestion_and_it_reaches_ical(settings, factory, coordinator):
    _course_with_weak_topic(factory)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        blocks = client.get("/api/learning/blocks").json()
        assert len(blocks) == 1
        assert blocks[0]["topic"] == "Schleifen"
        assert blocks[0]["status"] == "proposed"
        assert blocks[0]["duration_minutes"] == settings.study_block_minutes

        # A second listing must not create a duplicate for the same exam/topic.
        again = client.get("/api/learning/blocks").json()
        assert len(again) == 1
        assert again[0]["id"] == blocks[0]["id"]

        before_accept = client.get("/calendar.ics").text
        assert "Lernblock" not in before_accept

        accepted = client.post(f"/api/learning/blocks/{blocks[0]['id']}/accept")
        assert accepted.status_code == 200, accepted.text
        assert accepted.json()["status"] == "accepted"

        after_accept = client.get("/calendar.ics").text
        assert "Lernblock: Schleifen" in after_accept

        assert client.post(f"/api/learning/blocks/{blocks[0]['id']}/accept").status_code == 409


def test_strong_topic_gets_no_block_suggestion(settings, factory, coordinator):
    with factory() as session:
        course = Course(source="fixture", source_id="c2", name="Mathematik")
        session.add(course)
        session.commit()
        course_id = course.id
    with factory() as session:
        session.add(Exam(course_id=course_id, source_key="exam-2", title="Klausur Mathe",
                         exam_at=datetime.now(UTC) + timedelta(days=3)))
        session.commit()
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.get("/api/learning/blocks").json() == []


def test_open_block_moves_with_exam_but_accepted_block_stays(settings, factory, coordinator):
    _course_id, _topic_id, exam_id = _course_with_weak_topic(factory)
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        first = client.get("/api/learning/blocks").json()[0]
        with factory() as session:
            session.get(Exam, exam_id).exam_at = datetime.now(UTC) + timedelta(days=3)
            session.commit()
        moved = client.get("/api/learning/blocks").json()[0]
        assert moved["id"] == first["id"]
        assert moved["starts_at"] != first["starts_at"]
        assert client.post(f"/api/learning/blocks/{first['id']}/accept").status_code == 200
        with factory() as session:
            session.get(Exam, exam_id).exam_at = datetime.now(UTC) + timedelta(days=2)
            session.commit()
        accepted = client.get("/api/learning/blocks").json()[0]
        assert accepted["starts_at"] == moved["starts_at"]


def test_new_past_paper_suggests_practice_for_a_strong_topic(settings, factory, coordinator):
    course_id, _topic_id, _exam_id = _course_with_weak_topic(factory)
    with factory() as session:
        session.execute(update(AnkiReview).values(rating=3))
        material = Resource(source="fixture", source_key="practice-exam", course_id=course_id,
                            kind="file", name="Altklausur Programmieren.pdf", url="")
        session.add(material)
        session.flush()
        version = ResourceVersion(resource_id=material.id, version=1, sha256="a" * 64,
                                  relative_path="fixture/practice-exam.pdf", size=10,
                                  mime_type="application/pdf", downloaded_at=datetime.now(UTC))
        session.add(version)
        session.commit()
        version_id = version.id
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        blocks = client.get("/api/learning/blocks").json()
        assert len(blocks) == 1
        assert blocks[0]["exam_material_id"] == version_id


def test_study_block_starts_at_18_00_local_berlin_time_across_dst(settings, factory, coordinator):
    """A UTC-only ``starts_at`` would land at 19:00 or 20:00 Berlin time depending on the season."""
    berlin = ZoneInfo("Europe/Berlin")
    for label, exam_at in (("summer", datetime(2026, 7, 16, 9, tzinfo=UTC)),  # CEST, UTC+2
                          ("winter", datetime(2026, 1, 16, 9, tzinfo=UTC))):  # CET, UTC+1
        with factory() as session:
            course = Course(source="fixture", source_id=f"c-{label}", name="Programmieren")
            session.add(course)
            session.flush()
            topic = LearningTopic(course_id=course.id, slug="schleifen", name="Schleifen")
            session.add(topic)
            session.flush()
            proposal = AnkiCardQueue(status="approved", payload="{}", topic_id=topic.id)
            session.add(proposal)
            session.flush()
            card = AnkiCard(queue_id=proposal.id, note_id=f"note-{label}")
            session.add(card)
            session.flush()
            for index, rating in enumerate([1, 1, 1, 1, 3]):
                session.add(AnkiReview(card_id=card.id,
                                       reviewed_at=datetime(2025, 1, 1 + index, 9, tzinfo=UTC), rating=rating))
            exam = Exam(course_id=course.id, source_key=f"exam-{label}", title="Klausur", exam_at=exam_at)
            session.add(exam)
            session.commit()
            suggest_blocks(session, settings, exam_at - timedelta(days=2))
            block = session.scalar(select(StudyBlockSuggestion).where(StudyBlockSuggestion.exam_id == exam.id))
            assert block is not None
            local = as_utc(block.starts_at).astimezone(berlin)
            assert (local.hour, local.minute) == (18, 0), f"{label}: got {local}"


def test_rejected_block_disappears_from_the_list(settings, factory, coordinator):
    _course_with_weak_topic(factory)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        block_id = client.get("/api/learning/blocks").json()[0]["id"]
        rejected = client.post(f"/api/learning/blocks/{block_id}/reject")
        assert rejected.status_code == 200
        assert client.get("/api/learning/blocks").json() == []


def _local(settings, day, hour: int) -> datetime:
    return datetime.combine(day, time(hour, 0), settings.timezone).astimezone(UTC)


def _course_topic_exam(session, *, suffix: str, exam_at: datetime) -> tuple[int, int, int]:
    """A course with one topic that has no Anki/exercise data at all.

    Zero data means "low" confidence, and low confidence alone makes a
    topic weak (see ``TopicProgress.is_weak``) -- exactly the minimal setup
    needed to exercise the scheduling logic without unrelated fixtures.
    """
    course = Course(source="fixture", source_id=f"c-{suffix}", name=f"Kurs {suffix}")
    session.add(course)
    session.flush()
    topic = LearningTopic(course_id=course.id, slug=f"thema-{suffix}", name=f"Thema {suffix}")
    session.add(topic)
    session.flush()
    exam = Exam(course_id=course.id, source_key=f"exam-{suffix}", title="Klausur", exam_at=exam_at)
    session.add(exam)
    session.commit()
    return course.id, topic.id, exam.id


def test_block_moves_to_16_00_when_18_00_has_a_calendar_event(settings, factory, coordinator):
    exam_at = datetime(2026, 10, 10, 9, tzinfo=UTC)
    with factory() as session:
        course_id, _topic_id, exam_id = _course_topic_exam(session, suffix="evt", exam_at=exam_at)
        slot_day = (exam_at - timedelta(days=1)).astimezone(settings.timezone).date()
        busy_start = _local(settings, slot_day, 18)
        session.add(CalendarEvent(source="fixture", source_key="evt-1", course_id=course_id,
                                  title="Vorlesung", starts_at=busy_start, ends_at=busy_start + timedelta(hours=1)))
        session.commit()
        suggest_blocks(session, settings, exam_at - timedelta(days=3))
        block = session.scalar(select(StudyBlockSuggestion).where(StudyBlockSuggestion.exam_id == exam_id))
        assert block is not None
        local = as_utc(block.starts_at).astimezone(settings.timezone)
        assert local.date() == slot_day
        assert (local.hour, local.minute) == (16, 0)


def test_block_moves_to_previous_day_when_every_candidate_hour_is_busy(settings, factory, coordinator):
    exam_at = datetime(2026, 10, 10, 9, tzinfo=UTC)
    with factory() as session:
        course_id, _topic_id, exam_id = _course_topic_exam(session, suffix="full", exam_at=exam_at)
        slot_day = (exam_at - timedelta(days=1)).astimezone(settings.timezone).date()
        for index, hour in enumerate((18, 16, 20, 14)):
            busy_start = _local(settings, slot_day, hour)
            session.add(CalendarEvent(source="fixture", source_key=f"evt-{index}", course_id=course_id,
                                      title="Belegt", starts_at=busy_start, ends_at=busy_start + timedelta(minutes=59)))
        session.commit()
        suggest_blocks(session, settings, exam_at - timedelta(days=5))
        block = session.scalar(select(StudyBlockSuggestion).where(StudyBlockSuggestion.exam_id == exam_id))
        assert block is not None
        local = as_utc(block.starts_at).astimezone(settings.timezone)
        assert local.date() == slot_day - timedelta(days=1)
        assert (local.hour, local.minute) == (18, 0)


def test_block_moves_when_an_accepted_block_of_another_topic_occupies_the_slot(settings, factory, coordinator):
    exam_at = datetime(2026, 10, 10, 9, tzinfo=UTC)
    with factory() as session:
        _course_id, _topic_id, exam_id = _course_topic_exam(session, suffix="acc", exam_at=exam_at)
        slot_day = (exam_at - timedelta(days=1)).astimezone(settings.timezone).date()
        busy_start = _local(settings, slot_day, 18)

        other_exam_at = exam_at + timedelta(days=2)
        _other_course_id, other_topic_id, other_exam_id = _course_topic_exam(
            session, suffix="other", exam_at=other_exam_at)
        session.add(StudyBlockSuggestion(exam_id=other_exam_id, topic_id=other_topic_id, duration_minutes=45,
                                         starts_at=busy_start, status="accepted", created_at=utc_now()))
        session.commit()
        suggest_blocks(session, settings, exam_at - timedelta(days=3))
        block = session.scalar(select(StudyBlockSuggestion).where(StudyBlockSuggestion.exam_id == exam_id))
        assert block is not None
        local = as_utc(block.starts_at).astimezone(settings.timezone)
        assert local.date() == slot_day
        assert (local.hour, local.minute) == (16, 0)
