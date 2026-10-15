# SPDX-License-Identifier: AGPL-3.0-or-later

"""Synthetic real-source/real-Anki tests, including changed native note IDs."""

from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import event, select

from app.anki.collection import ensure_notetype, open_collection, write_study_mode
from app.anki.study_source_repository import StudySourceRepository
from app.db.models import AnkiCard, AnkiCardQueue
from app.main import create_app
from tests.test_material import add_version, prepare


def _save(client, version_id, *, page=1):
    annotation = client.post(f"/api/material/{version_id}/annotations", json={
        "kind": "question", "quote": "Ein synthetisches Prinzip", "page": page,
        "comment": "Wie funktioniert dieses Prinzip?"})
    assert annotation.status_code == 200, annotation.text
    payload = {"mutation_id": str(uuid4()), "front": "Wie funktioniert dieses Prinzip?",
               "back": "Ein synthetisches Prinzip", "topic": "Grundlagen",
               "source": {"version_id": version_id, "annotation_id": annotation.json()["id"],
                          "expected_revision": 1, "page": page}}
    response = client.post("/api/anki/manual-cards", json=payload)
    assert response.status_code == 201, response.text
    assert response.json()["status"] == "pushed", response.json()
    return payload, response.json()


def test_due_review_and_browser_preserve_frozen_source_after_reanchor(settings, factory, coordinator):
    resource_id, first_id, _ = prepare(settings, factory, ["Ein synthetisches Prinzip"])
    second_id = add_version(settings, factory, resource_id, 2, ["Einleitung", "Ein synthetisches Prinzip"])
    write_study_mode(settings, "integrated")
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        payload, saved = _save(client, first_id)
        viewed = client.get(f"/api/material/{second_id}").json()["annotations"][0]
        moved = client.post(f"/api/material/{second_id}/annotations/{viewed['id']}/reanchor", json={
            "expected_revision": 1, "quote": viewed["quote"], "page": 2, "rects": viewed["anchor"]["rects"]})
        assert moved.status_code == 200, moved.text
        due = client.get("/api/anki/study/due", params={"deck": saved["deck_name"]}).json()
        assert len(due["cards"]) == 1
        card = due["cards"][0]
        assert card["source"] == saved["source"]
        assert card["source"]["url"] == f"/material/{first_id}?page=1"
        assert card["source"]["annotation_revision"] == 1
        browser = client.get("/api/anki/study/cards").json()["cards"]
        assert browser[0]["source"] == saved["source"]
        review_input = {"card_id": card["id"], "rating": 3, "review_id": str(uuid4()),
                        "study_deck_id": due["scope"]["deck_id"]}
        review = client.post("/api/anki/study/reviews", json=review_input)
        assert review.status_code == 200, review.text
        assert review.json()["card"]["source"] == saved["source"]
        repeated = client.post("/api/anki/study/reviews", json=review_input).json()
        assert repeated["already_applied"] is True
        assert repeated["card"]["source"] == saved["source"]
        assert client.post("/api/anki/manual-cards", json=payload).json()["queue_id"] == saved["queue_id"]


def test_stable_guid_resolves_source_after_native_note_id_changes(settings, factory, coordinator):
    _, first_id, _ = prepare(settings, factory, ["Ein synthetisches Prinzip"])
    write_study_mode(settings, "integrated")
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        _, saved = _save(client, first_id)
        with open_collection(settings) as col:
            original = col.get_note(saved["note_id"])
            fields = list(original.fields)
            deck_id = original.cards()[0].did
            col.remove_notes([original.id])
            replacement = col.new_note(ensure_notetype(col, "basic"))
            replacement.fields = fields
            col.add_note(replacement, deck_id)
            assert int(replacement.id) != saved["note_id"]
            # A third-party note without the stable marker cannot inherit this source.
            imported = col.new_note(ensure_notetype(col, "basic"))
            imported["Front"] = "Unzugeordnet"
            imported["Back"] = "Importiert"
            col.add_note(imported, deck_id)
        with factory() as session:
            assert session.scalar(select(AnkiCard.note_id).where(AnkiCard.queue_id == saved["queue_id"])) == str(saved["note_id"])
        due = client.get("/api/anki/study/due", params={"deck": saved["deck_name"]}).json()["cards"]
        mapped = next(card for card in due if card["front"] != "Unzugeordnet")
        assert mapped["source"] == saved["source"]
        assert mapped["note_id"] != saved["note_id"]
        assert next(card for card in due if card["front"] == "Unzugeordnet")["source"] is None


def test_source_batch_reads_once_and_never_guesses_import_sources(settings, factory, coordinator):
    _, first_id, _ = prepare(settings, factory, ["Ein synthetisches Prinzip"])
    write_study_mode(settings, "integrated")
    with TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        payload, saved = _save(client, first_id)
    with factory() as session:
        engine = session.get_bind()
    reads = []

    def record(_conn, _cursor, statement, _parameters, _context, _many):
        if statement.lstrip().upper().startswith("SELECT"):
            reads.append(statement)

    event.listen(engine, "before_cursor_execute", record)
    marker = f"unios-manual-{payload['mutation_id']}"
    try:
        repository = StudySourceRepository(factory)
        assert repository.for_identities([marker] * 100 + [None, "unios-1", "unios-manual-invalid"])[marker].model_dump() == saved["source"]
        assert len(reads) == 1
        assert repository.for_identities([None, "foreign", "unios-1"]) == {}
        assert len(reads) == 1
        with factory() as session:
            row = session.get(AnkiCardQueue, saved["queue_id"])
            row.source_snapshot = {"source": {"version_id": 999}}
            session.commit()
        assert repository.for_identities([marker]) == {}
    finally:
        event.remove(engine, "before_cursor_execute", record)
