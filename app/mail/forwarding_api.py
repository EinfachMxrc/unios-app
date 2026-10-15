# SPDX-License-Identifier: AGPL-3.0-or-later
"""Authenticated status and pause/resume controls for forwarded mail."""

from datetime import datetime

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from app.integrations.storage import ConnectionError
from app.mail.connection_api import MailSyncReport
from app.mail.forwarding import MailForwardingService


class ForwardingStatus(BaseModel):
    configured: bool
    address: str
    ready: bool
    connected: bool
    last_success_at: datetime | None
    last_error: str


class ForwardingControl(BaseModel):
    enabled: bool


def mail_forwarding_router(service: MailForwardingService) -> APIRouter:
    router = APIRouter(prefix="/api/mail/forwarding")

    def checked(call):
        try:
            return call()
        except ConnectionError as exc:
            raise HTTPException(400, str(exc)) from None

    @router.get("", response_model=ForwardingStatus)
    def status(response: Response):
        response.headers["Cache-Control"] = "private, no-store"
        return checked(service.status)

    @router.put("", response_model=ForwardingStatus)
    def control(payload: ForwardingControl):
        return checked(lambda: service.set_enabled(payload.enabled))

    @router.post("/sync", response_model=MailSyncReport)
    def sync():
        return checked(service.sync)

    return router
