# SPDX-License-Identifier: AGPL-3.0-or-later

"""Validate AI exercise proposals and hold them for explicit review."""

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import func, select

from app.ai.access import allowed
from app.anki.api import CardSource
from app.db.models import (
    Course,
    ExerciseProposalQueue,
    Resource,
    ResourceText,
    ResourceVersion,
)
from app.host.lease import HostCoordinator


class ExerciseProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question: str = Field(min_length=1, max_length=4000)
    topic: str = Field(min_length=1, max_length=200)
    difficulty: Literal["easy", "medium", "hard"]
    sample_solution: str = Field(min_length=1, max_length=8000)
    solution_steps: str = Field(min_length=1, max_length=8000)
    source_page: int | None = Field(default=None, gt=0)
    choices: list[str] | None = Field(default=None, min_length=3, max_length=5)
    correct_choice: int | None = Field(default=None, ge=0)

    @field_validator("question", "topic", "sample_solution", "solution_steps")
    @classmethod
    def nonblank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Übungsinhalt darf nicht leer sein")
        return value

    @model_validator(mode="after")
    def valid_choices(self):
        if (self.choices is None) != (self.correct_choice is None):
            raise ValueError("Antwortmöglichkeiten und richtige Antwort müssen zusammen angegeben werden")
        if self.choices is not None:
            if any(not choice.strip() or len(choice) > 500 for choice in self.choices):
                raise ValueError("Antwortmöglichkeiten dürfen nicht leer oder länger als 500 Zeichen sein")
            if len({choice.casefold().strip() for choice in self.choices}) != len(self.choices):
                raise ValueError("Antwortmöglichkeiten müssen verschieden sein")
            if self.correct_choice is None or self.correct_choice >= len(self.choices):
                raise ValueError("Richtige Antwort liegt außerhalb der Auswahl")
        return self


class ExerciseImport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1]
    generated_by: str = Field(min_length=1, max_length=100)
    generated_at: datetime
    source: CardSource
    exercises: list[ExerciseProposal] = Field(min_length=1, max_length=15)

    @field_validator("generated_at")
    @classmethod
    def timezone_required(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Zeitstempel benötigt eine Zeitzone")
        return value


class ExerciseDecision(ExerciseProposal):
    status: Literal["proposed", "approved", "rejected"]


class ExerciseQueueItem(BaseModel):
    id: int
    resource_id: int
    resource_name: str
    course_id: int
    course_name: str
    status: str
    exercise: ExerciseProposal


def enqueue_exercises(session, payload: ExerciseImport) -> list[ExerciseQueueItem]:
    """Stage exercises without committing, so outbox receipts stay atomic."""
    resource = session.get(Resource, payload.source.resource_id)
    if resource is None or resource.group_category == "other_group":
        raise HTTPException(404, "Material nicht gefunden")
    version = session.scalar(select(ResourceVersion).where(
        ResourceVersion.resource_id == resource.id,
        ResourceVersion.version == payload.source.version,
    ))
    if version is None:
        raise HTTPException(404, "Materialversion nicht gefunden")
    course = session.get(Course, resource.course_id)
    if course is None:
        raise HTTPException(404, "Kurs nicht gefunden")
    if not allowed(session, f"course:{course.id}") or not allowed(session, "category:course_material"):
        raise HTTPException(403, "Dieser Kurs ist für KI-Ergebnisse gesperrt")
    active = session.scalar(select(func.count(ExerciseProposalQueue.id)).where(
        ExerciseProposalQueue.resource_id == resource.id,
        ExerciseProposalQueue.status != "rejected",
    )) or 0
    if active + len(payload.exercises) > 30:
        raise HTTPException(422, "Übungslimit für dieses Material überschritten")
    source_pages = set(session.scalars(select(ResourceText.page_number).where(
        ResourceText.version_id == version.id)).all())
    if source_pages and any(exercise.source_page is not None and exercise.source_page not in source_pages
                            for exercise in payload.exercises):
        raise HTTPException(422, "Übungsseite gehört nicht zur Materialversion")
    created = []
    for exercise in payload.exercises:
        item = ExerciseProposalQueue(resource_id=resource.id, status="proposed",
                                     payload=exercise.model_dump_json())
        session.add(item)
        session.flush()
        created.append(ExerciseQueueItem(id=item.id, resource_id=resource.id, resource_name=resource.name,
                                         course_id=course.id, course_name=course.name, status=item.status,
                                         exercise=exercise))
    return created


def exercise_router(factory, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/ai/exercises")

    @router.get("", response_model=list[ExerciseQueueItem])
    def queue():
        with factory() as session:
            rows = session.execute(select(ExerciseProposalQueue, Resource, Course).join(
                Resource, Resource.id == ExerciseProposalQueue.resource_id).join(
                Course, Course.id == Resource.course_id).order_by(
                    ExerciseProposalQueue.id.desc()).limit(200)).all()
            return [ExerciseQueueItem(id=item.id, resource_id=resource.id, resource_name=resource.name,
                                      course_id=course.id, course_name=course.name, status=item.status,
                                      exercise=ExerciseProposal.model_validate_json(item.payload))
                    for item, resource, course in rows]

    @router.post("/import", response_model=list[ExerciseQueueItem], status_code=201)
    def import_exercises(payload: ExerciseImport):
        coordinator.assert_writer()
        with factory() as session:
            created = enqueue_exercises(session, payload)
            session.commit()
            return created

    @router.put("/{item_id}", response_model=ExerciseQueueItem)
    def decide(item_id: int, payload: ExerciseDecision):
        coordinator.assert_writer()
        with factory() as session:
            item = session.get(ExerciseProposalQueue, item_id)
            if item is None:
                raise HTTPException(404, "Übungsvorschlag nicht gefunden")
            if item.status != "proposed":
                raise HTTPException(409, "Übungsvorschlag wurde bereits entschieden")
            resource = session.get(Resource, item.resource_id)
            course = session.get(Course, resource.course_id) if resource else None
            if resource is None or course is None:
                raise HTTPException(404, "Material nicht gefunden")
            exercise = ExerciseProposal.model_validate(payload.model_dump(exclude={"status"}))
            item.payload = exercise.model_dump_json()
            item.status = payload.status
            session.commit()
            return ExerciseQueueItem(id=item.id, resource_id=resource.id, resource_name=resource.name,
                                     course_id=course.id, course_name=course.name, status=item.status,
                                     exercise=exercise)

    return router
