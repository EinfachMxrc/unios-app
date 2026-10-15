# SPDX-License-Identifier: AGPL-3.0-or-later

"""Synthetic native reviews repair SQL provenance without answering twice."""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import pytest
from anki.collection import CardId, NoteId
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.anki.collection import (
    add_approved_note,
    ensure_notetype,
    open_collection,
    write_study_mode,
)
from app.anki.transfer_service import TransferService
from app.db.models import AnkiCard, AnkiCardQueue, AnkiReview
from app.main import create_app
from tests.test_anki_manual_transfer import seed_queue


def _card(settings, factory, coordinator, *, origin="manual"):
    queue_id, _, _ = seed_queue(factory, origin=origin)
    write_study_mode(settings, "integrated")
    transferred = TransferService(settings, factory, coordinator).transfer(queue_id)
    with open_collection(settings) as col:
        note = col.get_note(NoteId(transferred.note_id))
        card_id = int(note.cards()[0].id)
    with factory() as session:
        mapping_id = session.scalar(select(AnkiCard.id).where(AnkiCard.queue_id == queue_id))
    return queue_id, transferred.note_id, card_id, mapping_id


def _client(settings, coordinator):
    return TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator),
                      raise_server_exceptions=False)


def _replace(settings, note_id):
    with open_collection(settings) as col:
        original = col.get_note(NoteId(note_id))
        fields, deck_id = list(original.fields), original.cards()[0].did
        col.remove_notes([original.id])
        replacement = col.new_note(ensure_notetype(col, "basic"))
        replacement.fields = fields
        col.add_note(replacement, deck_id)
        assert int(replacement.id) != note_id
        return int(replacement.id), int(replacement.cards()[0].id)


def test_guid_review_rebinds_note_in_place_and_keeps_old_review_fk(settings, factory, coordinator):
    _, note_id, _, mapping_id = _card(settings, factory, coordinator)
    old_time = datetime(2025, 1, 1, tzinfo=UTC)
    with factory() as session:
        old = AnkiReview(card_id=mapping_id, reviewed_at=old_time, rating=2)
        session.add(old)
        session.commit()
        old_review_id = old.id
    replacement_id, card_id = _replace(settings, note_id)
    payload = {"card_id": card_id, "rating": 3, "review_id": "changed-native-note-review"}
    with _client(settings, coordinator) as client:
        response = client.post("/api/anki/study/reviews", json=payload)
        assert response.status_code == 200, response.text
    with factory() as session:
        mapped = session.get(AnkiCard, mapping_id)
        assert mapped.note_id == str(replacement_id)
        assert session.get(AnkiReview, old_review_id).card_id == mapping_id
        mirrored = session.scalar(select(AnkiReview).where(AnkiReview.review_id == payload["review_id"]))
        assert mirrored is not None and mirrored.card_id == mapping_id and mirrored.rating == 3
        assert session.scalar(select(func.count(AnkiCard.id))) == 1
        assert session.scalar(select(func.count(AnkiReview.id))) == 2


