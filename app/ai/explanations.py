# SPDX-License-Identifier: AGPL-3.0-or-later

"""Review explanations returned for marked questions before showing them as answers."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, select

from app.ai.access import allowed
from app.config import Settings
from app.db.models import (
    Course,
    MaterialAnnotation,
    QuestionExplanationQueue,
    Resource,
    utc_now,
)
from app.host.lease import HostCoordinator
from app.material.service import MaterialError, current_event


class ExplanationProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question_id: UUID
    answer: str = Field(min_length=1, max_length=8000)

    @field_validator("answer")
    @classmethod
    def nonblank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Erklärung darf nicht leer sein")
        return value


class ExplanationImport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1]
    generated_by: str = Field(min_length=1, max_length=100)
    generated_at: datetime
    explanations: list[ExplanationProposal] = Field(min_length=1, max_length=100)

    @field_validator("generated_at")
    @classmethod
    def timezone_required(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Zeitstempel benötigt eine Zeitzone")
        return value


class ExplanationDecision(BaseModel):
    status: Literal["approved", "rejected"]
    answer: str = Field(min_length=1, max_length=8000)

    @field_validator("answer")
    @classmethod
    def nonblank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Erklärung darf nicht leer sein")
        return value


class ExplanationQueueItem(BaseModel):
    id: int
    question_id: str
    question: str
    course_id: int
    course_name: str
    resource_name: str
    status: str
    answer: str
    generated_by: str


def enqueue_explanations(session, settings: Settings, payload: ExplanationImport) -> list[QuestionExplanationQueue]:
    """Stage every answer in one transaction; none are trusted or auto-approved."""
    if not allowed(session, "category:learning_questions") or not allowed(session, "category:course_material"):
        raise HTTPException(403, "Fragen oder Kursmaterial sind für KI-Ergebnisse gesperrt")
    ids = [str(item.question_id) for item in payload.explanations]
    if len(ids) != len(set(ids)):
        raise HTTPException(422, "Eine Frage darf nur einmal pro Antwortdatei vorkommen")
    checked = []
    for proposal in payload.explanations:
        question = session.get(MaterialAnnotation, str(proposal.question_id))
        if question is None or question.kind != "question":
            raise HTTPException(404, "Offene Frage nicht gefunden")
        resource = session.get(Resource, question.resource_id)
        if resource is None or resource.group_category == "other_group":
            raise HTTPException(404, "Material nicht gefunden")
        if not allowed(session, f"course:{resource.course_id}"):
            raise HTTPException(403, "Dieser Kurs ist für KI-Ergebnisse gesperrt")
        try:
            current_event(session, settings.data_dir, question)
        except MaterialError as exc:
            raise HTTPException(409, str(exc)) from None
        active = session.scalar(select(func.count(QuestionExplanationQueue.id)).where(
            QuestionExplanationQueue.question_id == question.id,
            QuestionExplanationQueue.status != "rejected",
        )) or 0
        if active >= 3:
            raise HTTPException(422, "Für diese Frage liegen bereits drei Erklärungen vor")
        checked.append(proposal)
    created = []
    for proposal in checked:
        item = QuestionExplanationQueue(question_id=str(proposal.question_id), status="proposed",
                                        answer=proposal.answer, generated_by=payload.generated_by,
                                        created_at=utc_now())
        session.add(item)
        created.append(item)
    session.flush()
    return created


def explanation_router(settings: Settings, factory, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/ai/explanations")

    @router.get("", response_model=list[ExplanationQueueItem])
    def queue():
        with factory() as session:
            rows = session.execute(
                select(QuestionExplanationQueue, MaterialAnnotation, Resource, Course)
                .outerjoin(MaterialAnnotation, MaterialAnnotation.id == QuestionExplanationQueue.question_id)
                .outerjoin(Resource, Resource.id == MaterialAnnotation.resource_id)
                .outerjoin(Course, Course.id == Resource.course_id)
                .order_by(QuestionExplanationQueue.id.desc()).limit(200)
            ).all()
            result = []
            for item, question, resource, course in rows:
                if question is not None:
                    try:
                        state = current_event(session, settings.data_dir, question)
                    except MaterialError as exc:
                        raise HTTPException(409, str(exc)) from None
                    question_text = state["comment"] or state["quote"]
                else:
                    question_text = "Ursprüngliche Frage wurde gelöscht"
                result.append(ExplanationQueueItem(
                    id=item.id, question_id=item.question_id, question=question_text,
                    course_id=course.id if course else 0,
                    course_name=course.name if course else "Kurs nicht mehr vorhanden",
                    resource_name=resource.name if resource else "Material nicht mehr vorhanden",
                    status=item.status, answer=item.answer, generated_by=item.generated_by,
                ))
            return result

    @router.post("/import", status_code=201)
    def import_explanations(payload: ExplanationImport):
        coordinator.assert_writer()
        with factory() as session:
            created = enqueue_explanations(session, settings, payload)
            session.commit()
            return {"created": len(created), "status": "proposed"}

    @router.put("/{item_id}", response_model=ExplanationQueueItem)
    def decide(item_id: int, payload: ExplanationDecision):
        coordinator.assert_writer()
        with factory() as session:
            item = session.get(QuestionExplanationQueue, item_id)
            if item is None:
                raise HTTPException(404, "Erklärung nicht gefunden")
            if item.status != "proposed":
                raise HTTPException(409, "Erklärung wurde bereits entschieden")
            item.answer = payload.answer.strip()
            item.status = payload.status
            question = session.get(MaterialAnnotation, item.question_id)
            resource = session.get(Resource, question.resource_id) if question else None
            course = session.get(Course, resource.course_id) if resource else None
            if question is None or resource is None or course is None:
                raise HTTPException(409, "Die ursprüngliche Frage ist nicht mehr vorhanden")
            try:
                state = current_event(session, settings.data_dir, question)
            except MaterialError as exc:
                raise HTTPException(409, str(exc)) from None
            result = ExplanationQueueItem(
                id=item.id, question_id=question.id, question=state["comment"] or state["quote"],
                course_id=course.id, course_name=course.name, resource_name=resource.name,
                status=item.status, answer=item.answer, generated_by=item.generated_by,
            )
            session.commit()
            return result

    return router
