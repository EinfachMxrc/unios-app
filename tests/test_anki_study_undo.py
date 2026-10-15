# SPDX-License-Identifier: AGPL-3.0-or-later

"""Identity-bound native undo with synthetic collections and real Anki scheduling."""

import json
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from threading import Event
from unittest.mock import patch

import pytest
from anki.dbproxy import DBProxy
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.anki.collection import (
    add_approved_note,
    close_study_collection,
    open_collection,
)
from app.anki.study_repository import StudyRepository
from app.anki.study_review_service import ReviewMirrorService
from app.anki.study_schema import ReviewInput
from app.anki.study_service import StudyError, StudyService
from app.anki.study_undo_repository import read_journal
from app.db.models import AnkiReview
from app.host.handoff import _install_snapshot, _stage_anki_snapshot, _stage_snapshot
from app.host.snapshots import (
    SnapshotVerificationError,
    _sha256,
    create_snapshot,
    verify_snapshot,
)
from app.main import create_app
from tests.test_anki_review_bridge import _card


def _client(settings, coordinator):
    return TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator),
                      raise_server_exceptions=False)


def _payload(card_id, review_id="synthetic-undo-review"):
    return {"card_id": card_id, "rating": 3, "review_id": review_id}


def test_review_normal_reads_undo_restores_scheduler_and_exact_sql_history(settings, factory, coordinator):
    _, _, card_id, _ = _card(settings, factory, coordinator)
    with open_collection(settings) as col:
        before = col.get_card(card_id)
        expected = before.queue, before.due, before.reps, before.lapses
    payload = _payload(card_id)
    with _client(settings, coordinator) as client:
        assert client.post("/api/anki/study/reviews", json=payload).status_code == 200
        for route in ("/api/anki/study/status", "/api/anki/study/stats", "/api/anki/study/due", "/api/anki/study/due?deck=Uni%3A%3ATestkurs"):
            response = client.get(route)
            assert response.status_code in {200, 404}, response.text
        response = client.post("/api/anki/study/reviews/undo", json=payload)
        assert response.status_code == 200, response.text
        assert response.json()["already_undone"] is False
        assert client.post("/api/anki/study/reviews/undo", json=payload).json()["already_undone"] is True
        replay = client.post("/api/anki/study/reviews", json=payload)
        assert replay.status_code == 409
    with open_collection(settings) as col:
        restored = col.get_card(card_id)
        assert (restored.queue, restored.due, restored.reps, restored.lapses) == expected
        assert col.db.scalar("SELECT count(*) FROM revlog") == 0
        assert col.db.scalar("SELECT rating FROM unios_review_receipts WHERE review_id = ?", payload["review_id"]) == -3
    with factory() as session:
        assert session.scalar(select(func.count(AnkiReview.id))) == 0


def test_native_undo_rejects_newer_review_and_external_edit(settings, factory, coordinator):
    _, _, first_id, _ = _card(settings, factory, coordinator)
    with open_collection(settings) as col:
        add_approved_note(col, queue_id=987, card_type="basic", front="Another synthetic card", back="Answer",
                          course="Synthetic course", topic="Demo", semester="1", source_file="", source_page=None)
    with _client(settings, coordinator) as client:
        first = _payload(first_id)
        assert client.post("/api/anki/study/reviews", json=first).status_code == 200
        second_id = client.get("/api/anki/study/due").json()["cards"][0]["id"]
        second = _payload(second_id, "synthetic-newer-review")
        assert client.post("/api/anki/study/reviews", json=second).status_code == 200
        assert client.post("/api/anki/study/reviews/undo", json=first).status_code == 409
        with open_collection(settings) as col:
            note = col.get_card(second_id).note()
            note["Back"] = "Changed outside the study session"
            col.update_note(note)
        assert client.post("/api/anki/study/reviews/undo", json=second).status_code == 409
    close_study_collection()


