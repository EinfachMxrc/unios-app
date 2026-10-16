# SPDX-License-Identifier: AGPL-3.0-or-later

"""Notes and quick captures go to a trash, come back unchanged, or are erased for good."""

from datetime import UTC, datetime
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import func, select, text

from app.db.models import AiAccess, Course, Jot, LinkEdge, Note, NoteVersion, Resource
from app.db.trash import INCLUDE_TRASHED
from app.main import create_app
from app.notes.store import create_note
from app.notify.service import Notifier
from app.sync.engine import SyncEngine


def prepare(factory) -> int:
    with factory() as session:
        session.execute(text("CREATE VIRTUAL TABLE jots_fts USING fts5(jot_id UNINDEXED, body)"))
        session.execute(text("CREATE VIRTUAL TABLE notes_fts USING fts5(note_id UNINDEXED, title, body)"))
        session.execute(text("CREATE VIRTUAL TABLE resource_texts_fts USING fts5(text, content='resource_texts', content_rowid='id')"))
        course = Course(source="moodle", source_id="1", name="Mathematik")
        session.add(course)
        session.commit()
        return course.id


def note_ids(client, course_id: int) -> list[str]:
    return [item["id"] for item in client.get("/api/notes", params={"course_id": course_id}).json()["notes"]]


def test_a_trashed_note_disappears_everywhere_and_comes_back_unchanged(settings, factory, coordinator):
    course_id = prepare(factory)
    with factory() as session:
        target = create_note(session, settings, course_id=course_id, resource_id=None,
                             title="Eigenwerte", body="Charakteristisches Polynom aufstellen.")
        source = create_note(session, settings, course_id=course_id, resource_id=None,
                             title="Übersicht", body="Siehe [[Eigenwerte]].")
        target_id, source_id = target.id, source.id
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.get("/api/search", params={"q": "Polynom"}).json()["note_results"]
        trashed = client.post(f"/api/notes/{target_id}/trash")
        assert trashed.status_code == 200, trashed.text
        assert trashed.json()["deleted_at"]
        assert client.get(f"/api/notes/{target_id}").status_code == 404
        assert target_id not in note_ids(client, course_id)
        assert client.get("/api/search", params={"q": "Polynom"}).json()["note_results"] == []
        assert client.put(f"/api/notes/{target_id}", json={"expected_revision": 1, "title": "Eigenwerte",
                                                           "body": "Neu"}).status_code == 404
        with factory() as session:
            assert session.scalar(select(func.count()).select_from(LinkEdge).where(
                LinkEdge.from_id == source_id, LinkEdge.relation == "wikilink")) == 0
        listed = client.get("/api/trash").json()["items"]
        assert [(item["kind"], item["id"], item["course_name"]) for item in listed] == [("note", target_id, "Mathematik")]

        restored = client.post(f"/api/trash/note/{target_id}/restore")
        assert restored.status_code == 200, restored.text
        assert restored.json()["deleted_at"] is None
        assert client.get(f"/api/notes/{target_id}").json()["body"] == "Charakteristisches Polynom aufstellen."
        assert client.get("/api/search", params={"q": "Polynom"}).json()["note_results"][0]["id"] == target_id
        assert client.get("/api/trash").json()["items"] == []
        with factory() as session:
            assert session.scalar(select(LinkEdge.to_id).where(
                LinkEdge.from_id == source_id, LinkEdge.relation == "wikilink")) == target_id
        assert client.post(f"/api/trash/note/{target_id}/restore").status_code == 404


def test_erasing_removes_the_note_its_links_and_its_files(settings, factory, coordinator):
    course_id = prepare(factory)
    with factory() as session:
        note = create_note(session, settings, course_id=course_id, resource_id=None,
                           title="Wegwerfnotiz", body="Nur ein Test.")
        note_id = note.id
        folder = (settings.data_dir / session.scalar(
            select(NoteVersion.relative_path).where(NoteVersion.note_id == note_id))).parent
        session.add(Jot(id=str(uuid4()), kind="thought", body="Gehört zur Notiz", note_id=note_id))
        session.add(LinkEdge(from_type="note", from_id=note_id, to_type="course", to_id=str(course_id)))
        session.commit()
    assert folder.is_dir()
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.delete(f"/api/trash/note/{note_id}").status_code == 404  # only from the trash
        assert client.post(f"/api/notes/{note_id}/trash").status_code == 200
        assert client.delete(f"/api/trash/note/{note_id}").status_code == 204
        assert client.get("/api/trash").json()["items"] == []
    assert not folder.exists()
    with factory() as session:
        assert session.get(Note, note_id, execution_options=INCLUDE_TRASHED) is None
        assert session.scalars(select(NoteVersion).where(NoteVersion.note_id == note_id)).all() == []
        assert session.scalars(select(LinkEdge).where(LinkEdge.from_id == note_id)).all() == []
        assert session.scalar(select(Jot.note_id)) is None


