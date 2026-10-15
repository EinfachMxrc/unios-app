# SPDX-License-Identifier: AGPL-3.0-or-later

"""Preferences survive restart and reject stale or unsafe updates."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.runtime.api import runtime_router
from app.runtime.repository import RuntimeRepository
from app.runtime.service import RuntimeService
from app.sync.scheduler import SyncScheduler


def test_runtime_settings_are_persistent_and_live(settings, factory, coordinator):
    scheduler = SyncScheduler(object(), settings, coordinator)
    service = RuntimeService(RuntimeRepository(factory), settings, scheduler, coordinator)
    app = FastAPI()
    app.include_router(runtime_router(service, coordinator))
    client = TestClient(app)

    initial = client.get("/api/runtime-settings").json()
    assert initial["revision"] == 0
    values = {**initial["values"], "sync_interval_minutes": 30,
              "quiet_hours_start": 22, "quiet_hours_end": 6,
              "snapshot_interval_minutes": 20, "deadline_warning_days": [7, 2],
              "automatic_takeover_enabled": False}
    updated = client.put("/api/runtime-settings", json={"expected_revision": 0, "values": values})
    assert updated.status_code == 200
    assert updated.json()["revision"] == 1
    assert settings.sync_interval_minutes == 30
    assert settings.snapshot_interval_seconds == 1200
    assert settings.warning_days == (7, 2)
    assert settings.automatic_takeover_enabled is False
    assert client.put("/api/runtime-settings", json={"expected_revision": 0, "values": values}).status_code == 409
    assert client.put("/api/runtime-settings", json={"expected_revision": 1,
        "values": {**values, "quiet_hours_end": None}}).status_code == 422
    assert client.put("/api/runtime-settings", json={"expected_revision": 1,
        "values": {**values, "deadline_warning_days": [7, 7]}}).status_code == 422

    fresh_settings = settings.model_copy(update={"sync_interval_minutes": 60,
        "snapshot_interval_seconds": 900, "automatic_takeover_enabled": True})
    fresh_scheduler = SyncScheduler(object(), fresh_settings, coordinator)
    restarted = RuntimeService(RuntimeRepository(factory), fresh_settings, fresh_scheduler, coordinator)
    assert restarted.load().values.sync_interval_minutes == 30
    assert fresh_settings.snapshot_interval_seconds == 1200
