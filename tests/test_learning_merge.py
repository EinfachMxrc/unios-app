# SPDX-License-Identifier: AGPL-3.0-or-later

"""Merging duplicate free-text topics moves every reference onto the survivor."""

from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.models import (
    AnkiCardQueue,
    Course,
    Exam,
    Exercise,
    LearningProgress,
    LearningTopic,
    ObjectMetadata,
    StudyBlockSuggestion,
    VoiceMemo,
)
from app.main import create_app


def _course(session, name="Programmieren", short_name="Prog") -> Course:
    course = Course(source="fixture", source_id=name, name=name, short_name=short_name)
    session.add(course)
    session.flush()
    return course


def _topic(session, course_id: int, name: str) -> LearningTopic:
    topic = LearningTopic(course_id=course_id, slug=name.casefold(), name=name)
    session.add(topic)
    session.flush()
    return topic


def test_merge_moves_references_and_deletes_source(settings, factory, coordinator):
    with factory() as session:
        course = _course(session)
        source = _topic(session, course.id, "While-Schleifen")
        target = _topic(session, course.id, "Schleifen")
        exercise = Exercise(topic_id=source.id, question="Was ist eine Schleife?", solution="...")
        session.add(exercise)
        card = AnkiCardQueue(status="approved", payload="{}", topic_id=source.id)
        session.add(card)
        progress = LearningProgress(topic_id=source.id, review_count=3, attempt_count=1)
        session.add(progress)
        memo = VoiceMemo(id="11111111-1111-1111-1111-111111111111", title="Notiz", course_id=course.id,
                         topic_id=source.id, relative_path="voice/x.wav", mime_type="audio/wav", size=10)
        session.add(memo)
        session.commit()
        source_id, target_id = source.id, target.id
        exercise_id, card_id, progress_id = exercise.id, card.id, progress.id

    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        response = client.post(f"/api/learning/topics/{source_id}/merge", json={"into_topic_id": target_id})
    assert response.status_code == 200
    body = response.json()
    assert body["topic_id"] == target_id
    assert body["topic"] == "Schleifen"

    with factory() as session:
        assert session.get(LearningTopic, source_id) is None
        assert session.get(LearningTopic, target_id) is not None
        assert session.get(Exercise, exercise_id).topic_id == target_id
        assert session.get(AnkiCardQueue, card_id).topic_id == target_id
        assert session.get(LearningProgress, progress_id).topic_id == target_id
        assert session.get(VoiceMemo, "11111111-1111-1111-1111-111111111111").topic_id == target_id


def test_merge_refuses_self_merge(settings, factory, coordinator):
    with factory() as session:
        course = _course(session)
        topic = _topic(session, course.id, "Rekursion")
        session.commit()
        topic_id = topic.id

    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        response = client.post(f"/api/learning/topics/{topic_id}/merge", json={"into_topic_id": topic_id})
    assert response.status_code == 422


def test_merge_refuses_cross_course_topics(settings, factory, coordinator):
    with factory() as session:
        course_a = _course(session, "Programmieren", "Prog")
        course_b = _course(session, "Mathematik", "Mathe")
        source = _topic(session, course_a.id, "Ableitungen")
        target = _topic(session, course_b.id, "Ableitungen")
        session.commit()
        source_id, target_id = source.id, target.id

    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        response = client.post(f"/api/learning/topics/{source_id}/merge", json={"into_topic_id": target_id})
    assert response.status_code == 422
    with factory() as session:
        assert session.get(LearningTopic, source_id) is not None
        assert session.get(LearningTopic, target_id) is not None


def test_merge_rejects_missing_topics(settings, factory, coordinator):
    with factory() as session:
        course = _course(session)
        topic = _topic(session, course.id, "Schleifen")
        session.commit()
        topic_id = topic.id

    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.post(f"/api/learning/topics/{topic_id}/merge",
                           json={"into_topic_id": 999_999}).status_code == 404
        assert client.post("/api/learning/topics/999999/merge",
                           json={"into_topic_id": topic_id}).status_code == 404


