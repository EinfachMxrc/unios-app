# SPDX-License-Identifier: AGPL-3.0-or-later

from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.models import Notification, SyncRun, utc_now
from app.main import create_app
from app.notify.service import Notifier
from app.sync.engine import SyncEngine
from app.sync.scheduler import SyncScheduler


def test_long_gap_enqueues_one_warning_per_day(settings, factory, coordinator):
    settings.tailscale_ip = "100.101.102.103"
    with factory() as session:
        session.add(SyncRun(status="success", finished_at=utc_now() - timedelta(hours=25)))
        session.commit()
    notifier = Notifier(settings, coordinator)
    engine = SyncEngine(factory, settings, [], notifier, coordinator)
    scheduler = SyncScheduler(engine, settings, coordinator)
    scheduler._warn_stale_sync()
    scheduler._warn_stale_sync()
    with factory() as session:
        notices = session.scalars(select(Notification).where(Notification.event_key.like("stale-sync:%"))).all()
    assert len(notices) == 1
    assert notices[0].body.endswith("/system")


def test_recent_sync_does_not_warn(settings, factory, coordinator):
    with factory() as session:
        session.add(SyncRun(status="success", finished_at=utc_now() - timedelta(hours=1)))
        session.commit()
    notifier = Notifier(settings, coordinator)
    scheduler = SyncScheduler(SyncEngine(factory, settings, [], notifier, coordinator), settings, coordinator)
    scheduler._warn_stale_sync()
    with factory() as session:
        assert session.scalar(select(Notification).where(Notification.event_key.like("stale-sync:%"))) is None


def test_warning_run_does_not_hide_old_successful_sync(settings, factory, coordinator):
    settings.tailscale_ip = "100.101.102.103"
    with factory() as session:
        session.add_all([
            SyncRun(status="success", finished_at=utc_now() - timedelta(hours=25)),
            SyncRun(status="warning", finished_at=utc_now() - timedelta(minutes=5)),
        ])
        session.commit()
    notifier = Notifier(settings, coordinator)
    scheduler = SyncScheduler(SyncEngine(factory, settings, [], notifier, coordinator), settings, coordinator)
    scheduler._warn_stale_sync()
    with factory() as session:
        notice = session.scalar(select(Notification).where(Notification.event_key.like("stale-sync:%")))
        assert notice is not None
        assert notice.body.endswith("/system")


def test_recent_warning_with_processed_courses_counts_as_sync(settings, factory, coordinator):
    with factory() as session:
        session.add_all([
            SyncRun(status="success", finished_at=utc_now() - timedelta(hours=25), course_count=2),
            SyncRun(status="warning", finished_at=utc_now() - timedelta(minutes=5), course_count=2),
        ])
        session.commit()
    notifier = Notifier(settings, coordinator)
    scheduler = SyncScheduler(SyncEngine(factory, settings, [], notifier, coordinator), settings, coordinator)
    scheduler._warn_stale_sync()
    with factory() as session:
        assert session.scalar(select(Notification).where(Notification.event_key.like("stale-sync:%"))) is None


def test_api_shows_overdue_sync_and_recovery_after_a_gap(settings, factory, coordinator):
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.get("/api/overview").json()["sync_continuity"]["state"] == "never"
        old = utc_now() - timedelta(hours=38, minutes=5)
        with factory() as session:
            session.add_all([SyncRun(status="success", finished_at=old, course_count=2),
                             SyncRun(status="error", finished_at=utc_now())])
            session.commit()
        for endpoint in ("/api/overview", "/api/system"):
            continuity = client.get(endpoint).json()["sync_continuity"]
            assert continuity["state"] == "overdue"
            assert continuity["hours_since"] == 38
            assert continuity["recovered_gap_hours"] is None
        with factory() as session:
            session.add(SyncRun(status="success", finished_at=utc_now(), course_count=2))
            session.commit()
        for endpoint in ("/api/overview", "/api/system"):
            continuity = client.get(endpoint).json()["sync_continuity"]
            assert continuity["state"] == "recovered"
            assert continuity["recovered_gap_hours"] == 38
            assert continuity["hours_since"] == 0
