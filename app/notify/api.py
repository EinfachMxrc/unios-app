# SPDX-License-Identifier: AGPL-3.0-or-later

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from app.notify.center import CenterView, NotificationCenter


class NotificationUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    read: bool | None = None
    muted: bool | None = None


class MuteInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scope: str = Field(max_length=80)
    enabled: bool


class ReadAllInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    through_id: int = Field(ge=0, le=9223372036854775807)


def notification_router(service: NotificationCenter):
    router = APIRouter(prefix="/api/notifications")

    @router.get("", response_model=CenterView)
    def list_notifications():
        return service.list()

    @router.post("/refresh", response_model=CenterView)
    def refresh_notifications():
        return service.refresh()

    @router.put("/mute", status_code=204)
    def mute(payload: MuteInput):
        service.mute(payload.scope, payload.enabled)

    @router.post("/read-all", response_model=CenterView)
    def mark_all_read(payload: ReadAllInput):
        return service.mark_all_read(payload.through_id)

    @router.patch("/{identifier}", status_code=204)
    def update(identifier: int, payload: NotificationUpdate):
        service.update(identifier, payload.read, payload.muted)

    return router
