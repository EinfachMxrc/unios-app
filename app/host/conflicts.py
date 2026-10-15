# SPDX-License-Identifier: AGPL-3.0-or-later

"""Detect Syncthing conflict copies without reading private file contents."""

from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
from contextlib import closing
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any
from uuid import uuid4

from app.files.atomic import ensure_directory, write_once

if TYPE_CHECKING:
    from app.config import Settings
    from app.host.lease import LeaseRecord


@dataclass(frozen=True)
class ConflictPackage:
    package_id: str
    action_count: int
    local_path: Path
    shared_path: Path | None


_PACKAGE_ID = re.compile(r"[0-9]{8}T[0-9]{12}Z-[0-9a-f]{8}\Z")
_ACTION_ID = re.compile(r"[0-9a-f]{32}\Z")


def lease_wins(candidate: LeaseRecord, other: LeaseRecord) -> bool:
    """Higher generation wins; the earlier acquisition breaks a tie."""
    if candidate.generation != other.generation:
        return candidate.generation > other.generation
    candidate_time = datetime.fromisoformat(candidate.acquired_at).astimezone(UTC)
    other_time = datetime.fromisoformat(other.acquired_at).astimezone(UTC)
    if candidate_time != other_time:
        return candidate_time < other_time
    return candidate.device_id < other.device_id


def _raise_scan_error(error: OSError) -> None:
    raise error


def has_syncthing_conflicts(root: Path, *, ignored_paths: set[Path] | None = None) -> bool:
    """Fail on an unreadable tree instead of incorrectly reporting no conflict."""
    if root.is_symlink() or not root.is_dir():
        raise OSError("Konfliktprüfung benötigt einen regulären Ordner")
    for directory, _subdirectories, files in os.walk(root, followlinks=False, onerror=_raise_scan_error):
        if any(".sync-conflict-" in name and Path(directory, name) not in (ignored_paths or set())
               for name in files):
            return True
    return False


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _copy_once(source: Path, target: Path) -> str:
    """Publish a streamed copy without replacing a prior conflict artifact."""
    if target.exists() or target.is_symlink():
        raise FileExistsError("Konfliktdatei existiert bereits")
    temporary = target.with_name(f".{target.name}.{uuid4().hex}.tmp")
    digest = hashlib.sha256()
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "wb") as output, source.open("rb") as input_file:
            for block in iter(lambda: input_file.read(1024 * 1024), b""):
                output.write(block)
                digest.update(block)
            output.flush()
            os.fsync(output.fileno())
        os.link(temporary, target)
        return digest.hexdigest()
    finally:
        temporary.unlink(missing_ok=True)


def _common_snapshot_time(settings: Settings, owned: LeaseRecord,
                          winner: LeaseRecord) -> tuple[datetime | None, bool, int | None, str | None]:
    from app.host.snapshots import SnapshotManifest, verify_snapshot

    name = winner.base_snapshot
    if not name or not name.startswith("snapshot_") or not name.endswith(".sqlite3") or "/" in name or "\\" in name:
        return None, False, None, None
    folder = settings.data_dir / "host" / "snapshots"
    try:
        value = json.loads((folder / f"{name}.json").read_text(encoding="utf-8"))
        manifest = SnapshotManifest(**value)
        timestamp = datetime.fromisoformat(manifest.created_at)
        if (manifest.filename != name or manifest.device_id != owned.device_id
                or manifest.generation != owned.generation or timestamp.tzinfo is None
                or not verify_snapshot(folder, manifest)):
            return None, False, None, None
        return (timestamp, manifest.dashboard_journal,
                manifest.action_journal_bytes, manifest.action_journal_sha256)
    except (OSError, ValueError, TypeError, KeyError):
        return None, False, None, None


def _backup_local_database(settings: Settings, folder: Path) -> tuple[str | None, str | None]:
    from app.host.handoff import _local_database_path
    from app.host.snapshots import _sqlite_integrity_check

    try:
        source_path = _local_database_path(settings)
    except (OSError, ValueError):
        return None, "Lokaler Datenbankpfad ist ungeeignet"
    if not source_path.is_file():
        return None, "Lokale Datenbank fehlt"
    temporary = folder / f".database-{uuid4().hex}.tmp"
    target = folder / "database.sqlite3"
    try:
        with closing(sqlite3.connect(f"{source_path.as_uri()}?mode=ro", uri=True)) as database, closing(sqlite3.connect(temporary)) as output:
            database.backup(output)
        if not _sqlite_integrity_check(temporary):
            raise sqlite3.DatabaseError("Datenbankkopie ist ungültig")
        digest = _copy_once(temporary, target)
        return digest, None
    except (OSError, sqlite3.Error):
        # Preserve the original bytes and WAL for manual recovery even if a
        # consistent SQLite backup cannot be produced.
        for suffix in ("", "-wal", "-shm"):
            source = Path(f"{source_path}{suffix}")
            if source.is_file() and not source.is_symlink():
                _copy_once(source, folder / f"raw-database.sqlite3{suffix}")
        return None, "Datenbankkopie konnte nicht geprüft werden; Rohdateien gesichert"
    finally:
        temporary.unlink(missing_ok=True)


