# SPDX-License-Identifier: AGPL-3.0-or-later

"""Fail-closed restoration of a released host on another local device."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import socket
import sqlite3
import subprocess
from contextlib import closing
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

import httpx
from filelock import FileLock, Timeout
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

from app.config import Settings
from app.host.conflicts import has_syncthing_conflicts
from app.host.lease import HostCoordinator, HostLeaseError, LeaseRecord, _atomic_json
from app.host.snapshots import (
    SnapshotManifest,
    SnapshotVerificationError,
    _sha256,
    _sqlite_integrity_check,
    verified_handoff_snapshot,
)


class HandoffError(HostLeaseError):
    """A device must stay in standby until every takeover condition is proven."""


def _health_host(raw_url: str | None) -> str | None:
    """Only probe the old host's HTTPS endpoint inside a Tailscale tailnet."""
    if not raw_url:
        return None
    try:
        parsed = urlsplit(raw_url)
        if (parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(".ts.net")
                or parsed.hostname == "ts.net" or parsed.username or parsed.password
                or parsed.port not in {None, 443} or parsed.path != "/health" or parsed.query or parsed.fragment):
            return None
    except ValueError:
        return None
    return parsed.hostname


def remote_host_offline(raw_url: str | None) -> bool:
    """Require Tailscale to report the exact peer offline and its health check to fail."""
    host = _health_host(raw_url)
    executable = shutil.which("tailscale")
    if not host or not executable:
        return False
    try:
        result = subprocess.run([executable, "status", "--json"], capture_output=True, text=True,
                                timeout=5, check=False)
        if result.returncode != 0:
            return False
        state = json.loads(result.stdout)
        if not isinstance(state, dict) or state.get("BackendState") != "Running":
            return False
        peers = state.get("Peer")
        if not isinstance(peers, dict):
            return False
        matches = [peer for peer in peers.values() if isinstance(peer, dict)
                   and peer.get("DNSName", "").rstrip(".").lower() == host]
        if len(matches) != 1 or matches[0].get("Online") is not False:
            return False
        with httpx.Client(timeout=3, trust_env=False, follow_redirects=False) as client:
            client.get(str(raw_url))
        return False
    except (OSError, subprocess.TimeoutExpired, ValueError, TypeError, AttributeError):
        return False
    except (httpx.ConnectError, httpx.ConnectTimeout):
        return True
    except httpx.HTTPError:
        return False


def _local_database_path(settings: Settings) -> Path:
    try:
        url = make_url(settings.database_url)
        if url.get_backend_name() != "sqlite" or not url.database or url.database == ":memory:":
            raise ValueError("SQLite-Datei fehlt")
        configured = Path(url.database).absolute()
        if configured.is_symlink():
            raise ValueError("Live-Datenbank ist eine Verknüpfung")
        target = configured.resolve()
        if target.parent != settings.local_dir.resolve():
            raise ValueError("Live-Datenbank liegt außerhalb von LOCAL_DIR")
        return target
    except (ValueError, ArgumentError) as exc:
        raise HandoffError("Lokaler Datenbankpfad ist für die Übernahme ungeeignet") from exc


def require_syncthing_ready(settings: Settings) -> None:
    from app.health.doctor import _syncthing, _syncthing_sync

    try:
        if has_syncthing_conflicts(settings.data_dir / "host"):
            raise HandoffError("Syncthing-Konflikt im Staffelstab-Ordner verhindert die Übernahme")
    except OSError as exc:
        raise HandoffError("Staffelstab-Ordner konnte nicht auf Syncthing-Konflikte geprüft werden") from exc
    if _syncthing(settings).status != "ok" or _syncthing_sync(settings).status != "ok":
        raise HandoffError("Syncthing meldet DATA_DIR nicht vollständig und sicher synchron")


def _stage_snapshot(folder: Path, manifest: SnapshotManifest, target: Path) -> Path:
    stage = target.with_name(f".{target.name}.handoff-{uuid4().hex}.tmp")
    digest = hashlib.sha256()
    descriptor = os.open(stage, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "wb") as output, (folder / manifest.filename).open("rb") as source:
            for block in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(block)
                output.write(block)
            output.flush()
            os.fsync(output.fileno())
        if digest.hexdigest() != manifest.sha256 or not _sqlite_integrity_check(stage):
            raise SnapshotVerificationError("Kopierter Datenbank-Snapshot ist ungültig")
        # A restored sequence may reuse event numbers. Rotate only the derived
        # corpus incarnation in the verified staging COPY, never the snapshot.
        with closing(sqlite3.connect(stage)) as database:
            if database.execute("SELECT 1 FROM sqlite_master WHERE name='corpus_state'").fetchone():
                database.execute("UPDATE corpus_state SET value=lower(hex(randomblob(16))) WHERE key='epoch'")
                database.commit()
        return stage
    except BaseException:
        stage.unlink(missing_ok=True)
        raise


