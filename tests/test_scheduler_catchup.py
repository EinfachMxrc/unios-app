# SPDX-License-Identifier: AGPL-3.0-or-later

"""A sleeping host catches up without syncing during quiet hours."""

from datetime import datetime, timedelta
from threading import Event

from apscheduler.events import EVENT_JOB_EXECUTED

import app.sync.scheduler as scheduler_module
from app.sync.scheduler import SyncScheduler


class FakeEngine:
    def __init__(self):
        self.calls = 0

    def run(self):
        self.calls += 1


def test_missed_sync_runs_once_after_wake_and_schedules_the_next_one(settings, coordinator):
    configured = settings.model_copy(update={"quiet_hours_start": None, "quiet_hours_end": None})
    engine = FakeEngine()
    scheduler = SyncScheduler(engine, configured, coordinator)
    completed = Event()
    scheduler.scheduler.add_listener(lambda _event: completed.set(), EVENT_JOB_EXECUTED)
    scheduler.scheduler.start(paused=True)
    try:
        scheduler._schedule_at(datetime.now(configured.timezone) - timedelta(hours=2))
        assert scheduler.scheduler.get_job("next_sync").misfire_grace_time is None
        scheduler.scheduler.resume()
        assert completed.wait(5)
        assert engine.calls == 1
        next_sync = scheduler.scheduler.get_job("next_sync")
        assert next_sync is not None
        assert next_sync.next_run_time > datetime.now(configured.timezone)
    finally:
        scheduler.stop()


def test_late_sync_waits_until_quiet_hours_end(settings, coordinator, monkeypatch):
    fixed = datetime(2026, 9, 24, 2, 15, tzinfo=settings.timezone)

    class FrozenDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return fixed.astimezone(tz) if tz else fixed.replace(tzinfo=None)

    monkeypatch.setattr(scheduler_module, "datetime", FrozenDateTime)
    engine = FakeEngine()
    scheduler = SyncScheduler(engine, settings, coordinator)
    scheduler.scheduler.start(paused=True)
    try:
        scheduler._run_and_reschedule()
        next_sync = scheduler.scheduler.get_job("next_sync")
        assert engine.calls == 0
        assert next_sync is not None
        assert next_sync.next_run_time.astimezone(settings.timezone).hour == 6
    finally:
        scheduler.stop()


def test_first_source_added_after_start_schedules_the_sync_without_restart(settings, coordinator):
    engine = FakeEngine()
    engine.connectors = []
    scheduler = SyncScheduler(engine, settings, coordinator)
    scheduler.scheduler.start(paused=True)
    try:
        scheduler.ensure_sync_scheduled()
        assert scheduler.scheduler.get_job("next_sync") is None
        engine.connectors.append(object())
        scheduler.ensure_sync_scheduled()
        assert scheduler.scheduler.get_job("next_sync") is not None
    finally:
        scheduler.stop()
