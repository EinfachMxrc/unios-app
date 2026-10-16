# SPDX-License-Identifier: AGPL-3.0-or-later

"""Two simulated devices exchange the shared folder without sharing live SQLite."""

import json
import os
import shutil
import sqlite3
from dataclasses import asdict
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.config import Settings
from app.db.models import Base, SyncRun
from app.db.session import make_engine, make_session_factory
from app.health import doctor
from app.host.handoff import (
    HandoffError,
    _install_snapshot,
    acquire_released,
    acquire_stale,
)
from app.host.lease import HostCoordinator, _atomic_json
from app.host.snapshots import _sha256, create_snapshot
from app.host.syncthing import FolderSyncStatus
from app.main import create_app


def device(tmp_path: Path, name: str) -> Settings:
    return Settings(
        _env_file=None,  # type: ignore[call-arg]  # pydantic-settings runtime option
        data_dir=tmp_path / name / "shared", local_dir=tmp_path / name / "local",
        device_name=name, tailscale_ip="100.101.102.103", syncthing_folder_id="uni-data",
        syncthing_api_key="fixture-syncthing-key",  # pragma: allowlist secret
        allowed_hosts="127.0.0.1,localhost,[::1],testserver", api_auth_required=False,
    )


def fake_syncthing_config(monkeypatch, settings: Settings) -> None:
    settings.local_dir.mkdir(parents=True, exist_ok=True)
    config = settings.local_dir / "syncthing-config.xml"
    config.write_text(
        f'<configuration><folder id="uni-data" path="{settings.data_dir}" type="sendreceive" />'
        '<device><address>tcp://peer.tailnet.ts.net:22000</address></device>'
        '<options><globalAnnounceEnabled>false</globalAnnounceEnabled>'
        '<relaysEnabled>false</relaysEnabled><natEnabled>false</natEnabled>'
        '<localAnnounceEnabled>false</localAnnounceEnabled>'
        '<listenAddress>tcp://100.101.102.103:22000</listenAddress></options></configuration>',
        encoding="utf-8",
    )
    monkeypatch.setattr(doctor, "_syncthing_config_paths", lambda: [config])


def add_current_schema(engine) -> None:
    root = Path(__file__).resolve().parents[1]
    config = Config(str(root / "alembic.ini"))
    head = ScriptDirectory.from_config(config).get_current_head()
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL)"))
        connection.execute(text("DELETE FROM alembic_version"))
        connection.execute(text("INSERT INTO alembic_version VALUES (:version)"), {"version": head})


def create_first_host(settings: Settings) -> HostCoordinator:
    host = HostCoordinator(settings)
    host.acquire_initial()
    assert host.start()
    engine = make_engine(settings, host)
    Base.metadata.create_all(engine)
    add_current_schema(engine)
    with make_session_factory(engine)() as session:
        session.add(SyncRun(status="success"))
        session.commit()
    engine.dispose()
    host.close()
    HostCoordinator(settings).release_offline()
    return host


def sync_folder(source: Settings, target: Settings) -> None:
    shutil.copytree(source.data_dir, target.data_dir, dirs_exist_ok=True)


def sync_runs(settings: Settings) -> int:
    with sqlite3.connect(settings.local_dir / "uni_os.sqlite3") as database:
        return database.execute("SELECT COUNT(*) FROM sync_runs").fetchone()[0]


def stale_host_fixture(tmp_path: Path, monkeypatch) -> tuple[Settings, Settings]:
    mac = device(tmp_path, "Test-Mac").model_copy(update={"host_health_url": "https://mac.example.ts.net/health"})
    pc = device(tmp_path, "Test-PC").model_copy(update={"host_health_url": "https://pc.example.ts.net/health"})
    host = HostCoordinator(mac)
    lease = host.acquire_initial()
    assert host.start(background=False)
    engine = make_engine(mac, host)
    Base.metadata.create_all(engine)
    add_current_schema(engine)
    with make_session_factory(engine)() as session:
        session.add(SyncRun(status="success"))
        session.commit()
    engine.dispose()
    create_snapshot(host)
    host.close()
    stale = asdict(lease)
    stale["heartbeat_at"] = (datetime.now(UTC) - timedelta(hours=3)).isoformat()
    _atomic_json(host.lease_path, stale)
    sync_folder(mac, pc)
    fake_syncthing_config(monkeypatch, pc)
    monkeypatch.setattr(doctor, "folder_sync_status", lambda *_args: FolderSyncStatus(True, "Fertig"))
    return mac, pc


