# SPDX-License-Identifier: AGPL-3.0-or-later

"""Local doctor checks must be truthful and must not write or leak secrets."""

import json
import os
import sqlite3
import subprocess

import pytest
from fastapi.testclient import TestClient
from typer.testing import CliRunner

from app.cli.main import cli
from app.health import doctor
from app.health.doctor import Diagnostic
from app.host.syncthing import FolderSyncStatus
from app.main import create_app


def test_doctor_cli_reports_local_readiness_without_secret(monkeypatch, settings, factory, coordinator):
    monkeypatch.setattr("app.cli.main.get_settings", lambda: settings)
    monkeypatch.setattr(doctor, "_tailscale", lambda _settings: Diagnostic("not_configured", "Test"))
    monkeypatch.setattr(doctor, "_syncthing", lambda _settings: Diagnostic("not_configured", "Test"))
    monkeypatch.setattr(doctor, "_disk_encryption", lambda: Diagnostic("unknown", "Test"))
    monkeypatch.setattr(doctor, "_anki_connect", lambda: Diagnostic("not_configured", "Test"))
    result = CliRunner().invoke(cli, ["doctor", "--pretty"])
    assert result.exit_code == 0, result.output
    payload = json.loads(result.stdout)
    assert all(payload["checks"].values())
    assert payload["ready_for_sync"] is True
    assert payload["ready_for_takeover"] is False
    assert payload["diagnostics"]["takeover"]["status"] == "warning"
    assert settings.moodle_token not in result.stdout


def test_doctor_api_is_read_only_and_hides_secret(monkeypatch, settings, factory, coordinator):
    monkeypatch.setattr(doctor, "_tailscale", lambda _settings: Diagnostic("not_configured", "Test"))
    monkeypatch.setattr(doctor, "_syncthing", lambda _settings: Diagnostic("not_configured", "Test"))
    monkeypatch.setattr(doctor, "_disk_encryption", lambda: Diagnostic("unknown", "Test"))
    monkeypatch.setattr(doctor, "_anki_connect", lambda: Diagnostic("not_configured", "Test"))
    database = settings.local_dir / "uni_os.sqlite3"
    with sqlite3.connect(f"{database.as_uri()}?mode=ro", uri=True) as connection:
        before = tuple(connection.iterdump())
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        response = client.get("/api/doctor")
    assert response.status_code == 200
    assert response.json()["ready_for_sync"] is True
    assert response.json()["diagnostics"]["takeover"]["status"] == "warning"
    assert settings.moodle_token not in response.text
    with sqlite3.connect(f"{database.as_uri()}?mode=ro", uri=True) as connection:
        assert tuple(connection.iterdump()) == before


def test_disabled_moodle_connector_stays_off_in_dashboard_api_and_cli(monkeypatch, settings, factory, coordinator):
    disabled = settings.model_copy(update={"moodle_enabled": False})
    monkeypatch.setattr("app.cli.main.get_settings", lambda: disabled)
    with TestClient(create_app(disabled, start_scheduler=False, coordinator=coordinator)) as client:
        assert client.get("/api/overview").json()["moodle_configured"] is False
        assert client.get("/api/system").json()["moodle_configured"] is False
        assert client.post("/api/sync").status_code == 409
        report = client.get("/api/doctor").json()
        assert report["ready_for_sync"] is False
        assert report["diagnostics"]["moodle_token"]["message"] == "Moodle-Connector deaktiviert"
    result = CliRunner().invoke(cli, ["sync"])
    assert result.exit_code == 2
    assert "Moodle-Connector ist deaktiviert" in result.output


def test_doctor_does_not_create_missing_database(monkeypatch, settings, coordinator):
    monkeypatch.setattr(doctor, "_tailscale", lambda _settings: Diagnostic("not_configured", "Test"))
    monkeypatch.setattr(doctor, "_syncthing", lambda _settings: Diagnostic("not_configured", "Test"))
    monkeypatch.setattr(doctor, "_disk_encryption", lambda: Diagnostic("unknown", "Test"))
    monkeypatch.setattr(doctor, "_anki_connect", lambda: Diagnostic("not_configured", "Test"))
    database = settings.local_dir / "uni_os.sqlite3"
    assert not database.exists()
    report = doctor.doctor_report(settings)
    assert report["checks"]["database_reachable"] is False
    assert report["ready_for_sync"] is False
    assert not database.exists()


@pytest.mark.skipif(os.name == "nt", reason="Unix-Dateimodus")
def test_insecure_env_is_not_reported_as_ready(monkeypatch, settings, factory, coordinator, tmp_path):
    monkeypatch.chdir(tmp_path)
    env = tmp_path / ".env"
    env.write_text("MOODLE_TOKEN=fixture-token\n", encoding="utf-8")
    env.chmod(0o644)
    monkeypatch.setattr(doctor, "_tailscale", lambda _settings: Diagnostic("not_configured", "Test"))
    monkeypatch.setattr(doctor, "_syncthing", lambda _settings: Diagnostic("not_configured", "Test"))
    monkeypatch.setattr(doctor, "_disk_encryption", lambda: Diagnostic("unknown", "Test"))
    monkeypatch.setattr(doctor, "_anki_connect", lambda: Diagnostic("not_configured", "Test"))
    report = doctor.doctor_report(settings)
    assert all(report["checks"].values())
    assert report["diagnostics"]["credential_file"]["status"] == "warning"
    assert report["ready_for_sync"] is False


