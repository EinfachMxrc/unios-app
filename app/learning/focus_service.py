# SPDX-License-Identifier: AGPL-3.0-or-later

"""Accepted-origin validation and conservative course-to-current-deck attribution."""

import logging
from typing import Literal

from app.anki.card_schema import manual_note_marker
from app.config import Settings
from app.cycles.service import PHASE_LABELS
from app.db.models import StudyBlockSuggestion, StudyCycle
from app.learning.focus_repository import CourseCardBinding, FocusRepository
from app.learning.focus_schema import (
    FocusCardScope,
    FocusDeck,
    FocusKind,
    FocusTopic,
    LearningFocusView,
)
from app.timeutil import as_utc

log = logging.getLogger(__name__)


class FocusError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


class FocusService:
    def __init__(self, repository: FocusRepository, settings: Settings):
        self._repository = repository
        self._settings = settings

    @staticmethod
    def _marker(binding: CourseCardBinding) -> str | None:
        if binding.origin == "ai":
            return f"unios-{binding.queue_id}"
        if binding.origin == "manual" and binding.mutation_id is not None:
            try:
                marker = manual_note_marker(binding.mutation_id)
                return marker if marker.removeprefix("unios-manual-") == binding.mutation_id else None
            except ValueError:
                return None
        return None

    def card_scope(self, course_id: int) -> FocusCardScope:
        try:
            from anki.errors import AnkiException

            from app.anki.collection import study_mode

            mode: Literal["integrated", "external"] = "integrated" if study_mode(self._settings) == "integrated" else "external"
        except (ImportError, OSError, ValueError):
            return FocusCardScope(mode="external", decks=[], scope="course_related_decks", uncertain=True)
        empty = FocusCardScope(mode=mode, decks=[], scope="course_related_decks", uncertain=True)
        if mode != "integrated":
            return empty
        bindings = self._repository.card_bindings()
        try:
            native = self._repository.native_projection()
        except (AnkiException, OSError):
            log.warning("Kursbezogene Kartenstapel sind derzeit nicht verfügbar")
            return empty
        if native is None:
            return empty
        by_marker = {self._marker(binding): binding for binding in bindings if self._marker(binding) is not None}
        native_notes: dict[str, set[str]] = {}
        for card in native.cards:
            if card.identity is not None:
                native_notes.setdefault(card.identity, set()).add(card.note_id)
        card_courses: dict[int, int] = {}
        matched_queues: set[int] = set()
        for card in native.cards:
            binding = by_marker.get(card.identity)
            if binding is None or len(native_notes.get(card.identity or "", set())) != 1 or len(binding.note_ids) > 1:
                continue
            if binding.origin == "ai" and binding.note_ids != (card.note_id,):
                continue
            card_courses[card.id] = binding.course_id
            matched_queues.add(binding.queue_id)
        deck_ids = {card.deck_id for card in native.cards if card_courses.get(card.id) == course_id}
        uncertain = any(binding.course_id == course_id and binding.queue_id not in matched_queues for binding in bindings)
        for deck_id in deck_ids:
            scope_ids = {deck_id, *native.children.get(deck_id, ())}
            if any(card.deck_id in scope_ids and card_courses.get(card.id) != course_id for card in native.cards):
                uncertain = True
        if not deck_ids and native.cards:
            uncertain = True
        return FocusCardScope(mode=mode, scope="course_related_decks", uncertain=uncertain,
                              decks=[FocusDeck(deck_id=deck_id, name=native.deck_names[deck_id])
                                     for deck_id in sorted(deck_ids, key=lambda value: native.deck_names[value])])

    def get(self, kind: FocusKind, identifier: int) -> LearningFocusView:
        if kind == "course":
            direct = self._repository.course_context(identifier)
            if direct is None:
                raise FocusError(404, "Kurs nicht gefunden")
            course, course_topics = direct
            return LearningFocusView(
                kind=kind, id=identifier, label=course.name, status="direct",
                course_id=course.id, course_name=course.name, exam_id=None, exam_title=None,
                exam_at=None, exam_changed=None, starts_at=None, ends_at=None,
                duration_minutes=None, missing_topic_ids=[],
                topics=[FocusTopic(id=topic.id, name=topic.name) for topic in course_topics],
                card_scope=self.card_scope(course.id),
            )
        context = self._repository.context(kind, identifier)
        if context is None:
            raise FocusError(404, "Lernvorhaben nicht gefunden")
        row, exam, course = context.row, context.exam, context.course
        if row.status != "accepted":
            raise FocusError(409, "Lernvorhaben wurde noch nicht angenommen")
        topics = {topic.id: topic for topic in context.topics}
        missing = [topic_id for topic_id in context.topic_ids if topic_id not in topics]
        if isinstance(row, StudyBlockSuggestion) and missing:
            raise FocusError(409, "Lernthema und Prüfung gehören nicht zum selben Kurs")
        cycle = row if isinstance(row, StudyCycle) else None
        ordered = [topics[topic_id] for topic_id in context.topic_ids if topic_id in topics]
        return LearningFocusView(
            kind=kind, id=row.id, label=PHASE_LABELS.get(cycle.phase, cycle.phase) if cycle else ordered[0].name,
            status="accepted", course_id=course.id, course_name=course.name, exam_id=exam.id, exam_title=exam.title,
            exam_at=as_utc(exam.exam_at) if exam.exam_at is not None else None,
            exam_changed=(exam.exam_at is None or as_utc(exam.exam_at) != as_utc(cycle.exam_at_snapshot)) if cycle else None,
            topics=[FocusTopic(id=topic.id, name=topic.name) for topic in ordered], missing_topic_ids=missing,
            duration_minutes=row.duration_minutes if isinstance(row, StudyBlockSuggestion) else None,
            starts_at=as_utc(row.starts_at), ends_at=as_utc(cycle.ends_at) if cycle else None,
            card_scope=self.card_scope(course.id),
        )
