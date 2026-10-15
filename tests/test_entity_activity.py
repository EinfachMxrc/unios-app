# SPDX-License-Identifier: AGPL-3.0-or-later

"""Timelines come from existing records and expose their real provenance."""

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.db.models import (
    Change,
    Course,
    IntakeDecision,
    Note,
    NoteVersion,
    Resource,
    ResourceVersion,
)
from app.main import create_app


def test_entity_and_course_activity_use_saved_facts(settings, factory, coordinator):
    now = datetime.now(UTC)
    with factory() as session:
        course = Course(source="fixture", source_id="course-1", name="Beispielkurs")
        session.add(course)
        session.flush()
        resource = Resource(source="fixture", source_key="file-1", course_id=course.id,
                            kind="file", name="Skript.pdf", url="https://example.invalid/file")
        session.add(resource)
        session.flush()
        session.add(ResourceVersion(resource_id=resource.id, version=1, sha256="a" * 64,
                                    relative_path="fixture/skript.pdf", size=42,
                                    mime_type="application/pdf", downloaded_at=now - timedelta(hours=2)))
        session.add(Change(course_id=course.id, resource_id=resource.id, kind="resource",
                           summary="Skript erkannt", created_at=now - timedelta(hours=1)))
        note = Note(id="00000000-0000-4000-8000-000000000001", course_id=course.id,
                    title="Mitschrift", current_revision=1, created_at=now, updated_at=now)
        session.add(note)
        session.add(NoteVersion(note_id=note.id, revision=1, title=note.title,
                                relative_path="notes/mitschrift.md", sha256="b" * 64, created_at=now))
        session.commit()
        course_id, resource_id, note_id = course.id, resource.id, note.id

    client = TestClient(create_app(settings, start_scheduler=False, coordinator=coordinator))
    material = client.get(f"/api/entity-activity/material/{resource_id}")
    assert material.status_code == 200
    assert [item["title"] for item in material.json()] == ["Änderung erkannt", "Materialversion gespeichert"]
    assert material.json()[1]["source"] == "fixture"
    course_items = client.get(f"/api/entity-activity/course/{course_id}").json()
    assert course_items[0]["title"] == "Notizversion gespeichert"
    assert len(course_items) == 3
    assert client.get(f"/api/entity-activity/note/{note_id}").json()[0]["source"] == "Lokale Notiz"
    assert client.get("/api/entity-activity/material/99999").status_code == 404
    assert client.get("/api/entity-activity/material/invalid").status_code == 400


def test_intake_decision_is_visible_at_course_and_target(settings, factory, coordinator):
    with factory() as session:
        course = Course(source="fixture", source_id="activity-intake", name="Beispielkurs")
        session.add(course)
        session.flush()
        resource = Resource(source="fixture", source_key="activity-file", course_id=course.id,
                            kind="file", name="Beispiel.pdf", url="")
        session.add(resource)
        session.flush()
        session.add(IntakeDecision(source_kind="clip", source_id="fake-clip", state="accepted",
                                   course_id=course.id, target_kind="material", target_id=str(resource.id),
                                   revision=1, created_at=datetime.now(UTC), updated_at=datetime.now(UTC)))
        session.commit()
        course_id, resource_id = course.id, resource.id
    client = TestClient(create_app(settings, start_scheduler=False, coordinator=coordinator))
    for kind, entity_id in (("course", course_id), ("material", resource_id)):
        items = client.get(f"/api/entity-activity/{kind}/{entity_id}").json()
        assert items[0]["title"] == "Eingang bearbeitet"
        assert items[0]["detail"] == "Web-/Textclip angenommen"
        assert items[0]["source"] == "Eingang · aktueller Entscheidungsstand"
