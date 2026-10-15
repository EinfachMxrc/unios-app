# SPDX-License-Identifier: AGPL-3.0-or-later

"""Target one approved queue row; stable note identity recovers partial commits."""

import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

from anki.collection import Collection
from anki.errors import AnkiException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.anki.card_schema import CardOrigin, manual_note_marker, parse_stored_card
from app.anki.collection import add_approved_note, open_collection, study_mode
from app.anki.note_schema import NoteCardSource
from app.anki.transfer_repository import TransferRepository
from app.config import Settings
from app.db.models import AnkiCardQueue
from app.host.lease import HostCoordinator

log = logging.getLogger(__name__)


class TransferError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class TransferResult:
    queue_id: int
    status: Literal["approved", "pushed"]
    note_id: int | None = None
    error: str | None = None


class TransferService:
    def __init__(self, settings: Settings, factory: Callable[[], Session],
                 coordinator: HostCoordinator | None = None):
        self._settings = settings
        self._repository = TransferRepository(factory)
        self._coordinator = coordinator

    def _assert_writer(self) -> None:
        if self._coordinator is not None:
            self._coordinator.assert_writer()

    def _read_status(self, queue_id: int) -> TransferResult:
        with self._repository.transaction() as session:
            target = self._repository.target(session, queue_id)
            if target is None or (target[1] is not None and target[1].group_category == "other_group"):
                raise TransferError(404, "Gespeicherte Karte nicht gefunden")
            item = target[0]
            if item.status not in {"approved", "pushed"}:
                raise TransferError(409, "Karte ist nicht freigegeben")
            bindings = self._repository.bindings(session, item.id)
            if len(bindings) > 1 or (item.status == "pushed" and not bindings):
                raise TransferError(409, "Anki-Zuordnung ist nicht eindeutig")
            return TransferResult(item.id, "pushed" if item.status == "pushed" else "approved",
                                  int(bindings[0].note_id) if bindings else None)

    @staticmethod
    def _manual_context(item: AnkiCardQueue) -> tuple[str, str]:
        source = item.source_snapshot.get("source") if isinstance(item.source_snapshot, dict) else None
        if isinstance(source, dict) and source.get("kind") == "note":
            try:
                note_source = NoteCardSource.model_validate(source)
            except ValueError as exc:
                raise TransferError(409, "Gespeicherte Notizquelle ist nicht eindeutig") from exc
            if item.resource_id is not None or item.source_version_id is not None:
                raise TransferError(409, "Notizquelle enthält eine unerwartete PDF-Zuordnung")
            return note_source.course_name, f"{note_source.note_title} · Notiz v{note_source.revision}"
        if (not isinstance(source, dict) or not isinstance(source.get("course_name"), str)
                or not source["course_name"].strip() or not isinstance(source.get("resource_name"), str)
                or not source["resource_name"].strip() or source.get("version_id") != item.source_version_id):
            raise TransferError(409, "Gespeicherte Kartenquelle ist nicht eindeutig")
        return source["course_name"], source["resource_name"]

    def _transfer_native(self, queue_id: int, collection: Collection) -> TransferResult:
        self._assert_writer()
        with self._repository.transaction(write=True) as session:
            target = self._repository.target(session, queue_id)
            if target is None or (target[1] is not None and target[1].group_category == "other_group"):
                raise TransferError(404, "Gespeicherte Karte nicht gefunden")
            item, resource, course = target
            bindings = self._repository.bindings(session, item.id)
            if len(bindings) > 1:
                raise TransferError(409, "Anki-Zuordnung ist nicht eindeutig")
            existing = bindings[0] if bindings else None
            if item.status == "pushed":
                if existing is None:
                    raise TransferError(409, "Anki-Zuordnung fehlt")
                return TransferResult(item.id, "pushed", int(existing.note_id))
            if item.status != "approved":
                raise TransferError(409, "Karte ist nicht freigegeben")
            try:
                card = parse_stored_card(item.payload, item.origin)
            except ValueError as exc:
                raise TransferError(422, "Gespeicherter Karteninhalt ist ungültig") from exc
            origin: CardOrigin = "manual" if item.origin == "manual" else "ai"
            course_name, source_file = course.name, resource.name if resource else ""
            if origin == "manual":
                course_name, source_file = self._manual_context(item)
                source = (item.source_snapshot or {})["source"]
                if source.get("page") != card.source_page or item.mutation_id is None:
                    raise TransferError(409, "Gespeicherte Kartenquelle passt nicht zum Inhalt")
                try:
                    manual_note_marker(item.mutation_id)
                except ValueError as exc:
                    raise TransferError(409, "Gespeicherte Kartenkennung ist ungültig") from exc
            try:
                note_id = add_approved_note(
                    collection, queue_id=item.id, card_type=card.card_type, front=card.front, back=card.back,
                    course=course_name, topic=card.topic, semester=self._repository.semester_name(session, course),
                    source_file=source_file, source_page=card.source_page, origin=origin,
                    mutation_id=item.mutation_id,
                )
            except ValueError as exc:
                raise TransferError(409, str(exc)) from exc
            other = self._repository.binding_for_note(session, note_id)
            if other is not None and other.queue_id != item.id:
                raise TransferError(409, "Anki-Notiz ist bereits einer anderen Karte zugeordnet")
            if existing is not None and existing.note_id != str(note_id):
                raise TransferError(409, "Anki-Zuordnung hat sich geändert")
            self._assert_writer()
            self._repository.acknowledge(session, item, note_id, existing)
            return TransferResult(item.id, "pushed", note_id)

    def transfer(self, queue_id: int) -> TransferResult:
        self._assert_writer()
        before = self._read_status(queue_id)
        if before.status == "pushed" or study_mode(self._settings) != "integrated":
            return before
        try:
            with open_collection(self._settings) as collection:
                return self._transfer_native(queue_id, collection)
        except TransferError:
            raise
        except (AnkiException, OSError, SQLAlchemyError) as exc:
            # The durable queue survives an engine failure or missing SQL acknowledgement.
            # Fencing must remain a hard error, even when it changed during native work.
            self._assert_writer()
            log.warning("Anki-Übernahme ausstehend (%s)", type(exc).__name__)
            return TransferResult(queue_id, "approved", error="Karte gespeichert; Übernahme nach Anki ausstehend")

    def transfer_approved(self) -> int:
        self._assert_writer()
        if study_mode(self._settings) != "integrated":
            raise TransferError(409, "Integrierter Lernmodus ist nicht aktiviert")
        moved = 0
        with open_collection(self._settings) as collection:
            for queue_id in self._repository.approved_ids():
                if self._transfer_native(queue_id, collection).status == "pushed":
                    moved += 1
        return moved
