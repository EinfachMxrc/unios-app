# SPDX-License-Identifier: AGPL-3.0-or-later

"""Local OCR status and explicit processing requests."""

from fastapi import APIRouter, HTTPException

from app.extract.ocr_service import OCRError, OCRService, OCRStatus
from app.host.lease import HostCoordinator


def ocr_router(service: OCRService, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/ocr/material")

    @router.get("/{version_id}", response_model=OCRStatus)
    def status(version_id: int):
        try:
            return service.status(version_id)
        except LookupError as exc:
            raise HTTPException(404, str(exc)) from None

    @router.post("/{version_id}", response_model=OCRStatus)
    def process(version_id: int):
        coordinator.assert_writer()
        try:
            return service.process(version_id, before_page=coordinator.assert_writer)
        except LookupError as exc:
            raise HTTPException(404, str(exc)) from None
        except OCRError as exc:
            raise HTTPException(503, str(exc)) from None

    return router
