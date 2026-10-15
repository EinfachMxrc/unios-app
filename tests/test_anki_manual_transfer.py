# SPDX-License-Identifier: AGPL-3.0-or-later

"""Manual cards retain literal content and stable native Anki identity."""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from unittest.mock import Mock

import pytest
from anki.collection import Collection
from anki.notes import NoteId
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import func, select

from app.anki.api import CardImport, card_queue_router, enqueue_cards
from app.anki.card_schema import (
    CardProposal,
    StoredCardData,
    manual_note_marker,
    parse_stored_card,
)
from app.anki.collection import (
    add_approved_note,
    collection_path,
    open_collection,
    write_study_mode,
)
from app.anki.transfer_repository import TransferRepository
from app.anki.transfer_service import TransferService
from app.db.models import AnkiCard, AnkiCardQueue, Course, Resource, ResourceVersion
from app.host.lease import HostCoordinator, HostLeaseError
from app.main import create_app

GUID = "00000000-0000-4000-8000-000000000071"


def add_manual(col: Collection, queue_id: int = 1) -> int:
    return add_approved_note(
        col, queue_id=queue_id, card_type="basic", front="Warum <T> & x?\nZweite Zeile",
        back="<script>literal</script>\nEigene Antwort", course="Synthetic", topic="Typen",
        semester="1", source_file="Text.pdf", source_page=12, origin="manual", mutation_id=GUID,
    )


def test_manual_native_note_preserves_literal_text_and_guid(settings):
    with open_collection(settings) as col:
        note_id = add_manual(col)
        note = col.get_note(NoteId(note_id))
        assert note["UniOSId"] == manual_note_marker(GUID)
        assert note["Front"] == "Warum &lt;T&gt; &amp; x?<br>Zweite Zeile"
        assert note["Back"] == "&lt;script&gt;literal&lt;/script&gt;<br>Eigene Antwort"
        assert add_manual(col, queue_id=99) == note_id
        assert len(col.find_notes("")) == 1


def test_manual_duplicate_guid_is_a_conflict(settings):
    with open_collection(settings) as col:
        note_id = add_manual(col)
        previous = col.get_note(NoteId(note_id))
        model = previous.note_type()
        assert model is not None
        duplicate = col.new_note(model)
        duplicate.fields = list(previous.fields)
        deck_id = col.decks.id("Uni::Synthetic")
        assert deck_id is not None
        col.add_note(duplicate, deck_id)
        with pytest.raises(ValueError, match="Mehrere"):
            add_manual(col)


def test_manual_content_and_ai_proposals_use_distinct_validation():
    content = {"card_type": "basic", "front": "Q", "back": "A", "course": "synthetic", "topic": "Topic"}
    manual = StoredCardData(**content)
    assert parse_stored_card(manual.model_dump_json(exclude_none=True), "manual").confidence is None
    with pytest.raises(ValidationError):
        CardProposal(**content)
    ai = CardProposal(**content, confidence="high")
    assert parse_stored_card(ai.model_dump_json(), "ai").confidence == "high"
    with pytest.raises(ValueError):
        parse_stored_card(ai.model_dump_json(), "manual")


