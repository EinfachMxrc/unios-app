# SPDX-License-Identifier: AGPL-3.0-or-later

from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.models import (
    Course,
    Deadline,
    DeadlineProposal,
    Resource,
    ResourceText,
    ResourceVersion,
)
from app.deadline_proposals.service import stage_document_date
from app.main import create_app


def add_version(session, resource, number: int, body: str):
    version = ResourceVersion(resource_id=resource.id, version=number, sha256=f"{number:064d}",
                              relative_path=f"example-v{number}.pdf", size=100, mime_type="application/pdf")
    session.add(version)
    session.flush()
    session.add(ResourceText(version_id=version.id, page_number=12, text=body,
                             markdown=None, no_text_layer=False))
    session.flush()
    stage_document_date(session, resource, version)
    session.commit()
    return version


def test_document_date_requires_review_and_shows_source_change(settings, factory, coordinator):
    with factory() as session:
        course = Course(source="fake", source_id="1", name="Mathematik")
        session.add(course)
        session.flush()
        resource = Resource(source="fake", source_key="slides", course_id=course.id, kind="file",
                            name="VL 03.pdf", url="https://example.invalid/slides")
        session.add(resource)
        session.flush()
        first = add_version(session, resource, 1, "Die Anmeldefrist ist bis zum 15.05.2027 verlängert.")
        assert session.scalar(select(Deadline)) is None
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        proposed = client.get("/api/deadline-proposals").json()
        assert len(proposed) == 1
        assert proposed[0]["page_number"] == 12
        assert proposed[0]["version_id"] == first.id
        assert proposed[0]["previous_due_at"] is None
        approved = client.post(f"/api/deadline-proposals/{proposed[0]['id']}/accept", json={
            "title": "Prüfungsanmeldung", "due_at": datetime(2027, 5, 15, 23, 59, tzinfo=UTC).isoformat()})
        assert approved.status_code == 200
        assert client.get("/api/deadlines").json()["deadlines"][0]["url"] == f"/material/{first.id}?page=12"
        assert client.post(f"/api/deadline-proposals/{proposed[0]['id']}/dismiss").status_code == 409
        with factory() as session:
            resource = session.get(Resource, first.resource_id)
            assert resource is not None
            add_version(session, resource, 2, "Neue Anmeldefrist: 20.05.2027.")
        changed = client.get("/api/deadline-proposals").json()
        assert len(changed) == 1
        assert changed[0]["previous_due_at"].startswith("2027-05-15")
        assert client.post(f"/api/deadline-proposals/{changed[0]['id']}/dismiss").status_code == 200
        assert client.get("/api/deadline-proposals").json() == []
    with factory() as session:
        deadline = session.scalar(select(Deadline))
        assert deadline is not None and deadline.due_at.date().isoformat() == "2027-05-15"
        assert session.scalar(select(DeadlineProposal).where(DeadlineProposal.status == "dismissed")) is not None


def test_ambiguous_document_dates_are_not_proposed(settings, factory, coordinator):
    with factory() as session:
        course = Course(source="fake", source_id="1", name="Mathematik")
        session.add(course)
        session.flush()
        resource = Resource(source="fake", source_key="slides", course_id=course.id, kind="file",
                            name="Termine.pdf", url="https://example.invalid/slides")
        session.add(resource)
        session.flush()
        add_version(session, resource, 1, "Anmeldefrist 15.05.2027. Abgabefrist 20.05.2027.")
        assert session.scalar(select(DeadlineProposal)) is None
