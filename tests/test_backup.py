# SPDX-License-Identifier: AGPL-3.0-or-later

"""A backup contains a usable SQLite snapshot and the current host identity."""

import json
import sqlite3
import subprocess

from typer.testing import CliRunner

from app.cli.main import cli
from app.health.backup import main as backup_main


def backup_actions(settings):
    return [json.loads(line) for line in (settings.local_dir / "host-actions.jsonl").read_text(encoding="utf-8").splitlines()]


def test_backup_accepts_native_sqlite_path_and_includes_host_identity(settings, factory, coordinator, monkeypatch):
    configured = settings.model_copy(update={"restic_repository": str(settings.data_dir / "restic-repo"),
                                             "restic_password": "fixture-only"})  # pragma: allowlist secret
    coordinator.settings = configured
    commands = []

    def fake_restic(args, **_kwargs):
        commands.append(args)
        return subprocess.CompletedProcess(args, 0, "", "")

    monkeypatch.setattr("app.health.backup.subprocess.run", fake_restic)
    assert backup_main(coordinator) == 0

    snapshots = list((settings.data_dir / "backup-snapshots").glob("*.sqlite3"))
    assert len(snapshots) == 1
    with sqlite3.connect(snapshots[0]) as database:
        assert database.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert database.execute("SELECT name FROM sqlite_master WHERE name='courses'").fetchone() is not None
    assert commands[0] == ["restic", "backup", str(settings.data_dir), str(coordinator.identity_path)]
    assert commands[1][:2] == ["restic", "forget"]
    statuses = list((settings.data_dir / "backup-status").glob("*.json"))
    assert len(statuses) == 1
    assert json.loads(statuses[0].read_text(encoding="utf-8"))["status"] == "success"
    assert [(entry["kind"], entry.get("path"), entry.get("status")) for entry in backup_actions(settings)] == [
        ("intent", "/internal/backup", None), ("result", None, 200)]


def test_invalid_database_url_is_reported_without_echoing_its_value(settings, coordinator):
    configured = settings.model_copy(update={"database_url": "invalid-url-with-private-value",
                                             "restic_repository": "local",
                                             "restic_password": "fixture-only"})  # pragma: allowlist secret
    coordinator.settings = configured
    assert backup_main(coordinator) == 1
    status = next((settings.data_dir / "backup-status").glob("*.json")).read_text(encoding="utf-8")
    assert "Ungültige Datenbank-URL" in status
    assert "private-value" not in status
    assert backup_actions(settings)[-1]["status"] == 500


def test_cli_backup_reports_machine_readable_success(settings, factory, coordinator, monkeypatch):
    configured = settings.model_copy(update={"restic_repository": str(settings.data_dir / "restic-repo"),
                                             "restic_password": "fixture-only"})  # pragma: allowlist secret
    coordinator.close()
    monkeypatch.setattr("app.cli.main.get_settings", lambda: configured)
    monkeypatch.setattr("app.health.backup.subprocess.run", lambda args, **_kwargs:
                        subprocess.CompletedProcess(args, 0, "", ""))
    result = CliRunner().invoke(cli, ["backup"])
    assert result.exit_code == 0, result.output
    assert json.loads(result.stdout) == {"status": "success"}
    assert backup_actions(settings)[-1]["status"] == 200
