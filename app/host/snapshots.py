# SPDX-License-Identifier: AGPL-3.0-or-later

"""Consistent SQLite snapshots for later host handoff."""

from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
from collections.abc import Callable
from contextlib import closing
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal
from uuid import UUID, uuid4

from sqlalchemy.engine import make_url

from app.host.actions import ActionJournal
from app.host.lease import HostCoordinator


@dataclass(frozen=True)
class SnapshotManifest:
    filename: str
    generation: int
    created_at: str
    sha256: str
    device_id: str
    dashboard_journal: bool = False
    action_journal_bytes: int | None = None
    action_journal_sha256: str | None = None
    anki_filename: str | None = None
    anki_sha256: str | None = None
    anki_receipts_filename: str | None = None
    anki_receipts_sha256: str | None = None


@dataclass(frozen=True)
class SnapshotHealth:
    status: Literal["ok", "warning", "error"]
    created_at: str | None
    generation: int | None
    age_seconds: int | None
    message: str


class SnapshotVerificationError(ValueError):
    """A shared snapshot is not safe to restore on another device."""


def snapshot_health(folder: Path, generation: int | None, device_id: str | None,
                    interval_seconds: int) -> SnapshotHealth:
    """Read the newest manifest and verify the snapshot before reporting it healthy."""
    manifests = sorted(folder.glob("snapshot_*.sqlite3.json"), reverse=True)
    if not manifests:
        return SnapshotHealth("warning", None, None, None, "Noch kein Datenbank-Snapshot vorhanden")
    try:
        manifest = SnapshotManifest(**json.loads(manifests[0].read_text(encoding="utf-8")))
        created = datetime.fromisoformat(manifest.created_at)
        if created.tzinfo is None or manifest.generation < 1:
            raise ValueError("Ungültige Snapshot-Metadaten")
        age = int((datetime.now(UTC) - created.astimezone(UTC)).total_seconds())
        if not verify_snapshot(folder, manifest):
            raise ValueError("Snapshot-Prüfsumme stimmt nicht")
    except (OSError, TypeError, ValueError, KeyError, json.JSONDecodeError):
        return SnapshotHealth("error", None, None, None, "Letzter Datenbank-Snapshot ist ungültig")
    if age < -300:
        return SnapshotHealth("warning", manifest.created_at, manifest.generation, age,
                              "Snapshot-Zeit liegt in der Zukunft")
    if generation is not None and (manifest.generation != generation or manifest.device_id != device_id):
        return SnapshotHealth("warning", manifest.created_at, manifest.generation, max(0, age),
                              "Snapshot gehört nicht zum aktuellen Staffelstab")
    if age > interval_seconds * 2:
        return SnapshotHealth("warning", manifest.created_at, manifest.generation, age,
                              "Letzter Datenbank-Snapshot ist überfällig")
    return SnapshotHealth("ok", manifest.created_at, manifest.generation, max(0, age), "Snapshot geprüft")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _sqlite_integrity_check(path: Path) -> bool:
    try:
        with closing(sqlite3.connect(f"{path.resolve().as_uri()}?mode=ro&immutable=1", uri=True)) as database:
            if database.execute("PRAGMA quick_check").fetchone() != ("ok",):
                return False
            tables = {row[0] for row in database.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            return {"courses", "resources", "resource_versions"}.issubset(tables)
    except (OSError, sqlite3.Error):
        return False


def backup_sqlite_copy(database_path: Path, target: Path, *, integrity_validator: Callable[[Path], bool] | None = None) -> None:
    """Write a consistent copy of a live SQLite database using the backup API.

    Shared by persisted host snapshots and one-off exports (``GET
    /api/export``): both need the same crash-safe copy of a database that
    may be written to concurrently, and both must refuse a torn copy rather
    than ship one.
    """
    with closing(sqlite3.connect(f"{database_path.as_uri()}?mode=ro", uri=True)) as source, \
            closing(sqlite3.connect(target)) as output:
        source.backup(output)
    if not (integrity_validator or _sqlite_integrity_check)(target):
        raise SnapshotVerificationError("Datenbank-Kopie ist nicht konsistent")
    with target.open("r+b") as output:
        os.fsync(output.fileno())


def create_snapshot(coordinator: HostCoordinator, *, next_generation: bool = False) -> SnapshotManifest:
    """Serialize native answers/undo and their SQL mirror with the whole snapshot."""
    from app.anki.collection import _lock

    with _lock:
        return _create_snapshot_locked(coordinator, next_generation=next_generation)


def _create_snapshot_locked(coordinator: HostCoordinator, *, next_generation: bool = False) -> SnapshotManifest:
    """Write a checked snapshot without touching the live database file."""
    coordinator.assert_writer()
    database = make_url(coordinator.settings.database_url).database
    if not database or database == ":memory:":
        raise ValueError("Snapshot benötigt eine SQLite-Datei")
    database_path = Path(database).resolve()
    if not database_path.is_file():
        raise FileNotFoundError("Live-Datenbank fehlt")
    lease = coordinator.current()
    if lease is None:
        raise RuntimeError("Staffelstab fehlt")
    folder = coordinator.settings.data_dir / "host" / "snapshots"
    folder.mkdir(parents=True, exist_ok=True)
    now = datetime.now(UTC)
    generation = lease.generation + 1 if next_generation else lease.generation
    filename = f"snapshot_{generation:08d}_{now:%Y%m%dT%H%M%S%fZ}_{uuid4().hex[:8]}.sqlite3"
    target = folder / filename
    temporary = folder / f".{filename}.tmp"
    manifest_path = folder / f"{filename}.json"
    temporary_manifest = folder / f".{filename}.json.tmp"
    anki_name = f"{Path(filename).stem}.apkg"
    temporary_anki = folder / f".{anki_name}"
    target_anki = folder / anki_name
    receipts_name = f"{Path(filename).stem}.anki-reviews.json"
    temporary_receipts = folder / f".{receipts_name}"
    target_receipts = folder / receipts_name
    try:
        # Anchor first: a write committed during the SQLite backup must remain
        # visible in a later conflict package even if this copy missed it.
        journal_bytes, journal_sha256, journal_complete = ActionJournal(coordinator.settings).snapshot_anchor()
        backup_sqlite_copy(database_path, temporary)
        digest = _sha256(temporary)
        anki_digest = None
        receipts_digest = None
        from app.anki.collection import (
            collection_path,
            export_package,
            open_collection,
            study_mode,
        )

        if study_mode(coordinator.settings) == "integrated":
            if not collection_path(coordinator.settings).is_file():
                raise SnapshotVerificationError("Anki-Collection fehlt für den Host-Snapshot")
            with open_collection(coordinator.settings, preserve_study_undo=True) as collection:
                assert collection.db is not None
                from app.anki.study_review_receipts import ensure_receipt_schema

                ensure_receipt_schema(collection)
                canceled = set(collection.db.list("SELECT review_id FROM unios_review_receipts WHERE rating < 0"))
                if canceled:
                    with closing(sqlite3.connect(temporary)) as mirror:
                        recorded = {row[0] for row in mirror.execute("SELECT review_id FROM anki_reviews WHERE review_id IS NOT NULL")}
                    if canceled & recorded:
                        raise SnapshotVerificationError("Zurückgenommene Bewertungen warten auf Abgleich des Lernverlaufs")
                export_package(collection, temporary_anki)
                anki_digest = _sha256(temporary_anki)
                from app.anki.study_undo_repository import export_receipts

                export_receipts(collection, temporary_receipts, anki_digest, coordinator.settings)
                receipts_digest = _sha256(temporary_receipts)
        coordinator.assert_writer()
        if anki_digest is not None:
            os.replace(temporary_anki, target_anki)
            os.replace(temporary_receipts, target_receipts)
        os.replace(temporary, target)
        manifest = SnapshotManifest(filename, generation, now.isoformat(), digest, lease.device_id,
                                    dashboard_journal=journal_complete,
                                    action_journal_bytes=journal_bytes,
                                    action_journal_sha256=journal_sha256,
                                    anki_filename=anki_name if anki_digest is not None else None,
                                    anki_sha256=anki_digest,
                                    anki_receipts_filename=receipts_name if receipts_digest is not None else None,
                                    anki_receipts_sha256=receipts_digest)
        with temporary_manifest.open("x", encoding="utf-8") as output:
            json.dump(asdict(manifest), output, ensure_ascii=False, indent=2)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary_manifest, manifest_path)
    finally:
        temporary.unlink(missing_ok=True)
        temporary_manifest.unlink(missing_ok=True)
        temporary_anki.unlink(missing_ok=True)
        temporary_receipts.unlink(missing_ok=True)
    _prune_snapshots(folder, coordinator.settings.snapshot_keep, coordinator)
    return manifest


