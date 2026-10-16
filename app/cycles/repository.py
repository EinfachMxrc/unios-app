# SPDX-License-Identifier: AGPL-3.0-or-later

"""Read recorded learning work and persist study-cycle decisions."""

from collections.abc import Callable
from contextlib import contextmanager
from datetime import datetime

from sqlalchemy import func, select

from app.config import Settings
from app.cycles.impact import ExamImpactView, ExamPlanState
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
    StudyBlockSuggestion,
    StudyCycle,
)
from app.learning.blocks import _busy_intervals
from app.learning.progress import TopicProgress, topics_for_course
from app.timeutil import as_utc


class CycleRepository:
    def __init__(self, factory):
        self.factory = factory

    @contextmanager
    def read_transaction(self):
        with self.factory() as session:
            yield session

    @contextmanager
    def transaction(self):
        with self.factory() as session:
            session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            yield session

    @staticmethod
    def exam_plan(session, settings: Settings, cycle_id: int, planned_at: datetime) -> ExamPlanState:
        anchor = session.get(StudyCycle, cycle_id)
        if anchor is None or anchor.status != "accepted":
            raise LookupError("Angenommener Lernzyklus nicht gefunden")
        exam = session.get(Exam, anchor.exam_id)
        if exam is None:
            raise LookupError("Prüfung nicht gefunden")
        cycles = list(session.scalars(select(StudyCycle).where(
            StudyCycle.exam_id == exam.id, StudyCycle.status == "accepted").order_by(StudyCycle.id)))
        blocks = [(block, name) for block, name in session.execute(select(StudyBlockSuggestion, LearningTopic.name).join(
            LearningTopic, LearningTopic.id == StudyBlockSuggestion.topic_id).where(
                StudyBlockSuggestion.exam_id == exam.id, StudyBlockSuggestion.status == "accepted")
            .order_by(StudyBlockSuggestion.starts_at, StudyBlockSuggestion.id))]
        movable_ids = {block.id for block, _ in blocks if as_utc(block.starts_at) > planned_at}
        return ExamPlanState(anchor, exam, cycles, blocks, _busy_intervals(session, settings, exclude_block_ids=movable_ids))

    @staticmethod
    def apply_exam_plan(session, preview: ExamImpactView) -> None:
        for phase in preview.phases:
            cycle = session.get(StudyCycle, phase.id)
            assert cycle is not None
            cycle.starts_at = phase.new_starts_at
            cycle.ends_at = phase.new_ends_at
            cycle.exam_at_snapshot = preview.current_exam_at
        for proposed in preview.blocks:
            block = session.get(StudyBlockSuggestion, proposed.id)
            assert block is not None
            block.starts_at = proposed.new_starts_at

    @staticmethod
    def commit(session, assert_writer: Callable[[], None]) -> None:
        assert_writer()
        session.commit()

    def exams(self, now: datetime, horizon: datetime) -> list[tuple[Exam, Course]]:
        with self.factory() as session:
            return list(session.execute(select(Exam, Course).join(Course, Course.id == Exam.course_id).where(
                Exam.exam_at.is_not(None), Exam.exam_at > now, Exam.exam_at <= horizon)).all())

    def topics(self, settings: Settings, course_id: int) -> list[TopicProgress]:
        with self.factory() as session:
            return topics_for_course(session, settings, course_id)

    def available_work(self, topic_ids: list[int]) -> tuple[int, int]:
        if not topic_ids:
            return 0, 0
        with self.factory() as session:
            cards = session.scalar(select(func.count()).select_from(AnkiCard)
                                   .join(AnkiCardQueue, AnkiCard.queue_id == AnkiCardQueue.id)
                                   .where(AnkiCardQueue.topic_id.in_(topic_ids))) or 0
            exercises = session.scalar(select(func.count()).select_from(Exercise).where(
                Exercise.topic_id.in_(topic_ids))) or 0
            return cards, exercises

    def recent_exam_materials(self, course_id: int, since: datetime) -> list[tuple[int, str]]:
        with self.factory() as session:
            rows = session.execute(select(Resource.id, ResourceVersion.id, Resource.name).join(
                ResourceVersion, ResourceVersion.resource_id == Resource.id).where(
                    Resource.course_id == course_id,
                    Resource.group_category != "other_group",
                    Resource.removed_upstream.is_(False),
                    ResourceVersion.downloaded_at >= since,
                ).order_by(ResourceVersion.downloaded_at.desc()).limit(60)).all()
            found: dict[int, tuple[int, str]] = {}
            for resource_id, version_id, name in rows:
                if (resource_id not in found and any(word in name.casefold()
                    for word in ("altklausur", "probeklausur", "musterklausur"))):
                    found[resource_id] = (version_id, name)
            return list(found.values())[:10]

    def upsert_proposals(self, proposals: list[StudyCycle]) -> None:
        with self.factory() as session:
            for proposal in proposals:
                existing = session.scalar(select(StudyCycle).where(
                    StudyCycle.exam_id == proposal.exam_id, StudyCycle.phase == proposal.phase))
                if existing is None:
                    session.add(proposal)
                elif existing.status == "proposed":
                    existing.starts_at = proposal.starts_at
                    existing.ends_at = proposal.ends_at
                    existing.exam_at_snapshot = proposal.exam_at_snapshot
                    existing.topic_ids = proposal.topic_ids
                    existing.review_goal = proposal.review_goal
                    existing.attempt_goal = proposal.attempt_goal
            session.commit()

    def rows(self) -> list[tuple[StudyCycle, Exam, Course]]:
        with self.factory() as session:
            return list(session.execute(select(StudyCycle, Exam, Course)
                .join(Exam, Exam.id == StudyCycle.exam_id)
                .join(Course, Course.id == Exam.course_id)
                .where(StudyCycle.status != "rejected")
                .order_by(StudyCycle.starts_at)).all())

    def completed(self, cycle: StudyCycle) -> tuple[int, int]:
        if not cycle.topic_ids:
            return 0, 0
        with self.factory() as session:
            reviews = session.scalar(select(func.count()).select_from(AnkiReview)
                .join(AnkiCard, AnkiCard.id == AnkiReview.card_id)
                .join(AnkiCardQueue, AnkiCardQueue.id == AnkiCard.queue_id)
                .where(AnkiCardQueue.topic_id.in_(cycle.topic_ids),
                       AnkiReview.reviewed_at >= cycle.starts_at,
                       AnkiReview.reviewed_at < cycle.ends_at)) or 0
            attempts = session.scalar(select(func.count()).select_from(ExerciseAttempt)
                .join(Exercise, Exercise.id == ExerciseAttempt.exercise_id)
                .where(Exercise.topic_id.in_(cycle.topic_ids),
                       ExerciseAttempt.attempted_at >= cycle.starts_at,
                       ExerciseAttempt.attempted_at < cycle.ends_at)) or 0
            return reviews, attempts

    def decide(self, cycle_id: int, status: str) -> bool | None:
        with self.factory() as session:
            cycle = session.get(StudyCycle, cycle_id)
            if cycle is None:
                return None
            if cycle.status != "proposed":
                return False
            cycle.status = status
            session.commit()
            return True
