# SPDX-License-Identifier: AGPL-3.0-or-later
"""Receipt-first retries and checked note selection provenance for Basic cards."""

import re

from filelock import Timeout
from sqlalchemy.exc import IntegrityError

from app.anki.api import _slug
from app.anki.card_schema import StoredCardData, parse_stored_card
from app.anki.collection import study_mode
from app.anki.manual_repository import ManualCardRecord
from app.anki.manual_service import ManualCardError
from app.anki.note_repository import NoteCardRepository
from app.anki.note_schema import NoteCardInput, NoteCardResponse, NoteCardSource
from app.anki.transfer_service import TransferError, TransferService
from app.config import Settings
from app.notes.store import NoteError


def _normalized(value: str) -> str:
    return " ".join(value.split())


def _inline_text(value: str) -> str:
    code: list[str] = []

    def preserve_code(match: re.Match[str]) -> str:
        code.append(match[2])
        return f"\x00{len(code) - 1}\x00"

    value = re.sub(r"(`+)([^\n]*?)\1", preserve_code, value)
    value = re.sub(r"!?\[([^\]]+)\]\([^\n)]*\)", r"\1", value)
    # Remove paired marks only. An underscore in an identifier or a literal
    # multiplication star is text and must not become different source content.
    for _ in range(3):
        value = re.sub(r"(?<!\\)(\*\*|__|~~|\*|_)(?=\S)(.*?\S)\1", r"\2", value)
    value = re.sub(r"\\([\\`*_{}\[\]()#+\-.!>~])", r"\1", value)
    return re.sub(r"\x00(\d+)\x00", lambda match: code[int(match[1])], value)


def _note_text(body: str) -> str:
    lines: list[str] = []
    fence: str | None = None
    for line in body.splitlines():
        if fence is not None:
            if re.fullmatch(r"[ \t]{0,3}" + re.escape(fence[0]) + "{" + str(len(fence)) + r",}[ \t]*", line):
                fence = None
            else:
                lines.append(line)
            continue
        opening = re.match(r"^[ \t]{0,3}(`{3,}|~{3,})", line)
        if opening is not None:
            fence = opening[1]
            continue
        line = re.sub(r"^[ \t]*(?:>[ \t]?)+", "", line)
        line = re.sub(r"^[ \t]*#{1,6}[ \t]+", "", line)
        line = re.sub(r"^[ \t]*(?:[-+*]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?", "", line)
        lines.append(_inline_text(line))
    return "\n".join(lines)


def selected_note_text(body: str, quote: str) -> bool:
    """Accept raw Markdown or its conservative text representation.

    Inline marks, list prefixes and link destinations are not browser selection
    text. This does not interpret formulas or code, or infer a PDF provenance.
    """
    target = _normalized(quote)
    if target in _normalized(body):
        return True
    return target in _normalized(_note_text(body))


