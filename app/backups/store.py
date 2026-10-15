# SPDX-License-Identifier: AGPL-3.0-or-later

"""Where backups go, how many are kept, and what a backup folder holds.

Layout of a backup folder (all chosen by the user, e.g. on OneDrive or a USB stick)::

    UniOS-Backup/
      files/                         every file UniOS stores, copied once and updated
      snapshots/UniOS-2026-10-13_0930/
        uni_os.sqlite3               a consistent copy of the database
        local/setup.json …           the few settings needed to start again
        manifest.json                when, which app and schema version

Files are write-once in UniOS (downloads and note revisions get new names), so
the shared ``files`` mirror stays small to update while every snapshot keeps
its own database.
"""

import json
import os
import re
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

from app.config import Settings

ROOT_NAME = "UniOS-Backup"
SNAPSHOT_PATTERN = re.compile(r"^UniOS-\d{4}-\d{2}-\d{2}_\d{6}$")
DEFAULT_KEEP = 14
MIN_KEEP, MAX_KEEP = 1, 365


class BackupError(RuntimeError):
    pass


@dataclass(frozen=True)
class BackupSettings:
    folder: str | None = None
    daily: bool = True
    keep: int = DEFAULT_KEEP


def settings_path(settings: Settings) -> Path:
    return settings.local_dir / "backup.json"


def load_settings(settings: Settings) -> BackupSettings:
    try:
        raw = json.loads(settings_path(settings).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return BackupSettings()
    keep = raw.get("keep", DEFAULT_KEEP)
    return BackupSettings(folder=raw.get("folder") if isinstance(raw.get("folder"), str) else None,
                          daily=bool(raw.get("daily", True)),
                          keep=keep if isinstance(keep, int) and MIN_KEEP <= keep <= MAX_KEEP else DEFAULT_KEEP)


def validate_folder(settings: Settings, folder: str) -> Path:
    """An absolute folder outside UniOS's own storage that can be created and written."""
    path = Path(folder.strip()).expanduser()
    if not folder.strip() or not path.is_absolute():
        raise BackupError("Bitte einen vollständigen Ordnerpfad angeben, zum Beispiel C:\\Users\\Name\\Documents")
    resolved = path.resolve()
    for own in (settings.data_dir, settings.local_dir):
        own_resolved = own.resolve()
        if resolved == own_resolved or resolved.is_relative_to(own_resolved) or own_resolved.is_relative_to(resolved):
            raise BackupError("Der Backup-Ordner darf nicht in UniOS' eigener Ablage liegen")
    try:
        resolved.mkdir(parents=True, exist_ok=True)
        probe = resolved / f".unios-write-test-{os.getpid()}"
        probe.write_bytes(b"ok")
        probe.unlink()
    except OSError:
        raise BackupError("In diesen Ordner kann UniOS nicht schreiben") from None
    return resolved


def save_settings(settings: Settings, value: BackupSettings) -> BackupSettings:
    if not MIN_KEEP <= value.keep <= MAX_KEEP:
        raise BackupError(f"Aufbewahren: zwischen {MIN_KEEP} und {MAX_KEEP} Sicherungen")
    folder = str(validate_folder(settings, value.folder)) if value.folder else None
    stored = BackupSettings(folder=folder, daily=value.daily, keep=value.keep)
    target = settings_path(settings)
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(asdict(stored), ensure_ascii=False), encoding="utf-8")
    os.replace(temporary, target)
    return stored


def backup_root(folder: str) -> Path:
    return Path(folder) / ROOT_NAME


def snapshot_name(moment: datetime) -> str:
    return f"UniOS-{moment.astimezone(UTC):%Y-%m-%d_%H%M%S}"


def list_snapshots(folder: str | None) -> list[dict]:
    """Complete snapshots, newest first. Unfinished ones (no manifest) do not count."""
    if not folder:
        return []
    root = backup_root(folder) / "snapshots"
    if not root.is_dir():
        return []
    snapshots = []
    for entry in root.iterdir():
        manifest = entry / "manifest.json"
        if not (entry.is_dir() and SNAPSHOT_PATTERN.match(entry.name) and manifest.is_file()):
            continue
        try:
            data = json.loads(manifest.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        snapshots.append({"name": entry.name, "created_at": data.get("created_at"), "app_version": data.get("app_version"),
                          "schema_revision": data.get("schema"), "files": data.get("files", 0), "bytes": data.get("bytes", 0)})
    return sorted(snapshots, key=lambda item: item["name"], reverse=True)


def snapshot_path(folder: str | None, name: str) -> Path:
    if not folder or not SNAPSHOT_PATTERN.match(name):
        raise BackupError("Sicherung nicht gefunden")
    path = backup_root(folder) / "snapshots" / name
    if not (path / "manifest.json").is_file() or not (path / "uni_os.sqlite3").is_file():
        raise BackupError("Sicherung nicht gefunden oder unvollständig")
    return path


def status_path(settings: Settings) -> Path:
    return settings.local_dir / "backup-status.json"


def read_status(settings: Settings) -> dict:
    try:
        return json.loads(status_path(settings).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def write_status(settings: Settings, status: dict) -> None:
    target = status_path(settings)
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(status, ensure_ascii=False), encoding="utf-8")
    os.replace(temporary, target)
