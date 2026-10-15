# SPDX-License-Identifier: AGPL-3.0-or-later

"""Materialized native identity and exact review receipts, including legacy rows."""

from dataclasses import dataclass

from anki.collection import CardId, Collection, NoteId

from app.anki.card_schema import is_manual_note_marker


@dataclass(frozen=True)
class NativeReviewIdentity:
    note_id: str
    source_identity: str | None
    matching_manual_notes: tuple[str, ...] = ()


@dataclass(frozen=True)
class NativeReviewReceipt:
    review_id: str
    card_id: int
    rating: int
    note_id: str | None = None
    source_identity: str | None = None
    revlog_id: int | None = None


def review_identity(col: Collection, card_id: int) -> NativeReviewIdentity:
    note = col.get_card(CardId(card_id)).note()
    identity = dict(note.items()).get("UniOSId")
    matches: tuple[str, ...] = ()
    if is_manual_note_marker(identity):
        matches = tuple(str(note_id) for note_id in col.find_notes(f'"UniOSId:{identity}"')
                        if dict(col.get_note(NoteId(note_id)).items()).get("UniOSId") == identity)
    return NativeReviewIdentity(str(note.id), identity, matches)


def ensure_receipt_schema(col: Collection) -> None:
    assert col.db is not None
    if not col.db.scalar("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'unios_review_receipts'"):
        col.db.execute("CREATE TABLE unios_review_receipts "
                       "(review_id TEXT PRIMARY KEY, card_id INTEGER NOT NULL, rating INTEGER NOT NULL)")
    columns = set(col.db.list("SELECT name FROM pragma_table_info('unios_review_receipts')"))
    # No rebuild: old three-field rows retain NULL metadata and remain acknowledgements.
    for name, kind in (("note_id", "TEXT"), ("source_identity", "TEXT"), ("revlog_id", "INTEGER")):
        if name not in columns:
            col.db.execute(f"ALTER TABLE unios_review_receipts ADD COLUMN {name} {kind}")


def read_receipt(col: Collection, review_id: str) -> NativeReviewReceipt | None:
    ensure_receipt_schema(col)
    assert col.db is not None
    row = col.db.first("SELECT card_id, rating, note_id, source_identity, revlog_id "
                       "FROM unios_review_receipts WHERE review_id = ?", review_id)
    return NativeReviewReceipt(review_id, int(row[0]), int(row[1]), row[2], row[3],
                               int(row[4]) if row[4] is not None else None) if row is not None else None
