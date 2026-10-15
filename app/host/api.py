# SPDX-License-Identifier: AGPL-3.0-or-later

"""Read-only conflict review endpoints; private data is never offline cached."""

from typing import Any

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel

from app.config import Settings
from app.host.conflicts import (
    conflict_actions,
    conflict_summaries,
    mark_conflict_action_checked,
    mark_conflict_action_replayed,
    mark_conflict_package_reviewed,
)
from app.host.lease import HostCoordinator


class ConflictSummary(BaseModel):
    package_id: str
    detected_at: str
    losing_device: str
    winning_device: str
    action_count: int
    dashboard_actions_complete: bool
    database_warning: str | None = None
    reviewed: bool


class ConflictActionPage(BaseModel):
    package_id: str
    total: int
    actions: list[dict[str, Any]]


def conflict_router(settings: Settings, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/host/conflicts")

    @router.get("", response_model=list[ConflictSummary])
    def list_conflicts(response: Response):
        response.headers["Cache-Control"] = "private, no-store"
        return conflict_summaries(settings)

    @router.get("/{package_id}", response_model=ConflictActionPage)
    def actions(package_id: str, response: Response, offset: int = Query(default=0, ge=0),
                limit: int = Query(default=50, ge=1, le=100)):
        response.headers["Cache-Control"] = "private, no-store"
        items = conflict_actions(settings, package_id)
        if items is None:
            raise HTTPException(404, "Änderungspaket nicht gefunden oder beschädigt")
        return {"package_id": package_id, "total": len(items), "actions": items[offset:offset + limit]}

    @router.post("/{package_id}/{action_id}/replayed", status_code=204)
    def mark_replayed(package_id: str, action_id: str):
        coordinator.assert_writer()
        if not mark_conflict_action_replayed(settings, package_id, action_id):
            raise HTTPException(404, "Änderung nicht gefunden")
        return Response(status_code=204)

    @router.post("/{package_id}/{action_id}/checked", status_code=204)
    def mark_checked(package_id: str, action_id: str):
        coordinator.assert_writer()
        if not mark_conflict_action_checked(settings, package_id, action_id):
            raise HTTPException(404, "Änderung nicht gefunden")
        return Response(status_code=204)

    @router.post("/{package_id}/reviewed", status_code=204)
    def mark_reviewed(package_id: str):
        coordinator.assert_writer()
        if conflict_actions(settings, package_id) is None:
            raise HTTPException(404, "Änderungspaket nicht gefunden oder beschädigt")
        if not mark_conflict_package_reviewed(settings, package_id):
            raise HTTPException(409, "Bitte jede Änderung einzeln übernehmen oder prüfen")
        return Response(status_code=204)

    return router
