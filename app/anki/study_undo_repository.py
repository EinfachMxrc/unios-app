# SPDX-License-Identifier: AGPL-3.0-or-later

"""Durable native review receipts that preserve Anki's official undo operation.

SQL writes clear Anki's undo manager. A fsynced, versioned receipt is therefore
written inside the native transaction before its commit and materialized into
the existing receipt table before collection close/snapshot. Undo and the SQL
tombstone share a native transaction; UUID replay can never reapply the answer.
"""

import hashlib
import json
import os
from collections.abc import Callable
from pathlib import Path
from typing import Literal, cast
from uuid import uuid4
from weakref import WeakKeyDictionary

from anki.collection import CardId, Collection
from pydantic import BaseModel, Field, field_validator

from app.anki.study_review_receipts import (
    NativeReviewReceipt,
    ensure_receipt_schema,
    read_receipt,
    review_identity,
)
from app.config import Settings
from app.files.atomic import replace_atomic
from app.files.localpath import native_path, resolve_local


class ReviewJournalError(Exception):
    pass


class UndoUnavailableError(ReviewJournalError):
    """The exact native answer still exists, but its ephemeral undo step does not."""

    def __init__(self, receipt: NativeReviewReceipt):
        super().__init__("Nur die letzte Bewertung dieser unveränderten Lernsitzung kann zurückgenommen werden")
        self.receipt = receipt


_anchors: WeakKeyDictionary[Collection, tuple[str, int]] = WeakKeyDictionary()


def undo_anchor(col: Collection) -> tuple[str, int] | None:
    return _anchors.get(col)


class ReviewJournal(BaseModel):
    version: Literal[1] = 1
    revision: int = Field(ge=1)
    state: Literal["prepared", "applied", "undone"]
    review_id: str = Field(min_length=8, max_length=100)
    card_id: int = Field(gt=0)
    rating: int = Field(ge=1, le=4)
    note_id: str
    source_identity: str | None
    collection_id: str = Field(pattern=r"^[0-9a-f-]{36}$")
    before_hash: str
    previous_reviews: list[int] = Field(max_length=50000)
    revlog_id: int | None = None

    def receipt(self) -> NativeReviewReceipt:
        return NativeReviewReceipt(self.review_id, self.card_id, self.rating,
                                   self.note_id, self.source_identity, self.revlog_id)


def _directory(settings: Settings) -> Path:
    directory = settings.local_dir / "anki" / "review-actions"
    physical = native_path(directory)
    if (physical.is_symlink() or physical.parent.is_symlink() or
            not resolve_local(physical).is_relative_to(resolve_local(settings.local_dir))):
        raise ReviewJournalError("Bewertungsablage liegt außerhalb der lokalen Collection")
    # The receipt's SHA256 basename and its UUID temporary name can exceed
    # Windows MAX_PATH even when the native collection itself has a short path.
    # All journal reads/globs/atomic writes use the same physical directory;
    # its containment check compares portable resolved paths without the prefix.
    return physical


def _path(settings: Settings, review_id: str) -> Path:
    return _directory(settings) / f"{hashlib.sha256(review_id.encode()).hexdigest()}.json"


def read_journal(settings: Settings, review_id: str) -> ReviewJournal | None:
    path = _path(settings, review_id)
    if path.is_symlink():
        raise ReviewJournalError("Bewertungsbeleg darf keine Verknüpfung sein")
    if not path.exists():
        return None
    if path.stat().st_size > 1024 * 1024:
        raise ReviewJournalError("Bewertungsbeleg ist zu groß")
    journal = ReviewJournal.model_validate_json(path.read_bytes())
    if journal.review_id != review_id:
        raise ReviewJournalError("Bewertungsbeleg ist nicht eindeutig")
    return journal