@pytest.mark.parametrize("replace_note", [False, True])
def test_sql_failure_after_native_commit_repairs_on_restart_without_new_answer(
    settings, factory, coordinator, monkeypatch, replace_note,
):
    _, note_id, card_id, mapping_id = _card(settings, factory, coordinator)
    previous_note_id = note_id
    old_count = int(replace_note)
    if replace_note:
        with factory() as session:
            session.add(AnkiReview(card_id=mapping_id, reviewed_at=datetime(2025, 1, 1, tzinfo=UTC), rating=2))
            session.commit()
        note_id, card_id = _replace(settings, note_id)
    payload = {"card_id": card_id, "rating": 3, "review_id": "interrupted-sql-review"}
    original = Session.commit

    def fail_review_commit(session):
        if any(isinstance(item, AnkiReview) for item in session.new):
            session.flush()
            raise OSError("Synthetic SQL interruption")
        return original(session)

    monkeypatch.setattr(Session, "commit", fail_review_commit)
    with _client(settings, coordinator) as client:
        failed = client.post("/api/anki/study/reviews", json=payload)
        assert failed.status_code == 503
    with factory() as session:
        assert session.scalar(select(func.count(AnkiReview.id))) == old_count
        assert session.get(AnkiCard, mapping_id).note_id == str(previous_note_id)
    with open_collection(settings) as col:
        assert col.db.scalar("SELECT count(*) FROM revlog") == 1
        assert col.db.scalar("SELECT count(*) FROM unios_review_receipts") == 1
        reviewed_ms = int(col.db.scalar("SELECT id FROM revlog WHERE cid = ?", card_id))
    monkeypatch.setattr(Session, "commit", original)
    with _client(settings, coordinator) as restarted:
        replay = restarted.post("/api/anki/study/reviews", json=payload)
        assert replay.status_code == 200, replay.text
        assert replay.json()["already_applied"] is True
        assert restarted.post("/api/anki/study/reviews", json=payload).json()["already_applied"] is True
    with open_collection(settings) as col:
        assert col.db.scalar("SELECT count(*) FROM revlog") == 1
        assert col.db.scalar("SELECT count(*) FROM unios_review_receipts") == 1
    with factory() as session:
        assert session.scalar(select(func.count(AnkiReview.id))) == 1 + old_count
        rows = session.scalars(select(AnkiReview).where(AnkiReview.review_id == payload["review_id"])).all()
        assert len(rows) == 1
        assert rows[0].card_id == mapping_id and rows[0].review_id == payload["review_id"]
        assert rows[0].reviewed_at.replace(tzinfo=UTC) == datetime.fromtimestamp(reviewed_ms / 1000, UTC)
        assert session.get(AnkiCard, mapping_id).note_id == str(note_id)
        assert all(row.card_id == mapping_id for row in session.scalars(select(AnkiReview)).all())


@pytest.mark.parametrize("replacement_count", [0, 1, 2])
def test_receipt_replay_repairs_history_after_original_card_is_deleted(
    settings, factory, coordinator, monkeypatch, replacement_count,
):
    from app.anki.study_review_repository import ReviewMirrorRepository

    _, note_id, card_id, mapping_id = _card(settings, factory, coordinator)
    historical_time = datetime(2025, 1, 1, tzinfo=UTC)
    with factory() as session:
        historical = AnkiReview(card_id=mapping_id, reviewed_at=historical_time, rating=2)
        session.add(historical)
        session.commit()
        historical_id = historical.id
    payload = {"card_id": card_id, "rating": 3, "review_id": "deleted-card-receipt-replay"}
    original = ReviewMirrorRepository.add_review

    def fail(*_args, **_kwargs):
        raise OSError("Synthetic mirror interruption before card removal")

    monkeypatch.setattr(ReviewMirrorRepository, "add_review", fail)
    with _client(settings, coordinator) as client:
        failed = client.post("/api/anki/study/reviews", json=payload)
        assert failed.status_code == 503, failed.text
    with open_collection(settings) as col:
        reviewed_ms = col.db.scalar("SELECT id FROM revlog WHERE cid = ?", card_id)
        assert reviewed_ms is not None
        assert col.db.scalar("SELECT count(*) FROM unios_review_receipts") == 1
    replacement_card = None
    if replacement_count:
        replacement_note, replacement_card = _replace(settings, note_id)
        if replacement_count == 2:
            with open_collection(settings) as col:
                replacement = col.get_note(NoteId(replacement_note))
                duplicate = col.new_note(ensure_notetype(col, "basic"))
                duplicate.fields = list(replacement.fields)
                col.add_note(duplicate, replacement.cards()[0].did)
    else:
        with open_collection(settings) as col:
            col.remove_notes([NoteId(note_id)])
    monkeypatch.setattr(ReviewMirrorRepository, "add_review", original)
    with _client(settings, coordinator) as restarted:
        repaired = restarted.post("/api/anki/study/reviews", json=payload)
        assert repaired.status_code == 200, repaired.text
        assert repaired.json() == {"card": None, "already_applied": True}
        assert restarted.post("/api/anki/study/reviews", json=payload).json() == repaired.json()
        assert restarted.post("/api/anki/study/reviews", json={**payload, "rating": 4}).status_code == 409
        assert restarted.post("/api/anki/study/reviews", json={**payload, "card_id": card_id + 1}).status_code == 409
        assert restarted.post("/api/anki/study/reviews", json={**payload, "review_id": "unknown-deleted-card"}).status_code == 404
    with factory() as session:
        mapped = session.get(AnkiCard, mapping_id)
        assert mapped.note_id == str(note_id)  # Historical ACK never invents a current binding.
        assert session.get(AnkiReview, historical_id).card_id == mapping_id
        reviews = session.scalars(select(AnkiReview).where(AnkiReview.review_id == payload["review_id"])).all()
        assert len(reviews) == 1 and reviews[0].card_id == mapping_id and reviews[0].rating == 3
        assert reviews[0].reviewed_at.replace(tzinfo=UTC) == datetime.fromtimestamp(reviewed_ms / 1000, UTC)
        assert session.scalar(select(func.count(AnkiCard.id))) == 1
        assert session.scalar(select(func.count(AnkiReview.id))) == 2
    with open_collection(settings) as col:
        # The real engine preserves the old event; a replay must never answer a replacement.
        assert col.db.scalar("SELECT count(*) FROM revlog") == 1
        assert col.db.scalar("SELECT count(*) FROM unios_review_receipts") == 1
        if replacement_card is not None:
            assert col.get_card(CardId(replacement_card)).reps == 0


