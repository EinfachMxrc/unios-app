# SPDX-License-Identifier: AGPL-3.0-or-later
from datetime import UTC, datetime

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.courses.api import course_router
from app.courses.classification import DOCUMENT_SOURCES, teaching_courses
from app.db.models import Assignment, CalendarEvent, Course, Resource, ResourceVersion
from app.intake.repository import IntakeRepository
from app.intake.service import IntakeService
from app.journal.api import journal_router


def test_portal_documents_are_separate_from_teaching_courses(factory):
    with factory() as session:
        for source in ("moodle", "mycampus", "primuss_portal", "example_university"):
            session.add(Course(source=source, source_id="sample", name=source))
        session.commit()
        assert {item.source for item in session.scalars(select(Course).where(teaching_courses()))} == {"moodle", "example_university"}
        assert {item.source for item in session.scalars(select(Course).where(Course.source.in_(DOCUMENT_SOURCES)))} == set(DOCUMENT_SOURCES)


def test_assigned_moodle_items_need_no_triage(settings, factory):
    with factory() as session:
        course = Course(source="moodle", source_id="sample", name="Beispielkurs")
        session.add(course)
        session.flush()
        session.add(Resource(source="moodle", source_key="sample.pdf", name="Beispiel.pdf", kind="file", url="",
                             course_id=course.id, group_category="general", last_seen_at=datetime.now(UTC)))
        session.add(Assignment(source="moodle", source_key="sample-task", course_id=course.id,
                               title="Beispielaufgabe", last_seen_at=datetime.now(UTC)))
        session.commit()
    items = IntakeService(IntakeRepository(factory, settings)).items()
    assert len(items) == 2
    assert all(item.state == "accepted" and item.course_id for item in items)


def test_download_is_not_attendance_and_inactive_preserves_history(settings, factory, coordinator):
    with factory() as session:
        course = Course(source="fixture", source_id="sample", name="Beispielkurs")
        session.add(course)
        session.flush()
        course_id = course.id
        resource = Resource(source="fixture", source_key="sample.pdf", name="Beispiel.pdf", kind="file", url="",
                            course_id=course.id, group_category="general")
        session.add(resource)
        session.flush()
        resource_id = resource.id
        session.add(ResourceVersion(resource_id=resource_id, version=1, sha256="a" * 64, size=1,
                                    relative_path="fixture.pdf", mime_type="application/pdf", downloaded_at=datetime(2026, 9, 30, 10, tzinfo=UTC)))
        session.commit()
    app = FastAPI()
    app.include_router(journal_router(settings, factory, coordinator))
    app.include_router(course_router(factory, coordinator))
    client = TestClient(app)
    day = client.get("/api/journal/2026-09-30").json()
    assert len(day["materials"]) == 1
    assert day["courses"] == []
    with factory() as session:
        session.add(CalendarEvent(source="fixture", source_key="lesson", course_id=course_id,
                                  title="Beispieltermin", starts_at=datetime(2026, 9, 30, 10, tzinfo=UTC)))
        session.commit()
    assert len(client.get("/api/journal/2026-09-30").json()["courses"]) == 1
    url = f"/api/courses/{course_id}/activity"
    assert client.patch(url, json={"is_active": False, "expected_is_active": True}).status_code == 200
    assert client.patch(url, json={"is_active": False, "expected_is_active": True}).status_code == 409
    assert client.get("/api/journal/2026-09-30").json()["courses"] == []
    client.put(f"/api/journal/2026-09-30/courses/{course_id}", json={"expected_revision": 0, "covered": "Eigener Rückblick"})
    assert client.get("/api/journal/2026-09-30").json()["courses"][0]["covered"] == "Eigener Rückblick"
    assert client.patch(url, json={"is_active": True, "expected_is_active": False}).status_code == 200
    with factory() as session:
        assert session.get(Course, course_id).is_active
        assert session.get(Resource, resource_id) is not None
