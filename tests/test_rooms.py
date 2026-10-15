# SPDX-License-Identifier: AGPL-3.0-or-later
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.institutions import load_institution
from app.rooms.api import rooms_router
from app.rooms.service import booking_config


def test_verified_configuration_is_not_an_occupancy_claim():
    config = booking_config(load_institution("hs-coburg"))
    assert config.url == "https://myapps.hs-coburg.de/raumbuchung"
    assert config.start_times == [f"{n // 60:02}:{n % 60:02}" for n in range(480, 1291, 30)]
    assert config.durations == [30, 60, 90, 120, 150, 180]
    assert len(config.rooms) == 10
    assert "4-033" not in config.rooms
    assert "available" not in config.model_dump()


def test_other_institution_has_no_guessed_booking_service():
    assert booking_config(load_institution("generic")).url is None
    assert booking_config(load_institution("generic")).rooms == []


def test_configuration_uses_current_profile_and_exposes_no_booking_endpoint(settings):
    app = FastAPI()
    app.include_router(rooms_router(settings))
    client = TestClient(app)
    assert client.get("/api/rooms/config").json()["url"] is not None
    assert client.post("/api/rooms/config", json={}).status_code == 405
    assert client.post("/api/rooms/book", json={}).status_code == 404
    settings.institution_slug = "generic"
    assert client.get("/api/rooms/config").json()["url"] is None