@pytest.mark.parametrize("conflict", ["missing_binding", "multiple_bindings", "changed_note", "other_queue", "other_origin", "unapproved"])
def test_legacy_ai_receipt_rejects_unproven_existing_sql_bindings(settings, factory, coordinator, monkeypatch, conflict):
    from app.anki.study_review_repository import ReviewMirrorRepository

    queue_id, note_id, card_id, mapping_id = _card(settings, factory, coordinator, origin="ai")
    payload = {"card_id": card_id, "rating": 3, "review_id": "legacy-ai-conflicting-binding"}
    original = ReviewMirrorRepository.add_review

    def fail(*_args, **_kwargs):
        raise OSError("Synthetic legacy AI mirror failure")

    monkeypatch.setattr(ReviewMirrorRepository, "add_review", fail)
    with _client(settings, coordinator) as client:
        assert client.post("/api/anki/study/reviews", json=payload).status_code == 503
    monkeypatch.setattr(ReviewMirrorRepository, "add_review", original)
    with open_collection(settings) as col:
        col.remove_notes([NoteId(note_id)])
    with factory() as session:
        mapped = session.get(AnkiCard, mapping_id)
        queue = session.get(AnkiCardQueue, queue_id)
        if conflict == "missing_binding":
            session.delete(mapped)
        elif conflict == "multiple_bindings":
            session.add(AnkiCard(queue_id=queue_id, note_id="synthetic-other-ai-note"))
        elif conflict == "changed_note":
            mapped.note_id = "synthetic-later-ai-binding"
        elif conflict == "other_queue":
            other = AnkiCardQueue(origin="ai", status="pushed", payload=queue.payload)
            session.add(other)
            session.flush()
            mapped.queue_id = other.id
        elif conflict == "other_origin":
            queue.origin = "manual"
        else:
            queue.status = "proposed"
        session.commit()
        expected_bindings = [(row.id, row.queue_id, row.note_id) for row in session.scalars(select(AnkiCard)).all()]
    with _client(settings, coordinator) as restarted:
        response = restarted.post("/api/anki/study/reviews", json=payload)
        assert response.status_code == 409, response.text
    with factory() as session:
        assert [(row.id, row.queue_id, row.note_id) for row in session.scalars(select(AnkiCard)).all()] == expected_bindings
        assert session.scalar(select(func.count(AnkiReview.id))) == 0
    with open_collection(settings) as col:
        assert col.db.scalar("SELECT count(*) FROM revlog") == 1
        assert col.db.scalar("SELECT count(*) FROM unios_review_receipts") == 1