def seed_queue(factory, *, origin="manual"):
    with factory() as session:
        course = Course(source="fixture", source_id="manual-course", name="Renamed course")
        session.add(course)
        session.flush()
        resource = Resource(source="fixture", source_key="manual-resource", course_id=course.id,
                            kind="file", name="Renamed.pdf", url="https://example.invalid/manual.pdf")
        session.add(resource)
        session.flush()
        version = ResourceVersion(resource_id=resource.id, version=1, sha256="a" * 64,
                                  relative_path="uni/Synthetic.pdf", size=1, mime_type="application/pdf",
                                  downloaded_at=datetime.now(UTC))
        session.add(version)
        session.flush()
        card = StoredCardData(card_type="basic", front="Warum <T>?", back="Zeile 1\nZeile 2",
                              course="synthetic", topic="Typen", source_page=12,
                              confidence="high" if origin == "ai" else None)
        source = {"resource_id": resource.id, "resource_name": "Original.pdf", "course_id": course.id,
                  "course_name": "Synthetic", "version_id": version.id, "version": 1,
                  "sha256": version.sha256, "page": 12, "quote": "Original quote",
                  "annotation_id": "00000000-0000-4000-8000-000000000099", "annotation_revision": 1,
                  "url": f"/material/{version.id}?page=12"}
        item = AnkiCardQueue(resource_id=resource.id, origin=origin, status="approved",
                             mutation_id=GUID if origin == "manual" else None,
                             source_version_id=version.id, source_snapshot={"source": source},
                             payload=card.model_dump_json(exclude_none=True))
        session.add(item)
        session.commit()
        return item.id, resource.id, version.id


def test_targeted_transfer_leaves_other_approved_cards_and_preserves_frozen_context(settings, factory, coordinator):
    queue_id, resource_id, _ = seed_queue(factory)
    with factory() as session:
        card = CardProposal(card_type="basic", front="Unrelated", back="Answer", course="synthetic",
                            topic="Topic", confidence="high")
        other = AnkiCardQueue(resource_id=resource_id, origin="ai", status="approved", payload=card.model_dump_json())
        session.add(other)
        session.commit()
        other_id = other.id
    write_study_mode(settings, "integrated")
    result = TransferService(settings, factory, coordinator).transfer(queue_id)
    assert result.status == "pushed" and result.error is None and result.note_id is not None
    with open_collection(settings) as col:
        note = col.get_note(NoteId(result.note_id))
        assert note["Course"] == "Synthetic" and note["SourceFile"] == "Original.pdf"
        assert note["Front"] == "Warum &lt;T&gt;?"
        assert col.decks.name(note.cards()[0].did) == "Uni::Synthetic"
        assert len(col.find_cards("")) == 1
    with factory() as session:
        assert session.get(AnkiCardQueue, other_id).status == "approved"


def test_native_create_before_sql_ack_is_recovered_once(settings, factory, coordinator, monkeypatch):
    queue_id, _, _ = seed_queue(factory)
    write_study_mode(settings, "integrated")
    original = TransferRepository.acknowledge

    def fail_ack(*_args, **_kwargs):
        raise OSError("Synthetic interrupted acknowledgement")

    monkeypatch.setattr(TransferRepository, "acknowledge", fail_ack)
    first = TransferService(settings, factory, coordinator).transfer(queue_id)
    assert first.status == "approved" and first.error
    with factory() as session:
        assert session.get(AnkiCardQueue, queue_id).status == "approved"
        assert session.scalar(select(func.count(AnkiCard.id))) == 0
    monkeypatch.setattr(TransferRepository, "acknowledge", original)
    second = TransferService(settings, factory, coordinator).transfer(queue_id)
    assert second.status == "pushed" and second.note_id is not None
    assert TransferService(settings, factory, coordinator).transfer(queue_id) == second
    with open_collection(settings) as col:
        assert len(col.find_notes(f'"UniOSId:{manual_note_marker(GUID)}"')) == 1
    with factory() as session:
        assert session.scalar(select(func.count(AnkiCard.id))) == 1


def test_external_manual_transfer_remains_durable_without_opening_anki(settings, factory, coordinator):
    queue_id, _, _ = seed_queue(factory)
    result = TransferService(settings, factory, coordinator).transfer(queue_id)
    assert result.status == "approved" and result.note_id is None and result.error is None
    assert not collection_path(settings).exists()


