# SPDX-License-Identifier: AGPL-3.0-or-later

"""The desktop installer keeps user data outside its replaceable binaries."""

import os
import shutil
import sqlite3
import subprocess
import sys

import pytest

from app.config import get_settings
from desktop import backend


def test_startup_probe_does_not_initialize_personal_home_or_credentials(monkeypatch, capsys, tmp_path):
    from app.integrations.storage import Vault

    # Backend CI does not build React. Use a synthetic bundle for this privacy
    # check; frozen-package smoke tests validate the actual packaged interface.
    ui = tmp_path / 'bundle' / 'frontend' / 'dist'
    ui.mkdir(parents=True)
    (ui / 'index.html').write_text('fictional bundled UI', encoding='utf-8')
    monkeypatch.setattr(backend, 'bundle_root', lambda: tmp_path / 'bundle')

    def forbidden(*args, **kwargs):
        raise AssertionError('startup probe must not access personal state')

    monkeypatch.setattr(backend, 'application_home', forbidden)
    monkeypatch.setattr(backend, 'configure_runtime', forbidden)
    monkeypatch.setattr(backend, 'prepare_database', forbidden)
    monkeypatch.setattr(backend, 'attach_mcp_streams', lambda: None)
    monkeypatch.setattr(Vault, 'read', forbidden)
    monkeypatch.setattr(sys, 'argv', ['uniosd', '--startup-check'])
    assert backend.main() == 0
    import json
    result = json.loads(capsys.readouterr().out)
    assert result['ok'] is True and result['client_seconds'] >= 0


def test_runtime_requires_absolute_home_and_bundled_ui(tmp_path, monkeypatch):
    monkeypatch.setenv("UNIOS_HOME", "relative")
    with pytest.raises(ValueError, match="absoluter Pfad"):
        backend.application_home()
    ui = tmp_path / "package" / "frontend" / "dist"
    ui.mkdir(parents=True)
    (ui / "index.html").write_text("fake UI", encoding="utf-8")
    monkeypatch.setattr(backend, "bundle_root", lambda: tmp_path / "package")
    home = tmp_path / "study-home"
    monkeypatch.setenv("UNIOS_HOME", str(home))
    monkeypatch.chdir(tmp_path)
    # `configure_runtime` sets these directly on `os.environ` (it's meant to
    # configure a real, whole-process launch), so pre-register them with
    # monkeypatch here too — otherwise they leak past this test and every
    # later test's `Settings()` would pick up SERVE_REACT=true from the
    # process environment, turning `/`, `/courses`, etc. into the SPA
    # fallback instead of a 404 for the rest of the pytest session.
    for leaked_var in ("DATA_DIR", "LOCAL_DIR", "REACT_DIST_DIR", "SERVE_REACT"):
        monkeypatch.setenv(leaked_var, "placeholder-cleared-by-configure-runtime")
    backend.configure_runtime(home)
    assert home.is_dir()
    assert backend.application_home() == home
    assert os.environ["REACT_DIST_DIR"] == str(ui)
    assert os.getcwd() == str(home)


def test_first_launch_creates_private_database_without_repeating_migration(tmp_path, monkeypatch):
    home = tmp_path / "study-home"
    monkeypatch.setenv("UNIOS_HOME", str(home))
    monkeypatch.setenv("DATA_DIR", str(home / "data"))
    monkeypatch.setenv("LOCAL_DIR", str(home / "local"))
    monkeypatch.setenv("NTFY_URL", "disabled-for-fake-test")
    monkeypatch.setenv("PUBLIC_PERIODS_ENABLED", "false")
    monkeypatch.chdir(tmp_path)
    get_settings.cache_clear()
    try:
        backend.prepare_database()
        database = home / "local" / "uni_os.sqlite3"
        assert database.is_file()
        assert (home / "local" / "setup.json").is_file()
        with sqlite3.connect(database) as connection:
            assert connection.execute("SELECT version_num FROM alembic_version").fetchone()
        backend.prepare_database()
        assert not list((home / "data" / "host" / "snapshots").glob("*.sqlite3"))
    finally:
        get_settings.cache_clear()


