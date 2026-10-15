# SPDX-License-Identifier: AGPL-3.0-or-later

"""Konsistentes SQLite-Abbild und restic-Backup mit Statusdatei."""

import json
import os
import sqlite3
import subprocess
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

from app.config import get_settings
from app.host.actions import ActionJournal
from app.host.lease import HostCoordinator, HostLeaseError


def main(coordinator: HostCoordinator | None = None, *, quiet: bool = False) -> int:
    settings = coordinator.settings if coordinator is not None else get_settings()
    owns_coordinator = coordinator is None
    coordinator = coordinator or HostCoordinator(settings)
    if owns_coordinator and not coordinator.start():
        if not quiet:
            print("Kein Staffelstab oder bereits aktive Host-Instanz")
        return 1
    try:
        coordinator.assert_writer()
    except HostLeaseError:
        if not quiet:
            print("Kein Staffelstab für Backup")
        if owns_coordinator:
            coordinator.close()
        return 1
    try:
        action_id = ActionJournal(settings).begin_operation(coordinator, "backup")
    except (OSError, RuntimeError):
        if not quiet:
            print("Backup konnte nicht sicher protokolliert werden")
        if owns_coordinator:
            coordinator.close()
        return 1
    now = datetime.now(UTC)
    status_dir = settings.data_dir / "backup-status"
    snapshot_dir = settings.data_dir / "backup-snapshots"
    status_dir.mkdir(parents=True, exist_ok=True)
    snapshot_dir.mkdir(parents=True, exist_ok=True)
    status = {"started_at": now.isoformat(), "status": "error", "message": ""}
    try:
        if not settings.restic_repository or not settings.restic_password:
            raise RuntimeError("RESTIC_REPOSITORY oder RESTIC_PASSWORD fehlt")
        try:
            database_url = make_url(settings.database_url)
        except ArgumentError:
            raise RuntimeError("Ungültige Datenbank-URL") from None
        if database_url.get_backend_name() != "sqlite" or not database_url.database or database_url.database == ":memory:":
            raise RuntimeError("Backup unterstützt nur eine SQLite-Datei")
        database_path = Path(database_url.database)
        if not database_path.is_file():
            raise RuntimeError("Datenbankdatei fehlt")
        snapshot = snapshot_dir / f"uni_os_{now:%Y%m%dT%H%M%S%fZ}.sqlite3"
        # SQLite-Backup-API erzeugt auch während eines laufenden Syncs ein konsistentes Bild.
        with sqlite3.connect(database_path) as source, sqlite3.connect(snapshot) as target:
            source.backup(target)
        environment = os.environ.copy()
        environment["RESTIC_REPOSITORY"] = settings.restic_repository
        environment["RESTIC_PASSWORD"] = settings.restic_password
        backup = subprocess.run(["restic", "backup", str(settings.data_dir), str(coordinator.identity_path)],
                                env=environment, capture_output=True, text=True, check=False)
        if backup.returncode:
            raise RuntimeError("restic backup fehlgeschlagen")
        retention = subprocess.run(["restic", "forget", "--keep-daily", "7", "--keep-weekly", "4",
                                    "--keep-monthly", "6", "--prune"], env=environment, capture_output=True, text=True, check=False)
        if retention.returncode:
            raise RuntimeError("restic-Aufbewahrungsregel fehlgeschlagen")
        status.update(status="success", message="Backup und Aufbewahrungsregel erfolgreich", snapshot=str(snapshot.name))
    except (OSError, sqlite3.Error, RuntimeError) as exc:
        status["message"] = str(exc)
    status["finished_at"] = datetime.now(UTC).isoformat()
    path = status_dir / f"{now:%Y%m%dT%H%M%S%fZ}.json"
    with path.open("x", encoding="utf-8") as output:
        json.dump(status, output, ensure_ascii=False, indent=2)
    try:
        ActionJournal(settings).finish(action_id, 200 if status["status"] == "success" else 500)
    finally:
        if owns_coordinator:
            coordinator.close()
    if not quiet:
        print(status["message"])
    return 0 if status["status"] == "success" else 1
