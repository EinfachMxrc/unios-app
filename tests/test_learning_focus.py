# SPDX-License-Identifier: AGPL-3.0-or-later

"""Accepted plans retain identity; native deck attribution never guesses course titles."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from anki.collection import NoteId
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.anki.card_schema import manual_note_marker
from app.anki.collection import (
    collection_path,
    ensure_notetype,
    open_collection,
    write_study_mode,
)
from app.db.models import (
    AnkiCard,
    AnkiCardQueue,
    Course,
    Exam,
    LearningTopic,
    Resource,
    StudyBlockSuggestion,
    StudyCycle,
)
from app.main import create_app


def seed_focus(factory, key="one"):
    now = datetime.now(UTC)
    with factory() as session:
        course = Course(source="fixture", source_id=key, name="Gleichnamiger Kurs")
        session.add(course)
        session.flush()
        topic = LearningTopic(course_id=course.id, slug="beweise", name="Beweise")
        resource = Resource(source="fixture", source_key=key, course_id=course.id,
                            kind="file", name="Skript.pdf", url="")
        exam = Exam(course_id=course.id, source_key=key, title="Klausur", exam_at=now + timedelta(days=4))
        session.add_all([topic, resource, exam])
        session.flush()
        block = StudyBlockSuggestion(exam_id=exam.id, topic_id=topic.id, duration_minutes=25,
                                     starts_at=now, status="accepted")
        cycle = StudyCycle(exam_id=exam.id, phase="review", starts_at=now, ends_at=now + timedelta(days=4),
                           exam_at_snapshot=exam.exam_at, topic_ids=[topic.id], status="accepted")
        session.add_all([block, cycle])
        session.commit()
        return {"course": course.id, "topic": topic.id, "resource": resource.id,
                "exam": exam.id, "block": block.id, "cycle": cycle.id}


def client_for(settings, coordinator):
    return TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator))


def native_card(col, marker, deck_id):
    note = col.new_note(ensure_notetype(col, "basic"))
    note["Front"], note["Back"], note["UniOSId"] = "Synthetische Frage", "Antwort", marker
    col.add_note(note, deck_id)
    return int(note.id), int(note.cards()[0].id)


def test_accepted_context_has_stable_ids_without_creating_study_work(settings, factory, coordinator, monkeypatch):
    ids = seed_focus(factory)
    with client_for(settings, coordinator) as client:
        monkeypatch.setattr(coordinator, "assert_writer", lambda: pytest.fail("Focus GET must not request writer"))
        block = client.get(f"/api/learning/focus/block/{ids['block']}")
        assert block.status_code == 200, block.text
        payload = block.json()
        assert (payload["kind"], payload["id"], payload["course_id"], payload["exam_id"], payload["duration_minutes"]) == (
            "block", ids["block"], ids["course"], ids["exam"], 25)
        assert payload["topics"] == [{"id": ids["topic"], "name": "Beweise"}]
        assert payload["exam_changed"] is None and payload["ends_at"] is None
        assert payload["card_scope"] == {"mode": "external", "decks": [], "scope": "course_related_decks", "uncertain": True}
        cycle = client.get(f"/api/learning/focus/cycle/{ids['cycle']}").json()
        assert cycle["exam_changed"] is False and cycle["duration_minutes"] is None
        assert cycle["label"] == "Wiederholen" and cycle["ends_at"] is not None
        assert client.get("/api/learning/focus/cycle/999999").status_code == 404
        assert client.get("/api/learning/focus/other/1").status_code == 422
        assert client.get("/api/learning/focus/block/0").status_code == 422
    assert not collection_path(settings).exists()
    with factory() as session:
        assert session.scalar(select(func.count(StudyBlockSuggestion.id))) == 1
        assert session.scalar(select(func.count(StudyCycle.id))) == 1
        assert session.scalar(select(func.count(AnkiCardQueue.id))) == 0


def test_direct_course_context_needs_no_plan_or_exam(settings, factory, coordinator, monkeypatch):
    with factory() as session:
        course = Course(source="fixture", source_id="direct", name="Direkte Mitschrift")
        session.add(course)
        session.flush()
        course_id = course.id
        session.add(LearningTopic(course_id=course_id, slug="algebra", name="Algebra"))
        session.commit()
    with client_for(settings, coordinator) as client:
        monkeypatch.setattr(coordinator, "assert_writer", lambda: pytest.fail("Direct workspace GET must be read-only"))
        result = client.get(f"/api/learning/focus/course/{course_id}")
        assert result.status_code == 200, result.text
        payload = result.json()
        assert (payload["kind"], payload["status"], payload["course_id"]) == ("course", "direct", course_id)
        assert payload["exam_id"] is None and payload["exam_title"] is None and payload["starts_at"] is None
        assert [topic["name"] for topic in payload["topics"]] == ["Algebra"]
        assert client.get("/api/learning/focus/course/999999").status_code == 404
    with factory() as session:
        for model in (Exam, StudyBlockSuggestion, StudyCycle, AnkiCardQueue):
            assert session.scalar(select(func.count(model.id))) == 0
    assert not collection_path(settings).exists()


@pytest.mark.parametrize("kind,model", [("block", StudyBlockSuggestion), ("cycle", StudyCycle)])
@pytest.mark.parametrize("status", ["proposed", "rejected"])
def test_focus_rejects_unaccepted_origins(settings, factory, coordinator, kind, model, status):
    ids = seed_focus(factory)
    with factory() as session:
        session.get(model, ids[kind]).status = status
        session.commit()
    with client_for(settings, coordinator) as client:
        assert client.get(f"/api/learning/focus/{kind}/{ids[kind]}").status_code == 409


def test_focus_validates_course_chain_and_reports_removed_cycle_topics(settings, factory, coordinator):
    own, foreign = seed_focus(factory), seed_focus(factory, "foreign")
    with factory() as session:
        session.get(StudyBlockSuggestion, own["block"]).topic_id = foreign["topic"]
        session.get(StudyCycle, own["cycle"]).topic_ids = [own["topic"], foreign["topic"], 999999, own["topic"]]
        session.get(Exam, own["exam"]).exam_at = None
        session.commit()
    with client_for(settings, coordinator) as client:
        assert client.get(f"/api/learning/focus/block/{own['block']}").status_code == 409
        cycle = client.get(f"/api/learning/focus/cycle/{own['cycle']}").json()
        assert cycle["topics"] == [{"id": own["topic"], "name": "Beweise"}]
        assert cycle["missing_topic_ids"] == [foreign["topic"], 999999]
        assert cycle["exam_at"] is None and cycle["exam_changed"] is True


def test_focus_follows_real_topic_merge_and_course_rename(settings, factory, coordinator):
    ids = seed_focus(factory)
    with factory() as session:
        target = LearningTopic(course_id=ids["course"], slug="neu", name="Neue Beweise")
        session.add(target)
        session.flush()
        session.get(StudyCycle, ids["cycle"]).topic_ids = [ids["topic"], target.id]
        session.get(Course, ids["course"]).name = "Umbenannter Kurs"
        session.commit()
        target_id = target.id
    with client_for(settings, coordinator) as client:
        merged = client.post(f"/api/learning/topics/{ids['topic']}/merge", json={"into_topic_id": target_id})
        assert merged.status_code == 200, merged.text
        for kind in ("block", "cycle"):
            result = client.get(f"/api/learning/focus/{kind}/{ids[kind]}")
            assert result.status_code == 200, result.text
            assert result.json()["topics"] == [{"id": target_id, "name": "Neue Beweise"}]
            assert result.json()["course_id"] == ids["course"]
            assert result.json()["course_name"] == "Umbenannter Kurs"


def test_native_deck_scope_finds_older_course_after_201_other_cards(settings, factory, coordinator):
    older, newer = seed_focus(factory, "older"), seed_focus(factory, "newer")
    mutation_id = str(uuid4())
    with factory() as session:
        first = AnkiCardQueue(resource_id=older["resource"], origin="manual", mutation_id=mutation_id,
                              payload="{}", status="pushed")
        session.add(first)
        session.flush()
        others = [AnkiCardQueue(resource_id=newer["resource"], payload="{}", status="pushed") for _ in range(201)]
        session.add_all(others)
        session.commit()
        first_id, other_ids = first.id, [item.id for item in others]
    write_study_mode(settings, "integrated")
    mappings = []
    with open_collection(settings) as col:
        older_deck = col.decks.id("Umbenannt::Älterer Stoff")
        newer_deck = col.decks.id("Andere Materialien")
        note_id, card_id = native_card(col, manual_note_marker(mutation_id), older_deck)
        mappings.append(AnkiCard(queue_id=first_id, note_id=str(note_id)))
        for queue_id in other_ids:
            other_note, _ = native_card(col, f"unios-{queue_id}", newer_deck)
            mappings.append(AnkiCard(queue_id=queue_id, note_id=str(other_note)))
        col.decks.select(newer_deck)
        before = col.db.all("SELECT id, nid, did, queue, due, reps FROM cards ORDER BY id")
    with factory() as session:
        session.add_all(mappings)
        session.get(Course, older["course"]).name = "Wieder umbenannt"
        session.commit()
    with client_for(settings, coordinator) as client:
        result = client.get(f"/api/learning/focus/block/{older['block']}")
        assert result.status_code == 200, result.text
        assert result.json()["card_scope"] == {
            "mode": "integrated", "scope": "course_related_decks", "uncertain": False,
            "decks": [{"deck_id": int(older_deck), "name": "Umbenannt::Älterer Stoff"}],
        }
    with open_collection(settings) as col:
        assert col.decks.selected() == newer_deck
        assert col.db.all("SELECT id, nid, did, queue, due, reps FROM cards ORDER BY id") == before
        assert col.db.scalar("SELECT count(*) FROM revlog") == 0
        assert col.get_card(card_id).nid == note_id


def test_manual_guid_follows_reimport_but_does_not_rebind_sql_on_get(settings, factory, coordinator):
    ids = seed_focus(factory)
    mutation_id = str(uuid4())
    with factory() as session:
        item = AnkiCardQueue(resource_id=ids["resource"], origin="manual", mutation_id=mutation_id,
                             status="pushed", payload="{}")
        session.add(item)
        session.commit()
        queue_id = item.id
    write_study_mode(settings, "integrated")
    with open_collection(settings) as col:
        first_deck = col.decks.id("Alt")
        old_note, _ = native_card(col, manual_note_marker(mutation_id), first_deck)
        current_deck = col.decks.id("Aktuell")
        # Keep the old ID occupied while constructing the replacement: Anki IDs
        # use milliseconds, and delete/add in one millisecond may otherwise reuse it.
        new_note, _ = native_card(col, manual_note_marker(mutation_id), current_deck)
        col.remove_notes([NoteId(old_note)])
        assert new_note != old_note
    with factory() as session:
        session.add(AnkiCard(queue_id=queue_id, note_id=str(old_note)))
        session.commit()
    with client_for(settings, coordinator) as client:
        scope = client.get(f"/api/learning/focus/block/{ids['block']}").json()["card_scope"]
        assert scope["decks"] == [{"deck_id": int(current_deck), "name": "Aktuell"}]
        assert scope["uncertain"] is False
        with open_collection(settings) as col:
            native_card(col, manual_note_marker(mutation_id), first_deck)
        duplicate_scope = client.get(f"/api/learning/focus/block/{ids['block']}").json()["card_scope"]
        assert duplicate_scope["decks"] == [] and duplicate_scope["uncertain"] is True
    with factory() as session:
        assert session.scalar(select(AnkiCard.note_id).where(AnkiCard.queue_id == queue_id)) == str(old_note)


def test_shared_deck_and_foreign_subdeck_are_explicitly_uncertain(settings, factory, coordinator):
    own, foreign = seed_focus(factory), seed_focus(factory, "foreign")
    with factory() as session:
        own_queue = AnkiCardQueue(resource_id=own["resource"], payload="{}", status="pushed")
        foreign_queue = AnkiCardQueue(resource_id=foreign["resource"], payload="{}", status="pushed")
        session.add_all([own_queue, foreign_queue])
        session.commit()
        own_id, foreign_id = own_queue.id, foreign_queue.id
    write_study_mode(settings, "integrated")
    with open_collection(settings) as col:
        parent = col.decks.id("Gemischter Stapel")
        child = col.decks.id("Gemischter Stapel::Fremder Kurs")
        own_note, _ = native_card(col, f"unios-{own_id}", parent)
        foreign_note, _ = native_card(col, f"unios-{foreign_id}", child)
    with factory() as session:
        session.add_all([AnkiCard(queue_id=own_id, note_id=str(own_note)),
                         AnkiCard(queue_id=foreign_id, note_id=str(foreign_note))])
        session.commit()
    with client_for(settings, coordinator) as client:
        scope = client.get(f"/api/learning/focus/block/{own['block']}").json()["card_scope"]
        assert scope["decks"] == [{"deck_id": int(parent), "name": "Gemischter Stapel"}]
        assert scope["uncertain"] is True
        with factory() as session:
            session.scalar(select(AnkiCard).where(AnkiCard.queue_id == own_id)).note_id = "unrelated-note"
            session.commit()
        wrong_binding = client.get(f"/api/learning/focus/block/{own['block']}").json()["card_scope"]
        assert wrong_binding["decks"] == [] and wrong_binding["uncertain"] is True


def test_missing_integrated_collection_is_not_created(settings, factory, coordinator):
    ids = seed_focus(factory)
    write_study_mode(settings, "integrated")
    with client_for(settings, coordinator) as client:
        scope = client.get(f"/api/learning/focus/block/{ids['block']}").json()["card_scope"]
        assert scope == {"mode": "integrated", "scope": "course_related_decks", "decks": [], "uncertain": True}
    assert not collection_path(settings).exists()


def test_focus_metadata_get_preserves_disabled_fsrs_and_current_deck(settings, factory, coordinator, monkeypatch):
    ids = seed_focus(factory)
    with factory() as session:
        item = AnkiCardQueue(resource_id=ids["resource"], status="pushed", payload="{}")
        session.add(item)
        session.commit()
        queue_id = item.id
    write_study_mode(settings, "integrated")
    with open_collection(settings) as col:
        deck_id = col.decks.id("Kontext")
        note_id, _ = native_card(col, f"unios-{queue_id}", deck_id)
        selected = col.decks.id("Anderer ausgewählter Stapel")
        col.decks.select(selected)
        col.set_config("fsrs", False)
        before_cards = col.db.all("SELECT * FROM cards ORDER BY id")
        before_notes = col.db.all("SELECT * FROM notes ORDER BY id")
        before_decks = [(item.id, item.name) for item in col.decks.all_names_and_ids()]
    with factory() as session:
        session.add(AnkiCard(queue_id=queue_id, note_id=str(note_id)))
        session.commit()
    with client_for(settings, coordinator) as client:
        monkeypatch.setattr(coordinator, "assert_writer", lambda: pytest.fail("Focus GET must not request writer"))
        result = client.get(f"/api/learning/focus/block/{ids['block']}")
        assert result.status_code == 200, result.text
        assert result.json()["card_scope"]["decks"] == [{"deck_id": int(deck_id), "name": "Kontext"}]
    with open_collection(settings, ensure_fsrs=False) as col:
        assert col.get_config("fsrs") is False
        assert col.decks.selected() == selected
        assert col.db.all("SELECT * FROM cards ORDER BY id") == before_cards
        assert col.db.all("SELECT * FROM notes ORDER BY id") == before_notes
        assert [(item.id, item.name) for item in col.decks.all_names_and_ids()] == before_decks
        assert col.db.scalar("SELECT count(*) FROM revlog") == 0
    with factory() as session:
        assert session.scalar(select(func.count(AnkiCard.id))) == 1
        assert session.scalar(select(AnkiCard.note_id).where(AnkiCard.queue_id == queue_id)) == str(note_id)


def test_card_bindings_resolve_resourceless_note_cards_via_topic(settings, factory):
    from app.learning.focus_repository import FocusRepository

    ids = seed_focus(factory)
    with factory() as session:
        note_queue = AnkiCardQueue(resource_id=None, topic_id=ids["topic"], origin="manual",
                                   payload="{}", status="pushed")
        orphan = AnkiCardQueue(resource_id=None, topic_id=None, payload="{}", status="pushed")
        session.add_all([note_queue, orphan])
        session.flush()
        session.add(AnkiCard(queue_id=note_queue.id, note_id="note-1"))
        session.commit()
        note_id = note_queue.id
    bindings = {item.queue_id: item for item in FocusRepository(factory, settings).card_bindings()}
    assert bindings[note_id].course_id == ids["course"]
    assert bindings[note_id].note_ids == ("note-1",)
    assert len(bindings) == 1