def _existing_package(settings: Settings, owned: LeaseRecord, winner: LeaseRecord) -> ConflictPackage | None:
    root = settings.local_dir / "conflicts"
    if not root.is_dir() or root.is_symlink():
        return None
    for path in root.glob("*/manifest.json"):
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
            if (value.get("owned", {}).get("device_id") == owned.device_id
                    and value.get("owned", {}).get("generation") == owned.generation
                    and value.get("owned", {}).get("acquired_at") == owned.acquired_at
                    and value.get("winner", {}).get("device_id") == winner.device_id
                    and value.get("winner", {}).get("generation") == winner.generation
                    and value.get("winner", {}).get("acquired_at") == winner.acquired_at):
                shared = settings.data_dir / "host" / "conflicts" / path.parent.name
                return ConflictPackage(path.parent.name, value.get("action_count", 0), path.parent,
                                       shared if (shared / "manifest.json").is_file() else None)
        except (OSError, ValueError, TypeError, AttributeError):
            continue
    return None


def _publish_package(settings: Settings, local: Path) -> Path | None:
    try:
        shared = ensure_directory(settings.data_dir, "host", "conflicts", local.name)
        for source in local.iterdir():
            if not source.is_file() or source.name == "manifest.json":
                continue
            target = shared / source.name
            if target.exists() or target.is_symlink():
                if target.is_symlink() or _sha256(target) != _sha256(source):
                    return None
            else:
                _copy_once(source, target)
        target = shared / "manifest.json"
        if target.exists() or target.is_symlink():
            return shared if not target.is_symlink() and _sha256(target) == _sha256(local / "manifest.json") else None
        _copy_once(local / "manifest.json", target)
        return shared
    except (OSError, ValueError, FileExistsError):
        return None


def build_conflict_package(settings: Settings, owned: LeaseRecord, winner: LeaseRecord) -> ConflictPackage:
    """Keep a local recovery copy first, then publish it to the shared folder."""
    from app.host.actions import ActionJournal

    existing = _existing_package(settings, owned, winner)
    if existing is not None:
        return ConflictPackage(existing.package_id, existing.action_count, existing.local_path,
                               _publish_package(settings, existing.local_path))
    package_id = f"{datetime.now(UTC):%Y%m%dT%H%M%S%fZ}-{uuid4().hex[:8]}"
    local = ensure_directory(settings.local_dir, "conflicts", package_id)
    since, journal_complete, journal_bytes, journal_sha256 = _common_snapshot_time(settings, owned, winner)
    actions, journal_intact = ActionJournal(settings).actions_since(
        since, owned.device_id, anchor_bytes=journal_bytes, anchor_sha256=journal_sha256)
    action_path = write_once(local / "actions.json", json.dumps(actions, ensure_ascii=False, indent=2).encode("utf-8"))
    database_sha, database_warning = _backup_local_database(settings, local)
    manifest: dict[str, Any] = {
        "package_id": package_id, "detected_at": datetime.now(UTC).isoformat(),
        "owned": asdict(owned), "winner": asdict(winner),
        "common_snapshot": winner.base_snapshot if since else None,
        "dashboard_actions_complete": journal_complete and journal_intact,
        "action_count": len(actions), "actions_sha256": _sha256(action_path),
        "database_sha256": database_sha, "database_warning": database_warning,
    }
    write_once(local / "manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8"))
    return ConflictPackage(package_id, len(actions), local, _publish_package(settings, local))


def _package_folder(settings: Settings, package_id: str) -> Path | None:
    if not _PACKAGE_ID.fullmatch(package_id):
        return None
    for root in (settings.local_dir / "conflicts", settings.data_dir / "host" / "conflicts"):
        folder = root / package_id
        if root.is_symlink() or folder.is_symlink():
            continue
        if folder.is_dir() and folder.resolve().parent == root.resolve():
            return folder
    return None


def _matching_shared_folder(settings: Settings, folder: Path) -> Path | None:
    shared = settings.data_dir / "host" / "conflicts" / folder.name
    try:
        if shared.is_symlink() or not shared.is_dir():
            return None
        if shared == folder:
            return shared
        if (_sha256(shared / "manifest.json") == _sha256(folder / "manifest.json")
                and _sha256(shared / "actions.json") == _sha256(folder / "actions.json")):
            return shared
    except OSError:
        pass
    return None


