# SPDX-License-Identifier: AGPL-3.0-or-later
"""Profile metadata only; university sessions stay in the user's booking window."""

from fastapi import APIRouter

from app.config import Settings
from app.institutions import load_institution
from app.rooms.service import RoomBookingConfig, booking_config


def rooms_router(settings: Settings) -> APIRouter:
    router = APIRouter(prefix="/api/rooms", tags=["rooms"])

    @router.get("/config", response_model=RoomBookingConfig)
    def config() -> RoomBookingConfig:
        return booking_config(load_institution(settings.institution_slug))

    return router
