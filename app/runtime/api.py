# SPDX-License-Identifier: AGPL-3.0-or-later

"""Small authenticated API for safe, live host preferences."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import OperationalError

from app.host.lease import HostCoordinator
from app.runtime.service import (
    RuntimeConflict,
    RuntimeService,
    RuntimeState,
    RuntimeValues,
)


class RuntimeUpdate(BaseModel):
    expected_revision: int = Field(ge=0)
    values: RuntimeValues


def runtime_router(service: RuntimeService, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/runtime-settings")

    @router.get("", response_model=RuntimeState)
    def read_runtime():
        try:
            return service.read()
        except OperationalError:
            raise HTTPException(503, "Datenbankmigration für Einstellungen fehlt") from None

    @router.put("", response_model=RuntimeState)
    def update_runtime(payload: RuntimeUpdate):
        coordinator.assert_writer()
        try:
            return service.update(payload.values, payload.expected_revision)
        except RuntimeConflict as exc:
            raise HTTPException(409, str(exc)) from None
        except OperationalError:
            raise HTTPException(503, "Datenbankmigration für Einstellungen fehlt") from None

    return router
