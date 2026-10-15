# SPDX-License-Identifier: AGPL-3.0-or-later

"""Object and course timelines, backed only by recorded facts."""

from fastapi import APIRouter, HTTPException

from app.activity.service import ActivityItem, ActivityService


def activity_router(service: ActivityService) -> APIRouter:
    router = APIRouter(prefix="/api/entity-activity")

    @router.get("/{kind}/{entity_id}", response_model=list[ActivityItem])
    def list_activity(kind: str, entity_id: str):
        try:
            items = service.list(kind, entity_id)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from None
        if items is None:
            raise HTTPException(404, "Objekt nicht gefunden")
        return items

    return router
