# SPDX-License-Identifier: AGPL-3.0-or-later
"""User-facing incoming timetable subscription, distinct from the outgoing iCal feed."""

from datetime import date, datetime
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException, Response
from pydantic import AwareDatetime, BaseModel, Field

from app.calendar.edit_service import CalendarEditError
from app.calendar.service import TimetableService
from app.integrations.storage import ConnectionError


class SubscriptionInput(BaseModel):
    url: str = Field(min_length=1, max_length=8000, repr=False)
    name: str = Field(default="Stundenplan", min_length=1, max_length=100)


class TimetableStatus(BaseModel):
    subscribed: bool
    name: str
    keyring_available: bool
    last_success_at: datetime | None
    last_error: str
    event_count: int
    session_link: bool
    through: str | None


class TimetableEvent(BaseModel):
    id: int
    title: str
    starts_at: datetime
    ends_at: datetime | None
    personal: bool = False
    adjusted: bool = False
    revision: str = ''
    series_revision: str | None = None
    series_count: int = 0
    series_adjusted: bool = False
    original_starts_at: datetime | None = None
    original_ends_at: datetime | None = None


class CalendarCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    starts_at: AwareDatetime
    ends_at: AwareDatetime


class CalendarUpdate(BaseModel):
    scope: Literal['single', 'future', 'series'] = 'single'
    series_revision: str | None = Field(default=None, pattern=r'^[a-f0-9]{64}$')
    title: str = Field(min_length=1, max_length=500)
    starts_at: AwareDatetime
    ends_at: AwareDatetime | None
    revision: str = Field(pattern=r'^[a-f0-9]{64}$')


class CalendarRevision(BaseModel):
    revision: str = Field(pattern=r'^[a-f0-9]{64}$')


class CalendarChange(BaseModel):
    event: TimetableEvent | None
    undo_id: str | None


class TimetableSlot(BaseModel):
    id: str
    title: str
    weekday: int
    start_time: str
    visible: bool


class SlotInput(BaseModel):
    slot_id: str = Field(pattern=r'^[a-f0-9]{64}$')
    visible: bool


def timetable_router(service: TimetableService) -> APIRouter:
    router = APIRouter(prefix="/api/timetable")

    @router.get("/status", response_model=TimetableStatus)
    def status(response: Response):
        response.headers["Cache-Control"] = "private, no-store"
        return service.status()

    @router.get("/events", response_model=list[TimetableEvent])
    def events(day: date):
        return service.events(day)

    def edit(call):
        try:
            return call()
        except CalendarEditError as exc:
            raise HTTPException(exc.status, str(exc)) from None

    @router.post('/events', response_model=CalendarChange, status_code=201)
    def create_event(payload: CalendarCreate):
        return edit(lambda: service.edits.create(payload.title, payload.starts_at, payload.ends_at))

    @router.patch('/events/{identifier}', response_model=CalendarChange)
    def update_event(identifier: int, payload: CalendarUpdate):
        return edit(lambda: service.edits.update(identifier, payload.revision, payload.title,
                                                 payload.starts_at, payload.ends_at, payload.scope, payload.series_revision))

    @router.delete('/events/{identifier}', response_model=CalendarChange)
    def delete_event(identifier: int, payload: CalendarRevision):
        return edit(lambda: service.edits.remove(identifier, payload.revision))

    @router.post('/events/{identifier}/reset', response_model=CalendarChange)
    def reset_event(identifier: int, payload: CalendarRevision):
        return edit(lambda: service.edits.remove(identifier, payload.revision, reset=True))

    @router.post('/changes/{identifier}/undo', response_model=CalendarChange)
    def undo_change(identifier: str):
        return edit(lambda: service.edits.undo(identifier))

    @router.get('/selection', response_model=list[TimetableSlot])
    def slots():
        return service.slots()

    def checked(call):
        try:
            return call()
        except ConnectionError as exc:
            raise HTTPException(400, str(exc)) from None
        except httpx.HTTPError:
            raise HTTPException(502, "Stundenplan-Dienst derzeit nicht erreichbar") from None

    @router.put('/selection', response_model=list[TimetableSlot])
    def select_slot(payload: SlotInput):
        return checked(lambda: service.select_slot(payload.slot_id, payload.visible))

    @router.post("/subscribe", response_model=TimetableStatus)
    def subscribe(payload: SubscriptionInput):
        return checked(lambda: service.subscribe(payload.url, payload.name.strip() or "Stundenplan"))

    @router.post("/sync", response_model=TimetableStatus)
    def sync():
        return checked(service.sync)

    @router.delete("/subscription")
    def disconnect():
        checked(service.disconnect)
        return {"subscribed": False}

    return router
