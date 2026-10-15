# SPDX-License-Identifier: AGPL-3.0-or-later

"""Synthetic real-Anki regressions for deck selection and bounded study queues."""

from datetime import UTC, datetime, timedelta

import pytest
from anki.collection import DeckId
from anki.scheduler.v3 import Scheduler
from fastapi.testclient import TestClient

from app.anki import study_service
from app.anki.collection import open_collection, write_study_mode
from app.anki.study_repository import StudyCollection
from app.main import create_app


def _configure_limits(col, *, new=1000, review=1000):
    config = col.decks.config_dict_for_deck_id(col.decks.selected())
    config["new"]["perDay"] = new
    config["rev"]["perDay"] = review
    config["newGatherPriority"] = 0
    config["newSortOrder"] = 0
    col.decks.update_config(config)


def _add_cards(col, deck_name, count):
    deck_id = col.decks.id(deck_name)
    assert deck_id is not None
    model = col.models.by_name("Basic")
    assert model is not None
    ids = []
    for index in range(count):
        note = col.new_note(model)
        note["Front"] = f"Synthetic {deck_name} {index}"
        note["Back"] = f"Answer {index}"
        col.add_note(note, deck_id)
        ids.append(int(note.cards()[0].id))
    return int(deck_id), ids


def _client(settings, coordinator):
    write_study_mode(settings, "integrated")
    return TestClient(create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator))


def _configure_deck(col, deck_id, *, new=1000, gather=0):
    config = col.decks.add_config(f"Synthetic config {deck_id}",
                                  clone_from=col.decks.config_dict_for_deck_id(DeckId(deck_id)))
    config["new"]["perDay"] = new
    config["rev"]["perDay"] = 1000
    config["newGatherPriority"] = gather
    config["newSortOrder"] = 1  # Preserve the native gather order without another sort.
    col.decks.update_config(config)
    deck = col.decks.get(DeckId(deck_id))
    deck["conf"] = config["id"]
    col.decks.update(deck)


def _assert_selected(settings, expected):
    with open_collection(settings) as col:
        assert int(col.decks.selected()) == expected


def test_later_deck_is_resolved_before_global_100_card_limit(settings, factory, coordinator):
    with open_collection(settings) as col:
        _configure_limits(col)
        _, ids_a = _add_cards(col, "Uni::A", 101)
        deck_b, ids_b = _add_cards(col, "Uni::B", 1)
    with _client(settings, coordinator) as client:
        global_due = client.get("/api/anki/study/due").json()
        assert len(global_due["cards"]) == 100
        assert all(card["id"] in ids_a for card in global_due["cards"])
        response = client.get("/api/anki/study/due", params={"deck": "Uni::B"})
        assert response.status_code == 200, response.text
        data = response.json()
        assert [card["id"] for card in data["cards"]] == ids_b
        assert data["scope"] == {"deck_id": deck_b, "deck_name": "Uni::B", "includes_subdecks": True}
        assert data["counts"] == {"new": 1, "learning": 0, "review": 0}
        assert data["has_more"] is False
        assert global_due["has_more"] is True
        assert global_due["scope"] is None
        assert global_due["counts"] == {"new": 102, "learning": 0, "review": 0}
        a = client.get("/api/anki/study/due", params={"deck": "Uni::A"}).json()
        assert len(a["cards"]) == 100
        assert a["has_more"] is True
        assert a["counts"]["new"] == 101
        status = client.get("/api/anki/study/status").json()
        assert status["due"] == 102
        assert status["counts"]["new"] == 102
        decks = client.get("/api/anki/study/stats").json()["decks"]
        assert [deck["name"] for deck in decks] == ["Uni::A", "Uni::B"]
        assert decks[1] == {"deck_id": deck_b, "name": "Uni::B", "cards": 1,
                            "scope_cards": 1, "counts": data["counts"]}
    _assert_selected(settings, 1)