def _receipt_exists(settings: Settings, folder: Path, name: str) -> bool:
    shared = _matching_shared_folder(settings, folder)
    return any(not (candidate / name).parent.is_symlink()
               and not (candidate / name).is_symlink() and (candidate / name).is_file()
               for candidate in (folder, shared) if candidate is not None)


def _receipt_folder(settings: Settings, folder: Path) -> Path:
    return _matching_shared_folder(settings, folder) or folder


def conflict_summaries(settings: Settings) -> list[dict[str, Any]]:
    ids: set[str] = set()
    for root in (settings.local_dir / "conflicts", settings.data_dir / "host" / "conflicts"):
        if root.is_dir() and not root.is_symlink():
            ids.update(path.name for path in root.iterdir() if path.is_dir() and not path.is_symlink()
                       and _PACKAGE_ID.fullmatch(path.name))
    result = []
    for package_id in sorted(ids, reverse=True):
        folder = _package_folder(settings, package_id)
        if folder is None:
            continue
        try:
            path = folder / "manifest.json"
            if path.is_symlink():
                continue
            manifest = json.loads(path.read_text(encoding="utf-8"))
            if manifest.get("package_id") != package_id:
                continue
            result.append({
                "package_id": package_id, "detected_at": manifest["detected_at"],
                "losing_device": manifest["owned"]["device_name"],
                "winning_device": manifest["winner"]["device_name"],
                "action_count": manifest["action_count"],
                "dashboard_actions_complete": manifest["dashboard_actions_complete"],
                "database_warning": manifest.get("database_warning"),
                "reviewed": _receipt_exists(settings, folder, "reviewed.json"),
            })
        except (OSError, ValueError, TypeError, KeyError):
            continue
    return result


def conflict_actions(settings: Settings, package_id: str) -> list[dict[str, Any]] | None:
    folder = _package_folder(settings, package_id)
    if folder is None:
        return None
    try:
        manifest_path = folder / "manifest.json"
        actions_path = folder / "actions.json"
        if manifest_path.is_symlink() or actions_path.is_symlink():
            return None
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("package_id") != package_id or _sha256(actions_path) != manifest.get("actions_sha256"):
            return None
        actions = json.loads(actions_path.read_text(encoding="utf-8"))
        if not isinstance(actions, list) or len(actions) != manifest.get("action_count"):
            return None
        if not all(isinstance(item, dict) and isinstance(item.get("id"), str) for item in actions):
            return None
        return [{**item, "replayed": bool(_ACTION_ID.fullmatch(item["id"])
                                            and _receipt_exists(settings, folder,
                                                                f"replayed/{item['id']}.json")),
                 "checked": bool(_ACTION_ID.fullmatch(item["id"])
                                 and _receipt_exists(settings, folder, f"checked/{item['id']}.json"))}
                for item in actions]
    except (OSError, ValueError, TypeError):
        return None


def mark_conflict_action_replayed(settings: Settings, package_id: str, action_id: str) -> bool:
    if not _ACTION_ID.fullmatch(action_id):
        return False
    actions = conflict_actions(settings, package_id)
    folder = _package_folder(settings, package_id)
    if actions is None or folder is None or not any(item["id"] == action_id for item in actions):
        return False
    receipts = ensure_directory(_receipt_folder(settings, folder), "replayed")
    receipt = receipts / f"{action_id}.json"
    if receipt.is_file() and not receipt.is_symlink():
        return True
    write_once(receipt, json.dumps({
        "action_id": action_id, "replayed_at": datetime.now(UTC).isoformat(),
    }, ensure_ascii=False).encode("utf-8"))
    return True


def mark_conflict_action_checked(settings: Settings, package_id: str, action_id: str) -> bool:
    if not _ACTION_ID.fullmatch(action_id):
        return False
    actions = conflict_actions(settings, package_id)
    folder = _package_folder(settings, package_id)
    if actions is None or folder is None or not any(item["id"] == action_id for item in actions):
        return False
    receipts = ensure_directory(_receipt_folder(settings, folder), "checked")
    receipt = receipts / f"{action_id}.json"
    if receipt.is_file() and not receipt.is_symlink():
        return True
    write_once(receipt, json.dumps({
        "action_id": action_id, "checked_at": datetime.now(UTC).isoformat(),
    }, ensure_ascii=False).encode("utf-8"))
    return True


def mark_conflict_package_reviewed(settings: Settings, package_id: str) -> bool:
    folder = _package_folder(settings, package_id)
    actions = conflict_actions(settings, package_id)
    if folder is None or actions is None or not all(item["replayed"] or item["checked"] for item in actions):
        return False
    receipt = _receipt_folder(settings, folder) / "reviewed.json"
    if receipt.is_symlink():
        return False
    if receipt.is_file():
        return True
    write_once(receipt, json.dumps({
        "reviewed_at": datetime.now(UTC).isoformat(),
    }, ensure_ascii=False).encode("utf-8"))
    return True
