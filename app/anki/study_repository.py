# SPDX-License-Identifier: AGPL-3.0-or-later

"""Serialized Anki projections and review storage, without HTTP/fach decisions."""

from collections.abc import Callable, Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, cast

from anki.collection import CardId, Collection
from anki.decks import DeckId, DeckTreeNode
from anki.scheduler.v3 import Scheduler
from sqlalchemy.orm import Session

from app.anki import study_undo_repository
from app.anki.collection import open_collection
from app.anki.study_review_receipts import (
    NativeReviewIdentity,
    NativeReviewReceipt,
    review_identity,
)
from app.anki.study_review_repository import ReviewMirrorRepository
from app.anki.study_schema import StudyCounts, StudyDeck
from app.anki.study_source_repository import StudySourceRepository
from app.config import Settings


def scheduler_for(col: Collection) -> Scheduler:
    if not hasattr(col.sched, "get_queued_cards"):
        raise RuntimeError("Anki-Scheduler ist nicht verfügbar")
    return cast(Scheduler, col.sched)


def last_review_ms_batch(col: Collection, card_ids: Sequence[int]) -> dict[int, int]:
    """One grouped read for a bounded card list, preserving the existing batching."""
    if not card_ids:
        return {}
    assert col.db is not None
    placeholders = ",".join("?" for _ in card_ids)
    rows = col.db.all(f"SELECT cid, max(id) FROM revlog WHERE cid IN ({placeholders}) GROUP BY cid", *card_ids)
    return {cid: last_id for cid, last_id in rows if last_id is not None}


def card_data(col: Collection, card_id: int, last_review_ms: int | None) -> dict[str, Any]:
    """Materialize all backend data before closing the collection; HTML is still raw."""
    card = col.get_card(CardId(card_id))
    note = card.note()
    source_identity = None
    if "UniOSId" in note:
        source_identity = note["UniOSId"]
    memory = card.memory_state
    due_at = datetime.now(UTC)
    if card.queue in {1, 3}:
        due_at = datetime.fromtimestamp(card.due, UTC)
    elif card.queue == 2:
        due_at += timedelta(days=card.due - col.sched.today)
    return {
        "id": int(card.id), "note_id": int(note.id),
        "_source_identity": source_identity,
        "front_html": card.question(), "back_html": card.answer(),
        "deck": col.decks.name(card.did), "tags": list(note.tags),
        "due": card.due, "queue": card.queue,
        "fsrs": {
            "due": due_at.isoformat(),
            "stability": memory.stability if memory else 0,
            "difficulty": memory.difficulty if memory else 0,
            "elapsed_days": max(0, int((datetime.now(UTC).timestamp() * 1000 - last_review_ms) / 86400000))
            if last_review_ms else 0,
            "scheduled_days": max(0, card.ivl), "learning_steps": 0,
            "reps": card.reps, "lapses": card.lapses, "state": card.type,
            "last_review": datetime.fromtimestamp(last_review_ms / 1000, UTC).isoformat()
            if last_review_ms else None,
        },
    }


def deck_projection(col: Collection) -> tuple[list[StudyDeck], StudyCounts]:
    """One native count tree; no queue construction/HTML projection per deck row."""
    names = {int(deck.id): deck.name for deck in col.decks.all_names_and_ids()}
    tree = col.sched.deck_due_tree()
    decks: list[StudyDeck] = []

    def counts(node: DeckTreeNode) -> StudyCounts:
        return StudyCounts(new=node.new_count, learning=node.learn_count, review=node.review_count)

    def visit(node: DeckTreeNode) -> None:
        if node.deck_id > 0:
            decks.append(StudyDeck(deck_id=node.deck_id, name=names[node.deck_id],
                                   cards=node.total_in_deck, scope_cards=node.total_including_children,
                                   counts=counts(node)))
        for child in node.children:
            visit(child)

    visit(tree)
    roots = [counts(child) for child in tree.children]
    global_counts = StudyCounts(new=sum(item.new for item in roots),
                               learning=sum(item.learning for item in roots),
                               review=sum(item.review for item in roots))
    return sorted(decks, key=lambda deck: deck.name), global_counts


def collection_counts(col: Collection) -> dict[str, Any]:
    """Shared by status and existing package previews; totals are never window lengths."""
    assert col.db is not None
    _, counts = deck_projection(col)
    return {"cards": int(col.db.scalar("SELECT count(*) FROM cards") or 0),
            "notes": int(col.db.scalar("SELECT count(*) FROM notes") or 0),
            "due": counts.total, "reviews": int(col.db.scalar("SELECT count(*) FROM revlog") or 0),
            "counts": counts.model_dump()}


@dataclass(frozen=True)
class QueueSnapshot:
    ids: list[int]
    counts: StudyCounts