def test_cancel_not_yet_applied_review_prevents_late_upload(settings, factory, coordinator):
    _, _, card_id, _ = _card(settings, factory, coordinator)
    payload = _payload(card_id)
    with _client(settings, coordinator) as client:
        canceled = client.post("/api/anki/study/reviews/undo", json=payload)
        assert canceled.status_code == 200, canceled.text
        assert client.post("/api/anki/study/reviews", json=payload).status_code == 409
        assert client.get("/api/anki/study/status").json()["reviews"] == 0
    close_study_collection()


def test_snapshot_preserves_live_native_undo_and_exports_unmaterialized_receipt(settings, factory, coordinator):
    _, _, card_id, _ = _card(settings, factory, coordinator)
    payload = _payload(card_id)
    with _client(settings, coordinator) as client:
        assert client.post("/api/anki/study/reviews", json=payload).status_code == 200
        with open_collection(settings, preserve_study_undo=True) as original:
            step = original.undo_status().last_step
            assert original.db.scalar("SELECT count(*) FROM unios_review_receipts") == 0
        manifest = create_snapshot(coordinator)
        folder = settings.data_dir / "host" / "snapshots"
        assert verify_snapshot(folder, manifest, check_integrity=True)
        archive = json.loads((folder / manifest.anki_receipts_filename).read_text(encoding="utf-8"))
        assert [row["review_id"] for row in archive["receipts"]] == [payload["review_id"]]
        with open_collection(settings, preserve_study_undo=True) as current:
            assert current is original
            assert current.undo_status().last_step == step
            assert current.db.scalar("SELECT count(*) FROM unios_review_receipts") == 0
        assert client.get("/api/anki/study/status").json()["reviews"] == 1
        assert client.post("/api/anki/study/reviews/undo", json=payload).status_code == 200
        assert client.get("/api/anki/study/status").json()["reviews"] == 0
    with factory() as session:
        assert session.scalar(select(func.count(AnkiReview.id))) == 0


def test_definite_unavailable_undo_confirms_applied_uuid_without_changing_history(settings, factory, coordinator):
    _, _, card_id, _ = _card(settings, factory, coordinator)
    payload = _payload(card_id)
    with _client(settings, coordinator) as client:
        assert client.post("/api/anki/study/reviews", json=payload).status_code == 200
        close_study_collection()
        unavailable = client.post("/api/anki/study/reviews/undo", json=payload)
        assert unavailable.status_code == 409, unavailable.text
        assert unavailable.json()["code"] == "UNDO_UNAVAILABLE"
        assert unavailable.json()["detail"].startswith(f"UNDO_UNAVAILABLE:{payload['review_id']}: ")
        assert client.post("/api/anki/study/reviews", json=payload).json()["already_applied"] is True
        assert client.get("/api/anki/study/status").json()["reviews"] == 1
        changed = dict(payload, rating=4)
        mismatch = client.post("/api/anki/study/reviews/undo", json=changed)
        assert mismatch.status_code == 409
        assert "code" not in mismatch.json()
    with factory() as session:
        assert session.scalar(select(func.count(AnkiReview.id))) == 1


def test_unavailable_undo_with_failed_mirror_repair_remains_retryable(settings, factory, coordinator, monkeypatch):
    _, _, card_id, _ = _card(settings, factory, coordinator)
    payload = _payload(card_id)
    with _client(settings, coordinator) as client:
        assert client.post("/api/anki/study/reviews", json=payload).status_code == 200
        close_study_collection()
        def fail_record(*args, **kwargs):
            raise OSError("Synthetic positive mirror repair interruption")
        monkeypatch.setattr(ReviewMirrorService, "record", fail_record)
        failed = client.post("/api/anki/study/reviews/undo", json=payload)
        assert failed.status_code == 503, failed.text
        assert "code" not in failed.json()
        assert client.get("/api/anki/study/status").json()["reviews"] == 1