def test_stale_host_takeover_restores_snapshot_and_old_host_stays_standby(tmp_path, monkeypatch):
    from app.host import handoff

    mac, pc = stale_host_fixture(tmp_path, monkeypatch)
    checks = []
    monkeypatch.setattr(handoff, "remote_host_offline", lambda url: checks.append(url) or True)
    claimed = acquire_stale(pc)
    assert claimed.generation == 2
    assert claimed.health_url == "https://pc.example.ts.net/health"
    assert checks == ["https://mac.example.ts.net/health"] * 2
    assert sync_runs(pc) == 1
    sync_folder(pc, mac)
    former = HostCoordinator(mac)
    assert former.start(background=False) is False
    assert former.is_writer is False
    former.close()


def test_stale_host_takeover_blocks_reachable_host_and_stale_snapshot(tmp_path, monkeypatch):
    from app.host import handoff

    _mac, pc = stale_host_fixture(tmp_path, monkeypatch)
    monkeypatch.setattr(handoff, "remote_host_offline", lambda _url: False)
    with pytest.raises(HandoffError, match="erreichbar"):
        acquire_stale(pc)
    assert not (pc.local_dir / "uni_os.sqlite3").exists()
    monkeypatch.setattr(handoff, "remote_host_offline", lambda _url: True)
    too_old = pc.model_copy(update={"automatic_takeover_snapshot_max_age_seconds": 0})
    with pytest.raises(HandoffError, match="Snapshot"):
        acquire_stale(too_old)
    assert not (pc.local_dir / "uni_os.sqlite3").exists()


def test_running_standby_switches_to_host_after_checked_takeover(tmp_path, monkeypatch):
    from app.host import handoff

    _mac, pc = stale_host_fixture(tmp_path, monkeypatch)
    monkeypatch.setattr(handoff, "remote_host_offline", lambda _url: True)
    app = create_app(pc, connectors=[], start_scheduler=False)
    scheduler_starts = []
    monkeypatch.setattr(app.state.standby_monitor.scheduler, "start", lambda: scheduler_starts.append(True))
    workers = []
    monkeypatch.setattr(app.state.background_jobs, "start", lambda: workers.append("jobs"))
    monkeypatch.setattr(app.state.corpus_worker, "start", lambda: workers.append("corpus"))
    monkeypatch.setattr(app.state.coding_service.repository, "recover", lambda _guard: workers.append("coding"))
    with TestClient(app) as client:
        assert client.get("/api/host").json()["mode"] == "standby"
        assert workers == []
        assert app.state.standby_monitor.run_once() is True
        assert client.get("/api/host").json()["mode"] == "host"
        assert scheduler_starts == [True]
        # The writer-only workers must start after a takeover, not only at process start.
        assert workers == ["coding", "jobs", "corpus"]


def test_standby_startup_claims_stale_host_before_serving(tmp_path, monkeypatch):
    from app.host import handoff

    _mac, pc = stale_host_fixture(tmp_path, monkeypatch)
    monkeypatch.setattr(handoff, "remote_host_offline", lambda _url: True)
    app = create_app(pc, connectors=[], start_scheduler=True)
    monkeypatch.setattr(app.state.standby_monitor.scheduler, "start", lambda: None)
    with TestClient(app) as client:
        assert client.get("/api/host").json()["mode"] == "host"
        assert client.get("/api/host").json()["generation"] == 2


def test_standby_monitor_reopens_requests_after_drain_timeout(tmp_path, monkeypatch):
    from app.host.write_gate import WriteGate

    _mac, pc = stale_host_fixture(tmp_path, monkeypatch)
    app = create_app(pc, connectors=[], start_scheduler=False)
    monitor = app.state.standby_monitor
    gate = monitor.request_gate
    assert gate.enter()
    original_drain = WriteGate.drain
    monkeypatch.setattr(gate, "drain", lambda **_kwargs: original_drain(gate, timeout_seconds=0))
    try:
        assert monitor.run_once() is False
        assert gate.draining is False
        assert gate.enter()
        gate.leave()
    finally:
        gate.leave()