def test_second_device_starts_read_only_and_rejects_incompatible_schema(tmp_path, monkeypatch):
    shared = tmp_path / "shared"
    first_local = tmp_path / "first-local"
    second_local = tmp_path / "second-local"
    monkeypatch.setenv("DATA_DIR", str(shared))
    monkeypatch.setenv("LOCAL_DIR", str(first_local))
    monkeypatch.setenv("NTFY_URL", "disabled-for-fake-test")
    monkeypatch.setenv("PUBLIC_PERIODS_ENABLED", "false")
    monkeypatch.chdir(tmp_path)
    get_settings.cache_clear()
    try:
        backend.prepare_database()
        second_local.mkdir()
        database = second_local / "uni_os.sqlite3"
        shutil.copy2(first_local / "uni_os.sqlite3", database)
        monkeypatch.setenv("LOCAL_DIR", str(second_local))
        get_settings.cache_clear()

        backend.prepare_database()
        assert not (second_local / "device.json").exists()
        assert not list((shared / "host" / "snapshots").glob("*.sqlite3"))

        with sqlite3.connect(database) as connection:
            connection.execute("UPDATE alembic_version SET version_num = '2971e84aea78'")
        with pytest.raises(RuntimeError, match="Standby-Datenbank benötigt eine Migration"):
            backend.prepare_database()

        with sqlite3.connect(database) as connection:
            connection.execute("UPDATE alembic_version SET version_num = 'future_schema'")
        lease_before = (shared / "host" / "lease.json").read_bytes()
        with pytest.raises(RuntimeError, match="Datenbank-Schema ist neuer oder unbekannt"):
            backend.prepare_database()
        assert (shared / "host" / "lease.json").read_bytes() == lease_before
        assert not list((shared / "host" / "snapshots").glob("*.sqlite3"))

        monkeypatch.setenv("LOCAL_DIR", str(first_local))
        get_settings.cache_clear()
        with sqlite3.connect(first_local / "uni_os.sqlite3") as connection:
            connection.execute("UPDATE alembic_version SET version_num = 'future_schema'")
        with pytest.raises(RuntimeError, match="Datenbank-Schema ist neuer oder unbekannt"):
            backend.prepare_database()
        assert (shared / "host" / "lease.json").read_bytes() == lease_before
    finally:
        get_settings.cache_clear()


def test_windowed_service_writes_to_a_local_log_instead_of_crashing(tmp_path, monkeypatch):
    """A console-less build has ``sys.stdout is None``; uvicorn calls ``sys.stdout.isatty()``."""
    monkeypatch.setattr(sys, "stdout", None)
    monkeypatch.setattr(sys, "stderr", None)
    stream = backend.attach_log_streams(tmp_path)
    try:
        assert sys.stdout is stream and sys.stderr is stream
        assert sys.stdout.isatty() is False
        print("dienst gestartet", file=sys.stderr)
        sys.stderr.flush()
        assert "dienst gestartet" in (tmp_path / "logs" / "uniosd.log").read_text(encoding="utf-8")
    finally:
        stream.close()


def test_console_build_keeps_its_streams(tmp_path):
    assert backend.attach_log_streams(tmp_path) is None
    assert not (tmp_path / "logs").exists()


def test_oversized_log_is_rotated_on_start(tmp_path, monkeypatch):
    logs = tmp_path / "logs"
    logs.mkdir()
    (logs / "uniosd.log").write_bytes(b"x" * (backend.LOG_LIMIT_BYTES + 1))
    monkeypatch.setattr(sys, "stdout", None)
    monkeypatch.setattr(sys, "stderr", None)
    stream = backend.attach_log_streams(tmp_path)
    try:
        assert (logs / "uniosd.log.1").stat().st_size == backend.LOG_LIMIT_BYTES + 1
        assert (logs / "uniosd.log").stat().st_size == 0
    finally:
        stream.close()


@pytest.mark.skipif(sys.platform != "win32", reason="console windows exist only on Windows")
def test_child_processes_of_the_windowed_service_get_no_console_window(monkeypatch):
    seen: list[int] = []

    def fake_init(self, args, **kwargs):
        seen.append(kwargs.get("creationflags", 0))

    monkeypatch.setattr(subprocess.Popen, "__init__", fake_init)
    backend.hide_child_consoles()
    subprocess.Popen.__init__(object.__new__(subprocess.Popen), ["git", "status"])
    subprocess.Popen.__init__(object.__new__(subprocess.Popen), ["git"], creationflags=subprocess.CREATE_NEW_PROCESS_GROUP)
    assert seen[0] & subprocess.CREATE_NO_WINDOW
    assert seen[1] & subprocess.CREATE_NO_WINDOW and seen[1] & subprocess.CREATE_NEW_PROCESS_GROUP


def test_desktop_window_may_open_external_links_in_the_browser():
    """tauri-plugin-shell turns every ``target=_blank`` click into ``plugin:shell|open``.

    Without this permission the Moodle login link silently does nothing.
    """
    import json
    from pathlib import Path

    capability = json.loads((Path(__file__).parents[1] / "desktop" / "src-tauri" / "capabilities"
                             / "default.json").read_text(encoding="utf-8"))
    assert {"shell:allow-open", "allow-open-moodle-login"} <= set(capability["permissions"])
    assert capability["remote"]["urls"] == ["http://127.0.0.1:8000/*", "http://127.0.0.1:8001/*", "http://127.0.0.1:8002/*"]
