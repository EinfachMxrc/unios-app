# SPDX-License-Identifier: AGPL-3.0-or-later

"""Small read-only context endpoints for in-place previews."""

from fastapi import APIRouter, HTTPException

from app.peek.service import PeekService, PeekView


def peek_router(service: PeekService) -> APIRouter:
    router = APIRouter(prefix="/api/peek")

    @router.get("/assignments/{assignment_id}", response_model=PeekView)
    def assignment(assignment_id: int):
        item = service.assignment(assignment_id)
        if item is None:
            raise HTTPException(404, "Aufgabe nicht gefunden")
        return item

    @router.get("/deadlines/{deadline_id}", response_model=PeekView)
    def deadline(deadline_id: int):
        item = service.deadline(deadline_id)
        if item is None:
            raise HTTPException(404, "Frist nicht gefunden")
        return item

    return router
