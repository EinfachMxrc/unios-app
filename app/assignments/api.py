# SPDX-License-Identifier: AGPL-3.0-or-later
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.assignments.repository import AssignmentRepository
from app.assignments.service import AssignmentService
from app.web.schemas import AssignmentView


class ConfirmDeadline(BaseModel):
    due_at: datetime
    expected_due_at: datetime | None = None
    delivery: Literal["unknown", "in_person", "online"] = "unknown"


def assignment_router(factory, coordinator):
    router = APIRouter(prefix="/api/assignments")
    repository = AssignmentRepository(factory)
    service = AssignmentService(repository, coordinator)

    @router.get("/unresolved", response_model=list[AssignmentView])
    def unresolved():
        return [AssignmentView.model_validate(item, from_attributes=True) for item in repository.unresolved()]

    @router.post("/{assignment_id}/deadline")
    def confirm(assignment_id: int, payload: ConfirmDeadline):
        try:
            service.confirm(assignment_id, payload)
        except LookupError as exc:
            raise HTTPException(404, str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        return {"ok": True}

    return router
