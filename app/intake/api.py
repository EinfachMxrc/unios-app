# SPDX-License-Identifier: AGPL-3.0-or-later

"""Unified, local triage over already stored study sources."""

from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.host.lease import HostCoordinator
from app.intake.service import (
    IntakeConflict,
    IntakeItem,
    IntakeNotFound,
    IntakeService,
    IntakeTarget,
    State,
    TargetKind,
)


class IntakeUpdate(BaseModel):
    expected_revision: int = Field(ge=0)
    state: State
    course_id: int | None = Field(default=None, ge=1)
    target_kind: TargetKind | None = None
    target_id: str | None = Field(default=None, max_length=80)
    duplicate_of: str | None = Field(default=None, max_length=350)
    snoozed_until: datetime | None = None


def intake_router(service: IntakeService, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/intake")

    @router.get("", response_model=list[IntakeItem])
    def list_intake():
        return service.items()

    @router.get("/targets", response_model=list[IntakeTarget])
    def list_targets(course_id: int):
        try:
            return service.targets(course_id)
        except IntakeNotFound as exc:
            raise HTTPException(404, str(exc)) from None

    @router.patch("/{kind}/{source_id}", response_model=IntakeItem)
    def update_intake(kind: str, source_id: str, payload: IntakeUpdate):
        coordinator.assert_writer()
        try:
            return service.update(kind, source_id, payload.expected_revision, payload.state,
                                  payload.course_id, payload.target_kind, payload.target_id,
                                  payload.duplicate_of, payload.snoozed_until)
        except IntakeNotFound as exc:
            raise HTTPException(404, str(exc)) from None
        except IntakeConflict as exc:
            raise HTTPException(409, str(exc)) from None
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from None

    return router