def test_parent_scope_contains_children_and_preserves_own_card_counts(settings, factory, coordinator):
    with open_collection(settings) as col:
        _configure_limits(col)
        parent, parent_ids = _add_cards(col, "Uni", 1)
        _, a_ids = _add_cards(col, "Uni::A", 2)
        deck_b, b_ids = _add_cards(col, "Uni::B", 1)
        _, child_ids = _add_cards(col, "Uni::B::Child", 1)
        _, bb_ids = _add_cards(col, "Uni::BB", 2)
    with _client(settings, coordinator) as client:
        b = client.get("/api/anki/study/due", params={"deck": "Uni::B"}).json()
        assert {card["id"] for card in b["cards"]} == set(b_ids + child_ids)
        assert b["scope"]["deck_id"] == deck_b
        all_cards = client.get("/api/anki/study/due", params={"deck": "Uni"}).json()
        assert {card["id"] for card in all_cards["cards"]} == set(parent_ids + a_ids + b_ids + child_ids + bb_ids)
        assert all_cards["scope"]["deck_id"] == parent
        assert all_cards["counts"]["new"] == 7
        decks = {deck["name"]: deck for deck in client.get("/api/anki/study/stats").json()["decks"]}
        assert decks["Uni"]["cards"] == 1
        assert decks["Uni"]["scope_cards"] == 7
        assert decks["Uni::B"]["cards"] == 1
        assert decks["Uni::B"]["scope_cards"] == 2
    _assert_selected(settings, 1)


@pytest.mark.parametrize("top_limits,expected_child", [(False, 4), (True, 2)])
def test_official_parent_daily_limits_are_not_bypassed(settings, factory, coordinator, top_limits, expected_child):
    with open_collection(settings) as col:
        _configure_limits(col)
        child, _ = _add_cards(col, "Uni::A", 6)
        parent = col.decks.id_for_name("Uni")
        assert parent is not None
        _configure_deck(col, parent, new=2)
        _configure_deck(col, child, new=4)
        col.set_config("applyAllParentLimits", top_limits)
        assert col.decks.get_deck_configs_for_update(DeckId(child)).apply_all_parent_limits == top_limits
    with _client(settings, coordinator) as client:
        parent_data = client.get("/api/anki/study/due", params={"deck": "Uni"}).json()
        child_data = client.get("/api/anki/study/due", params={"deck": "Uni::A"}).json()
        assert len(parent_data["cards"]) == parent_data["counts"]["new"] == 2
        assert len(child_data["cards"]) == child_data["counts"]["new"] == expected_child
        assert not parent_data["has_more"] and not child_data["has_more"]
        decks = client.get("/api/anki/study/stats").json()["decks"]
        assert decks[0]["counts"]["new"] == expected_child
    _assert_selected(settings, 1)


def test_zero_daily_limit_and_suspended_cards_stay_unavailable(settings, factory, coordinator):
    with open_collection(settings) as col:
        _configure_limits(col, new=0)
        deck_id, ids = _add_cards(col, "Uni::A", 3)
        for queue, card_id in zip((-1, -2), ids[:2]):
            card = col.get_card(card_id)
            card.queue = queue
            col.update_card(card)
    with _client(settings, coordinator) as client:
        data = client.get("/api/anki/study/due", params={"deck": "Uni::A"}).json()
        assert data["scope"]["deck_id"] == deck_id
        assert data["cards"] == []
        assert data["counts"] == {"new": 0, "learning": 0, "review": 0}
        assert data["has_more"] is False
        assert client.get("/api/anki/study/status").json()["cards"] == 3


def test_positive_limits_exclude_suspended_and_buried_cards(settings, factory, coordinator):
    with open_collection(settings) as col:
        _configure_limits(col)
        deck_id, ids = _add_cards(col, "Uni::A", 3)
        col.sched.suspend_cards([col.get_card(ids[1]).id])
        col.sched.bury_cards([col.get_card(ids[2]).id])
    with _client(settings, coordinator) as client:
        response = client.get("/api/anki/study/due", params={"deck": "Uni::A"})
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["scope"]["deck_id"] == deck_id
        assert [card["id"] for card in data["cards"]] == [ids[0]]
        assert data["counts"] == {"new": 1, "learning": 0, "review": 0}
        assert data["has_more"] is False
        status = client.get("/api/anki/study/status").json()
        assert status["cards"] == 3
        assert status["due"] == 1
        decks = client.get("/api/anki/study/stats").json()["decks"]
        assert decks[0]["cards"] == decks[0]["scope_cards"] == 3
        assert decks[0]["counts"] == data["counts"]
    _assert_selected(settings, 1)