def test_merge_resolves_study_block_conflicts_keeping_more_advanced_status(settings, factory, coordinator):
    with factory() as session:
        course = _course(session)
        source = _topic(session, course.id, "While-Schleifen")
        target = _topic(session, course.id, "Schleifen")
        exam = Exam(course_id=course.id, source_key="exam-1", title="Klausur",
                   exam_at=datetime(2026, 10, 1, 9, tzinfo=UTC))
        session.add(exam)
        session.flush()
        # The source's suggestion is only "proposed"; the target's was
        # already "accepted" -- the merge must keep the accepted one.
        source_block = StudyBlockSuggestion(exam_id=exam.id, topic_id=source.id, duration_minutes=45,
                                            starts_at=datetime(2026, 9, 28, 18, tzinfo=UTC), status="proposed")
        target_block = StudyBlockSuggestion(exam_id=exam.id, topic_id=target.id, duration_minutes=45,
                                            starts_at=datetime(2026, 9, 27, 18, tzinfo=UTC), status="accepted")
        session.add(source_block)
        session.add(target_block)

        # A second exam only has a source-side suggestion: it should simply
        # move onto the target topic.
        exam2 = Exam(course_id=course.id, source_key="exam-2", title="Zwischentest",
                    exam_at=datetime(2026, 10, 10, 9, tzinfo=UTC))
        session.add(exam2)
        session.flush()
        lone_block = StudyBlockSuggestion(exam_id=exam2.id, topic_id=source.id, duration_minutes=30,
                                          starts_at=datetime(2026, 10, 5, 18, tzinfo=UTC), status="proposed")
        session.add(lone_block)
        session.commit()
        source_id, target_id = source.id, target.id
        exam_id = exam.id
        target_block_id, lone_block_id, source_block_id = target_block.id, lone_block.id, source_block.id

    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        response = client.post(f"/api/learning/topics/{source_id}/merge", json={"into_topic_id": target_id})
    assert response.status_code == 200

    with factory() as session:
        remaining = session.scalars(select(StudyBlockSuggestion)
                                    .where(StudyBlockSuggestion.exam_id == exam_id)).all()
        assert len(remaining) == 1
        assert remaining[0].id == target_block_id
        assert remaining[0].status == "accepted"
        assert session.get(StudyBlockSuggestion, source_block_id) is None

        moved = session.get(StudyBlockSuggestion, lone_block_id)
        assert moved.topic_id == target_id


def test_merge_unions_metadata_tags_and_moves_lone_metadata(settings, factory, coordinator):
    with factory() as session:
        course = _course(session)
        source = _topic(session, course.id, "While-Schleifen")
        target = _topic(session, course.id, "Schleifen")
        session.add(ObjectMetadata(object_type="topic", object_id=str(source.id),
                                   tags=["klausur", "schwer"], revision=1))
        session.add(ObjectMetadata(object_type="topic", object_id=str(target.id),
                                   tags=["wiederholen"], revision=1))
        source_id, target_id = source.id, target.id
        course2 = _course(session, "Mathematik", "Mathe")
        lone_source = _topic(session, course2.id, "Grenzwerte")
        lone_target = _topic(session, course2.id, "Analysis")
        session.add(ObjectMetadata(object_type="topic", object_id=str(lone_source.id),
                                   tags=["neu"], revision=1))
        session.commit()
        lone_source_id, lone_target_id = lone_source.id, lone_target.id

    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.post(f"/api/learning/topics/{source_id}/merge",
                           json={"into_topic_id": target_id}).status_code == 200
        assert client.post(f"/api/learning/topics/{lone_source_id}/merge",
                           json={"into_topic_id": lone_target_id}).status_code == 200

    with factory() as session:
        merged = session.scalar(select(ObjectMetadata).where(
            ObjectMetadata.object_type == "topic", ObjectMetadata.object_id == str(target_id)))
        assert sorted(merged.tags) == ["klausur", "schwer", "wiederholen"]
        assert session.scalar(select(ObjectMetadata).where(
            ObjectMetadata.object_type == "topic", ObjectMetadata.object_id == str(source_id))) is None

        moved = session.scalar(select(ObjectMetadata).where(
            ObjectMetadata.object_type == "topic", ObjectMetadata.object_id == str(lone_target_id)))
        assert moved.tags == ["neu"]
