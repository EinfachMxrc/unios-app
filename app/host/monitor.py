# SPDX-License-Identifier: AGPL-3.0-or-later

"""Conservative standby monitor for an unattended failed-host takeover."""

from __future__ import annotations

import logging
import threading
from datetime import UTC, datetime

from sqlalchemy.engine import Engine

from app.config import Settings
from app.host.handoff import HandoffError, acquire_stale
from app.host.lease import HostCoordinator, HostLeaseError, LeaseRecord
from app.host.write_gate import WriteGate, WriteGateBusy
from app.sync.scheduler import SyncScheduler

log = logging.getLogger(__name__)


class StandbyMonitor:
    def __init__(self, settings: Settings, coordinator: HostCoordinator, engine: Engine,
                 scheduler: SyncScheduler, request_gate: WriteGate):
        self.settings = settings
        self.coordinator = coordinator
        self.engine = engine
        self.scheduler = scheduler
        self.request_gate = request_gate
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread is not None:
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name="standby-takeover", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join()
            self._thread = None

    def _loop(self) -> None:
        while not self._stop.wait(self.settings.automatic_takeover_poll_seconds):
            try:
                self.run_once()
            except Exception as exc:  # noqa: BLE001 - keep standby alive and report only error type
                log.warning("Ausfallübernahme nicht möglich: %s", type(exc).__name__)

    def _eligible_to_check(self, lease: LeaseRecord | None) -> bool:
        if not lease or lease.released_at or not lease.health_url or not self.settings.host_health_url:
            return False
        if lease.device_id == self.coordinator._device_id():
            return False
        try:
            heartbeat = datetime.fromisoformat(lease.heartbeat_at).astimezone(UTC)
        except ValueError:
            return False
        return (datetime.now(UTC) - heartbeat).total_seconds() > self.settings.automatic_takeover_after_seconds

    def run_once(self) -> bool:
        """Return True only after a checked claim and scheduler start."""
        writer = self.coordinator.is_writer
        if not writer and self.scheduler.scheduler.running:
            self.scheduler.stop()
        if writer or not self.settings.automatic_takeover_enabled or not self._eligible_to_check(self.coordinator.current()):
            return False
        try:
            drained = self.request_gate.drain(timeout_seconds=30)
        except WriteGateBusy:
            return False
        try:
            if not drained:
                return False
            self.engine.dispose()
            self.coordinator.close()
            try:
                acquire_stale(self.settings)
            except (HandoffError, HostLeaseError) as exc:
                log.info("Ausfallübernahme bleibt im Standby: %s", str(exc))
                self.coordinator.start()
                return False
            if not self.coordinator.start():
                raise HostLeaseError("Übernommener Staffelstab konnte nicht gestartet werden")
            self.scheduler.start()
            log.info("Ausfallübernahme abgeschlossen; Synchronisation gestartet")
            return True
        finally:
            self.request_gate.reopen()
