# SPDX-License-Identifier: AGPL-3.0-or-later

import json
from dataclasses import asdict

import pytest
from sqlalchemy import text

from app.config import Settings
from app.db.session import make_engine
from app.host.lease import (
    SNAPSHOT_BACKOFF_CAP_SECONDS,
    HostCoordinator,
    HostLeaseError,
    LeaseRecord,
    _snapshot_backoff_seconds,
)


def coordinator(tmp_path, device: str) -> HostCoordinator:
    settings = Settings(_env_file=None, data_dir=tmp_path / "shared", local_dir=tmp_path / device,  # type: ignore[call-arg]  # pydantic-settings runtime option
                        device_name=device, host_heartbeat_seconds=300)
    return HostCoordinator(settings)


def test_no_lease_means_standby_without_shared_writes(tmp_path):
    host = coordinator(tmp_path, "first")
    assert host.start() is False
    assert host.is_writer is False
    assert not host.lease_path.parent.exists()
    with pytest.raises(HostLeaseError, match="Kein Staffelstab"):
        host.assert_writer()


def test_second_device_cannot_write_or_take_existing_lease(tmp_path):
    first = coordinator(tmp_path, "first")
    lease = first.acquire_initial()
    assert lease.generation == 1
    assert first.start() is True
    second = coordinator(tmp_path, "second")
    assert second.start() is False
    with pytest.raises(HostLeaseError, match="gehört bereits"):
        second.acquire_initial()
    assert first.is_writer is True
    assert first.current() == second.current()
    first.close()


def test_same_device_second_process_stays_standby(tmp_path):
    first = coordinator(tmp_path, "first")
    first.acquire_initial()
    assert first.start() is True
    second = coordinator(tmp_path, "first")
    assert second.start() is False
    first.close()
    assert second.start() is True
    second.close()


def test_corrupt_or_changed_lease_fails_closed(tmp_path):
    host = coordinator(tmp_path, "first")
    host.acquire_initial()
    assert host.start() is True
    lease = host.current()
    assert lease is not None
    changed = LeaseRecord(lease.device_id, lease.device_name, lease.acquired_at, lease.heartbeat_at, 2)
    host.lease_path.write_text(json.dumps(asdict(changed)), encoding="utf-8")
    assert host.is_writer is False
    host.close()
    host.lease_path.write_text("{invalid", encoding="utf-8")
    with pytest.raises(HostLeaseError, match="beschädigt"):
        host.start()


def test_lost_lease_blocks_cte_write_on_existing_connection(tmp_path):
    host = coordinator(tmp_path, "first")
    host.acquire_initial()
    assert host.start() is True
    engine = make_engine(host.settings, host)
    with engine.connect() as connection:
        connection.execute(text("CREATE TABLE probe (value TEXT)"))
        cte_insert = text("WITH new_value(value) AS (SELECT 'before') "
                          "INSERT INTO probe(value) SELECT value FROM new_value")
        connection.execute(cte_insert)
        connection.commit()
        assert connection.scalar(text("SELECT COUNT(*) FROM probe")) == 1

        lease = host.current()
        assert lease is not None
        changed = LeaseRecord(lease.device_id, lease.device_name, lease.acquired_at,
                              lease.heartbeat_at, lease.generation + 1)
        host.lease_path.write_text(json.dumps(asdict(changed)), encoding="utf-8")
        assert connection.scalar(text("SELECT COUNT(*) FROM probe")) == 1
        with pytest.raises(HostLeaseError, match="Kein Staffelstab"):
            connection.execute(cte_insert)
        with pytest.raises(HostLeaseError, match="Kein Staffelstab"):
            connection.execute(text("PRAGMA user_version=123"))
        assert connection.scalar(text("SELECT COUNT(*) FROM probe")) == 1
    engine.dispose()
    host.close()


def test_snapshot_backoff_doubles_and_caps_after_repeated_failures():
    base = 900
    assert _snapshot_backoff_seconds(base, 0) == base
    assert _snapshot_backoff_seconds(base, 1) == base * 2
    assert _snapshot_backoff_seconds(base, 2) == base * 4
    assert _snapshot_backoff_seconds(base, 3) == base * 8
    # Keeps doubling until it would exceed the cap, then clamps to it.
    huge_failure_count = 20
    assert _snapshot_backoff_seconds(base, huge_failure_count) == SNAPSHOT_BACKOFF_CAP_SECONDS


def test_snapshot_backoff_resets_to_base_interval_on_success():
    base = 900
    assert _snapshot_backoff_seconds(base, 0) == base
