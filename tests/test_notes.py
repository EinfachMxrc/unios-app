# SPDX-License-Identifier: AGPL-3.0-or-later

"""Markdown notes keep every revision and search only the latest text."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from app.db.models import Course, LinkEdge, Note, NoteVersion, Resource
from app.main import create_app
from app.notes.store import (
    NoteConflict,
    NoteError,
    NoteMissing,
    create_note,
    read_note,
    update_note,
)


def prepare(factory) -> tuple[int, int]:
    with factory() as session:
        session.execute(text("CREATE VIRTUAL TABLE notes_fts USING fts5(note_id UNINDEXED, title, body)"))
        session.execute(text("CREATE VIRTUAL TABLE jots_fts USING fts5(jot_id UNINDEXED, body)"))
        session.execute(text("CREATE VIRTUAL TABLE resource_texts_fts USING fts5(text, content='resource_texts', content_rowid='id')"))
        first = Course(source="moodle", source_id="1", name="Programmieren / Grundlagen")
        second = Course(source="moodle", source_id="2", name="Mathematik")
        session.add_all([first, second])
        session.flush()
        resource = Resource(source="moodle", source_key="file-1", course_id=first.id,
                            kind="file", name="Skript.pdf", url="", group_category="general")
        session.add(resource)
        session.commit()
        return first.id, resource.id


def test_notes_are_versioned_files_and_search_uses_current_revision(settings, factory, coordinator):
    course_id, resource_id = prepare(factory)
    with factory() as session:
        note_id = create_note(session, settings, course_id=course_id, resource_id=resource_id,
                              title="Schleifen", body="Erste Fassung: while und for").id
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        note = client.get(f"/api/notes/{note_id}").json()
        assert note["note"]["current_revision"] == 1
        assert note["body"] == "Erste Fassung: while und for"
        assert client.get("/api/notes", params={"course_id": course_id}).json()["notes"][0]["id"] == note_id
        assert client.get("/api/search", params={"q": "while"}).json()["note_results"][0]["id"] == note_id
        created = client.post("/api/notes", json={"course_id": course_id, "title": "Neu", "body": "Text"})
        assert created.status_code == 201
        new_id = created.json()["note"]["id"]
        saved = client.put(f"/api/notes/{new_id}", json={"expected_revision": 1,
            "title": "Neu", "body": "Zweite Fassung"})
        assert saved.status_code == 200
        assert saved.json()["note"]["current_revision"] == 2
        generation = client.get("/api/host").json()["generation"]
        stale = client.put(f"/api/notes/{new_id}",
            headers={"X-UniOS-Lease-Generation": str(generation - 1)},
            json={"expected_revision": 2, "title": "Neu", "body": "Nicht übernehmen"})
        assert stale.status_code == 409
        assert "STALE_HOST" in stale.json()["detail"]
        assert client.get(f"/api/notes/{new_id}").json()["note"]["current_revision"] == 2
        stale_create = client.post("/api/notes",
            headers={"X-UniOS-Lease-Generation": str(generation - 1)},
            json={"course_id": course_id, "title": "Nicht anlegen", "body": "Text"})
        assert stale_create.status_code == 409
        assert client.put(f"/api/notes/{new_id}", json={"expected_revision": 1,
            "title": "Veraltet", "body": "Text"}).status_code == 409
    with factory() as session:
        update_note(session, settings, note_id, expected_revision=1,
                    title="Schleifen und Funktionen", body="Zweite Fassung: Rekursion und Funktionen")
        with pytest.raises(NoteConflict):
            update_note(session, settings, note_id, expected_revision=1,
                        title="Veraltet", body="Darf nicht gespeichert werden")
    with TestClient(app) as client:
        assert client.get(f"/api/notes/{note_id}").json()["note"]["current_revision"] == 2
        assert [item["revision"] for item in client.get(f"/api/notes/{note_id}").json()["versions"]] == [2, 1]
        assert client.get(f"/api/notes/{note_id}", params={"revision": 1}).json()["body"] == "Erste Fassung: while und for"
        assert client.get("/api/search", params={"q": "while"}).json()["note_results"] == []
        assert client.get("/api/search", params={"q": "Rekursion"}).json()["note_results"][0]["id"] == note_id
        assert client.get("/api/search", params={"q": "Rekursion", "course_id": 999}).json()["note_results"] == []
        assert client.get(f"/api/notes/{note_id}").json()["body"] == "Zweite Fassung: Rekursion und Funktionen"

    with factory() as session:
        versions = session.scalars(select(NoteVersion).where(NoteVersion.note_id == note_id)
                                   .order_by(NoteVersion.revision)).all()
        assert len(versions) == 2
        assert all(Path(settings.data_dir / item.relative_path).is_file() for item in versions)
        assert all(item.relative_path.split("/")[0] == "notes" and
                   item.relative_path.split("/")[1].endswith(f"_{course_id}") for item in versions)
        portable = (settings.data_dir / versions[0].relative_path).read_text(encoding="utf-8")
        assert portable.startswith(f'---\nunios_note_id: "{note_id}"\n')
        assert f'course_id: {course_id}\n' in portable
        assert portable.endswith("---\n\nErste Fassung: while und for")


def test_note_commit_stops_when_lease_changes_during_write(settings, factory):
    course_id, _ = prepare(factory)
    calls = 0

    def lost_lease() -> None:
        nonlocal calls
        calls += 1
        if calls == 2:
            raise RuntimeError("lease lost")

    with factory() as session, pytest.raises(RuntimeError, match="lease lost"):
        create_note(session, settings, course_id=course_id, resource_id=None,
                    title="Nicht anlegen", body="Entwurf", before_commit=lost_lease)
    with factory() as session:
        assert session.scalars(select(Note)).all() == []
        note_id = create_note(session, settings, course_id=course_id, resource_id=None,
                              title="Erhalten", body="Fassung 1").id

    calls = 0
    with factory() as session, pytest.raises(RuntimeError, match="lease lost"):
        update_note(session, settings, note_id, expected_revision=1,
                    title="Erhalten", body="Nicht committen", before_commit=lost_lease)
    with factory() as session:
        assert session.get(Note, note_id).current_revision == 1


@pytest.mark.parametrize("resource_bound", [False, True])
def test_blank_lecture_note_is_searchable_and_versions_later_content(settings, factory, coordinator, resource_bound):
    course_id, resource_id = prepare(factory)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    title = "Erfundene Vorlesung"
    with TestClient(app) as client:
        created = client.post("/api/notes", json={"course_id": course_id,
            "resource_id": resource_id if resource_bound else None, "title": title, "body": ""})
        assert created.status_code == 201
        detail = created.json()
        note_id = detail["note"]["id"]
        assert detail["body"] == ""
        assert detail["note"]["current_revision"] == 1
        assert detail["note"]["resource_id"] == (resource_id if resource_bound else None)
        assert client.get("/api/search", params={"q": "Erfundene"}).json()["note_results"][0]["id"] == note_id
        content = "Eigene Erklärung nach der Vorlesung."
        filled = client.put(f"/api/notes/{note_id}", json={
            "expected_revision": 1, "title": title, "body": content})
        assert filled.status_code == 200
        assert filled.json()["note"]["current_revision"] == 2
        # Clearing the prose is another revision, never a deletion of history.
        cleared = client.put(f"/api/notes/{note_id}", json={
            "expected_revision": 2, "title": title, "body": ""})
        assert cleared.status_code == 200
        assert cleared.json()["body"] == ""
        assert cleared.json()["note"]["current_revision"] == 3
        assert client.put(f"/api/notes/{note_id}", json={
            "expected_revision": 1, "title": title, "body": ""}).status_code == 409
        unchanged = client.put(f"/api/notes/{note_id}", json={
            "expected_revision": 3, "title": title, "body": ""})
        assert unchanged.json()["note"]["current_revision"] == 3
        assert client.get(f"/api/notes/{note_id}", params={"revision": 1}).json()["body"] == ""
        assert client.get(f"/api/notes/{note_id}", params={"revision": 2}).json()["body"] == content
        assert client.get("/api/search", params={"q": "Erklärung"}).json()["note_results"] == []
    with factory() as session:
        _, _, body, versions = read_note(session, settings, note_id)
        assert body == ""
        assert len(versions) == 3
        assert all((settings.data_dir / version.relative_path).is_file() for version in versions)


def test_blank_note_still_requires_valid_title_course_and_bounded_string_body(settings, factory, coordinator):
    course_id, _ = prepare(factory)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        for title in ("", "   ", "First\nSecond", "a" * 201):
            assert client.post("/api/notes", json={
                "course_id": course_id, "title": title, "body": ""}).status_code in (400, 422)
        for invalid_body in (None, 17, "a" * 100_001):
            assert client.post("/api/notes", json={
                "course_id": course_id, "title": "Vorlesung", "body": invalid_body}).status_code == 422
        assert client.post("/api/notes", json={"course_id": course_id, "title": "Vorlesung"}).status_code == 422
        assert client.post("/api/notes", json={"course_id": 0, "title": "Vorlesung", "body": ""}).status_code == 422
        assert client.post("/api/notes", json={"course_id": 999, "title": "Vorlesung", "body": ""}).status_code == 404
    with factory() as session:
        assert session.scalars(select(Note)).all() == []
        for title, body in (("a" * 201, ""), ("Vorlesung", "a" * 100_001)):
            with pytest.raises(NoteError):
                create_note(session, settings, course_id=course_id, resource_id=None, title=title, body=body)


def test_note_rejects_bad_relation_and_corrupt_file(settings, factory, coordinator):
    course_id, _ = prepare(factory)
    with factory() as session:
        with pytest.raises(NoteMissing):
            create_note(session, settings, course_id=999, resource_id=None, title="Nein", body="Text")
        with pytest.raises(NoteError):
            create_note(session, settings, course_id=course_id, resource_id=999, title="Nein", body="Text")
        with pytest.raises(NoteError):
            create_note(session, settings, course_id=course_id, resource_id=None, title=" ", body="Text")
        note_id = create_note(session, settings, course_id=course_id, resource_id=None,
                              title="Prüfung", body="Original").id
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.post("/api/notes", headers={"origin": "https://example.invalid"},
            json={"course_id": course_id, "title": "Fremd", "body": "Text"}).status_code == 403
        assert client.get("/api/notes/not-an-id").status_code == 404
        with factory() as session:
            version = session.scalar(select(NoteVersion).where(NoteVersion.note_id == note_id))
            assert version is not None
            (settings.data_dir / version.relative_path).write_text("Manipuliert")
        assert client.get(f"/api/notes/{note_id}").status_code == 503


def test_wikilinks_connect_notes_across_courses_and_follow_edits(settings, factory, coordinator):
    first_course, _ = prepare(factory)
    with factory() as session:
        second_course = session.scalar(select(Course).where(Course.name == "Mathematik"))
        assert second_course is not None
        target = create_note(session, settings, course_id=second_course.id, resource_id=None,
                             title="Lineare Algebra", body="Vektoren und Matrizen")
        source = create_note(session, settings, course_id=first_course, resource_id=None,
                             title="Machine Learning", body="Wiederhole [[Lineare Algebra]] vor Kapitel 3.")
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        outgoing = client.get(f"/api/links/note/{source.id}").json()
        incoming = client.get(f"/api/links/note/{target.id}").json()
        assert outgoing[0]["target"]["id"] == target.id
        assert incoming[0]["target"]["id"] == source.id
        saved = client.put(f"/api/notes/{source.id}", json={
            "expected_revision": 1, "title": "Machine Learning", "body": "Kein Verweis mehr."})
        assert saved.status_code == 200
        assert client.get(f"/api/links/note/{source.id}").json() == []


def test_wikilink_resolves_when_target_is_created_later(settings, factory, coordinator):
    first_course, _ = prepare(factory)
    with factory() as session:
        source = create_note(session, settings, course_id=first_course, resource_id=None,
                             title="Lernplan", body="Später [[Lineare Algebra]] lesen")
        assert session.scalar(select(LinkEdge).where(LinkEdge.from_id == source.id)) is None
        target = create_note(session, settings, course_id=first_course, resource_id=None,
                             title="Lineare Algebra", body="Matrizen")
        assert session.scalar(select(LinkEdge).where(LinkEdge.from_id == source.id,
                                                     LinkEdge.to_id == target.id)) is not None


def test_related_notes_explain_cross_course_suggestion(settings, factory, coordinator):
    first_course, _ = prepare(factory)
    with factory() as session:
        second_course = session.scalar(select(Course).where(Course.name == "Mathematik"))
        assert second_course is not None
        first = create_note(session, settings, course_id=first_course, resource_id=None,
                            title="Machine Learning", body="Vektoren und Matrizen berechnen")
        second = create_note(session, settings, course_id=second_course.id, resource_id=None,
                             title="Lineare Algebra", body="Matrizen, Vektoren und Eigenwerte")
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        suggestions = client.get(f"/api/notes/{first.id}/related")
        assert suggestions.status_code == 200
        assert suggestions.json()[0]["id"] == second.id
        assert "matrizen" in suggestions.json()[0]["shared_terms"]