@pytest.mark.parametrize("marker", ["unios-01", "01", "unios-+1", "unios-9223372036854775808"])
def test_legacy_ai_receipt_does_not_coerce_aliases_to_a_local_queue(settings, factory, coordinator, monkeypatch, marker):
    from app.anki.study_review_repository import ReviewMirrorRepository

    _, note_id, card_id, mapping_id = _card(settings, factory, coordinator, origin="ai")
    with open_collection(settings) as col:
        note = col.get_note(NoteId(note_id))
        note["UniOSId"] = marker
        col.update_note(note)
    payload = {"card_id": card_id, "rating": 3, "review_id": "legacy-ai-noncanonical-marker"}
    original = ReviewMirrorRepository.add_review

    def fail(*_args, **_kwargs):
        raise OSError("Synthetic legacy AI mirror failure")

    monkeypatch.setattr(ReviewMirrorRepository, "add_review", fail)
    with _client(settings, coordinator) as client:
        assert client.post("/api/anki/study/reviews", json=payload).status_code == 503
    monkeypatch.setattr(ReviewMirrorRepository, "add_review", original)
    with open_collection(settings) as col:
        col.remove_notes([NoteId(note_id)])
    with _client(settings, coordinator) as restarted:
        response = restarted.post("/api/anki/study/reviews", json=payload)
        assert response.status_code == 409, response.text
    with factory() as session:
        assert session.get(AnkiCard, mapping_id).note_id == str(note_id)
        assert session.scalar(select(func.count(AnkiReview.id))) == 0
    with open_collection(settings) as col:
        assert col.db.scalar("SELECT count(*) FROM revlog") == 1
        assert col.db.scalar("SELECT count(*) FROM unios_review_receipts") == 1
        assert col.db.scalar("SELECT sum(reps) FROM cards") in {None, 0}


@pytest.mark.parametrize("conflict", ["missing_binding", "ambiguous_binding", "different_sql_review"])
def test_deleted_card_receipt_preserves_sql_attribution_conflicts(settings, factory, coordinator, monkeypatch, conflict):
    from app.anki.study_review_repository import ReviewMirrorRepository

    queue_id, note_id, card_id, mapping_id = _card(settings, factory, coordinator)
    payload = {"card_id": card_id, "rating": 3, "review_id": "deleted-card-conflicting-sql"}
    original = ReviewMirrorRepository.add_review

    def fail(*_args, **_kwargs):
        raise OSError("Synthetic mirror interruption")

    monkeypatch.setattr(ReviewMirrorRepository, "add_review", fail)
    with _client(settings, coordinator) as client:
        assert client.post("/api/anki/study/reviews", json=payload).status_code == 503
    monkeypatch.setattr(ReviewMirrorRepository, "add_review", original)
    with open_collection(settings) as col:
        col.remove_notes([NoteId(note_id)])
    with factory() as session:
        if conflict == "missing_binding":
            session.delete(session.get(AnkiCard, mapping_id))
        elif conflict == "ambiguous_binding":
            session.add(AnkiCard(queue_id=queue_id, note_id="synthetic-second-binding"))
        else:
            session.add(AnkiReview(card_id=mapping_id, reviewed_at=datetime(2025, 1, 1, tzinfo=UTC),
                                   rating=4, review_id=payload["review_id"]))
        session.commit()
    with _client(settings, coordinator) as restarted:
        response = restarted.post("/api/anki/study/reviews", json=payload)
        assert response.status_code == 409, response.text
    with factory() as session:
        assert session.scalar(select(func.count(AnkiReview.id))) == int(conflict == "different_sql_review")
        assert session.scalar(select(func.count(AnkiCard.id))) == {"missing_binding": 0, "ambiguous_binding": 2,
                                                                "different_sql_review": 1}[conflict]
    with open_collection(settings) as col:
        assert col.db.scalar("SELECT count(*) FROM revlog") == 1
        assert col.db.scalar("SELECT count(*) FROM unios_review_receipts") == 1


@pytest.mark.parametrize("origin", ["ai", "manual"])
def test_unmanaged_receipt_after_deletion_is_native_only_ack(settings, factory, coordinator, origin):
    write_study_mode(settings, "integrated")
    with open_collection(settings) as col:
        note_id = add_approved_note(
            col, queue_id=999, card_type="basic", front="Foreign question", back="Foreign answer",
            course="Foreign", topic="Topic", semester="1", source_file="Foreign.pdf", source_page=1,
            origin=origin, mutation_id="11111111-1111-4111-8111-111111111111" if origin == "manual" else None,
        )
        card_id = int(col.get_note(NoteId(note_id)).cards()[0].id)
    payload = {"card_id": card_id, "rating": 3, "review_id": "unmanaged-deleted-card"}
    with _client(settings, coordinator) as client:
        answered = client.post("/api/anki/study/reviews", json=payload)
        assert answered.status_code == 200, answered.text
        assert answered.json()["card"] is not None
        assert answered.json()["already_applied"] is False
    with open_collection(settings) as col:
        col.remove_notes([NoteId(note_id)])
    with _client(settings, coordinator) as restarted:
        acknowledged = restarted.post("/api/anki/study/reviews", json=payload)
        assert acknowledged.status_code == 200, acknowledged.text
        assert acknowledged.json() == {"card": None, "already_applied": True}
    with factory() as session:
        assert session.scalar(select(func.count(AnkiReview.id))) == 0
        assert session.scalar(select(func.count(AnkiCard.id))) == 0
    with open_collection(settings) as col:
        assert col.db.scalar("SELECT count(*) FROM revlog") == 1


