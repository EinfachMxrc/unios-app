# SPDX-License-Identifier: AGPL-3.0-or-later

"""Small, factual study context for a note link preview."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, or_, select, text

from app.config import Settings
from app.db.models import Course, LearningTopic, MaterialAnnotation, Note, Resource
from app.learning.progress import topic_progress


class NotePeekView(BaseModel):
    id: str
    title: str
    course_name: str
    excerpt: str
    topic_name: str | None
    anki_retention: float | None
    anki_review_count: int
    exercise_accuracy: float | None
    exercise_attempt_count: int
    confidence: Literal["low", "medium", "high"] | None
    open_questions: int


def peek_router(settings: Settings, factory) -> APIRouter:
    router = APIRouter(prefix="/api/notes")

    @router.get("/{note_id}/peek", response_model=NotePeekView)
    def read_peek(note_id: UUID):
        with factory() as session:
            note = session.get(Note, str(note_id))
            if note is None:
                raise HTTPException(404, "Notiz nicht gefunden")
            course = session.get(Course, note.course_id)
            if course is None:
                raise HTTPException(404, "Kurs nicht gefunden")
            body = session.execute(text("SELECT body FROM notes_fts WHERE note_id = :id"),
                                   {"id": note.id}).scalar_one_or_none() or ""
            excerpt = " ".join(body.split())[:230]
            topics = session.scalars(select(LearningTopic).where(LearningTopic.course_id == note.course_id)).all()
            topic = next((item for item in topics if item.name.casefold() == note.title.casefold()), None)
            progress = topic_progress(session, settings, topic) if topic else None
            questions = session.scalar(select(func.count()).select_from(MaterialAnnotation)
                .join(Resource, MaterialAnnotation.resource_id == Resource.id)
                .where(Resource.course_id == note.course_id, MaterialAnnotation.kind == "question",
                       MaterialAnnotation.resolved.is_(False),
                       or_(MaterialAnnotation.quote.contains(note.title, autoescape=True),
                           MaterialAnnotation.comment.contains(note.title, autoescape=True)))) or 0
            return NotePeekView(
                id=note.id, title=note.title, course_name=course.name, excerpt=excerpt,
                topic_name=topic.name if topic else None,
                anki_retention=progress.anki_retention if progress else None,
                anki_review_count=progress.anki_review_count if progress else 0,
                exercise_accuracy=progress.exercise_accuracy if progress else None,
                exercise_attempt_count=progress.exercise_attempt_count if progress else 0,
                confidence=progress.confidence if progress else None,
                open_questions=questions,
            )

    return router