def test_quick_captures_use_the_same_trash_and_retries_do_not_revive_them(settings, factory, coordinator):
    prepare(factory)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    jot_id = str(uuid4())
    payload = {"id": jot_id, "kind": "thought", "body": "Eigenvektor nachschlagen",
               "created_at": datetime.now(UTC).isoformat()}
    with TestClient(app) as client:
        assert client.post("/api/jots", json=payload).status_code == 200
        assert client.post(f"/api/jots/{jot_id}/trash").status_code == 200
        assert client.get("/api/jots").json()["jots"] == []
        assert client.get("/api/search", params={"q": "Eigenvektor"}).json()["jot_results"] == []
        # An offline retry of the same capture is accepted, and it stays in the trash.
        assert client.post("/api/jots", json=payload).status_code == 200
        assert client.get("/api/jots").json()["jots"] == []
        assert [item["title"] for item in client.get("/api/trash").json()["items"]] == ["Eigenvektor nachschlagen"]
        assert client.post(f"/api/trash/jot/{jot_id}/restore").status_code == 200
        assert client.get("/api/search", params={"q": "Eigenvektor"}).json()["jot_results"][0]["id"] == jot_id
        assert client.post(f"/api/jots/{jot_id}/trash").status_code == 200
        emptied = client.delete("/api/trash")
        assert emptied.json() == {"erased": 1}
        assert client.post(f"/api/jots/{jot_id}/trash").status_code == 404
        assert client.post("/api/jots/not-an-id/trash").status_code == 404


def test_trash_writes_are_dashboard_only(settings, factory, coordinator):
    course_id = prepare(factory)
    with factory() as session:
        note_id = create_note(session, settings, course_id=course_id, resource_id=None,
                              title="Fremd", body="Text").id
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        foreign = {"origin": "https://example.invalid"}
        assert client.post(f"/api/notes/{note_id}/trash", headers=foreign).status_code == 403
        assert client.delete("/api/trash", headers=foreign).status_code == 403


def test_sync_does_not_bring_back_a_trashed_lecture_note(settings, factory, coordinator):
    course_id = prepare(factory)
    with factory() as session:
        session.add(Resource(source="moodle", source_key="r1", course_id=course_id, kind="file",
                             name="Vorlesung 3 - Eigenwerte.pdf", url="https://moodle.example.invalid/r1.pdf"))
        session.commit()
    engine = SyncEngine(factory, settings, [], Notifier(settings, coordinator), coordinator)
    engine._scaffold_lectures("moodle")
    with factory() as session:
        note = session.scalar(select(Note))
        assert note is not None and note.title == "Vorlesung 3 - Eigenwerte"
        note_id = note.id
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.post(f"/api/notes/{note_id}/trash").status_code == 200
    engine._scaffold_lectures("moodle")
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(Note).execution_options(**INCLUDE_TRASHED)) == 1
        assert session.scalar(select(func.count()).select_from(Note)) == 0


def test_trashed_notes_and_jots_leave_the_offline_index_and_the_ai_corpus(settings, factory, coordinator):
    from app.corpus.repository import CorpusRepository, readable_sql
    from app.corpus.worker import CorpusWorker

    course_id = prepare(factory)
    with factory() as session:
        note = create_note(session, settings, course_id=course_id, resource_id=None,
                           title="Eigenwerte", body="Charakteristisches Polynom aufstellen.")
        note_id = note.id
        jot = Jot(id=str(uuid4()), kind="thought", body="Eigenvektor nachschlagen", course_id=course_id)
        session.add(jot)
        session.commit()
        jot_id = jot.id
    CorpusWorker(CorpusRepository(factory, settings), coordinator).drain()
    with factory() as session:
        session.add(AiAccess(key='category:notes', allowed=True))
        session.commit()
    query = text(f"SELECT count(*) FROM corpus_documents d WHERE d.kind IN ('note','jot') AND d.live=1 AND {readable_sql()}")
    with factory() as session:
        assert session.scalar(query) == 2
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        kinds = {item["kind"] for item in client.get("/api/search/offline-index").json()["items"]}
        assert {"note", "jot"} <= kinds
        assert client.post(f"/api/notes/{note_id}/trash").status_code == 200
        assert client.post(f"/api/jots/{jot_id}/trash").status_code == 200
        kinds = {item["kind"] for item in client.get("/api/search/offline-index").json()["items"]}
        assert not {"note", "jot"} & kinds
    # Before the worker has run again, the readable filter alone must already hide them.
    with factory() as session:
        assert session.scalar(query) == 0
