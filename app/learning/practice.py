# SPDX-License-Identifier: AGPL-3.0-or-later

"""Practice approved exercises and retain each self-assessed attempt."""

from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import select

from app.ai.exercises import ExerciseProposal
from app.db.models import (
    Course,
    Exercise,
    ExerciseAttempt,
    ExerciseProposalQueue,
    Resource,
)
from app.host.lease import HostCoordinator
from app.learning.practice_repository import PracticeRepository
from app.learning.practice_schema import PracticeAttemptView, PracticeItem
from app.learning.practice_service import PracticeService
from app.learning.topics import resolve_topic


class PracticeAttemptInput(BaseModel):
    answer: str = Field(min_length=1, max_length=8000)
    correct: bool
    error_kind: Literal["concept", "calculation", "careless", "other"] | None = None
    duration_seconds: int = Field(ge=0, le=14_400)

    @field_validator("answer")
    @classmethod
    def nonblank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Antwort darf nicht leer sein")
        return value

    @model_validator(mode="after")
    def error_matches_result(self):
        if self.correct and self.error_kind is not None:
            raise ValueError("Richtige Antwort darf keine Fehlerart haben")
        if not self.correct and self.error_kind is None:
            raise ValueError("Bei einer falschen Antwort ist eine Fehlerart nötig")
        return self


def practice_router(factory, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/learning/practice")
    service = PracticeService(PracticeRepository(factory))

    @router.get("", response_model=list[PracticeItem])
    def list_practice(course_id: int | None = Query(default=None, gt=0)):
        try:
            return service.available(course_id)
        except LookupError as exc:
            raise HTTPException(404, str(exc)) from exc

    @router.get("/history", response_model=list[PracticeAttemptView])
    def history(course_id: int | None = Query(default=None, gt=0)):
        try:
            return service.history(course_id)
        except LookupError as exc:
            raise HTTPException(404, str(exc)) from exc

    @router.post("/{proposal_id}/attempt", response_model=PracticeAttemptView, status_code=201)
    def save_attempt(proposal_id: int, payload: PracticeAttemptInput):
        coordinator.assert_writer()
        with factory() as session:
            proposal = session.get(ExerciseProposalQueue, proposal_id)
            if proposal is None or proposal.status != "approved":
                raise HTTPException(404, "Freigegebene Übung nicht gefunden")
            resource = session.get(Resource, proposal.resource_id)
            if resource is None or resource.group_category == "other_group":
                raise HTTPException(404, "Material nicht gefunden")
            course = session.get(Course, resource.course_id)
            if course is None:
                raise HTTPException(404, "Kurs nicht gefunden")
            content = ExerciseProposal.model_validate_json(proposal.payload)
            correct = payload.correct
            error_kind = payload.error_kind
            if content.choices is not None and content.correct_choice is not None:
                if payload.answer not in content.choices:
                    raise HTTPException(422, "Antwort gehört nicht zu den Auswahlmöglichkeiten")
                correct = payload.answer == content.choices[content.correct_choice]
                error_kind = None if correct else "concept"
            topic = resolve_topic(session, course.id, content.topic)
            exercise = session.scalar(select(Exercise).where(Exercise.proposal_id == proposal.id))
            if exercise is None:
                exercise = Exercise(topic_id=topic.id, proposal_id=proposal.id,
                                    question=content.question, solution=content.sample_solution,
                                    difficulty=content.difficulty, solution_steps=content.solution_steps)
                session.add(exercise)
                session.flush()
            attempt = ExerciseAttempt(
                exercise_id=exercise.id, answer=payload.answer, correct=correct,
                error_kind=error_kind, topic_name=content.topic,
                difficulty=content.difficulty, solution_steps=content.solution_steps,
                duration_seconds=payload.duration_seconds,
            )
            session.add(attempt)
            session.commit()
            return PracticeAttemptView(
                id=attempt.id, exercise_id=exercise.id, proposal_id=proposal.id,
                course_id=course.id, course_name=course.name, topic=content.topic, question=content.question,
                answer=attempt.answer, correct=attempt.correct, error_kind=attempt.error_kind,
                difficulty=attempt.difficulty, solution_steps=attempt.solution_steps,
                duration_seconds=attempt.duration_seconds, attempted_at=attempt.attempted_at,
            )

    return router
