# SPDX-License-Identifier: AGPL-3.0-or-later
"""Synthetic note selections, durable receipts and real Anki note provenance."""

from copy import deepcopy
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text

from app.anki.collection import open_collection, write_study_mode
from app.anki.note_service import selected_note_text
from app.db.models import AiAccess, AnkiCardQueue, Course, Note
from app.main import create_app

BODY = "# Synthetische Mitschrift\n\nEine **Bijektion** ist injektiv und surjektiv.\n\n- Eindeutige Zuordnung"
QUOTE = "Eine Bijektion ist injektiv und surjektiv."


def _client(settings, factory, coordinator):
    with factory() as session:
        session.execute(text("CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(note_id UNINDEXED, title, body)"))
        course = Course(source="fixture", source_id="note-cards", name="Synthetisches Fach", short_name="Fach")
        session.add(course)
        session.commit()
        course_id = course.id
    return TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)), course_id


def _note(client, course_id):
    response = client.post("/api/notes", json={"course_id": course_id, "title": "Eigene Begriffe", "body": BODY})
    assert response.status_code == 201, response.text
    return response.json()["note"]["id"]


def _payload(note_id):
    return {"mutation_id": str(uuid4()), "front": "Was ist eine Bijektion?", "back": QUOTE, "topic": "Abbildungen",
            "source": {"note_id": note_id, "revision": 1, "quote": QUOTE}}


def test_note_cards_need_no_ai_permission_and_never_claim_pdf_provenance(settings, factory, coordinator):
    client, course_id = _client(settings, factory, coordinator)
    with factory() as session:
        session.add(AiAccess(key=f"course:{course_id}", allowed=False))
        session.commit()
    with client:
        note_id = _note(client, course_id)
        created = client.post("/api/anki/note-cards", json=_payload(note_id))
        assert created.status_code == 201, created.text
        data = created.json()
        assert data["status"] == "approved" and data["note_id"] is None
        assert data["source"]["kind"] == "note"
        assert data["source"]["note_id"] == note_id
        assert data["source"]["revision"] == 1
        assert len(data["source"]["sha256"]) == 64
        assert data["source"]["url"] == f"/notes?id={note_id}&revision=1"
        assert "version_id" not in data["source"] and "page" not in data["source"]
        assert data["card"]["source_page"] is None and data["card"]["confidence"] is None
        assert data["deck_name"] == "Uni::Synthetisches Fach"
        queue = client.get("/api/anki/queue?origin=manual").json()
        assert len(queue) == 1
        assert queue[0]["source"] == data["source"]
        assert queue[0]["resource_id"] is None
        assert queue[0]["resource_name"] == "Eigene Begriffe"
        assert client.get(f"/api/anki/manual-cards/{data['queue_id']}").json() == data
        assert client.post(f"/api/anki/manual-cards/{data['queue_id']}/transfer").json() == data


def test_saved_source_and_exact_retries_survive_note_edit_and_trash(settings, factory, coordinator):
    client, course_id = _client(settings, factory, coordinator)
    with client:
        note_id = _note(client, course_id)
        payload = _payload(note_id)
        created = client.post("/api/anki/note-cards", json=payload).json()
        updated = client.put(f"/api/notes/{note_id}", json={"expected_revision": 1, "title": "Neue Überschrift", "body": "Andere eigene Definition"})
        assert updated.status_code == 200, updated.text
        assert client.post("/api/anki/note-cards", json=payload).json() == created
        assert client.get(f"/api/anki/note-cards/{created['queue_id']}").json() == created
        assert client.get(f"/api/notes/{note_id}?revision=1").json()["body"] == BODY
        with factory() as session:
            from app.db.models import utc_now

            session.get(Note, note_id).deleted_at = utc_now()
            session.commit()
        assert client.post("/api/anki/note-cards", json=payload).json() == created
        queue = client.get("/api/anki/queue").json()[0]
        assert queue["source"]["note_title"] == "Eigene Begriffe"
        changed = deepcopy(payload)
        changed["front"] = "Andere Frage?"
        conflict = client.post("/api/anki/note-cards", json=changed)
        assert conflict.status_code == 409
        assert conflict.json()["code"] == "MANUAL_MUTATION_CONFLICT"
        with factory() as session:
            assert session.scalar(select(func.count(AnkiCardQueue.id))) == 1


