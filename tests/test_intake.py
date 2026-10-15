# SPDX-License-Identifier: AGPL-3.0-or-later

"""A local intake decision never changes or discards the incoming source."""

from datetime import UTC, datetime, timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.db.models import Course, InboxClip, LearningTopic, MailItem
from app.inbox.api import inbox_router
from app.inbox.search import search_clips
from app.intake.api import intake_router
from app.intake.repository import IntakeRepository
from app.intake.service import IntakeService


def test_capture_triage_search_and_critical_snooze(settings, factory, coordinator):
    with factory() as session:
        course = Course(source="fixture", source_id="intake-course", name="Beispielkurs")
        session.add(course)
        session.flush()
        topic = LearningTopic(course_id=course.id, slug="generatoren", name="Generatoren")
        session.add(topic)
        session.add(MailItem(source_hash="m" * 64, sender="uni@example.invalid", subject="Prüfungsfrist",
                             candidate_date=datetime.now(UTC).date() + timedelta(days=3), status="candidate",
                             imported_at=datetime.now(UTC)))
        session.commit()
        course_id, topic_id = course.id, topic.id
    app = FastAPI()
    app.include_router(inbox_router(settings, factory, coordinator))
    app.include_router(intake_router(IntakeService(IntakeRepository(factory, settings)), coordinator))
    client = TestClient(app)
    created = client.post("/api/inbox/clips", json={"kind": "text", "title": "Generatoren",
                                                     "body": "yield erzeugt Werte nach Bedarf"}).json()
    key = f"/api/intake/clip/{created['id']}"
    assert next(item for item in client.get("/api/intake").json() if item["source_id"] == created["id"])["state"] == "new"
    with factory() as session:
        assert search_clips(session, "yield") == []
    assert client.patch(key, json={"expected_revision": 0, "state": "accepted"}).status_code == 400
    assert any(item["id"] == str(topic_id) for item in client.get("/api/intake/targets", params={"course_id": course_id}).json())
    accepted = client.patch(key, json={"expected_revision": 0, "state": "accepted", "course_id": course_id,
                                      "target_kind": "topic", "target_id": str(topic_id)})
    assert accepted.status_code == 200
    assert accepted.json()["revision"] == 1
    assert client.patch(key, json={"expected_revision": 0, "state": "rejected"}).status_code == 409
    with factory() as session:
        assert session.get(InboxClip, created["id"]).body == "yield erzeugt Werte nach Bedarf"
        assert len(search_clips(session, "yield")) == 1
    rejected = client.patch(key, json={"expected_revision": 1, "state": "rejected", "course_id": course_id})
    assert rejected.status_code == 200
    with factory() as session:
        assert session.get(InboxClip, created["id"]).body == "yield erzeugt Werte nach Bedarf"
        assert search_clips(session, "yield") == []
    other = client.post("/api/inbox/clips", json={"kind": "text", "title": "Ähnlicher Text",
                                                   "body": "Noch ein erfundener Lerntext"}).json()
    duplicate = client.patch(key, json={"expected_revision": 2, "state": "duplicate",
                                         "duplicate_of": f"clip:{other['id']}", "course_id": course_id})
    assert duplicate.status_code == 200
    assert duplicate.json()["duplicate_of"] == f"clip:{other['id']}"
    mail = next(item for item in client.get("/api/intake").json() if item["source_kind"] == "mail")
    mail_key = f"/api/intake/mail/{mail['source_id']}"
    assert client.patch(mail_key, json={"expected_revision": 0, "state": "snoozed",
        "snoozed_until": (datetime.now(UTC) + timedelta(days=1)).isoformat()}).status_code == 400
    assert client.patch(mail_key, json={"expected_revision": 0, "state": "snoozed",
        "snoozed_until": (datetime.now(UTC) + timedelta(hours=4)).isoformat()}).status_code == 200
