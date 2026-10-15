# SPDX-License-Identifier: AGPL-3.0-or-later

"""Deck scope, safe presentation and receipt-first study rules."""

import logging
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Literal, cast
from urllib.parse import quote

from anki.collection import Collection
from anki.errors import NotFoundError
from bs4 import BeautifulSoup
from sqlalchemy.exc import SQLAlchemyError

from app.anki.collection import collection_path, study_mode
from app.anki.study_repository import StudyRepository, card_data, last_review_ms_batch
from app.anki.study_review_service import ReviewMirrorError, ReviewMirrorService
from app.anki.study_schema import (
    ReviewInput,
    StudyCard,
    StudyCounts,
    StudyDueResponse,
    StudyReviewResponse,
    StudyScope,
    StudyStatsResponse,
    StudyStatusResponse,
    StudyUndoInput,
    StudyUndoResponse,
)
from app.anki.study_undo_repository import ReviewJournalError, UndoUnavailableError

log = logging.getLogger(__name__)
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif"}
QUEUE_LIMIT = 100


class StudyError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class StudyUndoUnavailableError(StudyError):
    """The confirmed answer remains applied; this undo intent can be retired."""

    def __init__(self, review_id: str):
        super().__init__(409, f"UNDO_UNAVAILABLE:{review_id}: Die Bewertung bleibt gespeichert; Rücknahme ist nach einer neueren Änderung nicht mehr möglich.")


