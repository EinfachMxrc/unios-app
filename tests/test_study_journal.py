# SPDX-License-Identifier: AGPL-3.0-or-later

"""A study day combines source records without copying or changing them."""

from datetime import UTC, datetime
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.db.models import CalendarEvent, Course, Jot, Resource, ResourceVersion
from app.journal.api import journal_router


def test_journal_collects_local_day_and_rejects_stale_edits(settings, factory, coordinator):
    with factory() as session:
        course = Course(source="fixture", source_id="course-1", name="Algorithmen", short_name=None)
        session.add(course)
        session.flush()
        resource = Resource(source="fixture", source_key="file-1", course_id=course.id,
                            kind="file", name="Sortieren.pdf", url="", group_category="general")
        session.add(resource)
        session.flush()
        session.add(ResourceVersion(resource_id=resource.id, version=1, sha256="a" * 64,
                                    relative_path="fixture.pdf", size=10, mime_type="application/pdf",
                                    downloaded_at=datetime(2026, 9, 25, 22, 45, tzinfo=UTC)))
        session.add(CalendarEvent(source="fixture", source_key="lesson-1", course_id=course.id,
                                  title="Vorlesung", starts_at=datetime(2026, 9, 25, 22, 30, tzinfo=UTC)))
        session.add(Jot(id=str(uuid4()), kind="thought", body="Merksatz zu Sortieren", course_id=course.id,
                        created_at=datetime(2026, 9, 25, 23, 5, tzinfo=UTC)))
        session.commit()
        course_id = course.id

    app = FastAPI()
    app.include_router(journal_router(settings, factory, coordinator))
    client = TestClient(app)
    response = client.get("/api/journal/2026-09-26")
    assert response.status_code == 200
    day = response.json()
    assert [item["title"] for item in day["materials"]] == ["Sortieren.pdf"]
    assert [item["title"] for item in day["sessions"]] == ["Vorlesung"]
    assert [item["title"] for item in day["jots"]] == ["Merksatz zu Sortieren"]
    assert day["courses"] == [{"course_id": course_id, "course_name": "Algorithmen",
                               "covered": "", "revision": 0}]
    assert client.get("/api/journal/2026-09-25").json()["materials"] == []

    saved = client.put("/api/journal/2026-09-26/reflection",
                       json={"expected_revision": 0, "reflection": "Wiederholen"})
    assert saved.status_code == 200
    assert saved.json()["reflection"] == "Wiederholen"
    assert saved.json()["revision"] == 1
    assert client.put("/api/journal/2026-09-26/reflection",
                      json={"expected_revision": 0, "reflection": "Verlorene Änderung"}).status_code == 409
    coverage = client.put(f"/api/journal/2026-09-26/courses/{course_id}",
                          json={"expected_revision": 0, "covered": "Bis Merge Sort"})
    assert coverage.status_code == 200
    assert coverage.json()["courses"][0]["covered"] == "Bis Merge Sort"
    assert client.put(f"/api/journal/2026-09-26/courses/{course_id}",
                      json={"expected_revision": 0, "covered": "Stale"}).status_code == 409