def test_known_unicode_and_empty_deck_and_unknown_names_do_not_create_decks(settings, factory, coordinator):
    with open_collection(settings) as col:
        _configure_limits(col)
        unicode_id, ids = _add_cards(col, "Uni::Änalysis + β", 1)
        empty_id = col.decks.id("Empty")
        before = {int(deck.id): deck.name for deck in col.decks.all_names_and_ids()}
    with _client(settings, coordinator) as client:
        unicode = client.get("/api/anki/study/due", params={"deck": "Uni::Änalysis + β"}).json()
        assert unicode["scope"]["deck_id"] == unicode_id
        assert [card["id"] for card in unicode["cards"]] == ids
        empty = client.get("/api/anki/study/due", params={"deck": "Empty"}).json()
        assert empty["scope"]["deck_id"] == empty_id
        assert empty["cards"] == [] and not empty["has_more"]
        for name in ("Not existing", "Uni::änalysis + β", " Uni::Änalysis + β "):
            assert client.get("/api/anki/study/due", params={"deck": name}).status_code == 404
        for name in ("", "x" * 1025):
            assert client.get("/api/anki/study/due", params={"deck": name}).status_code == 422
    with open_collection(settings) as col:
        assert {int(deck.id): deck.name for deck in col.decks.all_names_and_ids()} == before
        assert int(col.decks.selected()) == 1


@pytest.mark.parametrize("failure", ["queue", "presentation"])
def test_selected_deck_is_restored_when_scoped_read_fails(settings, factory, coordinator, monkeypatch, failure):
    with open_collection(settings) as col:
        _configure_limits(col)
        _add_cards(col, "Uni::A", 1)
    def fail(*args, **kwargs):
        raise RuntimeError("Synthetic scoped failure")
    with _client(settings, coordinator) as client:
        if failure == "queue":
            monkeypatch.setattr(StudyCollection, "queue", fail)
        else:
            monkeypatch.setattr(study_service, "present_card", fail)
        with pytest.raises(RuntimeError, match="Synthetic scoped failure"):
            client.get("/api/anki/study/due", params={"deck": "Uni::A"})
    _assert_selected(settings, 1)


def test_deck_overview_does_not_build_a_queue_per_row(settings, factory, coordinator, monkeypatch):
    with open_collection(settings) as col:
        _configure_limits(col)
        for index in range(8):
            _add_cards(col, f"Uni::Deck{index}", 2)
    original = Scheduler.deck_due_tree
    calls = []
    def count_tree(self, *args, **kwargs):
        calls.append("tree")
        return original(self, *args, **kwargs)
    def forbidden_queue(*args, **kwargs):
        raise AssertionError("Deck rows must not materialize scheduler queues")
    monkeypatch.setattr(Scheduler, "deck_due_tree", count_tree)
    monkeypatch.setattr(Scheduler, "get_queued_cards", forbidden_queue)
    with _client(settings, coordinator) as client:
        status = client.get("/api/anki/study/status").json()
        assert status["due"] == 16
        stats = client.get("/api/anki/study/stats").json()
        assert len(stats["decks"]) == 8
        assert calls == ["tree", "tree"]


