# SPDX-License-Identifier: AGPL-3.0-or-later

"""Quiesce a running host before publishing its final handoff snapshot."""

from __future__ import annotations

from collections.abc import Callable

from app.host.lease import HostCoordinator, HostLeaseError, LeaseRecord
from app.host.write_gate import WriteGate
from app.sync.scheduler import SyncScheduler


def release_running_host(coordinator: HostCoordinator, scheduler: SyncScheduler,
                         gate: WriteGate, *, timeout_seconds: float = 300,
                         pre_release_check: Callable[[], None] | None = None) -> LeaseRecord:
    """Drain HTTP writers, finish scheduled jobs, then revoke this host's lease.

    The caller keeps the service process alive in read-only standby.
    """
    coordinator.assert_writer()
    drained = gate.drain(timeout_seconds=timeout_seconds)
    try:
        if not drained:
            raise HostLeaseError("Laufende Schreibanfragen wurden nicht rechtzeitig abgeschlossen")
        scheduler_was_running = scheduler.scheduler.running
        try:
            if scheduler_was_running:
                scheduler.stop()
            if pre_release_check is not None:
                pre_release_check()
            return coordinator.release_active(gate)
        except BaseException:
            if coordinator.is_writer and scheduler_was_running:
                scheduler.start()
            raise
    finally:
        gate.reopen()