def safe_html(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    allowed = {"b", "strong", "i", "em", "u", "s", "p", "div", "span", "br", "hr",
               "ul", "ol", "li", "code", "pre", "sub", "sup", "blockquote", "table",
               "thead", "tbody", "tr", "th", "td", "img"}
    for tag in list(soup.find_all(True)):
        if tag.name is None:
            continue
        if tag.name in {"script", "style", "iframe", "svg", "object", "embed", "form"}:
            tag.decompose()
            continue
        if tag.name not in allowed:
            tag.unwrap()
            continue
        source = tag.get("src") if tag.name == "img" else None
        alt = tag.get("alt") if tag.name == "img" else None
        tag.attrs.clear()
        if source:
            filename = str(source)
            if (Path(filename).name == filename and filename not in {".", ".."}
                    and not filename.startswith(".") and ":" not in filename
                    and Path(filename).suffix.lower() in IMAGE_SUFFIXES):
                tag["src"] = f"/api/anki/study/media/{quote(filename)}"
                tag["loading"] = "lazy"
                if alt:
                    tag["alt"] = str(alt)
            else:
                tag.decompose()
    return str(soup)


def present_card(data: dict[str, Any]) -> StudyCard:
    return StudyCard(**data, front=BeautifulSoup(data["front_html"], "html.parser").get_text(" ", strip=True),
                     back=BeautifulSoup(data["back_html"], "html.parser").get_text(" ", strip=True)).model_copy(
        update={"front_html": safe_html(data["front_html"]), "back_html": safe_html(data["back_html"])})


def card_dict(col: Collection, card_id: int, last_review_ms: int | None) -> dict[str, Any]:
    """Shared presentation for the unchanged browser/editor call sites."""
    return present_card(card_data(col, card_id, last_review_ms)).model_dump()


def card_single(col: Collection, card_id: int) -> dict[str, Any]:
    reviews = last_review_ms_batch(col, [card_id])
    return card_dict(col, card_id, reviews.get(card_id))


class StudyService:
    def __init__(self, repository: StudyRepository):
        self._repository = repository
        self._reviews = ReviewMirrorService(repository.reviews)

    def present_cards(self, cards: list[dict[str, Any]]) -> list[StudyCard]:
        """Read SQL sources only after closing the native Anki transaction."""
        sources = self._repository.sources.for_identities([card.get("_source_identity") for card in cards])
        return [present_card({**card, "source": sources.get(card.get("_source_identity") or "")}) for card in cards]

    def _require_integrated(self) -> None:
        if study_mode(self._repository.settings) != "integrated":
            raise StudyError(409, "Integrierter Lernmodus ist nicht aktiviert")

    def status(self) -> StudyStatusResponse:
        settings = self._repository.settings
        mode = study_mode(settings)
        if mode != "integrated" and not collection_path(settings).exists():
            return StudyStatusResponse(mode="external", cards=0, notes=0, due=0, reviews=0,
                                       counts=StudyCounts(new=0, learning=0, review=0))
        with self._repository.transaction() as collection:
            return StudyStatusResponse(mode=cast(Literal["external", "integrated"], mode), **collection.summary())

    def due(self, deck: str | None) -> StudyDueResponse:
        self._require_integrated()
        with self._repository.transaction() as collection:
            names = collection.deck_names()
            scope = None
            if deck is not None:
                deck_id = names.get(deck)
                if deck_id is None:
                    raise StudyError(404, "Anki-Deck nicht gefunden")
                collection.select(deck_id)
                snapshot = collection.queue(QUEUE_LIMIT + 1)
                ids = snapshot.ids[:QUEUE_LIMIT]
                counts = snapshot.counts
                has_more = len(snapshot.ids) > QUEUE_LIMIT
                scope = StudyScope(deck_id=deck_id, deck_name=deck, includes_subdecks=True)
            else:
                all_ids: list[int] = []
                has_more = False
                for snapshot in collection.root_queues(QUEUE_LIMIT + 1):
                    all_ids.extend(snapshot.ids)
                    has_more |= len(snapshot.ids) > QUEUE_LIMIT
                unique_ids = list(dict.fromkeys(all_ids))
                has_more |= len(unique_ids) > QUEUE_LIMIT
                ids = unique_ids[:QUEUE_LIMIT]
                counts = collection.global_counts()
            cards = collection.cards(ids)
        return StudyDueResponse(cards=self.present_cards(cards), generated_at=datetime.now(UTC).isoformat(),
                                scope=scope, counts=counts, has_more=has_more)

    def stats(self) -> StudyStatsResponse:
        self._require_integrated()
        with self._repository.transaction() as collection:
            return StudyStatsResponse(**collection.statistics(self._repository.settings))

    def review(self, payload: ReviewInput, write_guard: Callable[[], None] | None = None) -> StudyReviewResponse:
        self._require_integrated()
        already_applied = False
        identity = None
        next_card = None
        try:
            with self._repository.transaction(write_guard) as collection:
                receipt = collection.receipt(payload.review_id)
                if receipt is not None:
                    if (receipt.card_id, receipt.rating) != (payload.card_id, payload.rating):
                        raise StudyError(409, "Bewertungskennung wurde anders verwendet")
                    already_applied = True
                else:
                    card_deck = collection.card_deck(payload.card_id)
                    if payload.offline:
                        reviewed_at = payload.reviewed_at
                        now = datetime.now(UTC)
                        if reviewed_at is None or reviewed_at.tzinfo is None or not (
                            now - timedelta(days=7) <= reviewed_at <= now + timedelta(minutes=5)
                        ):
                            raise StudyError(422, "Offline-Bewertung hat keinen gültigen Zeitpunkt")
                    deck_id = payload.study_deck_id if payload.study_deck_id is not None else card_deck
                    if not collection.has_deck(deck_id):
                        raise StudyError(404, "Anki-Deck nicht gefunden")
                    collection.select(deck_id)
                    queued = collection.queue(1)
                    if not queued.ids or queued.ids[0] != payload.card_id:
                        raise StudyError(409, "Lernreihenfolge hat sich geändert; Lernstand neu laden")
                    self._reviews.preflight(collection.review_identity(payload.card_id), payload.review_id)
                    receipt = collection.answer(payload.card_id, payload.rating, payload.review_id)
                try:
                    identity = collection.review_identity(payload.card_id)
                    next_card = collection.cards([payload.card_id])[0]
                except NotFoundError:
                    if not already_applied:
                        raise
                    # A durable receipt confirms the original answer even after deletion.
                    # An imported replacement is not the card that was answered.
                    identity = None
                    next_card = None
                # The native collection lock also orders mirror recording and
                # undo: an in-flight answer must not recreate a removed mirror.
                try:
                    if write_guard is not None:
                        write_guard()
                    self._reviews.record(receipt, identity, write_guard)
                except (SQLAlchemyError, OSError) as exc:
                    log.warning("SQL-Lernverlauf wartet auf Wiederholung (card_id=%s)", payload.card_id)
                    raise StudyError(503, "Anki-Bewertung gespeichert; Lernverlauf bitte mit derselben Kennung erneut bestätigen") from exc
        except StudyError:
            raise
        except ReviewJournalError as exc:
            raise StudyError(409, str(exc)) from exc
        except ReviewMirrorError as exc:
            raise StudyError(exc.status_code, exc.detail) from exc
        except NotFoundError as exc:
            raise StudyError(404, "Karte nicht gefunden") from exc
        except Exception as exc:
            log.exception("Anki-Bewertung fehlgeschlagen (card_id=%s)", payload.card_id)
            raise StudyError(500, "Anki-Bewertung konnte nicht gespeichert werden") from exc
        return StudyReviewResponse(card=self.present_cards([next_card])[0] if next_card is not None else None,
                                   already_applied=already_applied)

    def undo(self, payload: StudyUndoInput, write_guard: Callable[[], None] | None = None) -> StudyUndoResponse:
        self._require_integrated()
        restored = None
        try:
            with self._repository.transaction(write_guard) as collection:
                try:
                    receipt, already_undone = collection.undo(payload.review_id, payload.card_id, payload.rating)
                except UndoUnavailableError as exc:
                    # A terminal refusal is safe to acknowledge only after both
                    # native proof and the corresponding positive mirror agree.
                    self._reviews.record(exc.receipt, None, write_guard)
                    raise StudyUndoUnavailableError(payload.review_id) from exc
                try:
                    restored = collection.cards([payload.card_id])[0]
                except NotFoundError:
                    pass
                if write_guard is not None:
                    write_guard()
                self._reviews.undo(receipt, write_guard)
        except (ReviewJournalError, ReviewMirrorError) as exc:
            raise StudyError(409, str(exc)) from exc
        except (SQLAlchemyError, OSError) as exc:
            raise StudyError(503, "Rücknahme bitte mit derselben Bewertungskennung erneut bestätigen") from exc
        return StudyUndoResponse(review_id=payload.review_id,
                                 card=self.present_cards([restored])[0] if restored is not None else None,
                                 already_undone=already_undone)
