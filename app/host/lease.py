# SPDX-License-Identifier: AGPL-3.0-or-later

"""Shared lease and local process lock for the one writing host."""

from __future__ import annotations

import json
import logging
import os
import socket
import sqlite3
import threading
import time
from collections.abc import Callable
from contextlib import closing
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID, uuid4

from filelock import FileLock, Timeout
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

from app.config import Settings
from app.files.atomic import ensure_directory, write_once
from app.host.conflicts import (
    build_conflict_package,
    has_syncthing_conflicts,
    lease_wins,
)
from app.host.write_gate import WriteGate

log = logging.getLogger(__name__)


class HostLeaseError(RuntimeError):
    """The current process may not write shared or live study data."""


SNAPSHOT_BACKOFF_CAP_SECONDS = 6 * 60 * 60


def _snapshot_backoff_seconds(base_interval: int, consecutive_failures: int,
                              cap_seconds: int = SNAPSHOT_BACKOFF_CAP_SECONDS) -> int:
    """Delay before the next snapshot attempt after ``consecutive_failures`` in a row.

    A failing ``create_snapshot`` (whole-file SQLite backup + SHA-256) used to be
    retried every ``base_interval`` at full cost. This doubles the wait on each
    failure, capped, and callers reset ``consecutive_failures`` to 0 on success.
    """
    if consecutive_failures <= 0:
        return base_interval
    return min(cap_seconds, base_interval * (2 ** consecutive_failures))


@dataclass(frozen=True)
class LeaseRecord:
    device_id: str
    device_name: str
    acquired_at: str
    heartbeat_at: str
    generation: int
    released_at: str | None = None
    health_url: str | None = None
    base_snapshot: str | None = None

    @classmethod
    def parse(cls, value: object) -> LeaseRecord:
        if not isinstance(value, dict):
            raise HostLeaseError("Staffelstab ist beschädigt")
        try:
            result = cls(**value)
            UUID(result.device_id)
            acquired_at = datetime.fromisoformat(result.acquired_at)
            heartbeat_at = datetime.fromisoformat(result.heartbeat_at)
            if acquired_at.tzinfo is None or heartbeat_at.tzinfo is None:
                raise ValueError("Zeitstempel ohne Zeitzone")
            if result.released_at is not None:
                released_at = datetime.fromisoformat(result.released_at)
                if released_at.tzinfo is None or released_at < acquired_at:
                    raise ValueError("Ungültiger Freigabezeitpunkt")
            if type(result.generation) is not int or result.generation < 1 or not result.device_name:
                raise ValueError("Ungültige Staffelstab-Daten")
            if result.health_url is not None and not isinstance(result.health_url, str):
                raise ValueError("Ungültige Host-Adresse")
            if result.base_snapshot is not None and (not isinstance(result.base_snapshot, str)
                                                      or not result.base_snapshot.startswith("snapshot_")
                                                      or not result.base_snapshot.endswith(".sqlite3")
                                                      or "/" in result.base_snapshot or "\\" in result.base_snapshot):
                raise ValueError("Ungültiger gemeinsamer Snapshot")
            return result
        except (TypeError, ValueError, KeyError) as exc:
            raise HostLeaseError("Staffelstab ist beschädigt") from exc


def _atomic_json(path: Path, value: dict[str, object]) -> None:
    temporary = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            json.dump(value, output, ensure_ascii=False, indent=2)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


