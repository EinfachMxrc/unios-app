# SPDX-License-Identifier: AGPL-3.0-or-later

from fastapi import APIRouter, Query

from app.local_actions.service import ActionView, LocalActions


def local_actions_router(service: LocalActions):
    router = APIRouter(prefix="/api/local-actions")

    @router.get("", response_model=list[ActionView])
    def recent(course_id: int | None = Query(default=None, ge=1), kind: str | None = None,
               entity_id: str | None = Query(default=None, max_length=350)):
        return service.recent(course_id, kind, entity_id)

    @router.post("/{identifier}/undo")
    def undo(identifier: str):
        return service.undo(identifier)

    return router