def test_legacy_receipt_after_deletion_acknowledges_without_inventing_history(settings, factory, coordinator):
    _, note_id, card_id, _ = _card(settings, factory, coordinator)
    with open_collection(settings) as col:
        col.db.execute("CREATE TABLE unios_review_receipts "
                       "(review_id TEXT PRIMARY KEY, card_id INTEGER NOT NULL, rating INTEGER NOT NULL)")
        col.db.execute("INSERT INTO unios_review_receipts VALUES (?, ?, ?)", "legacy-deleted-card", card_id, 3)
        col.remove_notes([NoteId(note_id)])
    with _client(settings, coordinator) as client:
        response = client.post("/api/anki/study/reviews", json={"card_id": card_id, "rating": 3,
            "review_id": "legacy-deleted-card", "offline": True, "study_deck_id": 999999,
            "reviewed_at": "2020-01-01T00:00:00Z"})
        assert response.status_code == 200, response.text
        assert response.json() == {"card": None, "already_applied": True}
    with factory() as session:
        assert session.scalar(select(func.count(AnkiReview.id))) == 0


def test_null_review_card_is_only_valid_for_a_confirmed_replay():
    from pydantic import ValidationError

    from app.anki.study_schema import StudyReviewResponse

    with pytest.raises(ValidationError):
        StudyReviewResponse(card=None, already_applied=False)
    assert StudyReviewResponse(card=None, already_applied=True).card is None


def test_receipt_insert_failure_rolls_back_native_answer_and_remains_due(settings, factory, coordinator, monkeypatch):
    _, _, card_id, _ = _card(settings, factory, coordinator)
    payload = {"card_id": card_id, "rating": 3, "review_id": "failed-native-receipt"}
    from app.anki import study_undo_repository
    original = study_undo_repository.write_journal

    def fail_insert(settings, journal, *, previous):
        if journal.state == "applied":
            raise OSError("Synthetic receipt interruption")
        return original(settings, journal, previous=previous)

    monkeypatch.setattr(study_undo_repository, "write_journal", fail_insert)
    with _client(settings, coordinator) as client:
        assert client.post("/api/anki/study/reviews", json=payload).status_code == 500
    with open_collection(settings) as col:
        assert col.db.scalar("SELECT count(*) FROM revlog") == 0
        assert col.db.scalar("SELECT count(*) FROM unios_review_receipts") == 0
        assert col.get_card(CardId(card_id)).reps == 0
    monkeypatch.setattr(study_undo_repository, "write_journal", original)
    with _client(settings, coordinator) as restarted:
        assert restarted.get("/api/anki/study/due").json()["cards"][0]["id"] == card_id
        assert restarted.post("/api/anki/study/reviews", json=payload).status_code == 200
    with open_collection(settings) as col:
        assert col.db.scalar("SELECT count(*) FROM revlog") == 1
        assert col.db.scalar("SELECT count(*) FROM unios_review_receipts") == 1


def test_parallel_uuid_answers_once_and_mirrors_once(settings, factory, coordinator):
    _, _, card_id, _ = _card(settings, factory, coordinator)
    payload = {"card_id": card_id, "rating": 3, "review_id": "parallel-shared-review"}
    with _client(settings, coordinator) as client, ThreadPoolExecutor(max_workers=2) as workers:
        replies = list(workers.map(lambda _i: client.post("/api/anki/study/reviews", json=payload), range(2)))
    assert all(reply.status_code == 200 for reply in replies), [reply.text for reply in replies]
    assert sorted(reply.json()["already_applied"] for reply in replies) == [False, True]
    with factory() as session:
        assert session.scalar(select(func.count(AnkiReview.id))) == 1
    with open_collection(settings) as col:
        assert col.db.scalar("SELECT count(*) FROM revlog") == 1
        assert col.db.scalar("SELECT count(*) FROM unios_review_receipts") == 1


