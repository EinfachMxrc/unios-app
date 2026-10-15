# SPDX-License-Identifier: AGPL-3.0-or-later

"""Shared per-topic retention/accuracy computation, reused by the API and the study-block rules."""

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from sqlalchemy import select

from app.config import Settings
from app.db.models import (
    AnkiCard,
    AnkiCardQueue,
    AnkiReview,
    Exercise,
    ExerciseAttempt,
    LearningTopic,
)

WEAK_THRESHOLD = 0.7


@dataclass
class TopicProgress:
    topic: LearningTopic
    anki_retention: float | None
    anki_review_count: int
    exercise_accuracy: float | None
    exercise_attempt_count: int
    last_review: datetime | None
    confidence: Literal["low", "medium", "high"]

    @property
    def is_weak(self) -> bool:
        if self.confidence == "low":
            return True
        return ((self.anki_retention is not None and self.anki_retention < WEAK_THRESHOLD)
                or (self.exercise_accuracy is not None and self.exercise_accuracy < WEAK_THRESHOLD))


def _confidence(settings: Settings, review_count: int, attempt_count: int) -> Literal["low", "medium", "high"]:
    has_reviews = review_count >= settings.learning_min_reviews
    has_attempts = attempt_count >= settings.learning_min_attempts
    if has_reviews and has_attempts:
        return "high"
    if has_reviews or has_attempts:
        return "medium"
    return "low"


def _progress_from_rows(settings: Settings, topic: LearningTopic,
                        reviews: list[tuple[int, datetime]],
                        attempts: list[tuple[bool, datetime]]) -> TopicProgress:
    review_count = len(reviews)
    attempt_count = len(attempts)
    retention = (sum(1 for rating, _ in reviews if rating > 1) / review_count
                if review_count >= settings.learning_min_reviews else None)
    accuracy = (sum(1 for correct, _ in attempts if correct) / attempt_count
               if attempt_count >= settings.learning_min_attempts else None)
    last_times = [when for _, when in reviews] + [when for _, when in attempts]
    return TopicProgress(
        topic=topic, anki_retention=retention, anki_review_count=review_count,
        exercise_accuracy=accuracy, exercise_attempt_count=attempt_count,
        last_review=max(last_times) if last_times else None,
        confidence=_confidence(settings, review_count, attempt_count),
    )


def topic_progress(session, settings: Settings, topic: LearningTopic) -> TopicProgress:
    return progress_for_topics(session, settings, [topic])[0]


def progress_for_topics(session, settings: Settings, topics: list[LearningTopic]) -> list[TopicProgress]:
    """Batched variant of ``topic_progress``: two grouped queries total, not two per topic."""
    topic_ids = [topic.id for topic in topics]
    reviews_by_topic: dict[int, list[tuple[int, datetime]]] = defaultdict(list)
    attempts_by_topic: dict[int, list[tuple[bool, datetime]]] = defaultdict(list)
    if topic_ids:
        for topic_id, rating, reviewed_at in session.execute(
            select(AnkiCardQueue.topic_id, AnkiReview.rating, AnkiReview.reviewed_at)
            .join(AnkiCard, AnkiCard.id == AnkiReview.card_id)
            .join(AnkiCardQueue, AnkiCardQueue.id == AnkiCard.queue_id)
            .where(AnkiCardQueue.topic_id.in_(topic_ids))
        ).all():
            reviews_by_topic[topic_id].append((rating, reviewed_at))
        for topic_id, correct, attempted_at in session.execute(
            select(Exercise.topic_id, ExerciseAttempt.correct, ExerciseAttempt.attempted_at)
            .join(Exercise, Exercise.id == ExerciseAttempt.exercise_id)
            .where(Exercise.topic_id.in_(topic_ids))
        ).all():
            attempts_by_topic[topic_id].append((correct, attempted_at))
    return [_progress_from_rows(settings, topic, reviews_by_topic.get(topic.id, []),
                                attempts_by_topic.get(topic.id, [])) for topic in topics]


def topics_for_course(session, settings: Settings, course_id: int) -> list[TopicProgress]:
    topics = session.scalars(select(LearningTopic).where(LearningTopic.course_id == course_id)).all()
    return progress_for_topics(session, settings, list(topics))