def _prune_snapshots(folder: Path, keep: int, coordinator: HostCoordinator) -> None:
    manifests = sorted(folder.glob("snapshot_*.sqlite3.json"), reverse=True)
    for item in manifests[keep:]:
        coordinator.assert_writer()
        try:
            value = json.loads(item.read_text(encoding="utf-8"))
            database = folder / value["filename"]
            if database.parent != folder or database.suffix != ".sqlite3":
                continue
            database.unlink(missing_ok=True)
            anki_name = value.get("anki_filename")
            if isinstance(anki_name, str) and Path(anki_name).name == anki_name and anki_name.endswith(".apkg"):
                (folder / anki_name).unlink(missing_ok=True)
            receipts_name = value.get("anki_receipts_filename")
            if (isinstance(receipts_name, str) and Path(receipts_name).name == receipts_name
                    and receipts_name.endswith(".anki-reviews.json")):
                (folder / receipts_name).unlink(missing_ok=True)
            item.unlink()
        except (OSError, ValueError, KeyError, TypeError):
            continue


def verify_snapshot(folder: Path, manifest: SnapshotManifest, *, check_integrity: bool = False) -> bool:
    if Path(manifest.filename).name != manifest.filename or not manifest.filename.endswith(".sqlite3"):
        return False
    path = folder / manifest.filename
    try:
        anki_ok = manifest.anki_filename is None and manifest.anki_sha256 is None
        if manifest.anki_filename is not None and manifest.anki_sha256 is not None:
            package = folder / manifest.anki_filename
            anki_ok = (Path(manifest.anki_filename).name == manifest.anki_filename
                       and manifest.anki_filename.endswith(".apkg")
                       and package.is_file() and not package.is_symlink()
                       and _sha256(package) == manifest.anki_sha256)
        receipts_ok = manifest.anki_receipts_filename is None and manifest.anki_receipts_sha256 is None
        if manifest.anki_receipts_filename is not None and manifest.anki_receipts_sha256 is not None:
            receipts = folder / manifest.anki_receipts_filename
            receipts_ok = (manifest.anki_filename is not None and
                           Path(manifest.anki_receipts_filename).name == manifest.anki_receipts_filename and
                           manifest.anki_receipts_filename.endswith(".anki-reviews.json") and
                           receipts.is_file() and not receipts.is_symlink() and
                           _sha256(receipts) == manifest.anki_receipts_sha256)
        # Windows can redirect AppData files into an app container: resolve() then
        # returns a different parent even though the validated filename is inside
        # this folder. Reject links explicitly instead of comparing resolved paths.
        return (anki_ok and receipts_ok and path.is_file() and not path.is_symlink()
                and _sha256(path) == manifest.sha256
                and (not check_integrity or _sqlite_integrity_check(path)))
    except OSError:
        return False


