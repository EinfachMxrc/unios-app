# SPDX-License-Identifier: AGPL-3.0-or-later

"""Read-only view of learning progress per topic, purely derived from local data."""

from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select

from app.config import Settings
from app.db.models import (
    AnkiReview,
    Course,
    Exam,
    Exercise,
    ExerciseAttempt,
    ExerciseProposalQueue,
    LearningTopic,
    Resource,
    ResourceVersion,
    StudyBlockSuggestion,
    utc_now,
)
from app.host.lease import HostCoordinator
from app.learning.blocks import suggest_blocks
from app.learning.merge import merge_topics
from app.learning.progress import progress_for_topics, topic_progress


class StudyBlockView(BaseModel):
    id: int
    exam_id: int
    exam_title: str
    topic_id: int
    topic: str
    course_id: int
    course_name: str
    duration_minutes: int
    starts_at: datetime
    status: Literal["proposed", "accepted", "rejected"]
    exam_material_id: int | None = None
    exam_material_name: str | None = None


class WeeklyOverview(BaseModel):
    reviews_this_week: int
    attempts_this_week: int
    open_exercises: int
    weak_topics: list[str]


class TopicStatus(BaseModel):
    topic_id: int
    module_id: int | None
    course_id: int
    course_name: str
    topic: str
    anki_retention: float | None
    anki_review_count: int
    exercise_accuracy: float | None
    exercise_attempt_count: int
    last_review: datetime | None
    confidence: Literal["low", "medium", "high"]


class TopicMergeRequest(BaseModel):
    into_topic_id: int


