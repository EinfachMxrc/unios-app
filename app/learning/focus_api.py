# SPDX-License-Identifier: AGPL-3.0-or-later

"""Read an existing accepted learning context without proposing or starting work."""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Path

from app.learning.focus_schema import FocusKind, LearningFocusView
from app.learning.focus_service import FocusError, FocusService


def focus_router(service: FocusService) -> APIRouter:
    router = APIRouter(prefix="/api/learning/focus", tags=["learning"])

    @router.get("/{kind}/{identifier}", response_model=LearningFocusView, responses={404: {}, 409: {}})
    def get_focus(kind: FocusKind, identifier: Annotated[int, Path(gt=0)]):
        try:
            return service.get(kind, identifier)
        except FocusError as exc:
            raise HTTPException(exc.status_code, exc.detail) from exc

    return router