@pytest.mark.parametrize("conflict", ["duplicate_guid", "multiple_bindings", "occupied_note", "noncanonical_guid"])
def test_ambiguous_or_foreign_binding_is_rejected_before_scheduler_write(settings, factory, coordinator, conflict):
    queue_id, note_id, card_id, mapping_id = _card(settings, factory, coordinator)
    if conflict == "duplicate_guid":
        with open_collection(settings) as col:
            original = col.get_note(NoteId(note_id))
            duplicate = col.new_note(ensure_notetype(col, "basic"))
            duplicate.fields = list(original.fields)
            col.add_note(duplicate, original.cards()[0].did)
    elif conflict == "noncanonical_guid":
        with open_collection(settings) as col:
            note = col.get_note(NoteId(note_id))
            note["UniOSId"] = note["UniOSId"].upper()
            col.update_note(note)
    else:
        with factory() as session:
            if conflict == "multiple_bindings":
                session.add(AnkiCard(queue_id=queue_id, note_id="999999999999"))
            else:
                session.get(AnkiCard, mapping_id).note_id = "999999999998"
                queue = AnkiCardQueue(origin="ai", status="pushed", payload="{}")
                session.add(queue)
                session.flush()
                session.add(AnkiCard(queue_id=queue.id, note_id=str(note_id)))
            session.commit()
    with _client(settings, coordinator) as client:
        reply = client.post("/api/anki/study/reviews", json={"card_id": card_id, "rating": 3,
                                                            "review_id": "conflicted-review"})
        assert reply.status_code == 409, reply.text
    with open_collection(settings) as col:
        assert col.db.scalar("SELECT count(*) FROM revlog") == 0
        assert col.db.scalar("SELECT count(*) FROM unios_review_receipts") == 0
        assert col.get_card(CardId(card_id)).reps == 0
    with factory() as session:
        assert session.scalar(select(func.count(AnkiReview.id))) == 0


def test_legacy_three_field_receipt_acknowledges_without_inventing_sql_time(settings, factory, coordinator):
    _, _, card_id, _ = _card(settings, factory, coordinator)
    with open_collection(settings) as col:
        card = col.get_card(CardId(card_id))
        card.start_timer()
        col.sched.answerCard(card, 3)
        col.db.execute("CREATE TABLE unios_review_receipts "
                       "(review_id TEXT PRIMARY KEY, card_id INTEGER NOT NULL, rating INTEGER NOT NULL)")
        col.db.execute("INSERT INTO unios_review_receipts VALUES (?, ?, ?)", "legacy-receipt", card_id, 3)
    with _client(settings, coordinator) as client:
        replay = client.post("/api/anki/study/reviews", json={"card_id": card_id, "rating": 3,
            "review_id": "legacy-receipt", "offline": True, "study_deck_id": 999999,
            "reviewed_at": "2020-01-01T00:00:00Z"})
        assert replay.status_code == 200, replay.text
        assert replay.json()["already_applied"] is True
    with open_collection(settings) as col:
        assert col.db.first("SELECT note_id, source_identity, revlog_id FROM unios_review_receipts") == [None, None, None]
        assert col.db.scalar("SELECT count(*) FROM revlog") == 1
    with factory() as session:
        assert session.scalar(select(func.count(AnkiReview.id))) == 0


def test_sql_uuid_without_native_receipt_is_rejected_before_answer(settings, factory, coordinator):
    _, _, card_id, mapping_id = _card(settings, factory, coordinator)
    with factory() as session:
        session.add(AnkiReview(card_id=mapping_id, reviewed_at=datetime(2025, 1, 1, tzinfo=UTC),
                               rating=3, review_id="already-recorded-sql-uuid"))
        session.commit()
    with _client(settings, coordinator) as client:
        response = client.post("/api/anki/study/reviews", json={"card_id": card_id, "rating": 3,
                                                               "review_id": "already-recorded-sql-uuid"})
        assert response.status_code == 409, response.text
    with open_collection(settings) as col:
        assert col.db.scalar("SELECT count(*) FROM revlog") == 0
        assert col.db.scalar("SELECT count(*) FROM unios_review_receipts") == 0
        assert col.get_card(CardId(card_id)).reps == 0
    with factory() as session:
        assert session.scalar(select(func.count(AnkiReview.id))) == 1


