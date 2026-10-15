# SPDX-License-Identifier: AGPL-3.0-or-later

import hashlib
import json
import sqlite3
from contextlib import closing
from dataclasses import asdict
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.host.lease import HostCoordinator, HostLeaseError
from app.host.snapshots import (
    SnapshotVerificationError,
    create_snapshot,
    snapshot_health,
    verified_handoff_snapshot,
    verify_snapshot,
)
from app.main import create_app


def test_consistent_snapshot_has_hash_and_retention(settings, factory, coordinator):
    settings.snapshot_keep = 2
    folder = settings.data_dir / "host" / "snapshots"
    first = create_snapshot(coordinator)
    assert first.generation == 1
    assert verify_snapshot(folder, first)
    assert verify_snapshot(folder, first, check_integrity=True)
    assert json.loads((folder / f"{first.filename}.json").read_text(encoding="utf-8")) == asdict(first)
    with closing(sqlite3.connect(folder / first.filename)) as snapshot:
        assert snapshot.execute("SELECT count(*) FROM sqlite_master WHERE type='table'").fetchone()[0] > 0
    second = create_snapshot(coordinator)
    third = create_snapshot(coordinator)
    assert not (folder / first.filename).exists()
    assert verify_snapshot(folder, second)
    assert verify_snapshot(folder, third)
    assert len(list(folder.glob("snapshot_*.sqlite3.json"))) == 2


def test_handoff_requires_current_generation_device_and_age(settings, factory, coordinator):
    folder = settings.data_dir / "host" / "snapshots"
    lease = coordinator.current()
    assert lease is not None
    manifest = create_snapshot(coordinator)
    assert verified_handoff_snapshot(folder, generation=lease.generation,
                                     device_id=lease.device_id, max_age_seconds=1800) == manifest
    with pytest.raises(SnapshotVerificationError, match="Staffelstab"):
        verified_handoff_snapshot(folder, generation=lease.generation + 1,
                                  device_id=lease.device_id, max_age_seconds=1800)
    with pytest.raises(SnapshotVerificationError, match="Staffelstab"):
        verified_handoff_snapshot(folder, generation=lease.generation,
                                  device_id="00000000-0000-0000-0000-000000000000", max_age_seconds=1800)
    with pytest.raises(SnapshotVerificationError, match="veraltet"):
        verified_handoff_snapshot(folder, generation=lease.generation,
                                  device_id=lease.device_id, max_age_seconds=-1)
    manifest_path = folder / f"{manifest.filename}.json"
    mismatched = json.loads(manifest_path.read_text(encoding="utf-8"))
    mismatched["generation"] = lease.generation + 1
    manifest_path.write_text(json.dumps(mismatched), encoding="utf-8")
    with pytest.raises(SnapshotVerificationError, match="ungültig"):
        verified_handoff_snapshot(folder, generation=lease.generation + 1,
                                  device_id=lease.device_id, max_age_seconds=1800)
    stale = json.loads(manifest_path.read_text(encoding="utf-8"))
    stale["generation"] = lease.generation
    stale["created_at"] = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    manifest_path.write_text(json.dumps(stale), encoding="utf-8")
    with pytest.raises(SnapshotVerificationError, match="veraltet"):
        verified_handoff_snapshot(folder, generation=lease.generation,
                                  device_id=lease.device_id, max_age_seconds=1800)


def test_handoff_rejects_non_sqlite_snapshot_even_with_matching_hash(settings, factory, coordinator):
    folder = settings.data_dir / "host" / "snapshots"
    lease = coordinator.current()
    assert lease is not None
    manifest = create_snapshot(coordinator)
    corrupted = b"erfundene, ungueltige SQLite-Datei"
    (folder / manifest.filename).write_bytes(corrupted)
    manifest_path = folder / f"{manifest.filename}.json"
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    payload["sha256"] = hashlib.sha256(corrupted).hexdigest()
    manifest_path.write_text(json.dumps(payload), encoding="utf-8")
    with pytest.raises(SnapshotVerificationError, match="SQLite-Struktur"):
        verified_handoff_snapshot(folder, generation=lease.generation,
                                  device_id=lease.device_id, max_age_seconds=1800)


def test_handoff_refuses_latest_invalid_manifest_instead_of_using_older(settings, factory, coordinator):
    folder = settings.data_dir / "host" / "snapshots"
    lease = coordinator.current()
    assert lease is not None
    older = create_snapshot(coordinator)
    latest = create_snapshot(coordinator)
    (folder / f"{latest.filename}.json").write_text("{invalid", encoding="utf-8")
    assert verify_snapshot(folder, older, check_integrity=True)
    with pytest.raises(SnapshotVerificationError, match="ungültig"):
        verified_handoff_snapshot(folder, generation=lease.generation,
                                  device_id=lease.device_id, max_age_seconds=1800)


def test_snapshot_is_not_published_when_sqlite_integrity_check_fails(settings, factory, coordinator, monkeypatch):
    folder = settings.data_dir / "host" / "snapshots"
    monkeypatch.setattr("app.host.snapshots._sqlite_integrity_check", lambda _path: False)
    with pytest.raises(SnapshotVerificationError, match="nicht konsistent"):
        create_snapshot(coordinator)
    assert not list(folder.iterdir())


def test_standby_cannot_create_snapshot(settings, factory, tmp_path):
    standby_settings = settings.model_copy(update={"local_dir": tmp_path / "other"})
    standby = HostCoordinator(standby_settings)
    with pytest.raises(HostLeaseError, match="Kein Staffelstab"):
        create_snapshot(standby)
    assert not (settings.data_dir / "host" / "snapshots").exists()


def test_snapshot_health_verifies_current_manifest_and_detects_damage(settings, factory, coordinator):
    folder = settings.data_dir / "host" / "snapshots"
    lease = coordinator.current()
    assert snapshot_health(folder, lease.generation, lease.device_id, 900).status == "warning"
    manifest = create_snapshot(coordinator)
    healthy = snapshot_health(folder, lease.generation, lease.device_id, 900)
    assert healthy.status == "ok"
    assert healthy.generation == 1
    assert healthy.age_seconds is not None and healthy.age_seconds < 30
    assert snapshot_health(folder, 2, lease.device_id, 900).status == "warning"
    manifest_path = folder / f"{manifest.filename}.json"
    old_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    old_manifest["created_at"] = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    manifest_path.write_text(json.dumps(old_manifest), encoding="utf-8")
    assert snapshot_health(folder, lease.generation, lease.device_id, 900).message == (
        "Letzter Datenbank-Snapshot ist überfällig"
    )
    (folder / manifest.filename).write_bytes(b"damaged test snapshot")
    damaged = snapshot_health(folder, lease.generation, lease.device_id, 900)
    assert damaged.status == "error"
    assert "ungültig" in damaged.message


def test_host_can_create_verified_snapshot_through_api(settings, factory, coordinator):
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        assert client.get("/api/system").json()["snapshot"]["status"] == "warning"
        response = client.post("/api/host/snapshot")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
        assert client.get("/api/system").json()["snapshot"]["status"] == "ok"


def test_snapshot_api_hides_local_errors(monkeypatch, settings, factory, coordinator):
    def fail(_coordinator):
        raise OSError("private-path-and-secret")

    monkeypatch.setattr("app.web.api.create_snapshot", fail)
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        response = client.post("/api/host/snapshot")
    assert response.status_code == 503
    assert "private-path-and-secret" not in response.text
