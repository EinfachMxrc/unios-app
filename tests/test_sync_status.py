# SPDX-License-Identifier: AGPL-3.0-or-later
from concurrent.futures import ThreadPoolExecutor
from threading import Event

from fastapi.testclient import TestClient

from app.db.models import SyncRun
from app.main import create_app
from tests.test_moodle_sync import FixtureMoodle


def test_concurrent_refresh(settings, factory, coordinator, monkeypatch):
    moodle = FixtureMoodle(settings)
    entered, release = Event(), Event()
    original = moodle.connector.fetch_changes

    def blocked_fetch(*, since=None):
        entered.set()
        assert release.wait(15)
        return original(since=since)

    monkeypatch.setattr(moodle.connector, "fetch_changes", blocked_fetch)
    app = create_app(settings, connectors=[moodle.connector], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client, ThreadPoolExecutor(max_workers=1) as pool:
        assert client.get("/api/sync/status").json()["running"] is False
        job = pool.submit(app.state.sync_engine.run)
        try:
            assert entered.wait(10)
            status = client.get("/api/sync/status").json()
            assert status["running"] is True
            assert status["last_status"] == "running"
            duplicate = client.post("/api/sync")
            assert duplicate.status_code == 409
            assert duplicate.json()["detail"] == "Sync läuft bereits"
        finally:
            release.set()
        result = job.result(timeout=15)
        assert result.status == "success"
        assert client.get("/api/sync/status").json() == {
            "running": False, "last_run_id": result.id, "last_status": "success",
        }


def test_abandoned_run_is_not_reported_as_still_running(settings, factory, coordinator):
    with factory() as session:
        session.add(SyncRun(status="running"))
        session.commit()
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        status = client.get("/api/sync/status").json()
        assert status["running"] is False
        assert status["last_status"] == "running"
        assert client.post("/api/sync").status_code == 409  # Unconfigured is a real error.
