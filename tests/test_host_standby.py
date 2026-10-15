# SPDX-License-Identifier: AGPL-3.0-or-later

import hashlib
import sqlite3
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.config import Settings
from app.db.session import make_engine, make_session_factory
from app.health.backup import main as backup_main
from app.host.lease import HostCoordinator, HostLeaseError
from app.main import create_app
from app.notify.service import Notifier
from app.sync.engine import SyncEngine


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_second_device_reads_snapshot_but_cannot_write(settings, factory, coordinator, tmp_path):
    second_local = tmp_path / "other-local"
    second_local.mkdir()
    second_database = second_local / "uni_os.sqlite3"
    with sqlite3.connect(settings.database_url.removeprefix("sqlite:///")) as source, sqlite3.connect(second_database) as target:
        source.backup(target)
    standby_settings = Settings(_env_file=None, data_dir=settings.data_dir, local_dir=second_local,
                                allowed_hosts="127.0.0.1,localhost,[::1],testserver", api_auth_required=False)
    standby = HostCoordinator(standby_settings)
    before = digest(second_database)
    lease_before = digest(coordinator.lease_path)
    with TestClient(create_app(standby_settings, connectors=[], start_scheduler=False, coordinator=standby)) as client:
        host = client.get("/api/host").json()
        assert host["mode"] == "standby"
        assert host["device_name"] == coordinator.current().device_name
        assert host["generation"] == 1
        assert datetime.fromisoformat(host["heartbeat_at"]) == datetime.fromisoformat(coordinator.current().heartbeat_at)
        assert client.get("/api/overview").status_code == 200
        assert client.post("/api/semesters", json={"name": "Gesperrt"}).status_code == 423
        assert client.post("/api/sync").status_code == 423
        assert client.post("/api/host/snapshot").status_code == 423
        assert client.post("/api/notifications/read-all", json={"through_id": 0}).status_code == 423
    assert digest(second_database) == before
    assert digest(coordinator.lease_path) == lease_before
    standby_engine = make_engine(standby_settings, standby)
    with pytest.raises(HostLeaseError, match="Kein Staffelstab"), standby_engine.begin() as connection:
        connection.execute(text("CREATE TABLE forbidden_write (id INTEGER)"))
    standby_engine.dispose()
    assert backup_main(standby) == 1
    assert not (standby_settings.data_dir / "backup-status").exists()
    with pytest.raises(HostLeaseError, match="Kein Staffelstab"):
        SyncEngine(make_session_factory(make_engine(standby_settings, standby)), standby_settings, [],
                   Notifier(standby_settings, standby), standby).run()


def test_same_local_device_second_server_stays_standby(settings, coordinator):
    second = HostCoordinator(settings)
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=second)) as client:
        assert client.get("/api/host").json()["mode"] == "standby"
        assert client.post("/api/sync").status_code == 423