def test_changed_revision_or_fabricated_selection_is_rejected_before_saving(settings, factory, coordinator):
    client, course_id = _client(settings, factory, coordinator)
    with client:
        note_id = _note(client, course_id)
        payload = _payload(note_id)
        payload["source"]["quote"] = "Das steht nicht in der Mitschrift"
        response = client.post("/api/anki/note-cards", json=payload)
        assert response.status_code == 409 and response.json()["code"] == "MANUAL_SOURCE_CHANGED"
        assert client.put(f"/api/notes/{note_id}", json={"expected_revision": 1, "title": "Eigene Begriffe", "body": BODY + "\nNachtrag"}).status_code == 200
        response = client.post("/api/anki/note-cards", json=_payload(note_id))
        assert response.status_code == 409 and response.json()["code"] == "MANUAL_SOURCE_CHANGED"
        with factory() as session:
            assert session.scalar(select(func.count(AnkiCardQueue.id))) == 0


def test_note_card_transfer_preserves_plain_text_and_study_note_source(settings, factory, coordinator):
    write_study_mode(settings, "integrated")
    client, course_id = _client(settings, factory, coordinator)
    with client:
        note_id = _note(client, course_id)
        payload = _payload(note_id)
        payload["front"] = "Was bedeutet <T> & Bijektion?"
        response = client.post("/api/anki/note-cards", json=payload)
        assert response.status_code == 201, response.text
        data = response.json()
        assert data["status"] == "pushed" and data["note_id"] is not None, data
        assert client.post("/api/anki/note-cards", json=payload).json() == data
        with open_collection(settings) as collection:
            note = collection.get_note(data["note_id"])
            assert "&lt;T&gt; &amp;" in note["Front"]
            assert "Notiz v1" in note["SourceFile"]
            assert note["SourcePage"] == ""
        due = client.get("/api/anki/study/due").json()
        assert len(due["cards"]) == 1
        assert due["cards"][0]["source"] == data["source"]


def test_external_agent_can_import_note_cards_with_stable_guid(settings, factory, coordinator):
    settings.anki_agent_token = "synthetic-agent-token"
    client, course_id = _client(settings, factory, coordinator)
    with client:
        note_id = _note(client, course_id)
        payload = _payload(note_id)
        data = client.post("/api/anki/note-cards", json=payload).json()
        headers = {"X-Anki-Agent-Token": settings.anki_agent_token, "X-UniOS-Anki-Capabilities": "manual-guid-v1"}
        assert client.get("/api/anki/agent/approved", headers={"X-Anki-Agent-Token": settings.anki_agent_token}).json() == []
        approved = client.get("/api/anki/agent/approved", headers=headers).json()
        assert approved[0]["guid"] == payload["mutation_id"]
        assert approved[0]["resource_name"] == "Eigene Begriffe"
        response = client.post("/api/anki/agent/pushed", json={"queue_id": data["queue_id"], "note_id": 99, "guid": payload["mutation_id"]}, headers=headers)
        assert response.status_code == 200, response.text
        assert client.get(f"/api/anki/note-cards/{data['queue_id']}").json()["status"] == "pushed"


@pytest.mark.parametrize("body,quote,matched", [
    (BODY, QUOTE, True), (BODY, "Eindeutige Zuordnung", True),
    ("[Linkname](https://example.invalid) und **Text**", "Linkname und Text", True),
    ("Erster Absatz\n\nZweiter Absatz", "Absatz Zweiter", True),
    ("- [ ] Erst\n- [x] Zweit", "Erst\nZweit", True),
    ("Vorher\n\n```python\na_b = 2 * 3\n```\n\nNachher", "Vorher\na_b = 2 * 3\nNachher", True),
    ("Vorher\n\n```python\na_b = 2 * 3\n```\n\nNachher", "Vorher\nab = 2 3\nNachher", False),
    ("Formel `a_b * c * d` und **Text**", "a_b * c * d und Text", True),
    ("Bezeichner a_b und **Text**", "ab und Text", False),
    (BODY, "Erfundene Aussage", False),
])
def test_note_selection_validation(body, quote, matched):
    assert selected_note_text(body, quote) is matched
