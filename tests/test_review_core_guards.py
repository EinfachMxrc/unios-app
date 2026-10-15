# SPDX-License-Identifier: AGPL-3.0-or-later
"""Regressions from the Argon review, using only temporary fictional state."""

import json
from dataclasses import asdict
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text

from app.db.session import make_engine
from app.host.lease import HostLeaseError, LeaseRecord
from app.sessions import SESSION_MAX_AGE_SECONDS, SessionStore


@pytest.mark.parametrize("created", ["expired", "invalid", "naive", "future"])
def test_session_verifiers_reject_invalid_lifetime_without_readonly_writes(tmp_path, created):
    store = SessionStore(tmp_path)
    token = store.create_session("Erfundenes Gerät")
    data = json.loads(store.path.read_text(encoding="utf-8"))
    now = datetime.now(UTC)
    values = {"expired": (now - timedelta(seconds=SESSION_MAX_AGE_SECONDS)).isoformat(),
              "invalid": "invalid", "naive": now.replace(tzinfo=None).isoformat(),
              "future": (now + timedelta(days=1)).isoformat()}
    next(iter(data["sessions"].values()))["created_at"] = values[created]
    store.path.write_text(json.dumps(data), encoding="utf-8")
    before = store.path.read_bytes()
    assert store.verify_session_readonly(token) is False
    assert store.path.read_bytes() == before
    assert store.verify_session(token) is False
    assert store.path.read_bytes() == before


def test_pairing_creation_prunes_expired_and_malformed_codes(tmp_path):
    store = SessionStore(tmp_path)
    expired = store.create_pairing_code().split(".")[0]
    valid = store.create_pairing_code()
    data = json.loads(store.path.read_text(encoding="utf-8"))
    data["pairing_codes"][expired]["expires_at"] = datetime.now(UTC).isoformat()
    data["pairing_codes"]["broken"] = {"expires_at": "invalid"}
    store.path.write_text(json.dumps(data), encoding="utf-8")
    new = store.create_pairing_code().split(".")[0]
    data = json.loads(store.path.read_text(encoding="utf-8"))
    assert set(data["pairing_codes"]) == {valid.split(".")[0], new}
    assert store.redeem_pairing_code(valid, "Erfunden")


def test_standby_allows_read_ctes_but_rejects_cached_writes(coordinator):
    engine = make_engine(coordinator.settings, coordinator)
    read = text("/* read */ WITH values_cte(v) AS MATERIALIZED (SELECT 'fictional') SELECT v FROM values_cte")
    write = text("WITH values_cte(v) AS (SELECT 'fictional') INSERT INTO probe SELECT v FROM values_cte")
    try:
        with engine.connect() as connection:
            connection.execute(text("CREATE TABLE probe (value TEXT)"))
            connection.execute(write)
            connection.commit()
            assert connection.scalar(read) == "fictional"
            lease = coordinator.current()
            assert lease
            changed = LeaseRecord(lease.device_id, lease.device_name, lease.acquired_at,
                                  lease.heartbeat_at, lease.generation + 1)
            coordinator.lease_path.write_text(json.dumps(asdict(changed)), encoding="utf-8")
            assert connection.scalar(read) == "fictional"
            for statement in (write, text("-- comment\nDELETE FROM probe"), text("PRAGMA user_version=123")):
                with pytest.raises(HostLeaseError):
                    connection.execute(statement)
            assert connection.scalar(text("SELECT COUNT(*) FROM probe")) == 1
    finally:
        engine.dispose()


@pytest.mark.parametrize("address", ["http://moodle.example.invalid", "https://moodle.example.invalid/"])
def test_profile_moodle_address_uses_the_settings_validator(tmp_path, monkeypatch, address):
    from app import config, institutions, secrets
    from app.config import Settings

    configured = Settings(_env_file=None, moodle_enabled=False, local_dir=tmp_path / "local", data_dir=tmp_path / "data")
    profile = institutions.load_institution("generic").model_copy(update={"moodle_url": address})
    monkeypatch.setattr(secrets, "require_private_env", lambda path: None)
    monkeypatch.setattr(config, "Settings", lambda **values: configured)
    monkeypatch.setattr(institutions, "chosen_institution", lambda path: "generic")
    monkeypatch.setattr(institutions, "load_institution", lambda slug: profile)
    monkeypatch.setattr(secrets, "load_ntfy_url", lambda: "")
    monkeypatch.setenv("SERVER_MODE", "false")
    config.get_settings.cache_clear()
    try:
        if address.startswith("http:"):
            with pytest.raises(ValueError, match="HTTPS"):
                config.get_settings()
        else:
            assert config.get_settings().moodle_base_url == address.rstrip("/")
    finally:
        config.get_settings.cache_clear()
