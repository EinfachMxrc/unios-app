# SPDX-License-Identifier: AGPL-3.0-or-later

"""Cycle plans use real available work and only count events inside their window."""

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.db.models import (
    AnkiCard,
    AnkiCardQueue,
    AnkiReview,
    Course,
    Exam,
    Exercise,
    ExerciseAttempt,
    LearningTopic,
    Resource,
    ResourceVersion,
)
from app.main import create_app


def test_cycle_proposal_decision_and_recorded_progress(settings, factory, coordinator):
    with factory() as session:
        course = Course(source="fixture", source_id="cycles-course", name="Programmieren")
        session.add(course)
        session.flush()
        topic = LearningTopic(course_id=course.id, slug="rekursion", name="Rekursion")
        session.add(topic)
        session.flush()
        proposal = AnkiCardQueue(status="approved", payload="{}", topic_id=topic.id)
        session.add(proposal)
        session.flush()
        card = AnkiCard(queue_id=proposal.id, note_id="cycle-card")
        exercise = Exercise(topic_id=topic.id, question="Beispiel?", solution="Ja")
        session.add_all([card, exercise])
        session.add(Exam(course_id=course.id, source_key="cycle-exam", title="Klausur",
                         exam_at=datetime.now(UTC) + timedelta(days=10)))
        session.commit()
        card_id, exercise_id = card.id, exercise.id

    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        cycles = client.get("/api/learning/cycles").json()
        assert [item["phase"] for item in cycles] == ["practice", "review"]
        assert cycles[0]["topic_names"] == ["Rekursion"]
        assert (cycles[0]["review_goal"], cycles[0]["attempt_goal"]) == (1, 1)
        assert cycles[0]["progress_percent"] == 0
        assert [item["id"] for item in client.get("/api/learning/cycles").json()] == [
            item["id"] for item in cycles]
        cycle_id = cycles[0]["id"]
        assert client.post(f"/api/learning/cycles/{cycle_id}/accept").status_code == 200
        assert client.post(f"/api/learning/cycles/{cycle_id}/accept").status_code == 409
        with factory() as session:
            session.add(AnkiReview(card_id=card_id, reviewed_at=datetime.now(UTC), rating=2))
            session.add(ExerciseAttempt(exercise_id=exercise_id, attempted_at=datetime.now(UTC),
                                        answer="Ja", correct=True))
            session.commit()
        updated = client.get("/api/learning/cycles").json()[0]
        assert updated["status"] == "accepted"
        assert (updated["reviews_done"], updated["attempts_done"], updated["progress_percent"]) == (1, 1, 100)
        assert client.post(f"/api/learning/cycles/{cycles[1]['id']}/reject").status_code == 200
        assert len(client.get("/api/learning/cycles").json()) == 1


def test_cycle_without_cards_does_not_invent_progress(settings, factory, coordinator):
    with factory() as session:
        course = Course(source="fixture", source_id="empty-cycle", name="Mathematik")
        session.add(course)
        session.flush()
        session.add(LearningTopic(course_id=course.id, slug="beweise", name="Beweise"))
        session.add(Exam(course_id=course.id, source_key="empty-cycle-exam", title="Klausur",
                         exam_at=datetime.now(UTC) + timedelta(days=2)))
        session.commit()
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        cycle = client.get("/api/learning/cycles").json()[0]
        assert cycle["progress_percent"] is None
        assert (cycle["review_goal"], cycle["attempt_goal"]) == (0, 0)


def test_open_cycle_adapts_to_new_exam_date_and_material(settings, factory, coordinator):
    with factory() as session:
        course = Course(source="fixture", source_id="adaptive-course", name="Mathematik")
        session.add(course)
        session.flush()
        session.add(LearningTopic(course_id=course.id, slug="analysis", name="Analysis"))
        exam = Exam(course_id=course.id, source_key="adaptive-exam", title="Klausur",
                    exam_at=datetime.now(UTC) + timedelta(days=12))
        session.add(exam)
        session.commit()
        exam_id, course_id = exam.id, course.id
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        original = client.get("/api/learning/cycles").json()[0]
        with factory() as session:
            session.get(Exam, exam_id).exam_at = datetime.now(UTC) + timedelta(days=8)
            material = Resource(source="fixture", source_key="past-paper", course_id=course_id,
                                kind="file", name="Altklausur Analysis.pdf", url="")
            session.add(material)
            session.flush()
            version = ResourceVersion(resource_id=material.id, version=1, sha256="a" * 64,
                                      relative_path="fixture/past-paper.pdf", size=10,
                                      mime_type="application/pdf", downloaded_at=datetime.now(UTC))
            session.add(version)
            session.commit()
            version_id = version.id
        updated = next(item for item in client.get("/api/learning/cycles").json() if item["id"] == original["id"])
        assert updated["ends_at"] != original["ends_at"]
        assert updated["exam_changed"] is False
        assert updated["new_exam_materials"] == [{"id": version_id, "name": "Altklausur Analysis.pdf"}]
        assert client.post(f"/api/learning/cycles/{original['id']}/accept").status_code == 200
        with factory() as session:
            session.get(Exam, exam_id).exam_at = datetime.now(UTC) + timedelta(days=6)
            session.commit()
        accepted = next(item for item in client.get("/api/learning/cycles").json() if item["id"] == original["id"])
        assert accepted["ends_at"] == updated["ends_at"]
        assert accepted["exam_changed"] is True
