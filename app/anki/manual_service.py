# SPDX-License-Identifier: AGPL-3.0-or-later
"""Manual confirmation, receipt-first retries and exact immutable PDF sources."""

from filelock import Timeout
from sqlalchemy.exc import IntegrityError

from app.anki.api import _slug
from app.anki.card_schema import StoredCardData, parse_stored_card
from app.anki.collection import study_mode
from app.anki.manual_repository import (
    ManualCardRecord,
    ManualCardRepository,
    ManualSourceRecords,
)
from app.anki.manual_schema import (
    ManualCardErrorCode,
    ManualCardInput,
    ManualCardResponse,
    ManualCardSource,
)
from app.anki.transfer_service import TransferError, TransferService
from app.config import Settings
from app.material.preview import PreviewUnavailable
from app.material.service import MaterialError


class ManualCardError(Exception):
    def __init__(self, status_code: int, detail: str, code: ManualCardErrorCode = "MANUAL_CARD_ERROR"):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail
        self.code = code


class ManualCardService:
    def __init__(self, settings: Settings, repository: ManualCardRepository, transfer: TransferService):
        self._settings = settings
        self._repository = repository
        self._transfer = transfer

    @staticmethod
    def _require_source(rows: ManualSourceRecords) -> None:
        if (rows.version is None or rows.resource is None or rows.course is None
                or rows.annotation is None or rows.resource.group_category == "other_group"):
            raise ManualCardError(404, "Material oder Markierung nicht gefunden")
        if rows.annotation.resource_id != rows.resource.id:
            raise ManualCardError(409, "Markierung gehört nicht zu diesem Material")

    @staticmethod
    def _require_manual(record: ManualCardRecord | None) -> ManualCardRecord:
        if record is None or record.origin != "manual":
            raise ManualCardError(404, "Eigene Lernkarte nicht gefunden")
        if record.status not in {"approved", "pushed"} or not record.source_snapshot or record.mutation_id is None:
            raise ManualCardError(409, "Gespeicherte Lernkarte ist unvollständig")
        return record

    def _replay(self, record: ManualCardRecord, payload: ManualCardInput) -> ManualCardRecord:
        record = self._require_manual(record)
        assert record.source_snapshot is not None
        if record.source_snapshot.get("request") != payload.model_dump(mode="json"):
            raise ManualCardError(409, "Diese Speicherkennung wurde bereits für anderen Inhalt verwendet",
                                  "MANUAL_MUTATION_CONFLICT")
        return record

    def _response(self, record: ManualCardRecord, error: str | None = None) -> ManualCardResponse:
        record = self._require_manual(record)
        assert record.source_snapshot is not None
        try:
            source = ManualCardSource.model_validate(record.source_snapshot["source"])
            card = parse_stored_card(record.payload, record.origin)
        except (KeyError, ValueError) as exc:
            raise ManualCardError(409, "Gespeicherte Lernkarte ist unvollständig") from exc
        return ManualCardResponse(queue_id=record.queue_id,
            status="pushed" if record.status == "pushed" else "approved", card=card, source=source,
            deck_name=f"Uni::{source.course_name}", note_id=record.note_id, transfer_error=error)

    def get(self, queue_id: int) -> ManualCardResponse:
        with self._repository.read() as transaction:
            record = self._require_manual(transaction.by_id(queue_id))
        return self._response(record)

    def is_note_source(self, queue_id: int) -> bool:
        with self._repository.read() as transaction:
            record = self._require_manual(transaction.by_id(queue_id))
        assert record.source_snapshot is not None
        source = record.source_snapshot.get("source")
        return isinstance(source, dict) and source.get("kind") == "note"

    def _finish(self, record: ManualCardRecord) -> ManualCardResponse:
        error = None
        if record.status == "approved" and study_mode(self._settings) == "integrated":
            try:
                result = self._transfer.transfer(record.queue_id)
                error = result.error
            except TransferError as exc:
                # The durable source card still exists; an engine conflict must
                # not be reported as loss of the already committed user content.
                error = exc.detail
            with self._repository.read() as transaction:
                record = self._require_manual(transaction.by_id(record.queue_id))
        return self._response(record, error)

    def transfer(self, queue_id: int) -> ManualCardResponse:
        with self._repository.read() as transaction:
            record = self._require_manual(transaction.by_id(queue_id))
        return self._finish(record)

    def create(self, payload: ManualCardInput) -> ManualCardResponse:
        mutation_id = str(payload.mutation_id)
        with self._repository.read() as transaction:
            existing = transaction.by_mutation(mutation_id)
        if existing is not None:
            return self._finish(self._replay(existing, payload))

        # This short read only chooses the resource lock. Validate and display
        # again from a fresh transaction after acquiring it, including revision.
        with self._repository.read() as transaction:
            rows = transaction.source(payload.source.version_id, str(payload.source.annotation_id))
            self._require_source(rows)
            assert rows.resource is not None
            resource_id = rows.resource.id
        try:
            with self._repository.write_for_source(resource_id) as transaction:
                existing = transaction.by_mutation(mutation_id)
                if existing is not None:
                    record = self._replay(existing, payload)
                else:
                    rows = transaction.source(payload.source.version_id, str(payload.source.annotation_id))
                    self._require_source(rows)
                    assert rows.annotation is not None and rows.version is not None
                    assert rows.resource is not None and rows.course is not None
                    if rows.annotation.revision != payload.source.expected_revision:
                        raise ManualCardError(409, "Markierung wurde inzwischen geändert", "MANUAL_SOURCE_CHANGED")
                    viewed = transaction.displayed_source(rows)
                    if (viewed["revision"] != payload.source.expected_revision
                            or rows.annotation.revision != payload.source.expected_revision):
                        raise ManualCardError(409, "Markierung wurde inzwischen geändert", "MANUAL_SOURCE_CHANGED")
                    anchor = viewed["anchor"]
                    if anchor["status"] != "matched" or anchor["page"] != payload.source.page:
                        raise ManualCardError(409, "Quellenstelle ist nicht eindeutig oder die Seite passt nicht",
                                              "MANUAL_SOURCE_CHANGED")
                    source = ManualCardSource(resource_id=rows.resource.id, resource_name=rows.resource.name,
                        course_id=rows.course.id, course_name=rows.course.name, version_id=rows.version.id,
                        version=rows.version.version, sha256=rows.version.sha256, page=anchor["page"],
                        quote=viewed["quote"], annotation_id=rows.annotation.id,
                        annotation_revision=rows.annotation.revision,
                        url=f"/material/{rows.version.id}?page={anchor['page']}")
                    card = StoredCardData(card_type="basic", front=payload.front, back=payload.back,
                        course=_slug(rows.course.short_name or rows.course.name)[:200], topic=payload.topic,
                        source_page=source.page,
                        source_question_id=payload.source.annotation_id if rows.annotation.kind == "question" else None)
                    snapshot = {"request": payload.model_dump(mode="json"),
                        "source": source.model_dump(mode="json"), "resource_source": rows.resource.source,
                        "resource_source_key": rows.resource.source_key}
                    record = transaction.save(resource_id=resource_id, version_id=rows.version.id,
                        mutation_id=mutation_id, course_id=rows.course.id, topic=payload.topic,
                        payload=card.model_dump_json(exclude_none=True), snapshot=snapshot)
        except IntegrityError:
            # Another writer may have won the UUID on a different resource lock
            # or database backend. Rollback is complete before this fresh lookup.
            with self._repository.read() as transaction:
                existing = transaction.by_mutation(mutation_id)
            if existing is None:
                raise ManualCardError(409, "Lernkarte konnte nicht eindeutig gespeichert werden") from None
            record = self._replay(existing, payload)
        except Timeout:
            raise ManualCardError(503, "Quellenstelle wird gerade geändert; bitte erneut versuchen") from None
        except MaterialError as exc:
            raise ManualCardError(409, str(exc)) from exc
        except PreviewUnavailable as exc:
            raise ManualCardError(503, str(exc)) from exc
        return self._finish(record)
