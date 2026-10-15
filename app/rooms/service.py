# SPDX-License-Identifier: AGPL-3.0-or-later
"""Verified booking entry points; no invented occupancy or server-side bookings."""

from pydantic import BaseModel

from app.institutions import InstitutionProfile, load_institution


class RoomBookingConfig(BaseModel):
    url: str | None = None
    rooms: list[str] = []
    start_times: list[str] = []
    durations: list[int] = []


def booking_config(profile: InstitutionProfile) -> RoomBookingConfig:
    if profile.room_booking_provider != "coburg-myapps":
        return RoomBookingConfig()
    return RoomBookingConfig(
        url="https://myapps.hs-coburg.de/raumbuchung",
        rooms=["4-030", "4-031", "4-032", "4-034", "4-035", "4-036", "4-037", "4-038",
               "4-039", "5-U11a"],
        start_times=[f"{minutes // 60:02}:{minutes % 60:02}" for minutes in range(480, 1291, 30)],
        durations=[30, 60, 90, 120, 150, 180],
    )


def config_for_server_profile(value: object) -> RoomBookingConfig:
    """Older servers expose their selected profile through authenticated setup metadata."""
    if not isinstance(value, str) or len(value) > 80:
        return RoomBookingConfig()
    try:
        return booking_config(load_institution(value))
    except (ValueError, FileNotFoundError):
        return RoomBookingConfig()
