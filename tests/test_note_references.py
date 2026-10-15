# SPDX-License-Identifier: AGPL-3.0-or-later

"""Unlinked mentions become versioned wikilinks without touching fenced code."""

from fastapi.testclient import TestClient
from sqlalchemy import text

from app.db.models import Course
from app.main import create_app
from app.notes.store import create_note, read_note


def test_incoming_links_and_unlinked_mentions(settings, factory, coordinator):
    with factory() as session:
        session.execute(text("CREATE VIRTUAL TABLE notes_fts USING fts5(note_id UNINDEXED, title, body)"))
        course = Course(source="fixture", source_id="course-1", name="Algorithmen")
        session.add(course)
        session.flush()
        target = create_note(session, settings, course_id=course.id, resource_id=None,
                             title="Rekursion", body="Eine Funktion ruft sich selbst auf.")
        plain = create_note(session, settings, course_id=course.id, resource_id=None,
                            title="Vorlesung 08", body="Wir haben Rekursion verwendet.\n```\nRekursion im Code\n```")
        linked = create_note(session, settings, course_id=course.id, resource_id=None,
                             title="Übungsblatt", body="Siehe [[Rekursion]] für Aufgabe 2.")
        code_only = create_note(session, settings, course_id=course.id, resource_id=None,
                                title="Codeblock", body="```\nRekursion\n```")
        target_id, plain_id, linked_id, code_id = target.id, plain.id, linked.id, code_only.id

    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        response = client.get(f"/api/notes/{target_id}/references")
        assert response.status_code == 200
        data = response.json()
        assert [item["id"] for item in data["backlinks"]] == [linked_id]
        assert [item["id"] for item in data["mentions"]] == [plain_id]
        assert code_id not in [item["id"] for item in (*data["backlinks"], *data["mentions"])]
        assert "Rekursion verwendet" in data["mentions"][0]["excerpt"]

        linked_response = client.post(f"/api/notes/{target_id}/link-mention/{plain_id}",
                                      json={"expected_revision": 1})
        assert linked_response.status_code == 200
        assert {item["id"] for item in linked_response.json()["backlinks"]} == {plain_id, linked_id}
        assert linked_response.json()["mentions"] == []
        assert client.post(f"/api/notes/{target_id}/link-mention/{plain_id}",
                           json={"expected_revision": 1}).status_code == 409
    with factory() as session:
        note, _, body, _ = read_note(session, settings, plain_id)
        assert note.current_revision == 2
        assert body.startswith("Wir haben [[Rekursion]] verwendet.")
