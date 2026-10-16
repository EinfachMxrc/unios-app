# SPDX-License-Identifier: AGPL-3.0-or-later

"""SQL context and native identity metadata, without file contents or scheduler writes."""

from collections.abc import Callable
from dataclasses import dataclass

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import (
    AnkiCard,
    AnkiCardQueue,
    Course,
    Exam,
    LearningTopic,
    Resource,
    StudyBlockSuggestion,
    StudyCycle,
)
from app.learning.focus_schema import FocusKind


@dataclass(frozen=True)
class FocusOrigin:
    row: StudyBlockSuggestion | StudyCycle
    exam: Exam
    course: Course
    topic_ids: list[int]
    topics: list[LearningTopic]


@dataclass(frozen=True)
class CourseCardBinding:
    queue_id: int
    course_id: int
    origin: str
    mutation_id: str | None
    note_ids: tuple[str, ...]


@dataclass(frozen=True)
class NativeFocusCard:
    id: int
    note_id: str
    deck_id: int
    identity: str | None


@dataclass(frozen=True)
class NativeFocusProjection:
    cards: list[NativeFocusCard]
    deck_names: dict[int, str]
    children: dict[int, tuple[int, ...]]


class FocusRepository:
    def __init__(self, factory: Callable[[], Session], settings: Settings):
        self._factory = factory
        self._settings = settings

    def course_context(self, identifier: int) -> tuple[Course, list[LearningTopic]] | None:
        with self._factory() as session:
            course = session.get(Course, identifier)
            if course is None:
                return None
            topics = list(session.scalars(select(LearningTopic).where(
                LearningTopic.course_id == identifier).order_by(LearningTopic.id)))
            return course, topics

    def context(self, kind: FocusKind, identifier: int) -> FocusOrigin | None:
        with self._factory() as session:
            row = session.get(StudyBlockSuggestion, identifier) if kind == "block" else session.get(StudyCycle, identifier)
            if row is None:
                return None
            exam = session.get(Exam, row.exam_id)
            course = session.get(Course, exam.course_id) if exam and exam.course_id is not None else None
            if exam is None or course is None:
                return None
            topic_ids = [row.topic_id] if isinstance(row, StudyBlockSuggestion) else list(dict.fromkeys(row.topic_ids))
            topics = list(session.scalars(select(LearningTopic).where(LearningTopic.id.in_(topic_ids),
                                                                     LearningTopic.course_id == course.id)))
            return FocusOrigin(row, exam, course, topic_ids, topics)

    def card_bindings(self) -> list[CourseCardBinding]:
        # No global card-window limit: an older course remains discoverable.
        with self._factory() as session:
            # Free note cards have no resource; their course comes from the learning topic.
            owner_course = func.coalesce(Resource.course_id, LearningTopic.course_id)
            rows = session.execute(select(AnkiCardQueue.id, owner_course, AnkiCardQueue.origin,
                                          AnkiCardQueue.mutation_id, AnkiCard.note_id)
                                   .outerjoin(Resource, Resource.id == AnkiCardQueue.resource_id)
                                   .outerjoin(LearningTopic, LearningTopic.id == AnkiCardQueue.topic_id)
                                   .outerjoin(AnkiCard, AnkiCard.queue_id == AnkiCardQueue.id)
                                   .where(AnkiCardQueue.status.in_(["approved", "pushed"]),
                                          or_(Resource.id.is_(None), Resource.group_category != "other_group"),
                                          owner_course.is_not(None))).all()
        bindings: dict[int, CourseCardBinding] = {}
        for queue_id, course_id, origin, mutation_id, note_id in rows:
            previous = bindings.get(queue_id)
            notes = previous.note_ids if previous else ()
            bindings[queue_id] = CourseCardBinding(queue_id, course_id, origin, mutation_id,
                                                  notes + (note_id,) if note_id is not None else notes)
        return list(bindings.values())

    def native_projection(self) -> NativeFocusProjection | None:
        from anki.decks import DeckId
        from anki.models import NotetypeId

        from app.anki.collection import collection_path, open_collection

        if not collection_path(self._settings).exists():
            return None
        with open_collection(self._settings, ensure_fsrs=False, preserve_study_undo=True) as col:
            assert col.db is not None
            identities: dict[int, str] = {}
            # The engine's field_at_index projects only UniOSId, never question/answer HTML.
            # Queries scale with note types, not individual cards or global queue windows.
            for notetype in col.models.all_names_and_ids():
                model = col.models.get(NotetypeId(notetype.id))
                if model is None:
                    continue
                field = col.models.field_map(model).get("UniOSId")
                if field is None:
                    continue
                for note_id, marker in col.db.all("SELECT id, field_at_index(flds, ?) FROM notes WHERE mid = ?",
                                                  field[0], notetype.id):
                    identities[int(note_id)] = marker
            cards = [NativeFocusCard(int(card_id), str(note_id), int(deck_id), identities.get(int(note_id)))
                     for card_id, note_id, deck_id in col.db.all("SELECT id, nid, did FROM cards")]
            names = {int(deck.id): deck.name for deck in col.decks.all_names_and_ids()}
            children = {deck_id: tuple(int(child_id) for _, child_id in col.decks.children(DeckId(deck_id)))
                        for deck_id in {card.deck_id for card in cards}}
            return NativeFocusProjection(cards, names, children)
