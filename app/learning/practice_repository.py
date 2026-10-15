# SPDX-License-Identifier: AGPL-3.0-or-later

"""Course filtering precedes read windows; unattempted proposals remain available."""

from collections.abc import Callable
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import (
    Course,
    Exercise,
    ExerciseAttempt,
    ExerciseProposalQueue,
    LearningTopic,
    Resource,
)


@dataclass(frozen=True)
class PracticeRecord:
    proposal: ExerciseProposalQueue
    resource: Resource
    course: Course
    exercise: Exercise | None
    attempt_count: int
    last_correct: bool | None


@dataclass(frozen=True)
class AttemptRecord:
    attempt: ExerciseAttempt
    exercise: Exercise
    topic: LearningTopic
    course: Course


class PracticeRepository:
    def __init__(self, factory: Callable[[], Session]):
        self._factory = factory

    def available(self, course_id: int | None) -> list[PracticeRecord]:
        with self._factory() as session:
            if course_id is not None and session.get(Course, course_id) is None:
                raise LookupError("Kurs nicht gefunden")
            query = (select(ExerciseProposalQueue, Resource, Course, Exercise)
                     .join(Resource, Resource.id == ExerciseProposalQueue.resource_id)
                     .join(Course, Course.id == Resource.course_id)
                     .outerjoin(Exercise, Exercise.proposal_id == ExerciseProposalQueue.id)
                     .where(ExerciseProposalQueue.status == "approved", Resource.group_category != "other_group"))
            if course_id is not None:
                query = query.where(Course.id == course_id)
            rows = session.execute(query.order_by(ExerciseProposalQueue.id.desc()).limit(200)).all()
            exercise_ids = [exercise.id for _, _, _, exercise in rows if exercise is not None]
            counts: dict[int, tuple[int, int]] = {}
            if exercise_ids:
                counts = {exercise_id: (count, latest_id) for exercise_id, count, latest_id in session.execute(
                    select(ExerciseAttempt.exercise_id, func.count(ExerciseAttempt.id), func.max(ExerciseAttempt.id))
                    .where(ExerciseAttempt.exercise_id.in_(exercise_ids)).group_by(ExerciseAttempt.exercise_id))}
            latest = dict(session.execute(select(ExerciseAttempt.id, ExerciseAttempt.correct).where(
                ExerciseAttempt.id.in_([last_id for _, last_id in counts.values()]))).all()) if counts else {}
            return [PracticeRecord(proposal, resource, course, exercise,
                                   counts.get(exercise.id, (0, 0))[0] if exercise else 0,
                                   latest.get(counts.get(exercise.id, (0, 0))[1]) if exercise else None)
                    for proposal, resource, course, exercise in rows]

    def history(self, course_id: int | None) -> list[AttemptRecord]:
        with self._factory() as session:
            if course_id is not None and session.get(Course, course_id) is None:
                raise LookupError("Kurs nicht gefunden")
            query = (select(ExerciseAttempt, Exercise, LearningTopic, Course)
                     .join(Exercise, Exercise.id == ExerciseAttempt.exercise_id)
                     .join(LearningTopic, LearningTopic.id == Exercise.topic_id)
                     .join(Course, Course.id == LearningTopic.course_id)
                     .where(Exercise.proposal_id.is_not(None)))
            if course_id is not None:
                query = query.where(Course.id == course_id)
            return [AttemptRecord(*row) for row in session.execute(
                query.order_by(ExerciseAttempt.id.desc()).limit(100))]