def _require_compatible_schema(stage: Path) -> None:
    """An older app must not claim or install a newer host's database."""
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    root = Path(__file__).resolve().parents[2]
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "alembic"))
    head = ScriptDirectory.from_config(config).get_current_head()
    try:
        with closing(sqlite3.connect(f"{stage.as_uri()}?mode=ro", uri=True)) as database:
            current = database.execute("SELECT version_num FROM alembic_version").fetchone()
    except sqlite3.Error as exc:
        raise HandoffError("Snapshot hat kein prüfbares Datenbank-Schema") from exc
    if head is None or current != (head,):
        raise HandoffError("Snapshot benötigt eine andere UniOS-Schema-Version; Gerät zuerst aktualisieren")


def _stage_anki_snapshot(folder: Path, manifest: SnapshotManifest, settings: Settings) -> Path | None:
    from anki.collection import Collection

    from app.anki.collection import collection_path, import_package, study_mode

    if study_mode(settings) != "integrated":
        return None
    if manifest.anki_filename is None or manifest.anki_sha256 is None:
        raise SnapshotVerificationError("Anki-Collection fehlt im Host-Snapshot")
    package = folder / manifest.anki_filename
    if _sha256(package) != manifest.anki_sha256:
        raise SnapshotVerificationError("Anki-Snapshot-Prüfsumme stimmt nicht")
    target = collection_path(settings)
    if target.parent.is_symlink() or target.parent.resolve() != (settings.local_dir.resolve() / "anki"):
        raise SnapshotVerificationError("Anki-Zielordner ist keine lokale Collection")
    target.parent.mkdir(parents=True, exist_ok=True)
    stage = target.with_name(f".{target.stem}.handoff-{uuid4().hex}.anki2")
    collection = Collection(str(stage))
    try:
        import_package(collection, package)
        if manifest.anki_receipts_filename is not None:
            from app.anki.study_undo_repository import (
                ReviewJournalError,
                import_receipts,
            )

            name = manifest.anki_receipts_filename
            receipts = folder / name
            if (Path(name).name != name or not name.endswith(".anki-reviews.json") or
                    manifest.anki_receipts_sha256 is None or receipts.is_symlink() or
                    _sha256(receipts) != manifest.anki_receipts_sha256):
                raise SnapshotVerificationError("Anki-Bewertungsarchiv hat keine gültige Prüfsumme")
            try:
                import_receipts(collection, receipts, manifest.anki_sha256)
            except (ReviewJournalError, ValueError) as exc:
                raise SnapshotVerificationError("Anki-Bewertungsarchiv ist nicht konsistent") from exc
    except BaseException:
        collection.close()
        stage.unlink(missing_ok=True)
        shutil.rmtree(stage.with_suffix(".media"), ignore_errors=True)
        raise
    collection.close()
    return stage