def test_failed_sql_undo_retries_concrete_tombstone_after_restart(settings, factory, coordinator, monkeypatch):
    _, _, card_id, _ = _card(settings, factory, coordinator)
    payload = _payload(card_id)
    original = Session.commit

    def fail_undo_commit(session):
        if any(isinstance(item, AnkiReview) for item in session.deleted):
            raise OSError("Synthetic undo mirror interruption")
        return original(session)

    with _client(settings, coordinator) as client:
        assert client.post("/api/anki/study/reviews", json=payload).status_code == 200
        monkeypatch.setattr(Session, "commit", fail_undo_commit)
        failed = client.post("/api/anki/study/reviews/undo", json=payload)
        assert failed.status_code == 503, failed.text
    close_study_collection()
    monkeypatch.setattr(Session, "commit", original)
    with _client(settings, coordinator) as client:
        retried = client.post("/api/anki/study/reviews/undo", json=payload)
        assert retried.status_code == 200, retried.text
        assert retried.json()["already_undone"] is True
        assert client.post("/api/anki/study/reviews", json=payload).status_code == 409
    with factory() as session:
        assert session.scalar(select(func.count(AnkiReview.id))) == 0
    close_study_collection()


def test_receipt_write_failure_rolls_back_native_answer(settings, factory, coordinator):
    _, _, card_id, _ = _card(settings, factory, coordinator)
    from app.anki import study_undo_repository
    original = study_undo_repository.write_journal

    def fail_applied(settings, journal, *, previous):
        if journal.state == "applied":
            raise OSError("Synthetic durable receipt interruption")
        return original(settings, journal, previous=previous)

    with _client(settings, coordinator) as client:
        with patch.object(study_undo_repository, "write_journal", fail_applied):
            failed = client.post("/api/anki/study/reviews", json=_payload(card_id))
            assert failed.status_code == 500, failed.text
        assert read_journal(settings, "synthetic-undo-review").state == "prepared"
        assert client.get("/api/anki/study/status").json()["reviews"] == 0
        retry = client.post("/api/anki/study/reviews", json=_payload(card_id))
        assert retry.status_code == 200, retry.text
        assert client.get("/api/anki/study/status").json()["reviews"] == 1
    close_study_collection()


def test_concurrent_undo_cannot_race_inflight_sql_mirror(settings, factory, coordinator, monkeypatch):
    _, _, card_id, _ = _card(settings, factory, coordinator)
    entered, release = Event(), Event()
    original = ReviewMirrorService.record

    def held_record(service, receipt, identity, write_guard=None):
        entered.set()
        assert release.wait(5)
        return original(service, receipt, identity, write_guard)

    monkeypatch.setattr(ReviewMirrorService, "record", held_record)
    with _client(settings, coordinator) as client, ThreadPoolExecutor(max_workers=2) as workers:
        answer = workers.submit(client.post, "/api/anki/study/reviews", json=_payload(card_id))
        assert entered.wait(5)
        undone = workers.submit(client.post, "/api/anki/study/reviews/undo", json=_payload(card_id))
        release.set()
        assert answer.result(timeout=10).status_code == 200
        response = undone.result(timeout=10)
        assert response.status_code == 200, response.text
    with factory() as session:
        assert session.scalar(select(func.count(AnkiReview.id))) == 0


def test_undo_sidecar_failure_retries_atomic_native_tombstone(settings, factory, coordinator, monkeypatch):
    _, _, card_id, _ = _card(settings, factory, coordinator)
    from app.anki import study_undo_repository
    original = study_undo_repository.write_journal

    def fail_undone(settings, journal, *, previous):
        if journal.state == "undone":
            raise OSError("Synthetic undo sidecar interruption")
        return original(settings, journal, previous=previous)

    with _client(settings, coordinator) as client:
        assert client.post("/api/anki/study/reviews", json=_payload(card_id)).status_code == 200
        monkeypatch.setattr(study_undo_repository, "write_journal", fail_undone)
        failed = client.post("/api/anki/study/reviews/undo", json=_payload(card_id))
        assert failed.status_code == 503, failed.text
        assert client.get("/api/anki/study/status").json()["reviews"] == 0
    monkeypatch.setattr(study_undo_repository, "write_journal", original)
    with _client(settings, coordinator) as client:
        assert client.post("/api/anki/study/reviews/undo", json=_payload(card_id)).status_code == 200
        assert client.post("/api/anki/study/reviews", json=_payload(card_id)).status_code == 409
    with factory() as session:
        assert session.scalar(select(func.count(AnkiReview.id))) == 0


