# SPDX-License-Identifier: AGPL-3.0-or-later

"""One backup run: database copy, file mirror, settings, manifest, then pruning."""

import json
import os
import shutil
import sqlite3
from contextlib import closing
from datetime import UTC, datetime, timedelta
from pathlib import Path

from filelock import FileLock, Timeout
from sqlalchemy.engine import make_url

from app.backups.store import (
    BackupError,
    backup_root,
    list_snapshots,
    load_settings,
    snapshot_name,
    write_status,
)
from app.config import Settings
from app.host.lease import HostCoordinator

# Device-bound or rebuildable: the host lease and its pre-migration copies, caches, older backup copies.
SKIPPED_TOP_LEVEL = {"host", "derived", "backup-snapshots", "backup-status"}
# Only what a fresh start needs, plus the Anki collection; sessions, tokens and secrets stay on this device.
LOCAL_SETTINGS = ("setup.json", "institution-profile.json", "campus.json")
DAILY = timedelta(hours=24)


def _database_path(settings: Settings) -> Path:
    url = make_url(settings.database_url)
    if url.get_backend_name() != "sqlite" or not url.database or url.database == ":memory:":
        raise BackupError("Backup braucht die lokale SQLite-Datenbank")
    path = Path(url.database)
    if not path.is_file():
        raise BackupError("Datenbankdatei fehlt")
    return path


def _copy_database(source: Path, target: Path) -> str | None:
    """A consistent copy even while UniOS writes, and the schema revision it carries."""
    # closing(): a bare sqlite3 context manager only ends the transaction, and an open
    # file would keep Windows from moving the finished snapshot into place.
    with closing(sqlite3.connect(source)) as origin, closing(sqlite3.connect(target)) as copy:
        origin.backup(copy)
    with closing(sqlite3.connect(target)) as copy:
        if copy.execute("PRAGMA quick_check").fetchone()[0] != "ok":
            raise BackupError("Die Datenbankkopie ist beschädigt")
        try:
            row = copy.execute("SELECT version_num FROM alembic_version").fetchone()
        except sqlite3.Error:
            row = None
    return row[0] if row else None


def _copy_anki_collection(source: Path, target: Path) -> None:
    """The built-in Anki collection holds every card and review; it lives beside the database."""
    collection = source / "collection.anki2"
    if not collection.is_file():
        return
    target.mkdir(parents=True)
    _copy_database(collection, target / "collection.anki2")
    media = source / "collection.media"
    if media.is_dir():
        shutil.copytree(media, target / "collection.media")


def _mirror(data_dir: Path, target: Path) -> tuple[int, int]:
    """Copies new or changed files; returns how many files and bytes the mirror holds."""
    files = total = 0
    for current, folders, names in os.walk(data_dir):
        base = Path(current)
        if base == data_dir:
            folders[:] = [name for name in folders if name not in SKIPPED_TOP_LEVEL]
        folders[:] = [name for name in folders if not (base / name).is_symlink()]
        for name in names:
            source = base / name
            if source.is_symlink() or not source.is_file():
                continue
            destination = target / source.relative_to(data_dir)
            stat = source.stat()
            existing = destination.stat() if destination.exists() else None
            if existing is None or existing.st_size != stat.st_size or int(existing.st_mtime) != int(stat.st_mtime):
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, destination)
            files += 1
            total += stat.st_size
    return files, total


def _prune(root: Path, keep: int) -> None:
    snapshots = sorted((entry for entry in root.iterdir() if entry.is_dir()), key=lambda entry: entry.name, reverse=True)
    complete = [entry for entry in snapshots if (entry / "manifest.json").is_file()]
    for entry in complete[keep:]:
        shutil.rmtree(entry, ignore_errors=True)
    # Leftovers of a run that was interrupted.
    for entry in snapshots:
        if entry.name.startswith(".incomplete-"):
            shutil.rmtree(entry, ignore_errors=True)


def run_backup(settings: Settings, coordinator: HostCoordinator, app_version: str = "",
               now: datetime | None = None) -> dict:
    """Make one backup into the configured folder. Raises BackupError with a readable reason."""
    coordinator.assert_writer()
    chosen = load_settings(settings)
    if not chosen.folder:
        raise BackupError("Zuerst einen Backup-Ordner wählen")
    moment = now or datetime.now(UTC)
    started = moment.isoformat()
    try:
        with FileLock(settings.local_dir / "backup.lock", timeout=0):
            root = backup_root(chosen.folder)
            snapshots = root / "snapshots"
            snapshots.mkdir(parents=True, exist_ok=True)
            name = snapshot_name(moment)
            work = snapshots / f".incomplete-{name}"
            shutil.rmtree(work, ignore_errors=True)
            (work / "local").mkdir(parents=True)
            schema = _copy_database(_database_path(settings), work / "uni_os.sqlite3")
            for setting in LOCAL_SETTINGS:
                if (settings.local_dir / setting).is_file():
                    shutil.copy2(settings.local_dir / setting, work / "local" / setting)
            _copy_anki_collection(settings.local_dir / "anki", work / "local" / "anki")
            files, total = _mirror(settings.data_dir, root / "files")
            manifest = {"format": 1, "created_at": started, "app_version": app_version, "schema": schema,
                        "files": files, "bytes": total}
            (work / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
            final = snapshots / name
            if final.exists():
                shutil.rmtree(final)
            os.replace(work, final)
            _prune(snapshots, chosen.keep)
    except Timeout:
        raise BackupError("Es läuft bereits eine Sicherung") from None
    except (OSError, sqlite3.Error) as exc:
        write_status(settings, {"status": "error", "at": started, "message": type(exc).__name__})
        raise BackupError("Die Sicherung ist fehlgeschlagen. Ist der Ordner erreichbar und frei genug?") from None
    except BackupError as exc:
        write_status(settings, {"status": "error", "at": started, "message": str(exc)})
        raise
    status = {"status": "success", "at": started, "name": name, "files": files, "bytes": total}
    write_status(settings, status)
    return status


def due_for_daily_backup(settings: Settings, now: datetime | None = None) -> bool:
    """Daily backups catch up after the laptop was off: due once the newest is a day old."""
    chosen = load_settings(settings)
    if not chosen.folder or not chosen.daily:
        return False
    latest = list_snapshots(chosen.folder)
    if not latest or not latest[0]["created_at"]:
        return True
    try:
        last = datetime.fromisoformat(latest[0]["created_at"])
    except ValueError:
        return True
    return (now or datetime.now(UTC)) - last >= DAILY