def write_journal(settings: Settings, journal: ReviewJournal, *, previous: int | None) -> None:
    existing = read_journal(settings, journal.review_id)
    if (existing.revision if existing else None) != previous:
        raise ReviewJournalError("Bewertungsbeleg wurde gleichzeitig verändert")
    path = _path(settings, journal.review_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = journal.model_dump_json()
    if len(payload.encode()) > 1024 * 1024:
        raise ReviewJournalError("Bewertungsbeleg ist zu groß")
    temporary = path.with_suffix(f".{uuid4().hex}.tmp")
    try:
        with temporary.open("x", encoding="utf-8") as output:
            output.write(payload)
            output.flush()
            os.fsync(output.fileno())
        replace_atomic(temporary, path)
        # POSIX directory durability; Windows atomically replaces the same-volume file.
        if os.name != "nt":
            descriptor = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
    finally:
        temporary.unlink(missing_ok=True)


def _card_hash(col: Collection, card_id: int) -> str:
    assert col.db is not None
    row = col.db.first("SELECT * FROM cards WHERE id = ?", card_id)
    return hashlib.sha256(json.dumps(row, separators=(",", ":")).encode()).hexdigest()


def _review_rows(col: Collection, card_id: int) -> list[int]:
    assert col.db is not None
    return [int(value) for value in col.db.list("SELECT id FROM revlog WHERE cid = ? ORDER BY id", card_id)]


def _collection_identity(col: Collection, *, create: bool = False) -> str | None:
    identity = col.get_config("unios_review_collection_identity")
    if identity is None and create:
        identity = str(uuid4())
        col.set_config("unios_review_collection_identity", identity)
    if identity is not None and (not isinstance(identity, str) or len(identity) != 36):
        raise ReviewJournalError("Lokale Collection-Kennung ist ungültig")
    return identity


def receipt(settings: Settings, col: Collection, review_id: str,
            write_guard: Callable[[], None] | None = None) -> NativeReviewReceipt | None:
    journal = read_journal(settings, review_id)
    stored = read_receipt(col, review_id)
    if journal is None:
        return stored
    if journal.collection_id != _collection_identity(col):
        if stored is not None:
            return stored  # The verified restored collection owns its own receipts.
        raise ReviewJournalError("Bewertungsbeleg gehört zu einer anderen lokalen Collection")
    if journal.state == "undone":
        return NativeReviewReceipt(review_id, journal.card_id, -journal.rating,
                                   journal.note_id, journal.source_identity, journal.revlog_id)
    if stored is not None:
        return stored
    if journal.state == "prepared":
        if (_card_hash(col, journal.card_id) == journal.before_hash and
                _review_rows(col, journal.card_id) == journal.previous_reviews):
            return None  # The native transaction did not apply this prepared answer.
        raise ReviewJournalError("Unvollständiger Bewertungsbeleg; Lernverlauf bitte prüfen")
    assert col.db is not None
    row = col.db.first("SELECT cid, ease FROM revlog WHERE id = ?", journal.revlog_id)
    if row is None or (int(row[0]), int(row[1])) != (journal.card_id, journal.rating):
        if (row is None and _card_hash(col, journal.card_id) == journal.before_hash and
                _review_rows(col, journal.card_id) == journal.previous_reviews):
            if write_guard is not None:
                write_guard()
            write_journal(settings, journal.model_copy(update={"state": "prepared", "revision": journal.revision + 1}),
                          previous=journal.revision)
            return None
        raise ReviewJournalError("Bewertungsbeleg und Anki-Verlauf stimmen nicht überein")
    return journal.receipt()


def answer(settings: Settings, col: Collection, card_id: int, rating: int, review_id: str,
           write_guard: Callable[[], None] | None = None) -> NativeReviewReceipt:
    if write_guard is not None:
        write_guard()
    ensure_receipt_schema(col)
    assert col.db is not None
    db = col.db
    identity = review_identity(col, card_id)
    collection_id = _collection_identity(col, create=True)
    assert collection_id is not None
    previous = read_journal(settings, review_id)
    if previous is not None and (previous.card_id, previous.rating) != (card_id, rating):
        raise ReviewJournalError("Bewertungskennung wurde anders verwendet")
    journal = ReviewJournal(revision=(previous.revision + 1 if previous else 1), state="prepared",
                            review_id=review_id, card_id=card_id, rating=rating, note_id=identity.note_id,
                            source_identity=identity.source_identity, before_hash=_card_hash(col, card_id),
                            collection_id=collection_id, previous_reviews=_review_rows(col, card_id))
    write_journal(settings, journal, previous=previous.revision if previous else None)
    _anchors.pop(col, None)
    applied: ReviewJournal | None = None

    def apply() -> None:
        nonlocal applied
        if write_guard is not None:
            write_guard()
        card = col.get_card(CardId(card_id))
        card.start_timer()
        col.sched.answerCard(card, cast(Literal[1, 2, 3, 4], rating))
        added = [value for value in _review_rows(col, card_id) if value not in journal.previous_reviews]
        if len(added) != 1 or int(db.scalar("SELECT ease FROM revlog WHERE id = ?", added[0])) != rating:
            raise ReviewJournalError("Native Bewertung hat keine eindeutige Verlaufskennung")
        applied = journal.model_copy(update={"revision": journal.revision + 1, "state": "applied", "revlog_id": added[0]})
        write_journal(settings, applied, previous=journal.revision)
        if write_guard is not None:
            write_guard()  # Still inside the native transaction, immediately before commit.

    try:
        db.transact(apply)
    except Exception:
        if write_guard is not None:
            write_guard()
        # A failed native transaction must leave a retryable prepared receipt.
        current = read_journal(settings, review_id)
        if current is not None and current.state == "applied" and _review_rows(col, card_id) == journal.previous_reviews:
            write_journal(settings, journal.model_copy(update={"revision": current.revision + 1}),
                          previous=current.revision)
        raise
    assert applied is not None
    _anchors[col] = review_id, int(col.undo_status().last_step)
    return applied.receipt()


def materialize_receipts(settings: Settings, col: Collection) -> None:
    """Preserve the established receipt format for snapshots, imports and restarts."""
    directory = _directory(settings)
    if not directory.exists():
        return
    ensure_receipt_schema(col)
    assert col.db is not None
    for path in directory.glob("*.json"):
        if path.is_symlink() or path.stat().st_size > 1024 * 1024:
            raise ReviewJournalError("Bewertungsbeleg ist ungültig")
        journal = ReviewJournal.model_validate_json(path.read_bytes())
        if journal.collection_id != _collection_identity(col):
            continue
        if journal.state != "applied" or read_receipt(col, journal.review_id) is not None:
            continue
        row = col.db.first("SELECT cid, ease FROM revlog WHERE id = ?", journal.revlog_id)
        if row is None or (int(row[0]), int(row[1])) != (journal.card_id, journal.rating):
            continue  # An incomplete/ambiguous journal is never acknowledged.
        col.db.execute("INSERT INTO unios_review_receipts "
                       "(review_id, card_id, rating, note_id, source_identity, revlog_id) VALUES (?, ?, ?, ?, ?, ?)",
                       journal.review_id, journal.card_id, journal.rating, journal.note_id,
                       journal.source_identity, journal.revlog_id)


def undo(settings: Settings, col: Collection, review_id: str, card_id: int, rating: int,
         write_guard: Callable[[], None] | None = None) -> tuple[NativeReviewReceipt, bool]:
    """Undo exactly this final review, or durably cancel its not-yet-applied UUID."""
    if write_guard is not None:
        write_guard()
    stored = receipt(settings, col, review_id, write_guard)
    journal = read_journal(settings, review_id)
    if journal is not None and journal.collection_id != _collection_identity(col):
        journal = None
    if stored is not None and (stored.card_id != card_id or abs(stored.rating) != rating):
        raise ReviewJournalError("Bewertungskennung wurde anders verwendet")
    ensure_receipt_schema(col)
    assert col.db is not None
    db = col.db
    if stored is not None and stored.rating < 0:
        if stored.revlog_id is not None and col.db.scalar("SELECT 1 FROM revlog WHERE id = ?", stored.revlog_id):
            raise ReviewJournalError("Rücknahmebeleg wartet auf Prüfung des Anki-Verlaufs")
        if journal is not None and journal.state != "undone":
            if write_guard is not None:
                write_guard()
            write_journal(settings, journal.model_copy(update={"state": "undone", "revision": journal.revision + 1}),
                          previous=journal.revision)
        return (journal.receipt() if journal else stored), True
    if stored is not None:
        anchor = undo_anchor(col)
        if (journal is None or journal.state != "applied" or anchor is None or anchor[0] != review_id or
                not col.undo_status().undo or int(col.undo_status().last_step) != anchor[1]):
            native = db.first("SELECT cid, ease FROM revlog WHERE id = ?", stored.revlog_id)
            if native is not None and (int(native[0]), int(native[1])) == (card_id, rating):
                raise UndoUnavailableError(stored)
            raise ReviewJournalError("Nur die letzte Bewertung dieser unveränderten Lernsitzung kann zurückgenommen werden")
    original = stored or NativeReviewReceipt(review_id, card_id, rating)
    _anchors.pop(col, None)

    def apply() -> None:
        if write_guard is not None:
            write_guard()
        if stored is not None:
            col.undo()
            if db.scalar("SELECT 1 FROM revlog WHERE id = ?", original.revlog_id):
                raise ReviewJournalError("Anki hat die gewählte Bewertung nicht zurückgenommen")
        # Negative rating is a cancellation tombstone in the existing internal table.
        # It is never a native revlog rating or a displayed/mirrored review.
        db.execute("INSERT INTO unios_review_receipts "
                       "(review_id, card_id, rating, note_id, source_identity, revlog_id) VALUES (?, ?, ?, ?, ?, ?) "
                       "ON CONFLICT(review_id) DO UPDATE SET rating = excluded.rating",
                       review_id, card_id, -rating, original.note_id, original.source_identity, original.revlog_id)
        if write_guard is not None:
            write_guard()
    db.transact(apply)
    # The native tombstone already commits atomically with scheduler undo.
    # A sidecar failure here is safely retried from that authoritative tombstone.
    if journal is not None:
        if write_guard is not None:
            write_guard()
        write_journal(settings, journal.model_copy(update={"state": "undone", "revision": journal.revision + 1}),
                      previous=journal.revision)
    return original, False


class ArchivedReview(BaseModel):
    review_id: str = Field(min_length=8, max_length=100)
    card_id: int = Field(gt=0)
    rating: int = Field(ge=-4, le=4)
    note_id: str | None = None
    source_identity: str | None = None
    revlog_id: int | None = Field(default=None, gt=0)

    @field_validator("rating")
    @classmethod
    def require_answer_or_tombstone(cls, value: int) -> int:
        if value == 0:
            raise ValueError("Unbekannte Bewertung")
        return value


class ReviewArchive(BaseModel):
    version: Literal[1] = 1
    package_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    receipts: list[ArchivedReview] = Field(max_length=200000)


def export_receipts(col: Collection, path: Path, package_sha256: str, settings: Settings | None = None) -> None:
    """APKG excludes custom SQLite tables; handoff preserves them explicitly."""
    ensure_receipt_schema(col)
    assert col.db is not None
    rows = col.db.all("SELECT review_id, card_id, rating, note_id, source_identity, revlog_id "
                      "FROM unios_review_receipts ORDER BY review_id")
    receipts = {row[0]: ArchivedReview(review_id=row[0], card_id=row[1], rating=row[2], note_id=row[3],
                                       source_identity=row[4], revlog_id=row[5]) for row in rows}
    # A live study handle may have durable, confirmed journals that have not
    # been materialized yet. Read them without SQL writes, preserving native undo.
    if settings is not None:
        directory = _directory(settings)
        if directory.exists():
            for journal_path in directory.glob("*.json"):
                if journal_path.is_symlink() or journal_path.stat().st_size > 1024 * 1024:
                    raise ReviewJournalError("Bewertungsbeleg ist ungültig")
                journal = ReviewJournal.model_validate_json(journal_path.read_bytes())
                if journal.collection_id != _collection_identity(col) or journal.state != "applied":
                    continue
                native = col.db.first("SELECT cid, ease FROM revlog WHERE id = ?", journal.revlog_id)
                if native is None or (int(native[0]), int(native[1])) != (journal.card_id, journal.rating):
                    continue  # Rolled-back or ambiguous sidecars are never confirmations.
                candidate = ArchivedReview(**journal.receipt().__dict__)
                existing = receipts.get(journal.review_id)
                if existing is not None and existing != candidate:
                    raise ReviewJournalError("Bewertungsbeleg und Collection-Archiv stimmen nicht überein")
                receipts[journal.review_id] = candidate
    archive = ReviewArchive(package_sha256=package_sha256, receipts=sorted(receipts.values(), key=lambda row: row.review_id))
    with path.open("x", encoding="utf-8") as output:
        output.write(archive.model_dump_json())
        output.flush()
        os.fsync(output.fileno())


def import_receipts(col: Collection, path: Path, package_sha256: str) -> None:
    """Only a verified sidecar belonging to this exact staged package is applied."""
    if path.is_symlink() or path.stat().st_size > 50 * 1024 * 1024:
        raise ReviewJournalError("Anki-Bewertungsarchiv ist ungültig oder zu groß")
    archive = ReviewArchive.model_validate_json(path.read_bytes())
    if archive.package_sha256 != package_sha256 or len({row.review_id for row in archive.receipts}) != len(archive.receipts):
        raise ReviewJournalError("Anki-Paket und Bewertungsarchiv gehören nicht zusammen")
    ensure_receipt_schema(col)
    assert col.db is not None
    db = col.db

    def apply() -> None:
        for receipt in archive.receipts:
            native = db.first("SELECT cid, ease FROM revlog WHERE id = ?", receipt.revlog_id) if receipt.revlog_id else None
            if native is not None and (receipt.rating < 0 or
                    (int(native[0]), int(native[1])) != (receipt.card_id, receipt.rating)):
                raise ReviewJournalError("Anki-Bewertungsarchiv widerspricht dem nativen Verlauf")
            stored = read_receipt(col, receipt.review_id)
            expected = NativeReviewReceipt(**receipt.model_dump())
            if stored is not None and stored != expected:
                raise ReviewJournalError("Anki-Bewertungskennung ist im übernommenen Archiv nicht eindeutig")
            if stored is None:
                db.execute("INSERT INTO unios_review_receipts "
                           "(review_id, card_id, rating, note_id, source_identity, revlog_id) VALUES (?, ?, ?, ?, ?, ?)",
                           receipt.review_id, receipt.card_id, receipt.rating, receipt.note_id,
                           receipt.source_identity, receipt.revlog_id)

    db.transact(apply)
