# SPDX-License-Identifier: AGPL-3.0-or-later

"""Offline and running releases preserve data and revoke the old writer."""

import importlib
import json
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from datetime import datetime
from threading import Event
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db.models import SyncRun
from app.db.session import make_engine
from app.host.lease import HostCoordinator, HostLeaseError, LeaseRecord
from app.host.release import release_running_host
from app.host.snapshots import SnapshotVerificationError, verified_handoff_snapshot
from app.host.write_gate import WriteGate
from app.main import create_app
from app.sync.scheduler import SyncScheduler


def test_offline_release_publishes_next_generation_and_revokes_writer(settings, factory, coordinator):
    lease = coordinator.current()
    assert lease is not None
    assert lease.released_at is None
    coordinator.close()

    offline = HostCoordinator(settings)
    released = offline.release_offline()
    assert released.generation == lease.generation + 1
    assert released.device_id == lease.device_id
    assert released.released_at is not None
    assert released == offline.current()
    assert offline.is_writer is False
    assert offline.start() is False
    with pytest.raises(HostLeaseError, match="bereits freigegeben"):
        offline.acquire_initial()

    folder = settings.data_dir / "host" / "snapshots"
    manifest = verified_handoff_snapshot(folder, generation=released.generation,
                                         device_id=lease.device_id, max_age_seconds=300)
    assert manifest.generation == released.generation
    assert (folder / manifest.filename).is_file()
    with pytest.raises(HostLeaseError, match="Kein Staffelstab"):
        offline.assert_writer()


def test_release_refuses_running_service_and_running_sync(settings, factory, coordinator):
    other = HostCoordinator(settings)
    with pytest.raises(HostLeaseError, match="gestoppt"):
        other.release_offline()
    assert coordinator.is_writer is True

    with factory() as session:
        session.add(SyncRun(status="running"))
        session.commit()
    coordinator.close()
    with pytest.raises(HostLeaseError, match="noch nicht abgeschlossen"):
        other.release_offline()
    lease = other.current()
    assert lease is not None and lease.generation == 1 and lease.released_at is None
    assert not list((settings.data_dir / "host" / "snapshots").glob("*.json"))


def test_failed_final_snapshot_does_not_release_lease(settings, factory, coordinator, monkeypatch):
    coordinator.close()
    monkeypatch.setattr("app.host.snapshots._sqlite_integrity_check", lambda _path: False)
    with pytest.raises(SnapshotVerificationError, match="nicht konsistent"):
        HostCoordinator(settings).release_offline()
    lease = coordinator.current()
    assert lease is not None and lease.generation == 1 and lease.released_at is None


def test_released_lease_blocks_already_open_writer_connection(settings, factory, coordinator):
    engine = make_engine(settings, coordinator)
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT COUNT(*) FROM sync_runs")) == 0
        lease = coordinator.current()
        assert lease is not None
        released = LeaseRecord(lease.device_id, lease.device_name, lease.acquired_at,
                               lease.heartbeat_at, lease.generation + 1, lease.heartbeat_at)
        coordinator.lease_path.write_text(json.dumps(asdict(released)), encoding="utf-8")
        assert coordinator.is_writer is False
        assert connection.scalar(text("SELECT COUNT(*) FROM sync_runs")) == 0
        with pytest.raises(HostLeaseError, match="Kein Staffelstab"):
            connection.execute(text("INSERT INTO sync_runs (status) VALUES ('running')"))
        with pytest.raises(HostLeaseError, match="Kein Staffelstab"):
            coordinator.heartbeat()
        with TestClient(create_app(settings, connectors=[], start_scheduler=False,
                                   coordinator=coordinator)) as client:
            assert client.get("/api/host").json()["mode"] == "released"
            assert client.post("/api/host/snapshot").status_code == 423
        assert coordinator.current() == released
    engine.dispose()