def test_manual_queue_is_readable_but_old_agents_do_not_receive_it(settings, factory, coordinator):
    queue_id, _, _ = seed_queue(factory)
    settings.anki_agent_token = "synthetic-agent-token"
    app = FastAPI()
    app.include_router(card_queue_router(settings, factory, coordinator))
    headers = {"X-Anki-Agent-Token": settings.anki_agent_token}
    capable = {**headers, "X-UniOS-Anki-Capabilities": "manual-guid-v1"}
    with TestClient(app) as client:
        queue = client.get("/api/anki/queue")
        assert queue.status_code == 200
        item = queue.json()[0]
        assert item["origin"] == "manual" and item["card"]["confidence"] is None
        assert item["guid"] == GUID and item["source"]["page"] == 12
        assert item["course_name"] == "Synthetic" and item["deck_name"] == "Uni::Synthetic"
        assert client.get("/api/anki/agent/approved", headers=headers).json() == []
        approved = client.get("/api/anki/agent/approved", headers=capable).json()
        assert len(approved) == 1 and approved[0]["guid"] == GUID
        assert approved[0]["course_name"] == "Synthetic"
        ack = {"queue_id": queue_id, "note_id": 123456, "guid": GUID}
        assert client.post("/api/anki/agent/pushed", headers=headers, json=ack).status_code == 409
        assert client.post("/api/anki/agent/pushed", headers=capable, json=ack).json() == {"status": "pushed"}
        assert client.post("/api/anki/agent/pushed", headers=capable, json=ack).json() == {"status": "pushed"}


def test_queue_origin_filter_finds_older_manual_source_before_global_limit(settings, factory, coordinator):
    queue_id, resource_id, version_id = seed_queue(factory)
    ai = CardProposal(card_type="basic", front="Newer AI question", back="Answer", course="synthetic",
                      topic="Topic", confidence="high")
    with factory() as session:
        session.add_all(AnkiCardQueue(resource_id=resource_id, origin="ai", status="proposed",
                                     payload=ai.model_dump_json()) for _ in range(201))
        session.commit()
    app = FastAPI()
    app.include_router(card_queue_router(settings, factory, coordinator))
    with TestClient(app) as client:
        legacy = client.get("/api/anki/queue")
        assert legacy.status_code == 200
        assert len(legacy.json()) == 200
        assert all(item["origin"] == "ai" and item["id"] > queue_id for item in legacy.json())

        filtered = client.get("/api/anki/queue", params={"origin": "manual"})
        assert filtered.status_code == 200
        assert len(filtered.json()) == 1
        item = filtered.json()[0]
        assert item["id"] == queue_id and item["origin"] == "manual" and item["guid"] == GUID
        assert item["resource_name"] == "Original.pdf" and item["course_name"] == "Synthetic"
        assert item["deck_name"] == "Uni::Synthetic"
        assert item["source"]["version_id"] == version_id and item["source"]["page"] == 12
        assert item["source"]["sha256"] == "a" * 64 and item["source"]["quote"] == "Original quote"

        ai_only = client.get("/api/anki/queue", params={"origin": "ai"})
        assert ai_only.status_code == 200 and ai_only.json() == legacy.json()
        invalid = client.get("/api/anki/queue", params={"origin": "unknown"})
        assert invalid.status_code == 422
        assert invalid.json()["detail"][0]["loc"] == ["query", "origin"]


def test_manual_cards_do_not_consume_ai_budget_and_ai_origin_is_server_forced(settings, factory):
    _, resource_id, version_id = seed_queue(factory)
    settings.max_anki_candidates_per_resource = 1
    payload = {"schema_version": 1, "generated_by": "synthetic", "generated_at": datetime.now(UTC),
               "origin": "manual", "source": {"resource_id": resource_id, "version": 1},
               "cards": [{"card_type": "basic", "front": "AI", "back": "A", "course": "bad",
                          "topic": "Topic", "confidence": "high", "origin": "manual"}]}
    with factory() as session:
        created = enqueue_cards(session, settings, CardImport.model_validate(payload))
        session.commit()
        assert created[0].origin == "ai" and created[0].card.confidence == "high"
        item = session.get(AnkiCardQueue, created[0].id)
        assert item.source_version_id == version_id and item.origin == "ai"