def test_prepared_receipt_never_attributes_foreign_native_answer(settings, factory, coordinator):
    _, _, card_id, _ = _card(settings, factory, coordinator)
    from app.anki import study_undo_repository
    original = study_undo_repository.write_journal

    def fail_applied(settings, journal, *, previous):
        if journal.state == "applied":
            raise OSError("Synthetic interruption")
        return original(settings, journal, previous=previous)

    with _client(settings, coordinator) as client:
        with patch.object(study_undo_repository, "write_journal", fail_applied):
            assert client.post("/api/anki/study/reviews", json=_payload(card_id)).status_code == 500
        with open_collection(settings) as col:
            card = col.get_card(card_id)
            col.decks.select(card.did)
            card.start_timer()
            col.sched.answerCard(card, 3)
        replay = client.post("/api/anki/study/reviews", json=_payload(card_id))
        assert replay.status_code == 409, replay.text
        assert client.get("/api/anki/study/status").json()["reviews"] == 1
    with factory() as session:
        assert session.scalar(select(func.count(AnkiReview.id))) == 0


def test_verified_handoff_preserves_ack_and_cancel_and_archives_prior_profile_journal(settings, factory, coordinator, tmp_path):
    _, _, card_id, _ = _card(settings, factory, coordinator)
    with _client(settings, coordinator) as client:
        assert client.post("/api/anki/study/reviews", json=_payload(card_id)).status_code == 200
        cancel = _payload(card_id, "synthetic-handoff-cancel")
        assert client.post("/api/anki/study/reviews/undo", json=cancel).status_code == 200
    manifest = create_snapshot(coordinator)
    folder = settings.data_dir / "host" / "snapshots"
    assert manifest.anki_receipts_filename is not None
    assert verify_snapshot(folder, manifest, check_integrity=True)
    receiver = settings.model_copy(update={"local_dir": tmp_path / "receiver"})
    with open_collection(receiver) as col:
        add_approved_note(col, queue_id=900, card_type="basic", front="Receiver old synthetic question", back="Answer",
                          course="Receiver", topic="Demo", semester="1", source_file="", source_page=None)
    service = StudyService(StudyRepository(receiver, factory))
    receiver_card = service.due(None).cards[0]
    service.review(ReviewInput(**_payload(receiver_card.id, "synthetic-receiver-old")))
    assert (receiver.local_dir / "anki" / "review-actions").is_dir()
    target = receiver.local_dir / "uni_os.sqlite3"
    sql_stage = _stage_snapshot(folder, manifest, target)
    native_stage = _stage_anki_snapshot(folder, manifest, receiver)
    assert native_stage is not None
    _install_snapshot(sql_stage, target, native_stage, receiver.local_dir / "anki" / "collection.anki2")
    assert not (receiver.local_dir / "anki" / "review-actions").exists()
    assert list((receiver.local_dir / "handoff-archives").glob("*/review-actions/*.json"))
    replay = service.review(ReviewInput(**_payload(card_id)))
    assert replay.already_applied is True
    with pytest.raises(StudyError) as conflict:
        service.review(ReviewInput(**cancel))
    assert conflict.value.status_code == 409
    assert service.status().reviews == 1
    close_study_collection()


