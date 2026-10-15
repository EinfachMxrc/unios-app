# SPDX-License-Identifier: AGPL-3.0-or-later

"""Older courses and their first attempts remain visible before global windows."""

from fastapi.testclient import TestClient
from sqlalchemy import event, func, select

from app.ai.exercises import ExerciseProposal
from app.db.models import (
    Course,
    Exercise,
    ExerciseAttempt,
    ExerciseProposalQueue,
    LearningTopic,
    Resource,
)
from app.learning.practice_repository import PracticeRepository
from app.learning.practice_service import PracticeService
from app.main import create_app


def seed_practice(factory):
    content = ExerciseProposal(question="Was ist ein Beweis?", topic="beweise", difficulty="easy",
                               sample_solution="Eine gültige Herleitung", solution_steps="Annahmen, Herleitung")
    with factory() as session:
        courses = [Course(source="fixture", source_id=key, name="Gleichnamiger Kurs") for key in ("older", "newer")]
        session.add_all(courses)
        session.flush()
        resources = [Resource(source="fixture", source_key=str(course.id), course_id=course.id,
                              kind="file", name="Skript", url="") for course in courses]
        session.add_all(resources)
        session.flush()
        older = ExerciseProposalQueue(resource_id=resources[0].id, status="approved", payload=content.model_dump_json())
        session.add(older)
        session.flush()
        newer = [ExerciseProposalQueue(resource_id=resources[1].id, status="approved",
                                       payload=content.model_dump_json()) for _ in range(201)]
        blocked = Resource(source="fixture", source_key="blocked", course_id=courses[0].id,
                           kind="file", name="Fremde Gruppe", url="", group_category="other_group")
        session.add(blocked)
        session.flush()
        session.add_all(newer + [ExerciseProposalQueue(resource_id=blocked.id, status="approved", payload=content.model_dump_json()),
                                ExerciseProposalQueue(resource_id=resources[0].id, status="proposed", payload=content.model_dump_json())])
        session.commit()
        return courses[0].id, courses[1].id, older.id, [item.id for item in newer]


def test_course_scope_precedes_200_and_keeps_unattempted_proposal(settings, factory, coordinator):
    older_course, _, older_id, _ = seed_practice(factory)
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        global_items = client.get("/api/learning/practice").json()
        assert len(global_items) == 200 and older_id not in {item["id"] for item in global_items}
        scoped = client.get(f"/api/learning/practice?course_id={older_course}")
        assert scoped.status_code == 200, scoped.text
        assert len(scoped.json()) == 1
        item = scoped.json()[0]
        assert (item["id"], item["course_id"], item["exercise_id"], item["attempt_count"], item["last_correct"]) == (
            older_id, older_course, None, 0, None)
        with factory() as session:
            assert session.scalar(select(func.count(Exercise.id))) == 0
            assert session.scalar(select(func.count(LearningTopic.id))) == 0
        attempted = client.post(f"/api/learning/practice/{older_id}/attempt", json={
            "answer": "Herleitung", "correct": True, "duration_seconds": 4})
        assert attempted.status_code == 201, attempted.text
        assert attempted.json()["course_id"] == older_course
        repeated = client.get(f"/api/learning/practice?course_id={older_course}").json()[0]
        assert repeated["exercise_id"] == attempted.json()["exercise_id"]
        assert repeated["attempt_count"] == 1 and repeated["last_correct"] is True
        assert client.get("/api/learning/practice?course_id=0").status_code == 422
        assert client.get("/api/learning/practice?course_id=999999").status_code == 404


def test_history_filters_course_before_100_and_preserves_saved_topic(settings, factory, coordinator):
    older_course, newer_course, older_id, newer_ids = seed_practice(factory)
    with factory() as session:
        topics = [LearningTopic(course_id=course_id, slug="beweise", name="Aktuell umbenannt")
                  for course_id in (older_course, newer_course)]
        session.add_all(topics)
        session.flush()
        exercises = [Exercise(topic_id=topic.id, proposal_id=proposal_id, question="Frage", solution="Lösung")
                     for topic, proposal_id in zip(topics, (older_id, newer_ids[0]), strict=True)]
        session.add_all(exercises)
        session.flush()
        old = ExerciseAttempt(exercise_id=exercises[0].id, answer="Ältere Kursantwort", correct=False,
                              error_kind="concept", topic_name="Historisches Thema", duration_seconds=8)
        session.add(old)
        session.flush()
        session.add_all([ExerciseAttempt(exercise_id=exercises[1].id, answer=f"Neu {i}", correct=True) for i in range(101)])
        session.commit()
        old_attempt_id = old.id
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        assert len(client.get("/api/learning/practice/history").json()) == 100
        scoped = client.get(f"/api/learning/practice/history?course_id={older_course}")
        assert scoped.status_code == 200, scoped.text
        assert len(scoped.json()) == 1
        assert scoped.json()[0]["id"] == old_attempt_id
        assert scoped.json()[0]["course_id"] == older_course
        assert scoped.json()[0]["topic"] == "Historisches Thema"
        assert client.get("/api/learning/practice/history?course_id=0").status_code == 422
        assert client.get("/api/learning/practice/history?course_id=999999").status_code == 404


def test_course_reads_batch_attempt_metadata_without_writes(factory):
    _, course_id, _, ids = seed_practice(factory)
    with factory() as session:
        topic = LearningTopic(course_id=course_id, slug="beweise", name="Beweise")
        session.add(topic)
        session.flush()
        exercise = Exercise(topic_id=topic.id, proposal_id=ids[-1], question="Frage", solution="Antwort")
        session.add(exercise)
        session.flush()
        session.add_all([ExerciseAttempt(exercise_id=exercise.id, answer="Erst", correct=False),
                         ExerciseAttempt(exercise_id=exercise.id, answer="Danach", correct=True)])
        session.commit()
    statements = []
    engine = factory.kw["bind"]
    def trace(_connection, _cursor, statement, _parameters, _context, _many):
        statements.append(statement)
    event.listen(engine, "before_cursor_execute", trace)
    try:
        items = PracticeService(PracticeRepository(factory)).available(course_id)
    finally:
        event.remove(engine, "before_cursor_execute", trace)
    assert len(items) == 200
    item = next(item for item in items if item.id == ids[-1])
    assert item.attempt_count == 2 and item.last_correct is True
    assert len(statements) == 4 and all(statement.lstrip().upper().startswith("SELECT") for statement in statements)
