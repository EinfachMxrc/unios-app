# SPDX-License-Identifier: AGPL-3.0-or-later

"""A preview reports only measured learning values for an exact local topic."""

from datetime import UTC, datetime

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db.models import (
    AnkiCard,
    AnkiCardQueue,
    AnkiReview,
    Course,
    Exercise,
    ExerciseAttempt,
    LearningTopic,
)
from app.notes.peek_api import peek_router
from app.notes.store import create_note


def test_peek_waits_for_enough_data_before_showing_percentages(settings, factory, coordinator):
    with factory() as session:
        session.execute(text("CREATE VIRTUAL TABLE notes_fts USING fts5(note_id UNINDEXED, title, body)"))
        course = Course(source="fixture", source_id="course-1", name="Algorithmen")
        session.add(course)
        session.flush()
        note = create_note(session, settings, course_id=course.id, resource_id=None,
                           title="Rekursion", body="Eine Funktion ruft sich selbst auf.")
        topic = LearningTopic(course_id=course.id, slug="rekursion", name="Rekursion")
        session.add(topic)
        session.commit()
        note_id = note.id
        topic_id = topic.id

    app = FastAPI()
    app.include_router(peek_router(settings, factory))
    client = TestClient(app)
    empty = client.get(f"/api/notes/{note_id}/peek").json()
    assert empty["excerpt"] == "Eine Funktion ruft sich selbst auf."
    assert empty["anki_retention"] is None
    assert empty["exercise_accuracy"] is None
    assert empty["confidence"] == "low"

    with factory() as session:
        proposal = AnkiCardQueue(status="approved", payload="{}", topic_id=topic_id)
        session.add(proposal)
        session.flush()
        card = AnkiCard(queue_id=proposal.id, note_id="fake-anki-note")
        session.add(card)
        session.flush()
        for rating in (3, 3, 3, 3, 1):
            session.add(AnkiReview(card_id=card.id, reviewed_at=datetime(2026, 9, 26, tzinfo=UTC),
                                   rating=rating))
        exercise = Exercise(topic_id=topic_id, question="Was ist Rekursion?", solution="Selbstaufruf")
        session.add(exercise)
        session.flush()
        for correct in (True, True, False):
            session.add(ExerciseAttempt(exercise_id=exercise.id, answer="Erfundene Antwort",
                                        correct=correct))
        session.commit()

    measured = client.get(f"/api/notes/{note_id}/peek").json()
    assert measured["anki_retention"] == 0.8
    assert measured["anki_review_count"] == 5
    assert measured["exercise_accuracy"] == 2 / 3
    assert measured["exercise_attempt_count"] == 3
    assert measured["confidence"] == "high"