def test_handoff_rejects_corrupt_or_mismatched_receipt_sidecar_before_install(settings, factory, coordinator, tmp_path):
    _, _, card_id, _ = _card(settings, factory, coordinator)
    with _client(settings, coordinator) as client:
        assert client.post("/api/anki/study/reviews", json=_payload(card_id)).status_code == 200
    manifest = create_snapshot(coordinator)
    folder = settings.data_dir / "host" / "snapshots"
    receipt_path = folder / manifest.anki_receipts_filename
    original = receipt_path.read_bytes()
    receipt_path.write_bytes(original + b"broken")
    assert verify_snapshot(folder, manifest) is False
    receiver = settings.model_copy(update={"local_dir": tmp_path / "receiver"})
    with pytest.raises(SnapshotVerificationError):
        _stage_anki_snapshot(folder, manifest, receiver)
    payload = json.loads(original)
    payload["package_sha256"] = "0" * 64
    receipt_path.write_text(json.dumps(payload), encoding="utf-8")
    mismatched = replace(manifest, anki_receipts_sha256=_sha256(receipt_path))
    with pytest.raises(SnapshotVerificationError):
        _stage_anki_snapshot(folder, mismatched, receiver)
    assert not (receiver.local_dir / "anki" / "collection.anki2").exists()


def test_snapshot_refuses_unrepaired_undo_mirror(settings, factory, coordinator, monkeypatch):
    _, _, card_id, _ = _card(settings, factory, coordinator)
    original = Session.commit

    def fail_undo_commit(session):
        if any(isinstance(item, AnkiReview) for item in session.deleted):
            raise OSError("Synthetic interrupted mirror")
        return original(session)

    with _client(settings, coordinator) as client:
        assert client.post("/api/anki/study/reviews", json=_payload(card_id)).status_code == 200
        monkeypatch.setattr(Session, "commit", fail_undo_commit)
        assert client.post("/api/anki/study/reviews/undo", json=_payload(card_id)).status_code == 503
    with pytest.raises(SnapshotVerificationError, match="Lernverlaufs"):
        create_snapshot(coordinator)
    monkeypatch.setattr(Session, "commit", original)
    with _client(settings, coordinator) as client:
        assert client.post("/api/anki/study/reviews/undo", json=_payload(card_id)).status_code == 200
    assert verify_snapshot(settings.data_dir / "host" / "snapshots", create_snapshot(coordinator))


def test_applied_receipt_before_aborted_native_commit_is_retried_exactly_once(settings, factory, coordinator, monkeypatch):
    _, _, card_id, _ = _card(settings, factory, coordinator)
    original = DBProxy.transact

    class SimulatedProcessAbort(BaseException):
        pass

    def abort_before_commit(db, operation):
        def apply_then_abort():
            operation()
            raise SimulatedProcessAbort()
        return original(db, apply_then_abort)

    service = StudyService(StudyRepository(settings, factory))
    monkeypatch.setattr(DBProxy, "transact", abort_before_commit)
    with pytest.raises(SimulatedProcessAbort):
        service.review(ReviewInput(**_payload(card_id)))
    assert read_journal(settings, "synthetic-undo-review").state == "applied"
    monkeypatch.setattr(DBProxy, "transact", original)
    close_study_collection()
    with _client(settings, coordinator) as client:
        retry = client.post("/api/anki/study/reviews", json=_payload(card_id))
        assert retry.status_code == 200, retry.text
        assert retry.json()["already_applied"] is False
        assert client.post("/api/anki/study/reviews", json=_payload(card_id)).json()["already_applied"] is True
        assert client.get("/api/anki/study/status").json()["reviews"] == 1


def test_writer_lost_while_waiting_for_collection_lock_never_prepares_answer(settings, factory, coordinator, monkeypatch):
    _, _, card_id, _ = _card(settings, factory, coordinator)
    from app.anki.collection import _lock
    entered = Event()
    original = StudyService.review

    def announce_wait(service, payload, write_guard=None):
        entered.set()
        return original(service, payload, write_guard)

    monkeypatch.setattr(StudyService, "review", announce_wait)
    with _client(settings, coordinator) as client, ThreadPoolExecutor(max_workers=1) as worker:
        with _lock:
            answering = worker.submit(client.post, "/api/anki/study/reviews", json=_payload(card_id))
            assert entered.wait(5)
            coordinator._active = False
        rejected = answering.result(timeout=10)
        assert rejected.status_code == 409, rejected.text
        assert rejected.json()["detail"].startswith("STALE_HOST")
        assert read_journal(settings, "synthetic-undo-review") is None
        coordinator._active = True
        assert client.get("/api/anki/study/status").json()["reviews"] == 0