class HostCoordinator:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.identity_path = settings.local_dir / "device.json"
        self.lease_path = settings.data_dir / "host" / "lease.json"
        self.last_owned_path = settings.local_dir / "last-host-lease.json"
        # Lifespan and standby monitor run on different threads. Both must
        # operate on the same held lock context during an automatic takeover.
        self._instance_lock = FileLock(settings.local_dir / "host-instance.lock", timeout=0, thread_local=False)
        self._active = False
        self._lock_held = False
        self._generation: int | None = None
        self._owned_lease: LeaseRecord | None = None
        self._stop = threading.Event()
        self._snapshot_refresh = threading.Event()
        self._heartbeat_thread: threading.Thread | None = None

    def _device_id(self) -> str | None:
        try:
            value = json.loads(self.identity_path.read_text(encoding="utf-8"))
            return str(UUID(value["device_id"]))
        except FileNotFoundError:
            return None
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise HostLeaseError("Lokale Gerätekennung ist beschädigt") from exc

    @property
    def has_instance_lock(self) -> bool:
        """Whether this process can safely keep the local database open."""
        return self._lock_held

    def current(self) -> LeaseRecord | None:
        try:
            return LeaseRecord.parse(json.loads(self.lease_path.read_text(encoding="utf-8")))
        except FileNotFoundError:
            return None
        except json.JSONDecodeError as exc:
            raise HostLeaseError("Staffelstab ist beschädigt") from exc

    def _last_owned(self) -> LeaseRecord | None:
        try:
            return LeaseRecord.parse(json.loads(self.last_owned_path.read_text(encoding="utf-8")))
        except FileNotFoundError:
            return None
        except json.JSONDecodeError as exc:
            raise HostLeaseError("Lokaler Staffelstab-Verlauf ist beschädigt") from exc

    def _remember_owned(self, lease: LeaseRecord) -> None:
        _atomic_json(self.last_owned_path, asdict(lease))
        self._owned_lease = lease

    def _package_loss(self, owned: LeaseRecord, winner: LeaseRecord) -> None:
        if (owned.released_at is not None or (winner.device_id == owned.device_id and winner.released_at is not None)
                or not lease_wins(winner, owned)):
            return
        try:
            package = build_conflict_package(self.settings, owned, winner)
            log.error("Doppel-Host erkannt; Konfliktpaket %s gesichert", package.package_id)
        except Exception as exc:  # noqa: BLE001 - never re-enable a losing writer if archiving fails
            log.error("Doppel-Host erkannt; Konfliktpaket fehlgeschlagen: %s", type(exc).__name__)

    def _conflicting_leases(self) -> list[tuple[Path, LeaseRecord]]:
        result: list[tuple[Path, LeaseRecord]] = []
        for path in self.lease_path.parent.glob("lease*.sync-conflict-*"):
            if path.is_symlink() or not path.is_file():
                raise HostLeaseError("Syncthing-Konflikt im Staffelstab-Ordner: Kopie ist ungeeignet")
            try:
                result.append((path, LeaseRecord.parse(json.loads(path.read_text(encoding="utf-8")))))
            except (OSError, json.JSONDecodeError, HostLeaseError) as exc:
                raise HostLeaseError("Syncthing-Konflikt im Staffelstab-Ordner: Kopie ist beschädigt") from exc
        return result

    @staticmethod
    def _same_owner(left: LeaseRecord, right: LeaseRecord) -> bool:
        return (left.device_id == right.device_id and left.generation == right.generation
                and left.acquired_at == right.acquired_at and left.released_at is None
                and right.released_at is None)

    def _restore_winning_copy(self, owned: LeaseRecord, current: LeaseRecord) -> LeaseRecord | None:
        """Resolve only a valid Syncthing lease election in this device's favor."""
        if owned.released_at is not None or current.released_at is not None or not lease_wins(owned, current):
            return None
        try:
            with FileLock(self.lease_path.with_suffix(".lock"), timeout=5):
                canonical = self.current()
                if canonical is None or canonical != current:
                    return None
                copies = self._conflicting_leases()
                owned_copy = any(self._same_owner(owned, item) for _path, item in copies)
                if not owned_copy or any(lease_wins(item, owned) for _path, item in copies):
                    return None
                if has_syncthing_conflicts(self.lease_path.parent,
                                           ignored_paths={path for path, _item in copies}):
                    return None
                # Preserve the canonical losing record before replacing the
                # mutable lease. It remains available if the other device has
                # not yet published its recovery package.
                archive = ensure_directory(self.settings.data_dir, "host", "lease-resolutions")
                name = f"{datetime.now(UTC):%Y%m%dT%H%M%S%fZ}-{uuid4().hex}.json"
                write_once(archive / name, json.dumps(asdict(canonical), ensure_ascii=False).encode("utf-8"))
                restored = LeaseRecord(owned.device_id, owned.device_name, owned.acquired_at,
                                       datetime.now(UTC).isoformat(), owned.generation,
                                       health_url=owned.health_url, base_snapshot=owned.base_snapshot)
                _atomic_json(self.lease_path, asdict(restored))
                self._remember_owned(restored)
                return restored
        except (HostLeaseError, OSError, ValueError, Timeout):
            return None

    def acquire_initial(self) -> LeaseRecord:
        """Create the first lease only; later devices use the verified handoff flow."""
        self.settings.local_dir.mkdir(parents=True, exist_ok=True)
        self.lease_path.parent.mkdir(parents=True, exist_ok=True)
        with FileLock(self.lease_path.with_suffix(".lock"), timeout=5):
            lease = self.current()
            device_id = self._device_id()
            if lease is not None:
                if lease.released_at is not None:
                    raise HostLeaseError("Staffelstab ist bereits freigegeben; Übernahmeprüfung erforderlich")
                if lease.device_id != device_id:
                    raise HostLeaseError(f"Staffelstab gehört bereits zu {lease.device_name}")
                return lease
            if device_id is None:
                device_id = str(uuid4())
                _atomic_json(self.identity_path, {"device_id": device_id})
            now = datetime.now(UTC).isoformat()
            lease = LeaseRecord(device_id, self.settings.device_name or socket.gethostname().split(".")[0], now, now, 1,
                                health_url=self.settings.host_health_url or None)
            _atomic_json(self.lease_path, asdict(lease))
            return lease

    def start(self, *, background: bool = True) -> bool:
        if self._active:
            return True
        # Standby processes also hold the local instance lock. A takeover must
        # never replace their open SQLite database underneath them.
        if not self._lock_held:
            self.settings.local_dir.mkdir(parents=True, exist_ok=True)
            try:
                self._instance_lock.acquire(timeout=0)
            except Timeout:
                return False
            self._lock_held = True
        try:
            device_id = self._device_id()
            lease = self.current()
        except (HostLeaseError, OSError):
            self.close()
            raise
        if device_id and lease is not None and lease.device_id != device_id:
            previous = self._last_owned()
            if previous is not None and previous.device_id == device_id:
                lease = self._restore_winning_copy(previous, lease) or lease
        if not device_id or not lease or lease.device_id != device_id or lease.released_at is not None:
            if device_id and lease and lease.device_id != device_id:
                previous = self._last_owned()
                if previous is not None and previous.device_id == device_id:
                    self._package_loss(previous, lease)
            return False
        self._generation = lease.generation
        self._active = True
        self._owned_lease = lease
        try:
            self.heartbeat()
        except (HostLeaseError, OSError):
            self.close()
            return False
        self._stop.clear()
        if background:
            self._start_background()
        return True

    def _start_background(self) -> None:
        if not self._active or self._heartbeat_thread is not None:
            return
        self._stop.clear()
        self._heartbeat_thread = threading.Thread(target=self._heartbeat_loop, name="host-heartbeat", daemon=True)
        self._heartbeat_thread.start()

    def _stop_background(self) -> None:
        self._stop.set()
        self._snapshot_refresh.set()
        if self._heartbeat_thread is not None and threading.current_thread() is not self._heartbeat_thread:
            self._heartbeat_thread.join()
        self._heartbeat_thread = None

    def _heartbeat_loop(self) -> None:
        from app.host.snapshots import create_snapshot

        next_heartbeat = time.monotonic() + self.settings.host_heartbeat_seconds
        next_snapshot = time.monotonic() + self.settings.snapshot_interval_seconds
        snapshot_failures = 0
        while not self._stop.is_set():
            if self._snapshot_refresh.wait(max(0, min(next_heartbeat, next_snapshot) - time.monotonic())):
                self._snapshot_refresh.clear()
                if self._stop.is_set():
                    break
                next_snapshot = time.monotonic() + self.settings.snapshot_interval_seconds
                continue
            now = time.monotonic()
            if now >= next_heartbeat:
                try:
                    self.heartbeat()
                except Exception as exc:  # noqa: BLE001 - heartbeat failures revoke write capability
                    log.error("Host-Herzschlag fehlgeschlagen: %s", type(exc).__name__)
                    self._active = False
                    break
                next_heartbeat = time.monotonic() + self.settings.host_heartbeat_seconds
            if now >= next_snapshot:
                try:
                    create_snapshot(self)
                    snapshot_failures = 0
                except HostLeaseError:
                    self._active = False
                    break
                except Exception as exc:  # noqa: BLE001 - a failed snapshot must not kill the heartbeat thread
                    snapshot_failures += 1
                    log.warning("Host-Snapshot fehlgeschlagen: %s", type(exc).__name__)
                next_snapshot = time.monotonic() + _snapshot_backoff_seconds(
                    self.settings.snapshot_interval_seconds, snapshot_failures)

    def refresh_snapshot_schedule(self) -> None:
        """Apply a changed snapshot interval without waiting for the old timer."""
        self._snapshot_refresh.set()

    def heartbeat(self) -> None:
        self.assert_writer()
        with FileLock(self.lease_path.with_suffix(".lock"), timeout=5):
            lease = self.current()
            if (lease is None or lease.device_id != self._device_id() or lease.generation != self._generation
                    or lease.released_at is not None or self._owned_lease is None
                    or lease.acquired_at != self._owned_lease.acquired_at):
                raise HostLeaseError("Staffelstab wurde entzogen")
            updated = LeaseRecord(lease.device_id, lease.device_name, lease.acquired_at,
                                  datetime.now(UTC).isoformat(), lease.generation,
                                  health_url=self.settings.host_health_url or lease.health_url,
                                  base_snapshot=lease.base_snapshot)
            _atomic_json(self.lease_path, asdict(updated))
            self._remember_owned(updated)

    def assert_writer(self) -> None:
        lease = self.current()
        if (self._active and lease is not None and self._owned_lease is not None
                and lease.device_id != self._owned_lease.device_id):
            lease = self._restore_winning_copy(self._owned_lease, lease) or lease
        if (not self._active or lease is None or lease.released_at is not None or lease.device_id != self._device_id()
                or lease.generation != self._generation or self._owned_lease is None
                or lease.acquired_at != self._owned_lease.acquired_at):
            if self._active and lease is not None and self._owned_lease is not None:
                self._active = False
                self._package_loss(self._owned_lease, lease)
            raise HostLeaseError("Kein Staffelstab: Schreibzugriff gesperrt")
        try:
            benign_copies: set[Path] = set()
            for path, candidate in self._conflicting_leases():
                if self._owned_lease is not None and lease_wins(candidate, self._owned_lease):
                    self._active = False
                    self._package_loss(self._owned_lease, candidate)
                    raise HostLeaseError("Doppel-Host-Konflikt: Schreibzugriff gesperrt")
                benign_copies.add(path)
            if has_syncthing_conflicts(self.lease_path.parent, ignored_paths=benign_copies):
                self._active = False
                raise HostLeaseError("Syncthing-Konflikt im Staffelstab-Ordner: Schreibzugriff gesperrt")
        except HostLeaseError:
            self._active = False
            raise
        except OSError as exc:
            self._active = False
            raise HostLeaseError("Staffelstab-Ordner konnte nicht auf Konflikte geprüft werden") from exc

    def _require_finished_syncs(self) -> None:
        """An interrupted sync must be resolved before publishing a final snapshot."""
        try:
            url = make_url(self.settings.database_url)
            if url.get_backend_name() != "sqlite" or not url.database or url.database == ":memory:":
                raise ValueError("Keine SQLite-Datei")
            path = Path(url.database).resolve()
            with closing(sqlite3.connect(f"{path.as_uri()}?mode=ro", uri=True)) as database:
                running = database.execute("SELECT COUNT(*) FROM sync_runs WHERE status = 'running'").fetchone()
            if running is None or running[0] != 0:
                raise HostLeaseError("Ein Sync ist noch nicht abgeschlossen")
        except (OSError, sqlite3.Error, ValueError, ArgumentError) as exc:
            raise HostLeaseError("Lokale Datenbank kann für die Freigabe nicht geprüft werden") from exc

    def _publish_release(self) -> LeaseRecord:
        from app.host.snapshots import create_snapshot, verified_handoff_snapshot

        self.assert_writer()
        self._require_finished_syncs()
        lease = self.current()
        if lease is None:
            raise HostLeaseError("Staffelstab fehlt")
        manifest = create_snapshot(self, next_generation=True)
        verified_handoff_snapshot(self.settings.data_dir / "host" / "snapshots",
                                  generation=lease.generation + 1, device_id=lease.device_id,
                                  max_age_seconds=300)
        with FileLock(self.lease_path.with_suffix(".lock"), timeout=5):
            if self.current() != lease:
                raise HostLeaseError("Staffelstab hat sich während der Freigabe geändert")
            now = datetime.now(UTC).isoformat()
            released = LeaseRecord(lease.device_id, lease.device_name, lease.acquired_at,
                                   now, manifest.generation, now, lease.health_url, manifest.filename)
            _atomic_json(self.lease_path, asdict(released))
            self._remember_owned(released)
        self._active = False
        self._generation = None
        self._owned_lease = None
        return released

    def release_active(self, gate: WriteGate) -> LeaseRecord:
        """Release this running host after its callers have drained all writes."""
        if not gate.draining:
            raise HostLeaseError("Schreibanfragen müssen vor der Freigabe angehalten sein")
        self.assert_writer()
        self._stop_background()
        try:
            return self._publish_release()
        except BaseException:
            if self.is_writer:
                self._start_background()
            raise

    def release_offline(self, *, pre_release_check: Callable[[], None] | None = None) -> LeaseRecord:
        """Release only after the local service has stopped and its lock is free."""
        if self._active:
            raise HostLeaseError("Host-Dienst muss vor der Freigabe gestoppt sein")
        try:
            if not self.start(background=False):
                raise HostLeaseError("Host-Dienst muss vor der Freigabe gestoppt sein")
            if pre_release_check is not None:
                pre_release_check()
            return self._publish_release()
        finally:
            self.close()

    @property
    def is_writer(self) -> bool:
        try:
            self.assert_writer()
            return True
        except HostLeaseError:
            return False

    def close(self) -> None:
        self._stop.set()
        self._snapshot_refresh.set()
        if self._heartbeat_thread is not None and threading.current_thread() is not self._heartbeat_thread:
            self._heartbeat_thread.join(timeout=2)
        self._heartbeat_thread = None
        self._active = False
        self._generation = None
        self._owned_lease = None
        if self._lock_held:
            self._lock_held = False
            self._instance_lock.release()
