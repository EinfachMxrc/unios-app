# SPDX-License-Identifier: AGPL-3.0-or-later
"""Own cards require the user's explicit confirmation of their question."""

from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, Path
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.anki.manual_schema import ManualCardFailure
from app.anki.manual_service import ManualCardError
from app.anki.note_repository import NoteCardRepository
from app.anki.note_schema import NoteCardInput, NoteCardResponse
from app.anki.note_service import NoteCardService
from app.anki.transfer_service import TransferService
from app.config import Settings
from app.host.lease import HostCoordinator


def note_card_router(settings: Settings, factory: Callable[[], Session], coordinator: HostCoordinator,
                     transfer_service: TransferService) -> APIRouter:
    router = APIRouter(prefix="/api/anki/note-cards")
    service = NoteCardService(settings, NoteCardRepository(settings, factory, coordinator), transfer_service)
    failures: dict[int | str, dict[str, Any]] = {status: {"model": ManualCardFailure} for status in (404, 409, 503)}

    def failure(exc: ManualCardError) -> JSONResponse:
        return JSONResponse({"detail": exc.detail, "code": exc.code}, status_code=exc.status_code)

    @router.post("", response_model=NoteCardResponse, status_code=201, responses=failures)
    def create(payload: NoteCardInput):
        coordinator.assert_writer()
        try:
            return service.create(payload)
        except ManualCardError as exc:
            return failure(exc)

    @router.get("/{queue_id}", response_model=NoteCardResponse, responses=failures)
    def get(queue_id: int = Path(gt=0)):
        try:
            return service.get(queue_id)
        except ManualCardError as exc:
            return failure(exc)

    @router.post("/{queue_id}/transfer", response_model=NoteCardResponse, responses=failures)
    def transfer(queue_id: int = Path(gt=0)):
        coordinator.assert_writer()
        try:
            return service.transfer(queue_id)
        except ManualCardError as exc:
            return failure(exc)

    return router