def test_remote_offline_requires_matching_tailscale_peer_and_failed_health(monkeypatch):
    from app.host import handoff

    calls = []
    monkeypatch.setattr(handoff.shutil, "which", lambda _name: "tailscale")

    def status(*_args, **_kwargs):
        return SimpleNamespace(returncode=0, stdout=json.dumps({
            "BackendState": "Running", "Peer": {"peer": {
                "DNSName": "mac.example.ts.net.", "Online": False,
            }},
        }))

    monkeypatch.setattr(handoff.subprocess, "run", status)

    class Unreachable:
        def __init__(self, **_kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def get(self, url):
            calls.append(url)
            raise httpx.ConnectTimeout("fixture timeout")

    monkeypatch.setattr(handoff.httpx, "Client", Unreachable)
    assert handoff.remote_host_offline("https://mac.example.ts.net/health") is True
    assert calls == ["https://mac.example.ts.net/health"]
    assert handoff.remote_host_offline("http://mac.example.ts.net/health") is False
    assert handoff.remote_host_offline("https://public.example.com/health") is False
    assert calls == ["https://mac.example.ts.net/health"]

    def online(*_args, **_kwargs):
        return SimpleNamespace(returncode=0, stdout=json.dumps({
            "BackendState": "Running", "Peer": {"peer": {
                "DNSName": "mac.example.ts.net.", "Online": True,
            }},
        }))

    monkeypatch.setattr(handoff.subprocess, "run", online)
    assert handoff.remote_host_offline("https://mac.example.ts.net/health") is False
    assert calls == ["https://mac.example.ts.net/health"]


def test_planned_mac_pc_mac_handoff_restores_both_local_databases(tmp_path, monkeypatch):
    mac = device(tmp_path, "Test-Mac")
    pc = device(tmp_path, "Test-PC")
    create_first_host(mac)
    sync_folder(mac, pc)
    fake_syncthing_config(monkeypatch, pc)
    checks = []

    def complete(_api_url, _api_key, folder_id):
        checks.append(folder_id)
        return FolderSyncStatus(True, "Syncthing meldet den lokalen Ordner vollständig synchron")

    monkeypatch.setattr(doctor, "folder_sync_status", complete)
    standby = HostCoordinator(pc)
    assert standby.start() is False
    missing_token = doctor.doctor_report(pc)
    assert missing_token["ready_for_takeover"] is False
    assert missing_token["diagnostics"]["takeover"]["message"] == "Moodle-Token fehlt auf diesem Gerät"
    ready = doctor.doctor_report(pc.model_copy(update={"moodle_token": "fixture-token"}))  # pragma: allowlist secret
    assert ready["ready_for_takeover"] is True
    checks.clear()
    with pytest.raises(HandoffError, match="gestoppt"):
        acquire_released(pc)
    standby.close()

    first_claim = acquire_released(pc)
    assert first_claim.device_name == "Test-PC"
    assert first_claim.generation == 2
    assert sync_runs(pc) == 1
    assert checks == ["uni-data", "uni-data"]

    pc_host = HostCoordinator(pc)
    assert pc_host.start()
    engine = make_engine(pc, pc_host)
    with make_session_factory(engine)() as session:
        session.add(SyncRun(status="success"))
        session.commit()
    engine.dispose()
    pc_host.close()
    HostCoordinator(pc).release_offline()
    sync_folder(pc, mac)
    fake_syncthing_config(monkeypatch, mac)

    second_claim = acquire_released(mac)
    assert second_claim.device_name == "Test-Mac"
    assert second_claim.generation == 3
    assert sync_runs(mac) == 2
    archives = list((mac.local_dir / "handoff-archives").glob("*/uni_os.sqlite3"))
    assert len(archives) == 1
    with sqlite3.connect(archives[0]) as archived:
        assert archived.execute("SELECT COUNT(*) FROM sync_runs").fetchone()[0] == 1


def test_takeover_refuses_unreleased_or_incomplete_shared_folder(tmp_path, monkeypatch):
    mac = device(tmp_path, "Test-Mac")
    pc = device(tmp_path, "Test-PC")
    owner = HostCoordinator(mac)
    owner.acquire_initial()
    sync_folder(mac, pc)
    with pytest.raises(HandoffError, match="Kein freigegebener"):
        acquire_released(pc)
    assert not (pc.local_dir / "device.json").exists()
    assert not (pc.local_dir / "uni_os.sqlite3").exists()

    create_first_host(mac)
    sync_folder(mac, pc)
    fake_syncthing_config(monkeypatch, pc)
    monkeypatch.setattr(doctor, "folder_sync_status", lambda *_args: FolderSyncStatus(False, "Nicht fertig"))
    with pytest.raises(HandoffError, match="nicht vollständig"):
        acquire_released(pc)
    assert HostCoordinator(pc).current().released_at is not None
    assert not (pc.local_dir / "uni_os.sqlite3").exists()
    monkeypatch.setattr(doctor, "folder_sync_status", lambda *_args: FolderSyncStatus(True, "Fertig"))
    config = pc.local_dir / "syncthing-config.xml"
    config.write_text(config.read_text(encoding="utf-8").replace('type="sendreceive"', 'type="receiveonly"'),
                      encoding="utf-8")
    with pytest.raises(HandoffError, match="nicht vollständig"):
        acquire_released(pc)
    assert not (pc.local_dir / "uni_os.sqlite3").exists()

    fake_syncthing_config(monkeypatch, mac)
    with pytest.raises(HandoffError, match="selbst"):
        acquire_released(mac)


def test_takeover_refuses_corrupt_latest_snapshot_and_external_database(tmp_path, monkeypatch):
    mac = device(tmp_path, "Test-Mac")
    pc = device(tmp_path, "Test-PC")
    create_first_host(mac)
    sync_folder(mac, pc)
    fake_syncthing_config(monkeypatch, pc)
    monkeypatch.setattr(doctor, "folder_sync_status", lambda *_args: FolderSyncStatus(True, "Fertig"))
    wrong_path = pc.model_copy(update={"database_url": f"sqlite:///{tmp_path / 'outside.sqlite3'}"})
    with pytest.raises(HandoffError, match="außerhalb|ungeeignet"):
        acquire_released(wrong_path)
    assert not (tmp_path / "outside.sqlite3").exists()

    manifest = max((pc.data_dir / "host" / "snapshots").glob("*.json"))
    manifest.write_text("{invalid", encoding="utf-8")
    with pytest.raises(HandoffError, match="Snapshot"):
        acquire_released(pc)
    assert not (pc.local_dir / "uni_os.sqlite3").exists()


def test_takeover_refuses_snapshot_from_newer_schema(tmp_path, monkeypatch):
    mac = device(tmp_path, "Test-Mac")
    pc = device(tmp_path, "Test-PC")
    create_first_host(mac)
    snapshot = max((mac.data_dir / "host" / "snapshots").glob("*.sqlite3"))
    with sqlite3.connect(snapshot) as database:
        database.execute("PRAGMA journal_mode=DELETE")
        database.execute("UPDATE alembic_version SET version_num = 'future_schema'")
    with sqlite3.connect(snapshot) as database:
        assert database.execute("SELECT version_num FROM alembic_version").fetchone() == ("future_schema",)
    manifest_path = snapshot.with_name(f"{snapshot.name}.json")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["sha256"] = _sha256(snapshot)
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    sync_folder(mac, pc)
    fake_syncthing_config(monkeypatch, pc)
    monkeypatch.setattr(doctor, "folder_sync_status", lambda *_args: FolderSyncStatus(True, "Fertig"))

    with pytest.raises(HandoffError, match="Schema-Version"):
        acquire_released(pc)
    assert HostCoordinator(pc).current().released_at is not None
    assert not (pc.local_dir / "uni_os.sqlite3").exists()


def test_takeover_refuses_syncthing_conflict_copy_in_host_folder(tmp_path, monkeypatch):
    mac = device(tmp_path, "Test-Mac")
    pc = device(tmp_path, "Test-PC")
    create_first_host(mac)
    sync_folder(mac, pc)
    fake_syncthing_config(monkeypatch, pc)
    monkeypatch.setattr(doctor, "folder_sync_status", lambda *_args: FolderSyncStatus(True, "Fertig"))
    (pc.data_dir / "host" / "lease.sync-conflict-20260925-073000-TEST.json").write_text(
        "different candidate", encoding="utf-8",
    )
    with pytest.raises(HandoffError, match="Syncthing-Konflikt"):
        acquire_released(pc)
    assert not (pc.local_dir / "uni_os.sqlite3").exists()
    assert HostCoordinator(pc).current().released_at is not None


@pytest.mark.skipif(os.name == "nt", reason="Windows-Testkonto kann keine symbolischen Links anlegen")
def test_restore_preserves_old_database_and_wal_but_refuses_archive_symlink(tmp_path):
    local = tmp_path / "local"
    local.mkdir()
    target = local / "uni_os.sqlite3"
    target.write_bytes(b"old database")
    wal = local / "uni_os.sqlite3-wal"
    wal.write_bytes(b"old write-ahead log")
    stage = local / ".staged.tmp"
    stage.write_bytes(b"verified new database")
    outside = tmp_path / "outside"
    outside.mkdir()
    (local / "handoff-archives").symlink_to(outside, target_is_directory=True)
    with pytest.raises(HandoffError, match="Archiv"):
        _install_snapshot(stage, target)
    assert target.read_bytes() == b"old database"
    assert wal.read_bytes() == b"old write-ahead log"
    assert stage.exists()
    assert not list(outside.iterdir())

    (local / "handoff-archives").unlink()
    _install_snapshot(stage, target)
    assert target.read_bytes() == b"verified new database"
    archive = next((local / "handoff-archives").iterdir())
    assert (archive / target.name).read_bytes() == b"old database"
    assert (archive / wal.name).read_bytes() == b"old write-ahead log"


def test_restarted_scheduler_keeps_jobs_registered_by_other_services(tmp_path, monkeypatch):
    _mac, pc = stale_host_fixture(tmp_path, monkeypatch)
    app = create_app(pc, connectors=[], start_scheduler=False)
    scheduler = app.state.standby_monitor.scheduler
    scheduler.add_recurring(lambda: None, job_id="notification-center", minutes=15)
    scheduler.start()
    try:
        assert scheduler.scheduler.get_job("notification-center") is not None
        scheduler.stop()
        scheduler.start()
        assert scheduler.scheduler.get_job("notification-center") is not None
    finally:
        scheduler.stop()