def test_actual_collision_adjusted_native_timestamp_is_used_instead_of_offline_time(settings, factory, coordinator, monkeypatch):
    _, _, card_id, _ = _card(settings, factory, coordinator)
    fixed_ms = int(datetime.now(UTC).timestamp() * 1000)
    monkeypatch.setattr("anki.scheduler.v3.int_time", lambda _scale=1: fixed_ms)
    with open_collection(settings) as col:
        foreign_id = add_approved_note(col, queue_id=999, card_type="basic", front="Other", back="A",
                                      course="Other", topic="Topic", semester="1", source_file="Other.pdf", source_page=1)
        foreign_card = col.get_note(NoteId(foreign_id)).cards()[0]
        foreign_card.start_timer()
        col.sched.answerCard(foreign_card, 3)
        assert col.db.scalar("SELECT id FROM revlog WHERE cid = ?", int(foreign_card.id)) == fixed_ms
        col.db.execute("CREATE TABLE unios_review_receipts "
                       "(review_id TEXT PRIMARY KEY, card_id INTEGER NOT NULL, rating INTEGER NOT NULL)")
    with _client(settings, coordinator) as client:
        response = client.post("/api/anki/study/reviews", json={"card_id": card_id, "rating": 3,
            "review_id": "same-native-millisecond", "offline": True,
            "reviewed_at": (datetime.now(UTC) - timedelta(hours=2)).isoformat()})
        assert response.status_code == 200, response.text
    with open_collection(settings) as col:
        actual_ms = col.db.scalar("SELECT id FROM revlog WHERE cid = ?", card_id)
        assert actual_ms > fixed_ms
        assert col.db.first("SELECT revlog_id, card_id, rating FROM unios_review_receipts") == [actual_ms, card_id, 3]
    with factory() as session:
        reviewed = session.scalar(select(AnkiReview))
        assert reviewed.reviewed_at.replace(tzinfo=UTC) == datetime.fromtimestamp(actual_ms / 1000, UTC)


@pytest.mark.parametrize("agent_first", [False, True])
def test_desktop_and_native_mirror_adopt_the_same_event_once(settings, factory, coordinator, monkeypatch, agent_first):
    from app.anki.study_review_repository import ReviewMirrorRepository

    _, note_id, card_id, _ = _card(settings, factory, coordinator)
    settings.anki_agent_token = "synthetic-review-agent"
    payload = {"card_id": card_id, "rating": 3, "review_id": "shared-desktop-native-event"}
    original = ReviewMirrorRepository.add_review
    if agent_first:
        def fail(*_args, **_kwargs):
            raise OSError("Synthetic mirror interruption")
        monkeypatch.setattr(ReviewMirrorRepository, "add_review", fail)
    with _client(settings, coordinator) as client:
        first = client.post("/api/anki/study/reviews", json=payload)
        assert first.status_code == (503 if agent_first else 200), first.text
        monkeypatch.setattr(ReviewMirrorRepository, "add_review", original)
        with open_collection(settings) as col:
            actual_ms = col.db.scalar("SELECT id FROM revlog WHERE cid = ?", card_id)
        desktop = client.post("/api/anki/agent/reviews", headers={"X-Anki-Agent-Token": settings.anki_agent_token},
                              json={"reviews": [{"note_id": note_id, "review_id": actual_ms, "rating": 3}]})
        assert desktop.status_code == 200, desktop.text
        assert desktop.json()["imported"] == int(agent_first)
        with factory() as session:
            original_sql_id = session.scalar(select(AnkiReview.id))
        assert client.post("/api/anki/study/reviews", json=payload).status_code == 200
        assert client.post("/api/anki/agent/reviews", headers={"X-Anki-Agent-Token": settings.anki_agent_token},
                           json={"reviews": [{"note_id": note_id, "review_id": actual_ms, "rating": 4}]}).status_code == 409
    with factory() as session:
        rows = session.scalars(select(AnkiReview)).all()
        assert len(rows) == 1 and rows[0].id == original_sql_id and rows[0].review_id == payload["review_id"]
        assert rows[0].rating == 3