def test_legacy_lease_parses_and_invalid_release_time_fails():
    original = {
        "device_id": "00000000-0000-0000-0000-000000000001",
        "device_name": "Test-Mac", "acquired_at": "2026-09-25T10:00:00+00:00",
        "heartbeat_at": "2026-09-25T10:05:00+00:00", "generation": 1,
    }
    assert LeaseRecord.parse(original).released_at is None
    with pytest.raises(HostLeaseError, match="beschädigt"):
        LeaseRecord.parse({**original, "released_at": "2026-09-25T09:00:00+00:00"})
    with pytest.raises(HostLeaseError, match="beschädigt"):
        LeaseRecord.parse({**original, "generation": True})


def test_running_release_waits_for_http_writer_then_keeps_service_read_only(settings, factory, coordinator):
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    gate = app.state.write_gate
    scheduler = SyncScheduler(None, settings, coordinator)
    entered = Event()
    finish = Event()

    @app.post("/__test__/held-write")
    def held_write():
        entered.set()
        assert finish.wait(3)
        return {"ok": True}

    with TestClient(app) as client, ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(client.post, "/__test__/held-write")
        assert entered.wait(1)
        releasing = pool.submit(release_running_host, coordinator, scheduler, gate)
        deadline = time.monotonic() + 1
        while not gate.draining and time.monotonic() < deadline:
            time.sleep(0.001)
        assert gate.draining
        assert releasing.done() is False
        assert client.post("/api/host/snapshot").status_code == 423
        finish.set()
        assert first.result(timeout=2).status_code == 200
        released = releasing.result(timeout=2)
        assert released.generation == 2
        assert released.released_at is not None
        assert client.get("/api/host").json()["mode"] == "released"
        assert client.post("/api/host/snapshot").status_code == 423
        assert gate.draining is False


def test_running_release_failure_keeps_writer_and_reopens_gate(settings, factory, coordinator):
    with factory() as session:
        session.add(SyncRun(status="running"))
        session.commit()
    scheduler = SyncScheduler(None, settings, coordinator)
    gate = WriteGate()
    with pytest.raises(HostLeaseError, match="noch nicht abgeschlossen"):
        release_running_host(coordinator, scheduler, gate)
    lease = coordinator.current()
    assert lease is not None and lease.released_at is None and lease.generation == 1
    assert coordinator.is_writer
    assert gate.draining is False
    assert gate.enter()
    gate.leave()


def test_running_release_requires_drained_write_gate(settings, factory, coordinator):
    with pytest.raises(HostLeaseError, match="Schreibanfragen"):
        coordinator.release_active(WriteGate())
    assert coordinator.is_writer


def test_release_api_requires_syncthing_then_keeps_dashboard_read_only(settings, factory, coordinator, monkeypatch):
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.post("/api/host/release", headers={"origin": "https://example.invalid"}).status_code == 403
        assert client.get("/api/host").json()["mode"] == "host"
        unavailable = client.post("/api/host/release")
        assert unavailable.status_code == 409
        assert client.get("/api/host").json()["mode"] == "host"
        monkeypatch.setattr(importlib.import_module("app.main"), "require_syncthing_ready", lambda _settings: None)
        released = client.post("/api/host/release")
        assert released.status_code == 200, released.text
        assert released.json()["mode"] == "released"
        assert released.json()["generation"] == 2
        assert released.json()["released_at"] is not None
        assert client.get("/api/host").json()["mode"] == "released"
        assert client.post("/api/host/snapshot").status_code == 423


def test_failed_running_snapshot_restarts_scheduler(settings, factory, coordinator, monkeypatch):
    hour = datetime.now(settings.timezone).hour
    settings.quiet_hours_start = hour
    settings.quiet_hours_end = (hour + 1) % 24
    scheduler = SyncScheduler(SimpleNamespace(run=lambda: None), settings, coordinator)
    scheduler.start()
    monkeypatch.setattr("app.host.snapshots._sqlite_integrity_check", lambda _path: False)
    try:
        with pytest.raises(SnapshotVerificationError, match="nicht konsistent"):
            release_running_host(coordinator, scheduler, WriteGate())
        assert scheduler.scheduler.running
        assert coordinator.is_writer
        lease = coordinator.current()
        assert lease is not None and lease.released_at is None
    finally:
        scheduler.stop()
