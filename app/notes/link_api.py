# SPDX-License-Identifier: AGPL-3.0-or-later

"""Read-only bounded batch endpoint for exact note-title resolution."""

from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, StringConstraints

from app.notes.link_service import MAX_LINK_TITLES, NoteLinkService

Title = Annotated[str, StringConstraints(min_length=1, max_length=200)]


class NoteLinkTargetView(BaseModel):
    id: str
    title: str
    course_name: str


class NoteLinkResolutionView(BaseModel):
    title: str
    status: Literal["resolved", "ambiguous", "missing"]
    target: NoteLinkTargetView | None


def note_links_router(service: NoteLinkService) -> APIRouter:
    router = APIRouter(prefix="/api/notes/link-targets")

    @router.get("", response_model=list[NoteLinkResolutionView])
    def resolve_titles(titles: Annotated[list[Title], Query(min_length=1, max_length=MAX_LINK_TITLES)]):
        try:
            return service.resolve(titles)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None

    return router
