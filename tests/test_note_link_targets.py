# SPDX-License-Identifier: AGPL-3.0-or-later

"""Global title resolution and bounded refresh against synthetic large note sets."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, select, text

from app.db.models import Course, LinkEdge, Note, NoteVersion
from app.files.localpath import native_path
from app.main import create_app
from app.notes.store import create_note
from app.notes.wikilinks import refresh_incoming_wikilinks
from app.sessions import SessionStore
from tests.test_notes import prepare


def test_titles_resolve_outside_filtered_paginated_index(settings, factory, coordinator):
    course_id, _ = prepare(factory)
    with factory() as session:
        target = create_note(session, settings, course_id=course_id, resource_id=None,
                             title="Straße und Beweis", body="Die alte Quelle bleibt verknüpft.")
        target_id = target.id
        for number in range(51):
            create_note(session, settings, course_id=course_id, resource_id=None,
                        title=f"Zwischennotiz {number:02}", body="Erfundener Lernstoff")
        source = create_note(session, settings, course_id=course_id, resource_id=None,
                             title="Aktueller Lernplan", body="Lies [[  STRASSE UND BEWEIS  ]].")
        source_id = source.id
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        assert target_id not in {note["id"] for note in client.get("/api/notes").json()["notes"]}
        assert client.get("/api/notes", params={"q": "Aktueller"}).json()["page"]["total"] == 1
        response = client.get("/api/notes/link-targets", params=[("titles", "  STRASSE UND BEWEIS  ")])
        assert response.status_code == 200
        assert response.json() == [{"title": "  STRASSE UND BEWEIS  ", "status": "resolved", "target": {
            "id": target_id, "title": "Straße und Beweis", "course_name": "Programmieren / Grundlagen"}}]
        assert client.get(f"/api/links/note/{source_id}").json()[0]["target"]["id"] == target_id
        renamed = client.put(f"/api/notes/{target_id}", json={
            "expected_revision": 1, "title": "Neuer Beweis", "body": "Die alte Quelle bleibt verknüpft."})
        assert renamed.status_code == 200
        result = client.get("/api/notes/link-targets", params=[("titles", "Straße und Beweis"),
                            ("titles", "Neuer Beweis")]).json()
        assert [item["status"] for item in result] == ["missing", "resolved"]
        assert client.get(f"/api/links/note/{source_id}").json() == []


def test_global_duplicates_are_ambiguous_including_source_title(settings, factory, coordinator):
    first_course, _ = prepare(factory)
    with factory() as session:
        second_course = session.scalar(select(Course).where(Course.name == "Mathematik"))
        assert second_course is not None
        first = create_note(session, settings, course_id=first_course, resource_id=None,
                            title="Straße", body="[[STRASSE]]")
        second = create_note(session, settings, course_id=second_course.id, resource_id=None,
                             title="STRASSE", body="Erfundene zweite Quelle")
        source = create_note(session, settings, course_id=first_course, resource_id=None,
                             title="Lernplan", body="[[Straße]]")
        assert session.scalars(select(LinkEdge).where(LinkEdge.relation == "wikilink")).all() == []
        first_id, second_id, source_id = first.id, second.id, source.id
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        result = client.get("/api/notes/link-targets", params=[("titles", " Straße ")]).json()[0]
        assert result["status"] == "ambiguous" and result["target"] is None
        assert client.get(f"/api/notes/{first_id}/references").json()["can_link"] is False
        assert client.post(f"/api/notes/{first_id}/link-mention/{source_id}",
                           json={"expected_revision": 1}).status_code == 409
        assert client.put(f"/api/notes/{second_id}", json={
            "expected_revision": 1, "title": "Andere Quelle", "body": "Erfundene zweite Quelle"}).status_code == 200
        assert client.get("/api/notes/link-targets", params=[("titles", "STRASSE")]).json()[0]["target"]["id"] == first_id
        assert client.get(f"/api/links/note/{source_id}").json()[0]["target"]["id"] == first_id


@pytest.mark.parametrize("title", ["Ä" * 200, "😀" * 200])
def test_full_length_titles_and_read_only_batch_bounds(settings, factory, coordinator, title):
    course_id, _ = prepare(factory)
    with factory() as session:
        course = session.get(Course, course_id)
        assert course is not None
        course.name = title
        target = create_note(session, settings, course_id=course_id, resource_id=None, title=title, body="Inhalt")
        target_id = target.id
        version = session.scalar(select(NoteVersion).where(NoteVersion.note_id == target_id))
        assert version is not None
        path = settings.data_dir / version.relative_path
        assert all(len(part.encode("utf-8")) <= 255 for part in path.relative_to(settings.data_dir).parts)
        assert title in native_path(path).read_text(encoding="utf-8")
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        note = client.get(f"/api/notes/{target_id}").json()
        assert note["note"]["title"] == title and note["body"] == "Inhalt"
        assert client.get("/api/notes/link-targets", params=[("titles", title.lower())]).json()[0]["target"]["id"] == target_id
        for params in [[], [("titles", "")], [("titles", " ")], [("titles", "a" * 201)],
                       [("titles", "Zeile\nZwei")], [("titles", "Quelle")] * 33]:
            assert client.get("/api/notes/link-targets", params=params).status_code == 422
        assert len(client.get("/api/notes/link-targets", params=[("titles", "Fehlt")] * 32).json()) == 32
    coordinator.close()
    # The same projection is available in standby without creating a write lease.
    with TestClient(app) as client:
        response = client.get("/api/notes/link-targets", params=[("titles", title)])
        assert response.status_code == 200 and response.json()[0]["target"]["id"] == target_id


def test_global_lookup_requires_pairing_and_is_private_in_standby(settings, factory, coordinator):
    course_id, _ = prepare(factory)
    with factory() as session:
        target = create_note(session, settings, course_id=course_id, resource_id=None,
                             title="Privater Katalogtitel", body="Synthetischer geschützter Inhalt")
        target_id = target.id
    configured = settings.model_copy(update={"api_auth_required": True, "server_mode": True})
    app = create_app(configured, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.get("/api/notes/link-targets", params={"titles": "Privater Katalogtitel"}).status_code == 401
        assert client.get("/api/entities/note", params={"q": "Privater"}).status_code == 401
    token = SessionStore(configured.local_dir).create_session("Synthetisches gekoppeltes Gerät")
    coordinator.close()
    with TestClient(app, cookies={"unios_session": token}) as client:
        response = client.get("/api/notes/link-targets", params={"titles": "Privater Katalogtitel"})
        assert response.status_code == 200 and response.json()[0]["target"]["id"] == target_id
        assert response.headers["Cache-Control"] == "private, no-store"


@pytest.mark.parametrize("source_count", [1, 80])
def test_refresh_uses_constant_queries_and_one_title_projection(factory, source_count):
    course_id, _ = prepare(factory)
    with factory() as session:
        target = Note(id=str(uuid4()), course_id=course_id, title="Ziel", current_revision=1)
        session.add(target)
        source_ids = []
        for number in range(source_count):
            note = Note(id=str(uuid4()), course_id=course_id, title=f"Quelle {number}", current_revision=1)
            session.add(note)
            source_ids.append(note.id)
            session.execute(text("INSERT INTO notes_fts(note_id, title, body) VALUES (:id, :title, :body)"),
                            {"id": note.id, "title": note.title, "body": "[[ Ziel ]]"})
        session.commit()
        statements = []
        engine = session.get_bind()

        def count_select(_connection, _cursor, statement, _parameters, _context, _executemany):
            if statement.lstrip().upper().startswith("SELECT"):
                statements.append(statement)

        event.listen(engine, "before_cursor_execute", count_select)
        try:
            refresh_incoming_wikilinks(session, target.id)
            session.flush()
        finally:
            event.remove(engine, "before_cursor_execute", count_select)
        assert len(statements) == 3  # bodies, ID/title projection, existing wikilink edges
        assert sum("SELECT notes.id, notes.title" in statement for statement in statements) == 1
        assert len(session.scalars(select(LinkEdge).where(LinkEdge.to_id == target.id)).all()) == source_count


def test_create_reuses_title_projection_for_its_incoming_refresh(settings, factory):
    course_id, _ = prepare(factory)
    with factory() as session:
        create_note(session, settings, course_id=course_id, resource_id=None, title="Quelle", body="[[Später]]")
        statements = []
        engine = session.get_bind()

        def record(_connection, _cursor, statement, _parameters, _context, _executemany):
            statements.append(statement)

        event.listen(engine, "before_cursor_execute", record)
        try:
            create_note(session, settings, course_id=course_id, resource_id=None, title="Später", body="Lernstoff")
        finally:
            event.remove(engine, "before_cursor_execute", record)
        assert sum("SELECT notes.id, notes.title" in statement for statement in statements) == 1