def _install_snapshot(stage: Path, target: Path, anki_stage: Path | None = None,
                      anki_target: Path | None = None) -> None:
    """Keep every earlier local SQLite file before replacing the live copy."""
    previous = [target, Path(f"{target}-wal"), Path(f"{target}-shm")]
    target_media = None
    stage_media = None
    target_actions = None
    if anki_stage is not None and anki_target is not None:
        from app.anki.collection import close_study_collection

        close_study_collection()
        previous.extend([anki_target, Path(f"{anki_target}-wal"), Path(f"{anki_target}-shm")])
        target_media = anki_target.with_suffix(".media")
        stage_media = anki_stage.with_suffix(".media")
        target_actions = anki_target.parent / "review-actions"
        if not stage_media.is_dir() or stage_media.is_symlink():
            raise HandoffError("Anki-Medien fehlen im übernommenen Snapshot")
    for path in previous:
        if path.is_symlink() or (path.exists() and not path.is_file()):
            raise HandoffError("Lokale Datenbank-Dateien sind für die Übernahme ungeeignet")
    if target_media is not None:
        if target_media.is_symlink() or (target_media.exists() and not target_media.is_dir()):
            raise HandoffError("Lokaler Anki-Medienordner ist für die Übernahme ungeeignet")
        previous.append(target_media)
    if target_actions is not None:
        if target_actions.is_symlink() or (target_actions.exists() and not target_actions.is_dir()):
            raise HandoffError("Lokaler Anki-Bewertungsordner ist für die Übernahme ungeeignet")
        previous.append(target_actions)
    existing = [path for path in previous if path.exists()]
    moved: list[tuple[Path, Path]] = []
    if existing:
        archive_root = target.parent / "handoff-archives"
        if archive_root.is_symlink() or (archive_root.exists() and not archive_root.is_dir()):
            raise HandoffError("Lokales Datenbank-Archiv ist für die Übernahme ungeeignet")
        archive = archive_root / f"{datetime.now(UTC):%Y%m%dT%H%M%S%fZ}-{uuid4().hex[:8]}"
        archive.mkdir(parents=True, mode=0o700)
        try:
            for path in existing:
                archived = archive / path.name
                os.replace(path, archived)
                moved.append((path, archived))
        except OSError:
            for path, archived in reversed(moved):
                os.replace(archived, path)
            raise
    installed_database = False
    installed_anki = False
    try:
        os.replace(stage, target)
        installed_database = True
        if anki_stage is not None and anki_target is not None:
            os.replace(anki_stage, anki_target)
            installed_anki = True
            assert stage_media is not None and target_media is not None
            os.replace(stage_media, target_media)
    except OSError:
        if installed_anki and anki_target is not None:
            anki_target.unlink(missing_ok=True)
        if installed_database:
            target.unlink(missing_ok=True)
        for path, archived in reversed(moved):
            os.replace(archived, path)
        raise


def acquire_released(settings: Settings, *, max_snapshot_age_seconds: int = 7200) -> LeaseRecord:
    """Restore a planned release on a stopped standby device.

    No automatic takeover of an active lease occurs.
    """
    settings.local_dir.mkdir(parents=True, exist_ok=True)
    coordinator = HostCoordinator(settings)
    try:
        with FileLock(settings.local_dir / "host-instance.lock", timeout=0):
            released = coordinator.current()
            if released is None or released.released_at is None:
                raise HandoffError("Kein freigegebener Staffelstab für die geplante Übernahme")
            device_id = coordinator._device_id()
            if device_id == released.device_id:
                raise HandoffError("Freigebendes Gerät darf sich nicht selbst übernehmen")
            require_syncthing_ready(settings)
            folder = settings.data_dir / "host" / "snapshots"
            manifest = verified_handoff_snapshot(folder, generation=released.generation,
                                                 device_id=released.device_id,
                                                 max_age_seconds=max_snapshot_age_seconds)
            target = _local_database_path(settings)
            stage = _stage_snapshot(folder, manifest, target)
            try:
                _require_compatible_schema(stage)
                anki_stage = _stage_anki_snapshot(folder, manifest, settings)
            except BaseException:
                stage.unlink(missing_ok=True)
                raise
            try:
                with FileLock(coordinator.lease_path.with_suffix(".lock"), timeout=5):
                    if coordinator.current() != released:
                        raise HandoffError("Staffelstab hat sich während der Übernahme geändert")
                    require_syncthing_ready(settings)
                    verified_handoff_snapshot(folder, generation=released.generation,
                                              device_id=released.device_id,
                                              max_age_seconds=max_snapshot_age_seconds)
                    if device_id is None:
                        device_id = str(uuid4())
                        _atomic_json(coordinator.identity_path, {"device_id": device_id})
                    from app.anki.collection import collection_path

                    _install_snapshot(stage, target, anki_stage,
                                      collection_path(settings) if anki_stage is not None else None)
                    now = datetime.now(UTC).isoformat()
                    claimed = LeaseRecord(device_id, settings.device_name or socket.gethostname().split(".")[0],
                                          now, now, released.generation, health_url=settings.host_health_url or None,
                                          base_snapshot=manifest.filename)
                    _atomic_json(coordinator.lease_path, asdict(claimed))
                    return claimed
            finally:
                stage.unlink(missing_ok=True)
                if anki_stage is not None:
                    anki_stage.unlink(missing_ok=True)
                    shutil.rmtree(anki_stage.with_suffix(".media"), ignore_errors=True)
    except Timeout as exc:
        raise HandoffError("Lokaler Dienst muss vor der Übernahme gestoppt sein") from exc
    except (OSError, SnapshotVerificationError) as exc:
        raise HandoffError("Geprüfter Datenbank-Snapshot konnte nicht übernommen werden") from exc