@pytest.mark.parametrize("marker_format", ["integrated", "desktop"])
@pytest.mark.parametrize("replacement_count", [0, 1, 2])
def test_legacy_ai_receipt_repairs_existing_binding_after_native_deletion(
    settings, factory, coordinator, monkeypatch, marker_format, replacement_count,
):
    queue_id, note_id, card_id, mapping_id = _card(settings, factory, coordinator, origin="ai")
    marker = f"unios-{queue_id}" if marker_format == "integrated" else str(queue_id)
    with open_collection(settings) as col:
        note = col.get_note(NoteId(note_id))
        note["UniOSId"] = marker
        col.update_note(note)
    with factory() as session:
        old = AnkiReview(card_id=mapping_id, reviewed_at=datetime(2025, 1, 1, tzinfo=UTC), rating=2)
        session.add(old)
        session.commit()
        old_id = old.id
    payload = {"card_id": card_id, "rating": 3, "review_id": "legacy-ai-deleted-receipt"}
    original_commit = Session.commit

    def fail_review_commit(session):
        if any(isinstance(row, AnkiReview) for row in session.new):
            session.flush()
            raise OSError("Synthetic legacy AI mirror commit failure")
        return original_commit(session)

    monkeypatch.setattr(Session, "commit", fail_review_commit)
    with _client(settings, coordinator) as client:
        failed = client.post("/api/anki/study/reviews", json=payload)
        assert failed.status_code == 503, failed.text
    with factory() as session:
        assert session.scalar(select(func.count(AnkiReview.id))) == 1
        assert session.get(AnkiCard, mapping_id).note_id == str(note_id)
    with open_collection(settings) as col:
        receipt = col.db.first("SELECT note_id, source_identity, revlog_id FROM unios_review_receipts")
        assert receipt[:2] == [str(note_id), marker]
        reviewed_ms = receipt[2]
        assert col.db.scalar("SELECT count(*) FROM revlog") == 1
    if replacement_count:
        replacement_note, replacement_card = _replace(settings, note_id)
        if replacement_count == 2:
            with open_collection(settings) as col:
                replacement = col.get_note(NoteId(replacement_note))
                duplicate = col.new_note(ensure_notetype(col, "basic"))
                duplicate.fields = list(replacement.fields)
                col.add_note(duplicate, replacement.cards()[0].did)
    else:
        with open_collection(settings) as col:
            col.remove_notes([NoteId(note_id)])
        replacement_card = None
    monkeypatch.setattr(Session, "commit", original_commit)
    with _client(settings, coordinator) as restarted:
        replay = restarted.post("/api/anki/study/reviews", json=payload)
        assert replay.status_code == 200, replay.text
        assert replay.json() == {"card": None, "already_applied": True}
        assert restarted.post("/api/anki/study/reviews", json=payload).json() == replay.json()
        assert restarted.post("/api/anki/study/reviews", json={**payload, "rating": 4}).status_code == 409
    with factory() as session:
        reviews = session.scalars(select(AnkiReview).where(AnkiReview.review_id == payload["review_id"])).all()
        assert len(reviews) == 1  # Before the fix the native ACK silently left this at zero.
        assert reviews[0].card_id == mapping_id and reviews[0].rating == 3
        assert reviews[0].reviewed_at.replace(tzinfo=UTC) == datetime.fromtimestamp(reviewed_ms / 1000, UTC)
        assert session.get(AnkiReview, old_id).card_id == mapping_id
        assert session.get(AnkiCard, mapping_id).note_id == str(note_id)
        assert session.scalar(select(func.count(AnkiCard.id))) == 1
        assert session.scalar(select(func.count(AnkiReview.id))) == 2
    with open_collection(settings) as col:
        assert col.db.scalar("SELECT count(*) FROM revlog") == 1
        assert col.db.scalar("SELECT count(*) FROM unios_review_receipts") == 1
        assert col.db.scalar("SELECT sum(reps) FROM cards") in {None, 0}
        if replacement_card is not None:
            assert col.get_card(CardId(replacement_card)).reps == 0
