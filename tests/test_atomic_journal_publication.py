# SPDX-License-Identifier: AGPL-3.0-or-later

"""Windows publication retries retain journal integrity and native identity."""

import json
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.anki.collection import close_study_collection
from app.anki.study_undo_repository import read_journal
from app.db.models import AnkiReview
from app.files import atomic
from app.host.actions import ActionJournal
from tests.test_anki_review_bridge import _card
from tests.test_anki_study_undo import _client, _payload


def _locked_file(error_code):
    error = PermissionError("Synthetic Windows destination lock")
    error.winerror = error_code
    return error


@pytest.mark.parametrize("error_code", [5, 32, 33])
@pytest.mark.parametrize("failures", [1, 2])
def test_atomic_publication_retries_same_payload_only(tmp_path, monkeypatch, error_code, failures):
    source, target = tmp_path / "durable.tmp", tmp_path / "head.json"
    source.write_bytes(b"new durable payload")
    target.write_bytes(b"old complete payload")
    replace = atomic.os.replace
    attempts, delays = [], []

    def denied_then_publish(actual_source, actual_target):
        assert Path(actual_source).read_bytes() == b"new durable payload"
        assert Path(actual_target).read_bytes() == b"old complete payload"
        attempts.append((actual_source, actual_target))
        if len(attempts) <= failures:
            raise _locked_file(error_code)
        return replace(actual_source, actual_target)

    monkeypatch.setattr(atomic.os, "replace", denied_then_publish)
    monkeypatch.setattr(atomic.time, "sleep", delays.append)
    atomic.replace_atomic(source, target)
    assert len(attempts) == failures + 1
    assert len(set(attempts)) == 1
    assert delays == [0.01 * 2 ** attempt for attempt in range(failures)]
    assert target.read_bytes() == b"new durable payload"
    assert not source.exists()


@pytest.mark.parametrize("error_code,expected_attempts", [(32, 8), (112, 1), (None, 1)])
def test_atomic_publication_permanent_or_other_error_leaves_destination_unchanged(
        tmp_path, monkeypatch, error_code, expected_attempts):
    source, target = tmp_path / "durable.tmp", tmp_path / "head.json"
    source.write_bytes(b"new durable payload")
    target.write_bytes(b"old complete payload")
    attempts, delays = [], []

    def denied(actual_source, actual_target):
        attempts.append((actual_source, actual_target))
        raise _locked_file(error_code)

    monkeypatch.setattr(atomic.os, "replace", denied)
    monkeypatch.setattr(atomic.time, "sleep", delays.append)
    with pytest.raises(PermissionError):
        atomic.replace_atomic(source, target)
    assert len(attempts) == expected_attempts
    assert len(delays) == expected_attempts - 1
    assert sum(delays) <= 0.64
    assert source.read_bytes() == b"new durable payload"
    assert target.read_bytes() == b"old complete payload"


def test_action_result_temporary_lock_keeps_exact_head_and_verified_recovery(settings, coordinator, monkeypatch):
    journal = ActionJournal(settings)
    action_id = journal.begin_operation(coordinator, "sync")
    replace = atomic.os.replace
    attempts = []

    def denied_then_publish(source, target):
        if Path(target) == journal.head_path:
            attempts.append((source, target))
            if len(attempts) <= 2:
                raise _locked_file(32)
        return replace(source, target)

    monkeypatch.setattr(atomic.os, "replace", denied_then_publish)
    monkeypatch.setattr(atomic.time, "sleep", lambda _delay: None)
    journal.finish(action_id, 200)
    assert len(attempts) == 3
    assert len(set(attempts)) == 1
    head = json.loads(journal.head_path.read_bytes())
    raw = journal.path.read_bytes()
    assert head["size"] == len(raw)
    assert head["chain"] == journal._chain(raw)[0]
    actions, intact = journal.actions_since(None, coordinator.current().device_id)
    assert intact and len(actions) == 1
    assert actions[0]["id"] == action_id and actions[0]["outcome"] == "erfolgreich"
    assert len(raw.splitlines()) == 2


def test_action_result_permanent_lock_cannot_bless_unpublished_tail(settings, coordinator, monkeypatch):
    journal = ActionJournal(settings)
    action_id = journal.begin_operation(coordinator, "sync")
    head_before = journal.head_path.read_bytes()
    replace = atomic.os.replace
    attempts = []

    def denied(source, target):
        if Path(target) == journal.head_path:
            attempts.append((source, target))
            raise _locked_file(32)
        return replace(source, target)

    monkeypatch.setattr(atomic.os, "replace", denied)
    monkeypatch.setattr(atomic.time, "sleep", lambda _delay: None)
    with pytest.raises(PermissionError):
        journal.finish(action_id, 200)
    assert len(attempts) == 8
    assert journal.head_path.read_bytes() == head_before
    raw_after = journal.path.read_bytes()
    assert len(raw_after.splitlines()) == 2
    _, intact = journal.actions_since(None, coordinator.current().device_id)
    assert not intact
    with pytest.raises(OSError, match="Journal-Kopf stimmen"):
        journal.begin_operation(coordinator, "sync")
    assert journal.path.read_bytes() == raw_after
    assert list(journal.path.parent.glob("*.tmp")) == []


@pytest.mark.parametrize("failures", [1, 2, 8])
def test_native_receipt_publication_lock_never_duplicates_answer(settings, factory, coordinator, monkeypatch, failures):
    _, _, card_id, _ = _card(settings, factory, coordinator)
    payload = _payload(card_id, "synthetic-sharing-lock-review")
    replace = atomic.os.replace
    attempts = []

    def deny_applied_receipt(source, target):
        if Path(target).parent.name == "review-actions" and json.loads(Path(source).read_bytes())["state"] == "applied":
            attempts.append((source, target))
            if len(attempts) <= failures:
                raise _locked_file(32)
        return replace(source, target)

    monkeypatch.setattr(atomic.os, "replace", deny_applied_receipt)
    monkeypatch.setattr(atomic.time, "sleep", lambda _delay: None)
    with _client(settings, coordinator) as client:
        response = client.post("/api/anki/study/reviews", json=payload)
        assert len(set(attempts)) == 1
        if failures == 8:
            assert response.status_code == 500, response.text
            assert len(attempts) == 8
            assert read_journal(settings, payload["review_id"]).state == "prepared"
            assert client.get("/api/anki/study/status").json()["reviews"] == 0
            with factory() as session:
                assert session.scalar(select(func.count(AnkiReview.id))) == 0
            monkeypatch.setattr(atomic.os, "replace", replace)
            response = client.post("/api/anki/study/reviews", json=payload)
        else:
            assert len(attempts) == failures + 1
        assert response.status_code == 200, response.text
        assert read_journal(settings, payload["review_id"]).state == "applied"
        replay = client.post("/api/anki/study/reviews", json=payload)
        assert replay.status_code == 200 and replay.json()["already_applied"]
        assert client.get("/api/anki/study/status").json()["reviews"] == 1
        with factory() as session:
            assert session.scalar(select(func.count(AnkiReview.id))) == 1
        assert client.post("/api/anki/study/reviews/undo", json=payload).status_code == 200
        assert client.get("/api/anki/study/status").json()["reviews"] == 0
        assert client.post("/api/anki/study/reviews", json=payload).status_code == 409
    close_study_collection()