def root_queues(col: Collection, fetch_limit: int) -> list[QueueSnapshot]:
    selected = col.decks.selected()
    snapshots: list[QueueSnapshot] = []
    try:
        for deck in col.decks.all_names_and_ids():
            if "::" in deck.name:
                continue
            col.decks.select(DeckId(deck.id))
            queued = scheduler_for(col).get_queued_cards(fetch_limit=fetch_limit)
            snapshots.append(QueueSnapshot([int(item.card.id) for item in queued.cards],
                                           StudyCounts(new=queued.new_count, learning=queued.learning_count,
                                                       review=queued.review_count)))
    finally:
        col.decks.select(selected)
    return snapshots


def due_ids(col: Collection) -> list[int]:
    """Compatibility for existing collection-card membership projections."""
    return list(dict.fromkeys(card_id for snapshot in root_queues(col, 100) for card_id in snapshot.ids))


class StudyCollection:
    """Operations on one already locked collection; callers cannot retain lazy objects."""

    def __init__(self, col: Collection, settings: Settings, write_guard: Callable[[], None] | None = None):
        self._col = col
        self._settings = settings
        self._write_guard = write_guard

    def deck_names(self) -> dict[str, int]:
        return {deck.name: int(deck.id) for deck in self._col.decks.all_names_and_ids()}

    def has_deck(self, deck_id: int) -> bool:
        return self._col.decks.have(DeckId(deck_id))

    def select(self, deck_id: int) -> None:
        self._col.decks.select(DeckId(deck_id))

    def queue(self, fetch_limit: int) -> QueueSnapshot:
        queued = scheduler_for(self._col).get_queued_cards(fetch_limit=fetch_limit)
        return QueueSnapshot([int(item.card.id) for item in queued.cards],
                             StudyCounts(new=queued.new_count, learning=queued.learning_count,
                                         review=queued.review_count))

    def root_queues(self, fetch_limit: int) -> list[QueueSnapshot]:
        return root_queues(self._col, fetch_limit)

    def global_counts(self) -> StudyCounts:
        return deck_projection(self._col)[1]

    def card_deck(self, card_id: int) -> int:
        return int(self._col.get_card(CardId(card_id)).did)

    def cards(self, ids: Sequence[int]) -> list[dict[str, Any]]:
        reviews = last_review_ms_batch(self._col, ids)
        return [card_data(self._col, card_id, reviews.get(card_id)) for card_id in ids]

    def summary(self) -> dict[str, Any]:
        return collection_counts(self._col)

    def statistics(self, settings: Settings) -> dict[str, Any]:
        assert self._col.db is not None
        today = datetime.now(settings.timezone).date()
        first = today - timedelta(days=6)
        start_ms = int(datetime.combine(first, datetime.min.time(), settings.timezone).timestamp() * 1000)
        daily = {str(first + timedelta(days=offset)): 0 for offset in range(7)}
        remembered = total = 0
        for reviewed_ms, ease in self._col.db.all("SELECT id, ease FROM revlog WHERE id >= ?", start_ms):
            day = str(datetime.fromtimestamp(reviewed_ms / 1000, settings.timezone).date())
            if day in daily:
                daily[day] += 1
            remembered += ease >= 2
            total += 1
        decks, _ = deck_projection(self._col)
        return {"daily_reviews": [{"day": day, "count": count} for day, count in daily.items()],
                "retention": round(remembered / total, 3) if total else None,
                "decks": [deck for deck in decks if deck.cards > 0]}

    def receipt(self, review_id: str) -> NativeReviewReceipt | None:
        return study_undo_repository.receipt(self._settings, self._col, review_id, self._write_guard)

    def review_identity(self, card_id: int) -> NativeReviewIdentity:
        return review_identity(self._col, card_id)

    def answer(self, card_id: int, rating: int, review_id: str) -> NativeReviewReceipt:
        return study_undo_repository.answer(self._settings, self._col, card_id, rating, review_id, self._write_guard)

    def undo(self, review_id: str, card_id: int, rating: int) -> tuple[NativeReviewReceipt, bool]:
        return study_undo_repository.undo(self._settings, self._col, review_id, card_id, rating, self._write_guard)


class StudyRepository:
    def __init__(self, settings: Settings, factory: Callable[[], Session]):
        self.settings = settings
        self._factory = factory
        self.sources = StudySourceRepository(factory)
        self.reviews = ReviewMirrorRepository(factory)

    @contextmanager
    def transaction(self, write_guard: Callable[[], None] | None = None) -> Iterator[StudyCollection]:
        with open_collection(self.settings, preserve_study_undo=True, access_guard=write_guard) as col:
            selected = col.decks.selected()
            try:
                yield StudyCollection(col, self.settings, write_guard)
            finally:
                col.decks.select(selected)
                anchor = study_undo_repository.undo_anchor(col)
                if anchor is not None and col.undo_status().undo and int(col.undo_status().last_step) != anchor[1]:
                    # Study projections only select/restore decks. Keep those harmless
                    # selection steps inside the concrete answer's native undo entry.
                    col.merge_undo_entries(anchor[1])