def test_writer_lost_before_native_commit_rolls_back_answer_and_safe_receipt_retry(settings, factory, coordinator, monkeypatch):
    _, _, card_id, _ = _card(settings, factory, coordinator)
    from app.anki import study_undo_repository
    original = study_undo_repository.write_journal

    def lose_after_receipt(settings, journal, *, previous):
        original(settings, journal, previous=previous)
        if journal.state == "applied":
            coordinator._active = False

    with _client(settings, coordinator) as client:
        monkeypatch.setattr(study_undo_repository, "write_journal", lose_after_receipt)
        failed = client.post("/api/anki/study/reviews", json=_payload(card_id))
        assert failed.status_code == 409, failed.text
        coordinator._active = True
        assert client.get("/api/anki/study/status").json()["reviews"] == 0
    monkeypatch.setattr(study_undo_repository, "write_journal", original)
    with _client(settings, coordinator) as client:
        assert client.post("/api/anki/study/reviews", json=_payload(card_id)).status_code == 200
        assert client.post("/api/anki/study/reviews", json=_payload(card_id)).json()["already_applied"] is True
        assert client.get("/api/anki/study/status").json()["reviews"] == 1


def test_undo_waiting_for_lock_cannot_write_after_lease_loss(settings, factory, coordinator, monkeypatch):
    _, _, card_id, _ = _card(settings, factory, coordinator)
    from app.anki.collection import _lock
    entered = Event()
    original = StudyService.undo

    def announce_wait(service, payload, write_guard=None):
        entered.set()
        return original(service, payload, write_guard)

    with _client(settings, coordinator) as client, ThreadPoolExecutor(max_workers=1) as worker:
        assert client.post("/api/anki/study/reviews", json=_payload(card_id)).status_code == 200
        monkeypatch.setattr(StudyService, "undo", announce_wait)
        with _lock:
            undoing = worker.submit(client.post, "/api/anki/study/reviews/undo", json=_payload(card_id))
            assert entered.wait(5)
            coordinator._active = False
        rejected = undoing.result(timeout=10)
        assert rejected.status_code == 409, rejected.text
        assert read_journal(settings, "synthetic-undo-review").state == "applied"
        coordinator._active = True
        assert client.get("/api/anki/study/status").json()["reviews"] == 1


def test_new_writer_generation_does_not_authorize_an_old_waiting_request(settings, factory, coordinator, monkeypatch):
    _, _, card_id, _ = _card(settings, factory, coordinator)
    from app.anki.collection import _lock
    entered = Event()
    original = StudyService.review
    original_current = coordinator.current
    original_assert = coordinator.assert_writer

    def announce_wait(service, payload, write_guard=None):
        entered.set()
        return original(service, payload, write_guard)

    monkeypatch.setattr(StudyService, "review", announce_wait)
    with _client(settings, coordinator) as client, ThreadPoolExecutor(max_workers=1) as worker:
        with _lock:
            answering = worker.submit(client.post, "/api/anki/study/reviews", json=_payload(card_id))
            assert entered.wait(5)
            new_lease = replace(original_current(), generation=original_current().generation + 1)
            # The coordinator accepts this new writer, but the old request's
            # captured device/generation/acquisition tuple must still fail.
            monkeypatch.setattr(coordinator, "current", lambda: new_lease)
            monkeypatch.setattr(coordinator, "assert_writer", lambda: None)
        rejected = answering.result(timeout=10)
        assert rejected.status_code == 409, rejected.text
        assert read_journal(settings, "synthetic-undo-review") is None
        monkeypatch.setattr(coordinator, "current", original_current)
        monkeypatch.setattr(coordinator, "assert_writer", original_assert)
        assert client.get("/api/anki/study/status").json()["reviews"] == 0