class NoteCardService:
    def __init__(self, settings: Settings, repository: NoteCardRepository, transfer: TransferService):
        self._settings = settings
        self._repository = repository
        self._transfer = transfer

    @staticmethod
    def _require(record: ManualCardRecord | None) -> ManualCardRecord:
        if record is None or record.origin != "manual" or not record.source_snapshot:
            raise ManualCardError(404, "Eigene Notizkarte nicht gefunden")
        if record.status not in {"approved", "pushed"} or record.mutation_id is None:
            raise ManualCardError(409, "Gespeicherte Notizkarte ist unvollständig")
        source = record.source_snapshot.get("source")
        if not isinstance(source, dict) or source.get("kind") != "note":
            raise ManualCardError(404, "Eigene Notizkarte nicht gefunden")
        return record

    def _replay(self, record: ManualCardRecord, payload: NoteCardInput) -> ManualCardRecord:
        # A UUID collision with another source kind is a conflict, not a new card.
        if not record.source_snapshot or record.source_snapshot.get("request") != payload.model_dump(mode="json"):
            raise ManualCardError(409, "Diese Speicherkennung wurde bereits für anderen Inhalt verwendet",
                                  "MANUAL_MUTATION_CONFLICT")
        return self._require(record)

    def _response(self, record: ManualCardRecord, error: str | None = None) -> NoteCardResponse:
        record = self._require(record)
        assert record.source_snapshot is not None
        try:
            source = NoteCardSource.model_validate(record.source_snapshot["source"])
            card = parse_stored_card(record.payload, record.origin)
        except (KeyError, ValueError) as exc:
            raise ManualCardError(409, "Gespeicherte Notizkarte ist unvollständig") from exc
        return NoteCardResponse(queue_id=record.queue_id,
            status="pushed" if record.status == "pushed" else "approved", card=card, source=source,
            deck_name=f"Uni::{source.course_name}", note_id=record.note_id, transfer_error=error)

    def get(self, queue_id: int) -> NoteCardResponse:
        with self._repository.read() as transaction:
            record = self._require(transaction.by_id(queue_id))
        return self._response(record)

    def transfer(self, queue_id: int) -> NoteCardResponse:
        with self._repository.read() as transaction:
            record = self._require(transaction.by_id(queue_id))
        return self._finish(record)

    def _finish(self, record: ManualCardRecord) -> NoteCardResponse:
        error = None
        if record.status == "approved" and study_mode(self._settings) == "integrated":
            try:
                error = self._transfer.transfer(record.queue_id).error
            except TransferError as exc:
                error = exc.detail
            with self._repository.read() as transaction:
                record = self._require(transaction.by_id(record.queue_id))
        return self._response(record, error)

    def create(self, payload: NoteCardInput) -> NoteCardResponse:
        mutation_id = str(payload.mutation_id)
        with self._repository.read() as transaction:
            existing = transaction.by_mutation(mutation_id)
        if existing is not None:
            return self._finish(self._replay(existing, payload))
        try:
            with self._repository.write_for_note(str(payload.source.note_id)) as transaction:
                existing = transaction.by_mutation(mutation_id)
                if existing is not None:
                    record = self._replay(existing, payload)
                else:
                    rows = transaction.note_source(str(payload.source.note_id), payload.source.revision)
                    if rows.note.deleted_at is not None or rows.course is None:
                        raise ManualCardError(404, "Notiz oder Kurs nicht gefunden")
                    if rows.note.current_revision != payload.source.revision or not selected_note_text(rows.body, payload.source.quote):
                        raise ManualCardError(409, "Notiz oder Auswahl wurde inzwischen geändert; bitte neu öffnen",
                                              "MANUAL_SOURCE_CHANGED")
                    source = NoteCardSource(note_id=payload.source.note_id, note_title=rows.version.title,
                        revision=rows.version.revision, sha256=rows.version.sha256, course_id=rows.course.id,
                        course_name=rows.course.name, quote=payload.source.quote,
                        url=f"/notes?id={rows.note.id}&revision={rows.version.revision}")
                    card = StoredCardData(card_type="basic", front=payload.front, back=payload.back,
                        course=_slug(rows.course.short_name or rows.course.name)[:200], topic=payload.topic)
                    record = transaction.save(resource_id=None, version_id=None, mutation_id=mutation_id,
                        course_id=rows.course.id, topic=payload.topic, payload=card.model_dump_json(exclude_none=True),
                        snapshot={"request": payload.model_dump(mode="json"), "source": source.model_dump(mode="json")})
        except IntegrityError:
            with self._repository.read() as transaction:
                existing = transaction.by_mutation(mutation_id)
            if existing is None:
                raise ManualCardError(409, "Notizkarte konnte nicht eindeutig gespeichert werden") from None
            record = self._replay(existing, payload)
        except Timeout:
            raise ManualCardError(503, "Notiz wird gerade gespeichert; bitte erneut versuchen") from None
        except NoteError as exc:
            raise ManualCardError(409, str(exc), "MANUAL_SOURCE_CHANGED") from exc
        return self._finish(record)
