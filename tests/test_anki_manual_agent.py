# SPDX-License-Identifier: AGPL-3.0-or-later

"""Desktop transfer uses the same manual GUID and literal fields as native Anki."""

from contextlib import nullcontext

import httpx
import pytest
from anki.collection import Collection
from anki.notes import NoteId

from app.anki.card_schema import manual_note_marker
from app.anki.collection import ensure_notetype, open_collection
from clients.anki_agent import __main__ as agent

GUID = "00000000-0000-4000-8000-000000000072"


def manual_item():
    return {"id": 7, "origin": "manual", "guid": GUID, "course_name": "Synthetic",
            "resource_name": "Original.pdf", "semester_name": "1",
            "card": {"card_type": "basic", "front": "Warum <T>?\nZweite Zeile", "back": "A & B",
                     "course": "synthetic", "topic": "Topic", "source_page": 12}}


class NativeConnect:
    """Synthetic AnkiConnect operations backed by a real temporary collection."""

    def __init__(self, collection: Collection):
        self.collection = collection
        self.client = nullcontext()
        self.created = 0

    def ensure_model(self, kind):
        return ensure_notetype(self.collection, kind)["name"]

    def call(self, action, **parameters):
        col = self.collection
        if action == "version":
            return 6
        if action == "findNotes":
            return col.find_notes(parameters["query"])
        if action == "notesInfo":
            return [{"noteId": int(note_id), "fields": {
                name: {"value": value} for name, value in col.get_note(NoteId(note_id)).items()
            }} for note_id in parameters["notes"]]
        if action == "createDeck":
            return col.decks.id(parameters["deck"])
        if action == "addNote":
            payload = parameters["note"]
            model = col.models.by_name(payload["modelName"])
            assert model is not None
            note = col.new_note(model)
            for key, value in payload["fields"].items():
                note[key] = value
            note.tags = payload["tags"]
            deck_id = col.decks.id(payload["deckName"])
            assert deck_id is not None
            col.add_note(note, deck_id)
            self.created += 1
            return int(note.id)
        raise AssertionError(f"Unexpected synthetic AnkiConnect operation {action}")


def test_manual_agent_recovers_create_before_ack_using_guid(settings, monkeypatch):
    client_class = httpx.Client
    attempts = []

    def handle(request):
        assert request.headers["X-UniOS-Anki-Capabilities"] == "manual-guid-v1"
        if request.url.path == "/api/anki/agent/approved":
            return httpx.Response(200, json=[manual_item()])
        if request.url.path == "/api/anki/agent/pushed":
            import json

            attempts.append(json.loads(request.content))
            return httpx.Response(502 if len(attempts) == 1 else 200, json={"status": "pushed"})
        if request.url.path == "/api/anki/agent/notes":
            return httpx.Response(200, json=[])
        raise AssertionError(f"Unexpected synthetic host request {request.url.path}")

    monkeypatch.setattr(agent.httpx, "Client", lambda **kwargs: client_class(**kwargs, transport=httpx.MockTransport(handle)))
    with open_collection(settings) as col:
        native = NativeConnect(col)
        monkeypatch.setattr(agent, "AnkiConnect", lambda _url: native)
        with pytest.raises(httpx.HTTPStatusError):
            agent.sync("https://host.example.invalid", "synthetic-token", "http://127.0.0.1:8765")
        assert native.created == 1
        assert agent.sync("https://host.example.invalid", "synthetic-token", "http://127.0.0.1:8765") == 1
        assert native.created == 1 and len(col.find_notes("")) == 1
        note = col.get_note(NoteId(attempts[0]["note_id"]))
        assert note["UniOSId"] == manual_note_marker(GUID)
        assert note["Front"] == "Warum &lt;T&gt;?<br>Zweite Zeile"
        assert attempts[0] == attempts[1] and attempts[1]["guid"] == GUID


def test_manual_agent_duplicate_guids_fail_before_creation_or_ack(settings, monkeypatch):
    client_class = httpx.Client
    acknowledgements = []

    def handle(request):
        if request.url.path == "/api/anki/agent/approved":
            return httpx.Response(200, json=[manual_item()])
        acknowledgements.append(request.url.path)
        return httpx.Response(200, json=[])

    monkeypatch.setattr(agent.httpx, "Client", lambda **kwargs: client_class(**kwargs, transport=httpx.MockTransport(handle)))
    with open_collection(settings) as col:
        native = NativeConnect(col)
        note = agent.build_note(manual_item(), native.ensure_model("basic"))
        native.call("addNote", note=note)
        native.call("addNote", note=note)
        monkeypatch.setattr(agent, "AnkiConnect", lambda _url: native)
        with pytest.raises(RuntimeError, match="Mehrere"):
            agent.sync("https://host.example.invalid", "synthetic-token", "http://127.0.0.1:8765")
        assert native.created == 2 and acknowledgements == []


def test_ai_agent_retains_legacy_fields_and_duplicate_policy():
    item = manual_item()
    item.pop("origin")
    item.pop("guid")
    note = agent.build_note(item, "UniOS Basic")
    assert note["fields"]["UniOSId"] == "7"
    assert "unios-id-7" in note["tags"]
    assert note["options"]["allowDuplicate"] is False