def verified_handoff_snapshot(folder: Path, *, generation: int, device_id: str,
                              max_age_seconds: int) -> SnapshotManifest:
    """Fail closed on an absent, stale, forged, or corrupt latest shared snapshot."""
    manifests = sorted(folder.glob("snapshot_*.sqlite3.json"), reverse=True)
    if not manifests:
        raise SnapshotVerificationError("Kein Datenbank-Snapshot für die Übernahme vorhanden")
    try:
        manifest_path = manifests[0]
        manifest = SnapshotManifest(**json.loads(manifest_path.read_text(encoding="utf-8")))
        created = datetime.fromisoformat(manifest.created_at)
        UUID(manifest.device_id)
        if (manifest_path.name != f"{manifest.filename}.json" or type(manifest.generation) is not int
                or manifest.generation < 1 or not manifest.filename.startswith(f"snapshot_{manifest.generation:08d}_")
                or created.tzinfo is None
                or not re.fullmatch(r"[0-9a-fA-F]{64}", manifest.sha256)):
            raise ValueError("Ungültige Snapshot-Metadaten")
        if (manifest.anki_filename is None) != (manifest.anki_sha256 is None):
            raise ValueError("Anki-Snapshot-Metadaten sind unvollständig")
        if manifest.anki_sha256 is not None and not re.fullmatch(r"[0-9a-fA-F]{64}", manifest.anki_sha256):
            raise ValueError("Anki-Snapshot-Prüfsumme ist ungültig")
        if (manifest.anki_receipts_filename is None) != (manifest.anki_receipts_sha256 is None):
            raise ValueError("Anki-Bewertungsarchiv-Metadaten sind unvollständig")
        if manifest.anki_receipts_sha256 is not None and not re.fullmatch(r"[0-9a-f]{64}", manifest.anki_receipts_sha256):
            raise ValueError("Anki-Bewertungsarchiv-Prüfsumme ist ungültig")
        age_seconds = (datetime.now(UTC) - created.astimezone(UTC)).total_seconds()
        if manifest.generation != generation or manifest.device_id != device_id:
            raise SnapshotVerificationError("Snapshot gehört nicht zum erwarteten Staffelstab")
        if max_age_seconds < 0 or age_seconds < -300 or age_seconds > max_age_seconds:
            raise SnapshotVerificationError("Datenbank-Snapshot ist veraltet oder liegt in der Zukunft")
        if not verify_snapshot(folder, manifest, check_integrity=True):
            raise SnapshotVerificationError("Datenbank-Snapshot hat keine gültige Prüfsumme oder SQLite-Struktur")
        return manifest
    except (OSError, TypeError, ValueError, KeyError, sqlite3.Error) as exc:
        if isinstance(exc, SnapshotVerificationError):
            raise
        raise SnapshotVerificationError("Datenbank-Snapshot ist ungültig") from None
