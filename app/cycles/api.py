# SPDX-License-Identifier: AGPL-3.0-or-later

"""Review automatically proposed learning cycles."""

from fastapi import APIRouter, HTTPException
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from app.cycles.impact import ExamImpactView
from app.cycles.service import CycleService, CycleView
from app.host.lease import HostCoordinator


class ConfirmExamImpact(BaseModel):
    model_config = ConfigDict(extra="forbid")
    planned_at: AwareDatetime
    revision: str = Field(pattern=r"^[a-f0-9]{64}$")


def cycles_router(service: CycleService, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/learning/cycles")

    @router.get("", response_model=list[CycleView])
    def list_cycles():
        return service.list(may_suggest=coordinator.is_writer)

    @router.get("/{cycle_id}/exam-impact", response_model=ExamImpactView)
    def exam_impact(cycle_id: int):
        try:
            return service.exam_impact(cycle_id)
        except LookupError as exc:
            raise HTTPException(404, str(exc)) from None

    @router.post("/{cycle_id}/exam-impact", response_model=ExamImpactView)
    def confirm_exam_impact(cycle_id: int, payload: ConfirmExamImpact):
        coordinator.assert_writer()
        try:
            return service.confirm_exam_impact(cycle_id, payload.planned_at, payload.revision, coordinator.assert_writer)
        except LookupError as exc:
            raise HTTPException(404, str(exc)) from None
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from None

    @router.post("/{cycle_id}/{action}", response_model=list[CycleView])
    def decide_cycle(cycle_id: int, action: str):
        coordinator.assert_writer()
        if action not in {"accept", "reject"}:
            raise HTTPException(400, "Unbekannte Entscheidung")
        try:
            service.decide(cycle_id, "accepted" if action == "accept" else "rejected")
        except LookupError as exc:
            raise HTTPException(404, str(exc)) from None
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from None
        return service.list(may_suggest=False)

    return router
