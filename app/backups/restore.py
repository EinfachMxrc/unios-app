# SPDX-License-Identifier: AGPL-3.0-or-later

"""Restoring a backup in two steps.

While UniOS runs, its database is open, so a restore is only *staged*: the
chosen snapshot is checked and remembered. The next start applies it before
anything opens the database (``desktop/backend.py`` → ``prepare_database``),
and the usual start-up migration then brings an older backup up to date. The
database that was replaced is kept next to it, so a restore can be undone.
"""

import json
import os
import shutil
import sqlite3
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

from app.backups.store import BackupError, load_settings, snapshot_path
from app.config import Settings

CONFIRMATION = "WIEDERHERSTELLEN"


def _marker(settings: Settings) -> Path:
    return settings.local_dir / "backup-restore.json"


def _result(settings: Settings) -> Path:
    return settings.local_dir / "backup-restore-result.json"


def known_revisions() -> set[str]:
    root = Path(__file__).resolve().parents[2]
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "alembic"))
    return {script.revision for script in ScriptDirectory.from_config(config).walk_revisions()}


def stage_restore(settings: Settings, name: str, confirmation: str) -> dict:
    """Checks the snapshot and remembers it for the next start."""
    if confirmation.strip() != CONFIRMATION:
        raise BackupError(f"Zum Bestätigen „{CONFIRMATION}“ eintippen")
    chosen = load_settings(settings)
    snapshot = snapshot_path(chosen.folder, name)
    manifest = json.loads((snapshot / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("schema") and manifest["schema"] not in known_revisions():
        raise BackupError("Diese Sicherung stammt aus einer neueren UniOS-Version. Bitte zuerst UniOS aktualisieren.")
    with closing(sqlite3.connect(f"{(snapshot / 'uni_os.sqlite3').as_uri()}?mode=ro", uri=True)) as copy:
        if copy.execute("PRAGMA quick_check").fetchone()[0] != "ok":
            raise BackupError("Die Datenbank in dieser Sicherung ist beschädigt")
    staged = {"snapshot": str(snapshot), "files": str(snapshot.parents[1] / "files"),
              "requested_at": datetime.now(UTC).isoformat(), "name": name}
    _marker(settings).write_text(json.dumps(staged, ensure_ascii=False), encoding="utf-8")
    return staged


def pending_restore(settings: Settings) -> dict | None:
    try:
        return json.loads(_marker(settings).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def cancel_restore(settings: Settings) -> None:
    _marker(settings).unlink(missing_ok=True)


def last_restore(settings: Settings) -> dict | None:
    try:
        return json.loads(_result(settings).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _copy_files(source: Path, target: Path) -> int:
    copied = 0
    for current, _, names in os.walk(source):
        for name in names:
            origin = Path(current) / name
            if origin.is_symlink():
                continue
            destination = target / origin.relative_to(source)
            if destination.exists() and destination.stat().st_size == origin.stat().st_size:
                continue
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(origin, destination)
            copied += 1
    return copied


def _swap_database(database: Path, incoming: Path, keep: Path) -> None:
    """Moves the current database (with its journal files) aside and puts the copy in its place.

    If anything fails, the moved files go back, so UniOS never starts without a database.
    """
    moved: list[Path] = []
    try:
        for suffix in ("", "-wal", "-shm"):
            current = database.with_name(database.name + suffix)
            if current.exists():
                os.replace(current, keep / current.name)
                moved.append(current)
        os.replace(incoming, database)
    except OSError:
        for original in moved:
            os.replace(keep / original.name, original)
        incoming.unlink(missing_ok=True)
        raise


def apply_pending_restore(settings: Settings, database: Path) -> dict | None:
    """Runs at start-up before the database opens. Returns what happened, or None."""
    staged = pending_restore(settings)
    if staged is None:
        return None
    _marker(settings).unlink(missing_ok=True)
    moment = datetime.now(UTC)
    result: dict = {"name": staged.get("name"), "at": moment.isoformat()}
    try:
        snapshot = Path(staged["snapshot"])
        if not (snapshot / "uni_os.sqlite3").is_file():
            raise BackupError("Die Sicherung ist nicht mehr erreichbar")
        copied = _copy_files(Path(staged["files"]), settings.data_dir) if Path(staged["files"]).is_dir() else 0
        # The copy lands beside the database first, so the swap below is one rename.
        incoming = database.with_name(database.name + ".restore")
        shutil.copy2(snapshot / "uni_os.sqlite3", incoming)
        keep = settings.local_dir / f"before-restore-{moment:%Y%m%dT%H%M%S}"
        keep.mkdir(parents=True)
        _swap_database(database, incoming, keep)
        for setting in (snapshot / "local").glob("*.json"):
            shutil.copy2(setting, settings.local_dir / setting.name)
        saved_anki = snapshot / "local" / "anki"
        if (saved_anki / "collection.anki2").is_file():
            live_anki = settings.local_dir / "anki"
            if live_anki.exists():
                os.replace(live_anki, keep / "anki")
            shutil.copytree(saved_anki, live_anki)
        result.update(status="success", files=copied, previous=keep.name)
    except (OSError, KeyError, BackupError) as exc:
        result.update(status="error", message=str(exc) if isinstance(exc, BackupError) else type(exc).__name__)
    _result(settings).write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    return result
