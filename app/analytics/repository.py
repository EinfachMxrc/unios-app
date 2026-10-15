# SPDX-License-Identifier: AGPL-3.0-or-later

"""Read source facts for study analytics; record first reader openings once."""

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select, update

from app.config import Settings
from app.courses.classification import teaching_courses
from app.db.models import (
    AnkiCard,
    AnkiCardQueue,
    AnkiReview,
    Course,
    Deadline,
    Exam,
    Exercise,
    ExerciseAttempt,
    LearningTopic,
    MaterialAnnotation,
    Note,
    Resource,
    ResourceVersion,
)
from app.learning.progress import TopicProgress, progress_for_topics


@dataclass
class AnalyticsRows:
    courses: list[Course]
    versions: list[tuple[ResourceVersion, Resource]]
    notes: list[Note]
    questions: list[tuple[MaterialAnnotation, Resource]]
    reviews: list[tuple[AnkiReview, int]]
    attempts: list[tuple[ExerciseAttempt, int]]
    deadlines: list[Deadline]
    exams: list[Exam]
    progress: list[TopicProgress]


class AnalyticsRepository:
    def __init__(self, factory):
        self.factory = factory

    def record_open(self, version_id: int, now: datetime) -> bool:
        with self.factory() as session:
            row = session.execute(select(ResourceVersion, Resource)
                .join(Resource, Resource.id == ResourceVersion.resource_id)
                .where(ResourceVersion.id == version_id)).first()
            if row is None or row[1].group_category == "other_group":
                return False
            session.execute(update(ResourceVersion).where(
                ResourceVersion.id == version_id, ResourceVersion.first_opened_at.is_(None))
                .values(first_opened_at=now))
            session.commit()
            return True

    def snapshot(self, settings: Settings, now: datetime) -> AnalyticsRows:
        since_28 = now - timedelta(days=28)
        since_7 = now - timedelta(days=7)
        with self.factory() as session:
            courses = list(session.scalars(select(Course).where(teaching_courses()).order_by(Course.name)).all())
            versions = list(session.execute(select(ResourceVersion, Resource)
                .join(Resource, Resource.id == ResourceVersion.resource_id)
                .where(ResourceVersion.downloaded_at >= since_7,
                       Resource.group_category != "other_group")).all())
            notes = list(session.scalars(select(Note).where(Note.created_at >= since_7)).all())
            questions = list(session.execute(select(MaterialAnnotation, Resource)
                .join(Resource, Resource.id == MaterialAnnotation.resource_id)
                .where(MaterialAnnotation.kind == "question", MaterialAnnotation.resolved.is_(False),
                       Resource.group_category != "other_group")).all())
            reviews = list(session.execute(select(AnkiReview, AnkiCardQueue.topic_id)
                .join(AnkiCard, AnkiCard.id == AnkiReview.card_id)
                .join(AnkiCardQueue, AnkiCardQueue.id == AnkiCard.queue_id)
                .where(AnkiReview.reviewed_at >= since_28, AnkiCardQueue.topic_id.is_not(None))).all())
            attempts = list(session.execute(select(ExerciseAttempt, Exercise.topic_id)
                .join(Exercise, Exercise.id == ExerciseAttempt.exercise_id)
                .where(ExerciseAttempt.attempted_at >= since_28)).all())
            deadlines = list(session.scalars(select(Deadline).where(
                Deadline.removed_upstream.is_(False), Deadline.due_at >= now,
                Deadline.due_at <= now + timedelta(days=14))).all())
            exams = list(session.scalars(select(Exam).where(
                Exam.exam_at.is_not(None), Exam.exam_at >= now,
                Exam.exam_at <= now + timedelta(days=30))).all())
            topics = list(session.scalars(select(LearningTopic)).all())
            progress = progress_for_topics(session, settings, topics)
            return AnalyticsRows(courses, versions, notes, questions, reviews, attempts,
                                 deadlines, exams, progress)