def test_manual_browser_edit_keeps_markup_literal_and_source(settings, factory, coordinator):
    queue_id, _, version_id = seed_queue(factory)
    write_study_mode(settings, "integrated")
    transferred = TransferService(settings, factory, coordinator).transfer(queue_id)
    assert transferred.note_id is not None
    with open_collection(settings) as col:
        card_id = int(col.get_note(NoteId(transferred.note_id)).cards()[0].id)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        response = client.put(f"/api/anki/study/cards/{card_id}", json={
            "front": '<img src="x" onerror="alert(1)">\n<b>Literal bold</b>',
            "back": "A < B & C\nSecond line",
        })
        assert response.status_code == 200, response.text
        assert response.json()["source"]["version_id"] == version_id
        assert "&lt;img" in response.json()["front_html"]
        assert "&lt;b&gt;Literal bold&lt;/b&gt;" in response.json()["front_html"]
        assert "<br" in response.json()["back_html"]
        browser = client.get("/api/anki/study/cards").json()["cards"]
        assert browser[0]["source"]["version_id"] == version_id
    with open_collection(settings) as col:
        note = col.get_note(NoteId(transferred.note_id))
        assert note["Front"] == '&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;<br>&lt;b&gt;Literal bold&lt;/b&gt;'
        assert note["Back"] == "A &lt; B &amp; C<br>Second line"


def test_transfer_fencing_is_a_hard_failure_even_after_native_creation(settings, factory, coordinator):
    queue_id, _, _ = seed_queue(factory)
    write_study_mode(settings, "integrated")
    fence = Mock(spec=HostCoordinator)
    fence.assert_writer.side_effect = [None, None, HostLeaseError("Synthetic lost writer")]
    with pytest.raises(HostLeaseError, match="lost writer"):
        TransferService(settings, factory, fence).transfer(queue_id)
    with factory() as session:
        assert session.get(AnkiCardQueue, queue_id).status == "approved"
        assert session.scalar(select(func.count(AnkiCard.id))) == 0
    retry = TransferService(settings, factory, coordinator).transfer(queue_id)
    assert retry.status == "pushed"
    with open_collection(settings) as col:
        assert len(col.find_notes("")) == 1


def test_parallel_targeted_transfers_acknowledge_one_native_note(settings, factory, coordinator):
    queue_id, _, _ = seed_queue(factory)
    write_study_mode(settings, "integrated")
    transfer = TransferService(settings, factory, coordinator)
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(transfer.transfer, [queue_id, queue_id]))
    assert all(result.status == "pushed" for result in results)
    assert results[0].note_id == results[1].note_id
    with factory() as session:
        assert session.scalar(select(func.count(AnkiCard.id))) == 1
    with open_collection(settings) as col:
        assert len(col.find_notes("")) == 1


def test_bulk_transfer_keeps_contract_and_ai_html_and_legacy_marker(settings, factory, coordinator):
    _, resource_id, _ = seed_queue(factory)
    with factory() as session:
        ai = CardProposal(card_type="basic", front="<b>AI rich</b>", back="Answer", course="synthetic",
                          topic="Topic", confidence="high")
        item = AnkiCardQueue(resource_id=resource_id, origin="ai", status="approved", payload=ai.model_dump_json())
        session.add(item)
        session.commit()
        ai_id = item.id
    write_study_mode(settings, "integrated")
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        response = client.post("/api/anki/study/approved")
        assert response.status_code == 200, response.text
        assert response.json() == {"imported": 2}
        assert client.post("/api/anki/study/approved").json() == {"imported": 0}
    with open_collection(settings) as col:
        ids = col.find_notes(f'"UniOSId:unios-{ai_id}"')
        assert len(ids) == 1
        note = col.get_note(NoteId(ids[0]))
        assert note["UniOSId"] == f"unios-{ai_id}" and note["Front"] == "<b>AI rich</b>"
        assert len(col.find_notes("")) == 2
