# SPDX-License-Identifier: AGPL-3.0-or-later

"""Learning topic status stays hidden behind configurable minimum data amounts."""

from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.db.models import (
    AnkiCard,
    AnkiCardQueue,
    AnkiReview,
    Course,
    Exercise,
    ExerciseAttempt,
    ExerciseProposalQueue,
    LearningTopic,
    Resource,
)
from app.main import create_app


def _course(factory) -> int:
    with factory() as session:
        course = Course(source="fixture", source_id="c1", name="Programmieren")
        session.add(course)
        session.commit()
        return course.id


def test_topic_hides_percentages_under_minimum_data(settings, factory, coordinator):
    course_id = _course(factory)
    with factory() as session:
        topic = LearningTopic(course_id=course_id, slug="schleifen", name="Schleifen")
        session.add(topic)
        session.flush()
        proposal = AnkiCardQueue(status="approved", payload="{}", topic_id=topic.id)
        session.add(proposal)
        session.flush()
        card = AnkiCard(queue_id=proposal.id, note_id="note-1")
        session.add(card)
        session.flush()
        session.add(AnkiReview(card_id=card.id, reviewed_at=datetime(2026, 9, 20, 9, tzinfo=UTC), rating=3))
        session.add(AnkiReview(card_id=card.id, reviewed_at=datetime(2026, 9, 21, 9, tzinfo=UTC), rating=1))
        session.commit()

    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        topics = client.get("/api/learning/topics").json()
    assert len(topics) == 1
    assert topics[0]["anki_review_count"] == 2
    assert topics[0]["anki_retention"] is None  # below settings.learning_min_reviews (5)
    assert topics[0]["exercise_accuracy"] is None
    assert topics[0]["confidence"] == "low"


def test_topic_shows_retention_and_accuracy_once_enough_data(settings, factory, coordinator):
    course_id = _course(factory)
    with factory() as session:
        topic = LearningTopic(course_id=course_id, slug="schleifen", name="Schleifen")
        session.add(topic)
        session.flush()
        proposal = AnkiCardQueue(status="approved", payload="{}", topic_id=topic.id)
        session.add(proposal)
        session.flush()
        card = AnkiCard(queue_id=proposal.id, note_id="note-2")
        session.add(card)
        session.flush()
        ratings = [3, 3, 3, 3, 1]  # 4 of 5 retained
        for index, rating in enumerate(ratings):
            session.add(AnkiReview(card_id=card.id,
                                   reviewed_at=datetime(2026, 9, 20 + index, 9, tzinfo=UTC), rating=rating))
        exercise = Exercise(topic_id=topic.id, question="Warum?", solution="Weil.")
        session.add(exercise)
        session.flush()
        for correct in (True, True, False):
            session.add(ExerciseAttempt(exercise_id=exercise.id, answer="x", correct=correct,
                                        error_kind=None if correct else "concept"))
        session.commit()

    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        topics = client.get("/api/learning/topics").json()
    assert len(topics) == 1
    status = topics[0]
    assert status["anki_review_count"] == 5
    assert status["anki_retention"] == 0.8
    assert status["exercise_attempt_count"] == 3
    assert round(status["exercise_accuracy"], 4) == round(2 / 3, 4)
    assert status["confidence"] == "high"
    assert status["last_review"] is not None


def test_topic_without_any_activity_is_not_listed(settings, factory, coordinator):
    _course(factory)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.get("/api/learning/topics").json() == []


def test_weekly_overview_counts_reviews_attempts_open_and_weak_topics(settings, factory, coordinator):
    course_id = _course(factory)
    with factory() as session:
        resource = Resource(source="fixture", source_key="r1", course_id=course_id,
                            kind="file", name="Blatt.pdf", url="https://example.invalid/file",
                            group_category="general")
        session.add(resource)
        session.flush()
        weak_topic = LearningTopic(course_id=course_id, slug="schwach", name="Schwaches Thema")
        session.add(weak_topic)
        session.flush()
        proposal = AnkiCardQueue(status="approved", payload="{}", topic_id=weak_topic.id)
        session.add(proposal)
        session.flush()
        card = AnkiCard(queue_id=proposal.id, note_id="note-weekly")
        session.add(card)
        session.flush()
        for rating in (1, 1, 1, 1, 3):
            session.add(AnkiReview(card_id=card.id, reviewed_at=datetime.now(UTC), rating=rating))
        practiced_exercise = Exercise(topic_id=weak_topic.id, question="Q1", solution="S1")
        session.add(practiced_exercise)
        session.flush()
        session.add(ExerciseAttempt(exercise_id=practiced_exercise.id, answer="a", correct=True))
        approved_unpracticed = ExerciseProposalQueue(resource_id=resource.id, status="approved",
                                                     payload='{"topic": "x"}')
        session.add(approved_unpracticed)
        session.commit()

    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        overview = client.get("/api/learning/weekly").json()
    assert overview["reviews_this_week"] == 5
    assert overview["attempts_this_week"] == 1
    assert overview["open_exercises"] == 1
    assert overview["weak_topics"] == ["Schwaches Thema"]