def learning_router(settings: Settings, factory, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/learning")

    @router.get("/topics", response_model=list[TopicStatus])
    def topics():
        with factory() as session:
            rows = session.execute(select(LearningTopic, Course).join(
                Course, Course.id == LearningTopic.course_id)).all()
            progresses = progress_for_topics(session, settings, [topic for topic, _course in rows])
            result = []
            for (topic, course), progress in zip(rows, progresses, strict=True):
                result.append(TopicStatus(
                    topic_id=topic.id, module_id=topic.module_id,
                    course_id=course.id, course_name=course.name, topic=topic.name,
                    anki_retention=progress.anki_retention, anki_review_count=progress.anki_review_count,
                    exercise_accuracy=progress.exercise_accuracy,
                    exercise_attempt_count=progress.exercise_attempt_count,
                    last_review=progress.last_review, confidence=progress.confidence,
                ))
            result.sort(key=lambda item: (item.anki_retention if item.anki_retention is not None else 2,
                                          item.exercise_accuracy if item.exercise_accuracy is not None else 2))
            return result

    @router.post("/topics/{source_id}/merge", response_model=TopicStatus)
    def merge_topic(source_id: int, payload: TopicMergeRequest):
        coordinator.assert_writer()
        with factory() as session:
            target = merge_topics(session, source_id, payload.into_topic_id, coordinator.assert_writer)
            course = session.get(Course, target.course_id)
            progress = topic_progress(session, settings, target)
            return TopicStatus(
                topic_id=target.id, module_id=target.module_id,
                course_id=target.course_id, course_name=course.name, topic=target.name,
                anki_retention=progress.anki_retention, anki_review_count=progress.anki_review_count,
                exercise_accuracy=progress.exercise_accuracy,
                exercise_attempt_count=progress.exercise_attempt_count,
                last_review=progress.last_review, confidence=progress.confidence,
            )

    @router.get("/weekly", response_model=WeeklyOverview)
    def weekly():
        since = utc_now() - timedelta(days=7)
        with factory() as session:
            reviews = session.scalar(select(func.count()).select_from(AnkiReview)
                                     .where(AnkiReview.reviewed_at >= since)) or 0
            attempts = session.scalar(select(func.count()).select_from(ExerciseAttempt)
                                      .where(ExerciseAttempt.attempted_at >= since)) or 0
            open_exercises = session.scalar(
                select(func.count()).select_from(ExerciseProposalQueue)
                .outerjoin(Exercise, Exercise.proposal_id == ExerciseProposalQueue.id)
                .outerjoin(ExerciseAttempt, ExerciseAttempt.exercise_id == Exercise.id)
                .where(ExerciseProposalQueue.status == "approved", ExerciseAttempt.id.is_(None))
            ) or 0
            topics = session.scalars(select(LearningTopic)).all()
            weak = [progress.topic.name for progress in progress_for_topics(session, settings, list(topics))
                   if progress.is_weak]
            return WeeklyOverview(reviews_this_week=reviews, attempts_this_week=attempts,
                                  open_exercises=open_exercises, weak_topics=weak)

    @router.get("/blocks", response_model=list[StudyBlockView])
    def blocks():
        with factory() as session:
            if coordinator.is_writer:
                suggest_blocks(session, settings, utc_now())
            rows = session.execute(
                select(StudyBlockSuggestion, Exam, LearningTopic, Course)
                .join(Exam, Exam.id == StudyBlockSuggestion.exam_id)
                .join(LearningTopic, LearningTopic.id == StudyBlockSuggestion.topic_id)
                .join(Course, Course.id == LearningTopic.course_id)
                .where(StudyBlockSuggestion.status != "rejected")
                .order_by(StudyBlockSuggestion.starts_at)
            ).all()
            recent = session.execute(select(Resource.course_id, ResourceVersion.id, Resource.name)
                .join(ResourceVersion, ResourceVersion.resource_id == Resource.id)
                .where(Resource.removed_upstream.is_(False), Resource.group_category != "other_group",
                       ResourceVersion.downloaded_at >= datetime.now(UTC) - timedelta(days=14))
                .order_by(ResourceVersion.downloaded_at.desc()).limit(200)).all()
            exam_materials: dict[int, tuple[int, str]] = {}
            for course_id, version_id, name in recent:
                if course_id not in exam_materials and any(term in name.casefold()
                   for term in ("altklausur", "probeklausur", "musterklausur")):
                    exam_materials[course_id] = (version_id, name)
            return [StudyBlockView(
                id=block.id, exam_id=exam.id, exam_title=exam.title, topic_id=topic.id, topic=topic.name,
                course_id=course.id, course_name=course.name, duration_minutes=block.duration_minutes,
                starts_at=block.starts_at, status=block.status,
                exam_material_id=exam_materials.get(course.id, (None, None))[0],
                exam_material_name=exam_materials.get(course.id, (None, None))[1],
            ) for block, exam, topic, course in rows]

    def _decide(block_id: int, status: str) -> StudyBlockView:
        coordinator.assert_writer()
        with factory() as session:
            row = session.execute(
                select(StudyBlockSuggestion, Exam, LearningTopic, Course)
                .join(Exam, Exam.id == StudyBlockSuggestion.exam_id)
                .join(LearningTopic, LearningTopic.id == StudyBlockSuggestion.topic_id)
                .join(Course, Course.id == LearningTopic.course_id)
                .where(StudyBlockSuggestion.id == block_id)
            ).first()
            if row is None:
                raise HTTPException(404, "Lernblock nicht gefunden")
            block, exam, topic, course = row
            if block.status != "proposed":
                raise HTTPException(409, "Lernblock wurde bereits entschieden")
            block.status = status
            session.commit()
            return StudyBlockView(
                id=block.id, exam_id=exam.id, exam_title=exam.title, topic_id=topic.id, topic=topic.name,
                course_id=course.id, course_name=course.name, duration_minutes=block.duration_minutes,
                starts_at=block.starts_at, status=block.status,
            )

    @router.post("/blocks/{block_id}/accept", response_model=StudyBlockView)
    def accept_block(block_id: int):
        return _decide(block_id, "accepted")

    @router.post("/blocks/{block_id}/reject", response_model=StudyBlockView)
    def reject_block(block_id: int):
        return _decide(block_id, "rejected")

    return router
