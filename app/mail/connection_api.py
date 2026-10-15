# SPDX-License-Identifier: AGPL-3.0-or-later
"""Mail consent and read-only import; OAuth tokens never reach the frontend."""

from datetime import datetime
from uuid import UUID

import httpx
from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field

from app.integrations.storage import ConnectionError
from app.mail.service import MailService, ScrapedMessage


class MailConsentInput(BaseModel):
    client_id: UUID


class MailStatus(BaseModel):
    connected: bool
    client_id: str
    keyring_available: bool
    last_success_at: datetime | None
    last_error: str


class MailDeviceCode(BaseModel):
    user_code: str
    verification_url: str
    interval: int
    expires_in: int


class MailPoll(BaseModel):
    connected: bool
    interval: int


class MailSyncReport(BaseModel):
    read: int
    created: int
    skipped: int
    limited: bool


class ScrapedMessageInput(BaseModel):
    """One message the frontend read out of the user's own interactive OWA window."""

    message_key: str = Field(min_length=1, max_length=200)
    sender: str = Field(min_length=1, max_length=320)
    subject: str = Field(default="", max_length=500)
    received_at: datetime | None = None
    body: str = Field(default="", max_length=20_000)


class OwaImportInput(BaseModel):
    messages: list[ScrapedMessageInput] = Field(max_length=200)


class OwaImportReport(BaseModel):
    read: int
    created: int
    skipped: int


def mail_connection_router(service: MailService) -> APIRouter:
    router = APIRouter(prefix="/api/mail/connection")

    def checked(call):
        try:
            return call()
        except ConnectionError as exc:
            raise HTTPException(400, str(exc)) from None
        except httpx.HTTPError:
            raise HTTPException(502, "Microsoft derzeit nicht erreichbar") from None

    @router.get("", response_model=MailStatus)
    def status(response: Response):
        response.headers["Cache-Control"] = "private, no-store"
        return checked(service.status)

    @router.post("/start", response_model=MailDeviceCode)
    def start(payload: MailConsentInput):
        return checked(lambda: service.begin(str(payload.client_id)))

    @router.post("/poll", response_model=MailPoll)
    def poll():
        return checked(service.poll)

    @router.post("/sync", response_model=MailSyncReport)
    def sync():
        return checked(service.sync)

    @router.post("/owa-import", response_model=OwaImportReport)
    def owa_import(payload: OwaImportInput):
        messages = [ScrapedMessage(m.message_key, m.sender, m.subject, m.received_at, m.body)
                   for m in payload.messages]
        return checked(lambda: service.import_scraped(messages))

    @router.delete("")
    def disconnect():
        checked(service.disconnect)
        return {"connected": False}

    return router
