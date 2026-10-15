# SPDX-License-Identifier: AGPL-3.0-or-later

"""The Sunday summary is accurate locally and private in push messages."""

from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.config import RemoteAddressNotConfigured
from app.db.models import (
    AnkiCard,
    AnkiCardQueue,
    AnkiReview,
    Course,
    CourseSection,
    Deadline,
    Notification,
    Resource,
    ResourceVersion,
    SectionGroupAssignment,
    WeeklyDigest,
)
from app.digest.service import build_digest, send_weekly_digest, week_start_for
from app.main import create_app
from app.notify.links import dashboard_link, dashboard_link_or_notice
from app.notify.service import Notifier
from app.sync.engine import SyncEngine
from app.sync.scheduler import SyncScheduler

SUNDAY = datetime(2026, 9, 27, 19, 5, tzinfo=ZoneInfo("Europe/Berlin"))


def _seed(factory):
    with factory() as session:
        course = Course(source="fixture", source_id="one", name="Privater Kurs")
        session.add(course)
        session.flush()
        section = CourseSection(course_id=course.id, source_id="unknown", name="Unklar")
        session.add(section)
        session.flush()
        session.add(SectionGroupAssignment(section_id=section.id, status="unassigned", needs_confirmation=True))
        resource = Resource(source="fixture", source_key="one", course_id=course.id,
                            kind="file", name="Privates Skript.pdf", url="https://example.invalid/resource")
        hidden = Resource(source="fixture", source_key="other", course_id=course.id,
                          kind="file", name="Fremdgruppe.pdf", url="https://example.invalid/other",
                          group_category="other_group")
        session.add_all([resource, hidden])
        session.flush()
        for item, version, day in ((resource, 1, 23), (hidden, 1, 24)):
            session.add(ResourceVersion(resource_id=item.id, version=version, sha256="a" * 64,
                                        relative_path=f"uni/test-{item.id}.pdf", size=10,
                                        mime_type="application/pdf",
                                        downloaded_at=datetime(2026, 9, day, 10, tzinfo=UTC)))
        session.add(Deadline(source="fixture", source_key="due", title="Vertrauliche Aufgabe",
                             course_id=course.id, due_at=datetime(2026, 9, 29, 12, tzinfo=UTC)))
        session.add(Deadline(source="fixture", source_key="removed", title="Entfernt",
                             course_id=course.id, due_at=datetime(2026, 9, 30, 12, tzinfo=UTC),
                             removed_upstream=True))
        proposal = AnkiCardQueue(status="proposed", payload='{"front":"erfunden"}')
        session.add(proposal)
        session.flush()
        card = AnkiCard(queue_id=proposal.id, note_id="fake-note")
        session.add(card)
        session.flush()
        session.add(AnkiReview(card_id=card.id, reviewed_at=datetime(2026, 9, 25, 12, tzinfo=UTC), rating=3))
        session.commit()
        return course.id


def test_week_bounds_summary_push_privacy_and_idempotence(settings, factory, coordinator):
    course_id = _seed(factory)
    assert week_start_for(SUNDAY, settings).isoformat() == "2026-09-21"
    with factory() as session:
        summary = build_digest(session, settings, SUNDAY)
    assert summary.week_end.isoformat() == "2026-09-28"
    assert summary.next_week_end.isoformat() == "2026-10-05"
    assert [(item.course_id, item.count) for item in summary.materials] == [(course_id, 1)]
    assert [item.title for item in summary.deadlines] == ["Vertrauliche Aufgabe"]
    assert summary.open_assignments[0].count == 1
    assert summary.anki.available and summary.anki.card_count == 1
    assert summary.anki.review_count == 1 and summary.anki.proposed_count == 1

    settings.tailscale_ip = "100.101.102.103"
    notifier = Notifier(settings, coordinator)
    first = send_weekly_digest(factory, settings, coordinator, notifier, SUNDAY)
    second = send_weekly_digest(factory, settings, coordinator, notifier, SUNDAY)
    assert first is not None and second is not None and first.id == second.id
    with factory() as session:
        assert len(session.scalars(select(WeeklyDigest)).all()) == 1
        notices = session.scalars(select(Notification).where(Notification.event_key.like("weekly-digest:%"))).all()
        assert len(notices) == 1
        assert "/digest" in notices[0].body
        assert "Privater Kurs" not in notices[0].body
        assert "Vertrauliche Aufgabe" not in notices[0].body
        assert "Privates Skript" not in notices[0].body


def test_digest_switch_and_browser_view(settings, factory, coordinator):
    _seed(factory)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        preview = client.get("/api/digest")
        assert preview.status_code == 200 and preview.json()["preview"]
        assert preview.json()["enabled"]
        assert client.patch("/api/digest/preference", json={"enabled": False},
                            headers={"origin": "https://example.invalid"}).status_code == 403
        assert client.patch("/api/digest/preference", json={"enabled": False}).json() == {"enabled": False}
        assert client.get("/api/digest").json()["enabled"] is False
        assert client.patch("/api/digest/preference", json={"enabled": True}).json() == {"enabled": True}
        assert client.get("/api/digest/preference").json()["enabled"] is True
    notifier = Notifier(settings, coordinator)
    with TestClient(app) as client:
        client.patch("/api/digest/preference", json={"enabled": False})
    assert send_weekly_digest(factory, settings, coordinator, notifier, SUNDAY) is None
    with factory() as session:
        assert not session.scalars(select(Notification)).all()
    with TestClient(app) as client:
        client.patch("/api/digest/preference", json={"enabled": True})
    send_weekly_digest(factory, settings, coordinator, notifier, SUNDAY)
    with TestClient(app) as client:
        latest = client.get("/api/digest").json()
        assert not latest["preview"]
        assert latest["summary"]["materials"][0]["course_name"] == "Privater Kurs"


def test_scheduler_has_sunday_job_even_without_connector(settings, factory, coordinator):
    notifier = Notifier(settings, coordinator)
    engine = SyncEngine(factory, settings, [], notifier, coordinator)
    scheduler = SyncScheduler(engine, settings, coordinator)
    scheduler.start()
    try:
        job = scheduler.scheduler.get_job("weekly_digest")
        assert job is not None
        assert job.next_run_time.weekday() == 6
        assert job.next_run_time.hour == 19
        assert scheduler.scheduler.get_job("next_sync") is None
    finally:
        scheduler.stop()


def test_dst_week_window_is_seven_local_days(settings):
    spring_sunday = datetime(2027, 3, 28, 19, tzinfo=settings.timezone)
    assert week_start_for(spring_sunday, settings) + timedelta(days=7) == date(2027, 3, 29)


def test_dashboard_link_accepts_only_local_or_tailscale_hosts(settings):
    with pytest.raises(RemoteAddressNotConfigured):
        dashboard_link(settings, "/digest")
    settings.tailscale_ip = "100.101.102.103"
    assert dashboard_link(settings, "/digest") == "http://100.101.102.103:8000/digest"
    settings.tailscale_ip = "8.8.8.8"
    with pytest.raises(RemoteAddressNotConfigured):
        dashboard_link(settings, "/digest")
    assert dashboard_link_or_notice(settings, "/digest") == "(kein Fernzugriff eingerichtet – in der App öffnen)"