def test_syncthing_accepts_only_fixed_tailscale_addresses(monkeypatch, settings, tmp_path):
    settings.tailscale_ip = "100.101.102.103"
    settings.data_dir.mkdir()
    config = tmp_path / "config.xml"
    monkeypatch.setattr(doctor, "_syncthing_config_paths", lambda: [config])

    def write_config(listener: str, peer: str) -> None:
        config.write_text(f"""<configuration>
          <folder path="{settings.data_dir}" type="sendreceive" />
          <device><address>{peer}</address></device>
          <options>
            <globalAnnounceEnabled>false</globalAnnounceEnabled>
            <relaysEnabled>false</relaysEnabled>
            <natEnabled>false</natEnabled>
            <localAnnounceEnabled>false</localAnnounceEnabled>
            <listenAddress>{listener}</listenAddress>
          </options>
        </configuration>""", encoding="utf-8")

    write_config("tcp://100.101.102.103:22000", "tcp://peer.tailnet.ts.net:22000")
    assert doctor._syncthing(settings).status == "ok"
    write_config("tcp://100.101.102.103.evil.example:22000", "tcp://peer.tailnet.ts.net:22000")
    assert doctor._syncthing(settings).status == "warning"
    write_config("tcp://100.101.102.103:22000", "tcp://peer.tailnet.ts.net.evil.example:22000")
    assert doctor._syncthing(settings).status == "warning"
    write_config("tcp://100.101.102.103:22000", "tcp://peer.tailnet.ts.net:22000")
    assert doctor._syncthing(settings).status == "ok"
    config.write_text(config.read_text(encoding="utf-8").replace('type="sendreceive"', 'type="receiveonly"'),
                      encoding="utf-8")
    assert doctor._syncthing(settings).status == "warning"


def test_syncthing_rest_status_must_match_data_dir_folder(monkeypatch, settings, tmp_path):
    settings.data_dir.mkdir()
    settings.syncthing_folder_id = "uni-data"
    settings.syncthing_api_key = "fixture-syncthing-key"  # pragma: allowlist secret
    config = tmp_path / "config.xml"
    monkeypatch.setattr(doctor, "_syncthing_config_paths", lambda: [config])
    calls = []

    def read_status(api_url, api_key, folder_id):
        calls.append((api_url, api_key, folder_id))
        return FolderSyncStatus(True, "Syncthing meldet den lokalen Ordner vollständig synchron")

    monkeypatch.setattr(doctor, "folder_sync_status", read_status)
    config.write_text(f'<configuration><folder id="other" path="{settings.data_dir}" />'
                      '</configuration>', encoding="utf-8")
    assert doctor._syncthing_sync(settings).status == "warning"
    assert calls == []
    config.write_text(f'<configuration><folder id="uni-data" path="{settings.data_dir}" />'
                      '</configuration>', encoding="utf-8")
    assert doctor._syncthing_sync(settings).status == "ok"
    assert calls == [(settings.syncthing_api_url, settings.syncthing_api_key, "uni-data")]


def test_encryption_status_is_parsed_without_guessing(monkeypatch):
    monkeypatch.setattr(doctor.platform, "system", lambda: "Darwin")
    monkeypatch.setattr(doctor.subprocess, "run", lambda *args, **kwargs: subprocess.CompletedProcess(args, 0, "FileVault is On.\n", ""))
    assert doctor._disk_encryption().status == "ok"
    monkeypatch.setattr(doctor.subprocess, "run", lambda *args, **kwargs: subprocess.CompletedProcess(args, 0, "FileVault is Off.\n", ""))
    assert doctor._disk_encryption().status == "warning"
    monkeypatch.setattr(doctor.platform, "system", lambda: "Windows")
    monkeypatch.setattr(doctor.subprocess, "run", lambda *args, **kwargs: subprocess.CompletedProcess(args, 0, '{"ProtectionStatus": "On"}', ""))
    assert doctor._disk_encryption().status == "ok"
    monkeypatch.setattr(doctor.subprocess, "run", lambda *args, **kwargs: subprocess.CompletedProcess(args, 0, '{"ProtectionStatus": 0}', ""))
    assert doctor._disk_encryption().status == "warning"
    monkeypatch.setattr(doctor.subprocess, "run", lambda *args, **kwargs: subprocess.CompletedProcess(args, 0, '{}', ""))
    assert doctor._disk_encryption().status == "unknown"


def test_tailscale_requires_connected_local_address(monkeypatch, settings):
    settings.tailscale_ip = "100.101.102.103"
    monkeypatch.setattr(doctor.shutil, "which", lambda _name: "/fake/tailscale")
    state = {"BackendState": "Running", "Self": {"TailscaleIPs": ["100.101.102.103"]}}
    monkeypatch.setattr(doctor.subprocess, "run", lambda *args, **kwargs: subprocess.CompletedProcess(args, 0, json.dumps(state), ""))
    assert doctor._tailscale(settings).status == "ok"
    state["Self"]["TailscaleIPs"] = ["100.101.102.104"]
    assert doctor._tailscale(settings).status == "warning"
