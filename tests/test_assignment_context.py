# SPDX-License-Identifier: AGPL-3.0-or-later
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.assignments.api import assignment_router
from app.connectors.base import RemoteAssignment, RemoteCourse
from app.db.models import Assignment, Course, Deadline, SyncRun
from app.notify.service import Notifier
from app.sync.assignment_context import assignment_context
from app.sync.engine import SyncEngine
from app.timeutil import as_utc

TZ = ZoneInfo("Europe/Berlin")


def test_explicit_date_clock_and_relative_text():
    opening = int(datetime(2027, 3, 9, 14, tzinfo=TZ).timestamp())
    absolute = assignment_context("Abgabe am 10.03.2027 um 14.45 Uhr vor Ort.", opening, TZ)
    assert absolute.due_at == datetime(2027, 3, 10, 13, 45, tzinfo=UTC)
    assert absolute.delivery == "in_person"
    weekday = assignment_context("Bitte am Mittwoch bis 14:45 abgeben.", opening, TZ)
    assert weekday.due_at == absolute.due_at
    uncertain = assignment_context("Abgabe am zweiten Tag um 14.45 Uhr mit USB-Stick. Nicht über Moodle!", opening, TZ)
    assert uncertain.due_at is None and "14.45" in uncertain.quote
    assert uncertain.delivery == "in_person"
    assert assignment_context("Geöffnet am 10.03.2027. Abgabe am zweiten Tag.", opening, TZ).due_at is None
    assert assignment_context("Abgabe 31.02.2027 um 14:45.", opening, TZ).due_at is None
    assert assignment_context("Abgabe am Mittwoch um 14:45.", None, TZ).due_at is None
    assert assignment_context("Abgabe über GitHub, nicht per Mail.", None, TZ).delivery == "unknown"


def test_confirmation_survives_sync_and_rejects_stale_update(settings, factory, coordinator):
    sync = SyncEngine(factory, settings, [], Notifier(settings, coordinator), coordinator)
    remote = RemoteCourse("sample", "Beispielkurs", assignments=[
        RemoteAssignment("sample:task", "Gruppenprojekt", None, None,
                         "Abgabe am zweiten Tag um 14.45 Uhr vor Ort.")])
    with factory() as session:
        course = Course(source="moodle", source_id="sample", name=remote.name)
        session.add(course); session.flush()
        sync._upsert_assignments(session, SyncRun(change_count=0), "moodle", course, remote)
        session.commit()
        assignment_id = session.scalar(select(Assignment.id))
    app = FastAPI()
    app.include_router(assignment_router(factory, coordinator))
    client = TestClient(app)
    assert len(client.get("/api/assignments/unresolved").json()) == 1
    payload = {"due_at": "2027-03-10T13:45:00Z", "expected_due_at": None, "delivery": "in_person"}
    assert client.post(f"/api/assignments/{assignment_id}/deadline", json=payload).status_code == 200
    assert client.post(f"/api/assignments/{assignment_id}/deadline", json=payload).status_code == 409
    assert client.get("/api/assignments/unresolved").json() == []
    with factory() as session:
        course = session.scalar(select(Course))
        sync._upsert_assignments(session, SyncRun(change_count=0), "moodle", course, remote)
        session.commit()
        item = session.get(Assignment, assignment_id)
        assert item.due_override and item.delivery == "in_person" and item.due_origin == "confirmed"
        assert as_utc(item.due_at) == datetime(2027, 3, 10, 13, 45, tzinfo=UTC)
        assert session.scalar(select(Deadline)).assignment_id == item.id
