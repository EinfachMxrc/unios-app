# SPDX-License-Identifier: AGPL-3.0-or-later

"""Known Syncthing conflict copies block handoff and appear in diagnostics."""

import os

import pytest
from fastapi.testclient import TestClient

from app.health.doctor import _syncthing_conflicts
from app.host.conflicts import has_syncthing_conflicts
from app.host.lease import HostLeaseError
from app.main import create_app


def test_conflict_scan_finds_nested_copy_without_reading_it(settings):
    settings.data_dir.mkdir()
    folder = settings.data_dir / "host" / "snapshots"
    folder.mkdir(parents=True)
    (folder / "snapshot.sqlite3.json").write_text("private contents", encoding="utf-8")
    assert has_syncthing_conflicts(settings.data_dir) is False
    assert _syncthing_conflicts(settings).status == "ok"
    conflict = folder / "snapshot.sqlite3.sync-conflict-20260925-073000-TEST.json"
    conflict.write_text("not valid JSON", encoding="utf-8")
    assert has_syncthing_conflicts(settings.data_dir) is True
    warning = _syncthing_conflicts(settings)
    assert warning.status == "warning"
    assert "Konfliktdatei" in warning.message
    assert "private contents" not in warning.message
    assert str(settings.data_dir) not in warning.message


def test_missing_root_never_looks_conflict_free(settings):
    assert _syncthing_conflicts(settings).status == "not_configured"
    with pytest.raises(OSError):
        has_syncthing_conflicts(settings.data_dir)


@pytest.mark.skipif(os.name == "nt", reason="Windows-Testkonto kann keine symbolischen Links anlegen")
def test_symlinked_root_is_not_trusted(settings, tmp_path):
    target = tmp_path / "target"
    target.mkdir()
    settings.data_dir.symlink_to(target, target_is_directory=True)
    assert _syncthing_conflicts(settings).status == "unknown"


def test_known_lease_conflict_revokes_existing_writer(settings, factory, coordinator):
    conflict = settings.data_dir / "host" / "lease.sync-conflict-20260925-073000-TEST.json"
    conflict.write_text("different lease", encoding="utf-8")
    with pytest.raises(HostLeaseError, match="Syncthing-Konflikt"):
        coordinator.assert_writer()
    assert coordinator.is_writer is False
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        assert client.get("/api/host").json()["mode"] == "standby"
        assert client.post("/api/host/snapshot").status_code == 423
    conflict.unlink()
    assert coordinator.is_writer is False