def test_review_uses_parent_gather_scope_and_receipt_ignores_replayed_scope(settings, factory, coordinator):
    with open_collection(settings) as col:
        _configure_limits(col)
        _, _ = _add_cards(col, "Uni::A", 3)
        child_b, b_ids = _add_cards(col, "Uni::B", 2)
        parent = col.decks.id_for_name("Uni")
        assert parent is not None
        _configure_deck(col, parent, gather=2)  # Highest position first.
        _configure_deck(col, child_b, gather=1)  # Lowest position first.
        obsolete_scope = col.decks.id("Obsolete")
        assert obsolete_scope is not None
    with _client(settings, coordinator) as client:
        parent_data = client.get("/api/anki/study/due", params={"deck": "Uni"}).json()
        child_data = client.get("/api/anki/study/due", params={"deck": "Uni::B"}).json()
        assert parent_data["cards"][0]["id"] == b_ids[1]
        assert child_data["cards"][0]["id"] == b_ids[0]
        payload = {"card_id": b_ids[1], "rating": 3, "review_id": "parent-review-one",
                   "study_deck_id": int(parent)}
        reviewed = client.post("/api/anki/study/reviews", json=payload)
        assert reviewed.status_code == 200, reviewed.text
        _assert_selected(settings, 1)
        with open_collection(settings) as col:
            col.decks.remove([obsolete_scope])
        replay = client.post("/api/anki/study/reviews", json={**payload, "study_deck_id": int(obsolete_scope)})
        assert replay.status_code == 200, replay.text
        assert replay.json()["already_applied"] is True
        replay_without_scope = client.post("/api/anki/study/reviews", json={key: value for key, value in payload.items()
                                                                         if key != "study_deck_id"})
        assert replay_without_scope.json()["already_applied"] is True
        conflict = client.post("/api/anki/study/reviews", json={**payload, "rating": 4})
        assert conflict.status_code == 409
        assert client.get("/api/anki/study/status").json()["reviews"] == 1
    _assert_selected(settings, 1)


def test_legacy_review_and_offline_scope_reject_unknown_scope_and_restore_after_conflict(
        settings, factory, coordinator):
    with open_collection(settings) as col:
        _configure_limits(col)
        deck_a, ids_a = _add_cards(col, "Uni::A", 2)
        deck_b, _ = _add_cards(col, "Uni::B", 1)
        before = len(col.decks.all_names_and_ids())
    with _client(settings, coordinator) as client:
        payload = {"card_id": ids_a[0], "rating": 3, "review_id": "legacy-review-one",
                   "offline": True, "reviewed_at": datetime.now(UTC).isoformat()}
        assert client.post("/api/anki/study/reviews", json={**payload, "study_deck_id": 99999999}).status_code == 404
        assert client.post("/api/anki/study/reviews", json={**payload, "study_deck_id": deck_b}).status_code == 409
        assert client.post("/api/anki/study/reviews", json={**payload, "study_deck_id": 0}).status_code == 422
        assert client.post("/api/anki/study/reviews", json=payload).status_code == 200
        # Existing queue entries do not need a scope field, including successful replays.
        assert client.post("/api/anki/study/reviews", json=payload).json()["already_applied"] is True
        assert client.get("/api/anki/study/status").json()["reviews"] == 1
        assert client.get("/api/anki/study/due", params={"deck": "Uni::A"}).json()["scope"]["deck_id"] == deck_a
    with open_collection(settings) as col:
        assert len(col.decks.all_names_and_ids()) == before
        assert int(col.decks.selected()) == 1


@pytest.mark.parametrize("kind", ["missing", "old", "future", "naive"])
def test_offline_time_validation_is_preserved(settings, factory, coordinator, kind):
    now = datetime.now(UTC)
    reviewed_at = {"missing": None, "old": (now - timedelta(days=8)).isoformat(),
                   "future": (now + timedelta(hours=1)).isoformat(),
                   "naive": now.replace(tzinfo=None).isoformat()}[kind]
    with open_collection(settings) as col:
        _configure_limits(col)
        deck, ids = _add_cards(col, "Uni::A", 1)
    with _client(settings, coordinator) as client:
        response = client.post("/api/anki/study/reviews", json={
            "card_id": ids[0], "rating": 3, "review_id": "invalid-offline-time", "offline": True,
            "reviewed_at": reviewed_at, "study_deck_id": deck,
        })
        assert response.status_code == 422
        assert client.get("/api/anki/study/status").json()["reviews"] == 0
    _assert_selected(settings, 1)


def test_review_restores_selection_after_scheduler_failure(settings, factory, coordinator, monkeypatch):
    with open_collection(settings) as col:
        _configure_limits(col)
        deck, ids = _add_cards(col, "Uni::A", 1)
    with _client(settings, coordinator) as client:
        def fail(*args, **kwargs):
            raise RuntimeError("Synthetic answer failure")
        monkeypatch.setattr(StudyCollection, "answer", fail)
        response = client.post("/api/anki/study/reviews", json={
            "card_id": ids[0], "rating": 3, "review_id": "failed-scope-review", "study_deck_id": deck,
        })
        assert response.status_code == 500
    _assert_selected(settings, 1)
