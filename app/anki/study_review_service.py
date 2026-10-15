# SPDX-License-Identifier: AGPL-3.0-or-later

"""Receipt-first review mirroring with conservative stable-identity attribution."""

import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.anki.card_schema import is_manual_note_marker
from app.anki.study_review_receipts import NativeReviewIdentity, NativeReviewReceipt
from app.anki.study_review_repository import ReviewMirrorRepository
from app.db.models import AnkiCard, AnkiCardQueue


class ReviewMirrorError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class AgentReviewEvent:
    note_id: str
    revlog_id: int
    rating: int


class ReviewMirrorService:
    def __init__(self, repository: ReviewMirrorRepository):
        self._repository = repository

    def _binding(self, session: Session, identity: NativeReviewIdentity) -> tuple[AnkiCardQueue | None, AnkiCard | None]:
        repository = self._repository
        occupied = repository.note_binding(session, identity.note_id)
        if is_manual_note_marker(identity.source_identity):
            if identity.matching_manual_notes != (identity.note_id,):
                raise ReviewMirrorError(409, "Eigene Kartenkennung ist in Anki nicht eindeutig")
            assert identity.source_identity is not None
            queue = repository.manual_queue(session, identity.source_identity.removeprefix("unios-manual-"))
            if queue is None:
                if occupied is not None:
                    raise ReviewMirrorError(409, "Anki-Notiz ist einer anderen Karte zugeordnet")
                return None, None  # A foreign imported GUID cannot inherit a local topic.
            bindings = repository.bindings(session, queue.id)
            if len(bindings) > 1 or queue.status not in {"approved", "pushed"}:
                raise ReviewMirrorError(409, "Eigene Kartenkennung hat keine eindeutige SQL-Zuordnung")
            mapped = bindings[0] if bindings else None
            if occupied is not None and (mapped is None or occupied.id != mapped.id):
                raise ReviewMirrorError(409, "Anki-Notiz ist einer anderen Karte zugeordnet")
            return queue, mapped
        if occupied is not None:
            queue = repository.queue(session, occupied.queue_id)
            if queue is not None and queue.origin == "manual":
                raise ReviewMirrorError(409, "Eigene Karte hat ihre bestätigte Kartenkennung verloren")
        return None, occupied

    def preflight(self, identity: NativeReviewIdentity, review_id: str) -> None:
        with self._repository.transaction() as session:
            self._binding(session, identity)
            if self._repository.review(session, review_id) is not None:
                # Without a native receipt we cannot treat a SQL row as an Anki ACK.
                raise ReviewMirrorError(409, "Bewertungskennung ist bereits im Lernverlauf gespeichert")

    def _historical_binding(self, session: Session, receipt: NativeReviewReceipt) -> AnkiCard | None:
        """Attribute a confirmed event without inventing a current native binding."""
        marker = receipt.source_identity
        if not is_manual_note_marker(marker):
            if marker is not None and marker.startswith("unios-manual-"):
                raise ReviewMirrorError(409, "Bestätigte eigene Kartenkennung ist nicht eindeutig")
            return self._historical_ai_binding(session, receipt)
        assert marker is not None
        queue = self._repository.manual_queue(session, marker.removeprefix("unios-manual-"))
        if queue is None:
            return None  # A foreign GUID remains a native-only acknowledgement.
        bindings = self._repository.bindings(session, queue.id)
        if len(bindings) != 1:
            raise ReviewMirrorError(409, "Bestätigte eigene Karte hat keine eindeutige historische SQL-Zuordnung")
        return bindings[0]

    def _historical_ai_binding(self, session: Session, receipt: NativeReviewReceipt) -> AnkiCard | None:
        marker = receipt.source_identity
        if marker is None:
            return None
        # Native transfer uses unios-N; the legacy Desktop agent writes bare N.
        # Neither identifies a local queue alone: the frozen original note ID
        # must still match its sole existing SQL binding. Never follow a reimport.
        value = marker.removeprefix("unios-")
        if not re.fullmatch(r"[1-9][0-9]{0,18}", value) or int(value) > 2**63 - 1:
            if marker.startswith("unios-") or marker.isdecimal():
                raise ReviewMirrorError(409, "Bestätigte KI-Kartenkennung ist nicht eindeutig")
            return None
        queue = self._repository.queue(session, int(value))
        if queue is None:
            return None  # Foreign imports remain native-only acknowledgements.
        bindings = self._repository.bindings(session, queue.id)
        if (queue.origin != "ai" or queue.status != "pushed" or len(bindings) != 1 or
                bindings[0].note_id != receipt.note_id):
            raise ReviewMirrorError(409, "Bestätigte KI-Karte hat keine eindeutige historische SQL-Zuordnung")
        return bindings[0]

    def record(self, receipt: NativeReviewReceipt, identity: NativeReviewIdentity | None,
               write_guard: Callable[[], None] | None = None) -> None:
        if receipt.note_id is None or receipt.revlog_id is None:
            return  # An old receipt confirms Anki only; its historical time is unknown.
        if identity is not None and receipt.source_identity != identity.source_identity:
            raise ReviewMirrorError(409, "Bewertete Karte hat eine andere Kartenkennung")
        if identity is not None and not is_manual_note_marker(receipt.source_identity) and receipt.note_id != identity.note_id:
            raise ReviewMirrorError(409, "Bewertete Anki-Notiz ist nicht mehr eindeutig zugeordnet")
        reviewed_at = datetime.fromtimestamp(receipt.revlog_id / 1000, UTC)
        repository = self._repository
        with repository.transaction(write=True, write_guard=write_guard) as session:
            if identity is None:
                mapped = self._historical_binding(session, receipt)
            else:
                queue, mapped = self._binding(session, identity)
                if queue is not None:
                    mapped = repository.bind(session, queue, identity.note_id, mapped)
            if mapped is None:
                return  # Imported/unmanaged notes remain native-only reviews.
            existing = repository.review(session, receipt.review_id)
            if existing is not None:
                if (existing.card_id != mapped.id or existing.rating != receipt.rating or
                        existing.reviewed_at.replace(tzinfo=UTC) != reviewed_at):
                    raise ReviewMirrorError(409, "Bewertungskennung wurde anders verwendet")
                return
            same_event = repository.reviews_at(session, mapped.id, reviewed_at)
            if same_event:
                if len(same_event) != 1 or same_event[0].rating != receipt.rating or same_event[0].review_id is not None:
                    raise ReviewMirrorError(409, "Bewertungsverlauf ist nicht eindeutig zugeordnet")
                repository.acknowledge_review(same_event[0], receipt.review_id)
            else:
                repository.add_review(session, mapped.id, reviewed_at, receipt.rating, receipt.review_id)

    def import_agent(self, events: list[AgentReviewEvent]) -> int:
        added = 0
        with self._repository.transaction(write=True) as session:
            for event in events:
                mapped = self._repository.note_binding(session, event.note_id)
                if mapped is None:
                    raise ReviewMirrorError(404, "Anki-Notiz nicht zugeordnet")
                reviewed_at = datetime.fromtimestamp(event.revlog_id / 1000, UTC)
                existing = self._repository.reviews_at(session, mapped.id, reviewed_at)
                if existing:
                    if len(existing) != 1 or existing[0].rating != event.rating:
                        raise ReviewMirrorError(409, "Bewertungsverlauf ist nicht eindeutig zugeordnet")
                else:
                    self._repository.add_review(session, mapped.id, reviewed_at, event.rating)
                    session.flush()
                    added += 1
        return added

    def undo(self, receipt: NativeReviewReceipt, write_guard: Callable[[], None] | None = None) -> None:
        """Remove this acknowledged event only; never remove another review by time."""
        with self._repository.transaction(write=True, write_guard=write_guard) as session:
            existing = self._repository.review(session, receipt.review_id)
            if existing is None:
                return
            if (receipt.revlog_id is None or existing.rating != abs(receipt.rating) or
                    existing.reviewed_at.replace(tzinfo=UTC) != datetime.fromtimestamp(receipt.revlog_id / 1000, UTC)):
                raise ReviewMirrorError(409, "Rücknahme und Lernverlauf sind nicht eindeutig zugeordnet")
            mapped = self._historical_binding(session, receipt)
            if mapped is None or existing.card_id != mapped.id:
                raise ReviewMirrorError(409, "Rücknahme gehört zu einer anderen Karte")
            self._repository.remove_review(session, existing)