def acquire_stale(settings: Settings) -> LeaseRecord:
    """Claim a failed active host only after independent, repeated safety checks."""
    if not settings.automatic_takeover_enabled:
        raise HandoffError("Automatische Übernahme ist ausgeschaltet")
    if not _health_host(settings.host_health_url):
        raise HandoffError("Eigene gesicherte Tailscale-Adresse fehlt")
    settings.local_dir.mkdir(parents=True, exist_ok=True)
    coordinator = HostCoordinator(settings)
    try:
        with FileLock(settings.local_dir / "host-instance.lock", timeout=0):
            previous = coordinator.current()
            device_id = coordinator._device_id()
            if previous is None or previous.released_at is not None or device_id == previous.device_id:
                raise HandoffError("Kein fremder aktiver Host für die Ausfallübernahme")
            _require_stale_host(settings, previous)
            require_syncthing_ready(settings)
            folder = settings.data_dir / "host" / "snapshots"
            manifest = verified_handoff_snapshot(
                folder, generation=previous.generation, device_id=previous.device_id,
                max_age_seconds=settings.automatic_takeover_snapshot_max_age_seconds)
            target = _local_database_path(settings)
            stage = _stage_snapshot(folder, manifest, target)
            try:
                _require_compatible_schema(stage)
                anki_stage = _stage_anki_snapshot(folder, manifest, settings)
            except BaseException:
                stage.unlink(missing_ok=True)
                raise
            try:
                with FileLock(coordinator.lease_path.with_suffix(".lock"), timeout=5):
                    if coordinator.current() != previous:
                        raise HandoffError("Staffelstab hat sich während der Ausfallübernahme geändert")
                    _require_stale_host(settings, previous)
                    require_syncthing_ready(settings)
                    verified_handoff_snapshot(
                        folder, generation=previous.generation, device_id=previous.device_id,
                        max_age_seconds=settings.automatic_takeover_snapshot_max_age_seconds)
                    if device_id is None:
                        device_id = str(uuid4())
                        _atomic_json(coordinator.identity_path, {"device_id": device_id})
                    from app.anki.collection import collection_path

                    _install_snapshot(stage, target, anki_stage,
                                      collection_path(settings) if anki_stage is not None else None)
                    now = datetime.now(UTC).isoformat()
                    claimed = LeaseRecord(
                        device_id, settings.device_name or socket.gethostname().split(".")[0],
                        now, now, previous.generation + 1, health_url=settings.host_health_url or None,
                        base_snapshot=manifest.filename)
                    _atomic_json(coordinator.lease_path, asdict(claimed))
                    return claimed
            finally:
                stage.unlink(missing_ok=True)
                if anki_stage is not None:
                    anki_stage.unlink(missing_ok=True)
                    shutil.rmtree(anki_stage.with_suffix(".media"), ignore_errors=True)
    except Timeout as exc:
        raise HandoffError("Lokaler Dienst muss vor der Ausfallübernahme gestoppt sein") from exc
    except (OSError, SnapshotVerificationError) as exc:
        raise HandoffError("Geprüfter Datenbank-Snapshot konnte nicht übernommen werden") from exc


def _require_stale_host(settings: Settings, lease: LeaseRecord) -> None:
    if not _health_host(lease.health_url):
        raise HandoffError("Gesicherte Tailscale-Adresse des bisherigen Hosts fehlt")
    try:
        heartbeat = datetime.fromisoformat(lease.heartbeat_at).astimezone(UTC)
    except ValueError as exc:
        raise HandoffError("Herzschlag des bisherigen Hosts ist ungültig") from exc
    age = (datetime.now(UTC) - heartbeat).total_seconds()
    if age <= settings.automatic_takeover_after_seconds:
        raise HandoffError("Herzschlag des bisherigen Hosts ist noch aktuell")
    if not remote_host_offline(lease.health_url):
        raise HandoffError("Bisheriger Host ist erreichbar oder sein Zustand ist unklar")
