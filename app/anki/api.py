# SPDX-License-Identifier: AGPL-3.0-or-later

"""Review AI card proposals before any card reaches Anki."""

import re
from datetime import datetime
from hmac import compare_digest
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_, select

from app.ai.access import allowed
from app.anki.card_schema import (
    CardOrigin,
    CardProposal,
    StoredCardData,
    parse_stored_card,
)
from app.anki.manual_schema import ManualCardSource
from app.anki.note_schema import NoteCardSource
from app.anki.study_review_repository import ReviewMirrorRepository
from app.anki.study_review_service import (
    AgentReviewEvent,
    ReviewMirrorError,
    ReviewMirrorService,
)
from app.config import Settings
from app.db.models import (
    AnkiCard,
    AnkiCardQueue,
    Course,
    LearningTopic,
    MaterialAnnotation,
    Resource,
    ResourceVersion,
    Semester,
)
from app.host.lease import HostCoordinator
from app.learning.topics import resolve_topic


class CardSource(BaseModel):
    resource_id: int = Field(gt=0)
    version: int = Field(gt=0)


class CardImport(BaseModel):
    schema_version: Literal[1]
    generated_by: str = Field(min_length=1, max_length=100)
    generated_at: datetime
    source: CardSource
    cards: list[CardProposal] = Field(min_length=1, max_length=100)

    @field_validator("generated_at")
    @classmethod
    def timezone_required(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Zeitstempel benötigt eine Zeitzone")
        return value


class CardEdit(BaseModel):
    front: str = Field(min_length=1, max_length=4000)
    back: str = Field(min_length=1, max_length=8000)
    topic: str = Field(min_length=1, max_length=200)

    @field_validator("front", "back", "topic")
    @classmethod
    def nonblank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Leerer Karteninhalt")
        return value


class CardDecision(CardEdit):
    status: Literal["proposed", "approved", "rejected"]


class BulkApproval(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=100)


class QueueItem(BaseModel):
    id: int
    resource_id: int | None
    resource_name: str
    course_id: int
    course_name: str
    status: str
    origin: CardOrigin = "ai"
    guid: UUID | None = None
    source: ManualCardSource | NoteCardSource | None = None
    deck_name: str | None = None
    card: StoredCardData


class AgentCard(BaseModel):
    id: int
    resource_name: str
    course_name: str
    semester_name: str
    origin: CardOrigin = "ai"
    guid: UUID | None = None
    card: StoredCardData


class PushAck(BaseModel):
    queue_id: int = Field(gt=0)
    note_id: int = Field(gt=0)
    guid: UUID | None = None


class AgentNote(BaseModel):
    note_id: int


class AgentReview(BaseModel):
    note_id: int = Field(gt=0)
    review_id: int = Field(gt=0)
    rating: int = Field(ge=1, le=4)


class ReviewBatch(BaseModel):
    reviews: list[AgentReview] = Field(max_length=1000)


def _slug(value: str) -> str:
    value = value.casefold().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-") or "kurs"


def _manual_source(item: AnkiCardQueue) -> ManualCardSource | NoteCardSource | None:
    if item.origin != "manual":
        return None
    snapshot = item.source_snapshot
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get("source"), dict):
        raise TypeError("Gespeicherte Kartenquelle fehlt")
    if snapshot["source"].get("kind") == "note":
        note_source = NoteCardSource.model_validate(snapshot["source"])
        if item.source_version_id is not None or item.resource_id is not None:
            raise ValueError("Notizkarte enthält eine unerwartete PDF-Zuordnung")
        return note_source
    source = ManualCardSource.model_validate(snapshot["source"])
    if source.version_id != item.source_version_id:
        raise ValueError("Gespeicherte Kartenquelle passt nicht zur Version")
    return source


def _queue_item(item: AnkiCardQueue, resource: Resource | None, course: Course) -> QueueItem:
    source = _manual_source(item)
    course_name = source.course_name if source else course.name
    card = parse_stored_card(item.payload, item.origin)
    origin: CardOrigin = "manual" if item.origin == "manual" else "ai"
    resource_name = (source.note_title if isinstance(source, NoteCardSource) else source.resource_name) if source else resource.name if resource else ""
    return QueueItem(id=item.id, resource_id=resource.id if resource else None,
                     resource_name=resource_name,
                     course_id=source.course_id if source else course.id,
                     course_name=course_name, status=item.status, origin=origin,
                     guid=UUID(item.mutation_id) if item.mutation_id else None,
                     source=source, deck_name=f"Uni::{course_name}", card=card)


def enqueue_cards(session, settings: Settings, payload: CardImport) -> list[QueueItem]:
    """Validate the source and stage proposals without committing the transaction."""
    resource = session.get(Resource, payload.source.resource_id)
    if resource is None or resource.group_category == "other_group":
        raise HTTPException(404, "Material nicht gefunden")
    version = session.scalar(select(ResourceVersion).where(
        ResourceVersion.resource_id == resource.id,
        ResourceVersion.version == payload.source.version,
    ))
    if version is None:
        raise HTTPException(404, "Materialversion nicht gefunden")
    course = session.get(Course, resource.course_id)
    if course is None:
        raise HTTPException(404, "Kurs nicht gefunden")
    if not allowed(session, f"course:{course.id}") or not allowed(session, "category:course_material"):
        raise HTTPException(403, "Dieser Kurs ist für KI-Ergebnisse gesperrt")
    active = session.scalar(select(func.count(AnkiCardQueue.id)).where(
        AnkiCardQueue.resource_id == resource.id,
        AnkiCardQueue.origin == "ai",
        AnkiCardQueue.status != "rejected",
    )) or 0
    if active + len(payload.cards) > settings.max_anki_candidates_per_resource:
        raise HTTPException(422, "Kartenlimit für dieses Material überschritten")
    course_slug = _slug(course.short_name or course.name)
    created = []
    for card in payload.cards:
        source_page = card.source_page
        if card.source_question_id is not None:
            question = session.get(MaterialAnnotation, str(card.source_question_id))
            if (question is None or question.kind != "question" or question.resolved
                    or question.resource_id != resource.id):
                raise HTTPException(422, "Verknüpfte Frage gehört nicht zu diesem Material")
            if source_page is not None and source_page != question.source_page:
                raise HTTPException(422, "Kartenseite passt nicht zur verknüpften Frage")
            source_page = question.source_page
        normalized = card.model_copy(update={"course": course_slug, "source_page": source_page})
        item = AnkiCardQueue(resource_id=resource.id, status="proposed", origin="ai",
                             source_version_id=version.id,
                             payload=normalized.model_dump_json())
        session.add(item)
        session.flush()
        created.append(_queue_item(item, resource, course))
    return created


def list_card_queue(session, status: str | None = None, origin: CardOrigin | None = None) -> list[QueueItem]:
    """Card proposals with their material context, newest first.

    Shared by the ``/api/anki/queue`` route and the ``anki queue`` CLI command
    so both expose the same query and result shape.
    """
    query = queue_context_query()
    if status is not None:
        query = query.where(AnkiCardQueue.status == status)
    if origin is not None:
        query = query.where(AnkiCardQueue.origin == origin)
    rows = session.execute(query.order_by(AnkiCardQueue.id.desc()).limit(200)).all()
    return [_queue_item(item, resource, course) for item, resource, course in rows]


def queue_context_query():
    """Free note cards derive their course from their durable learning topic."""
    return (select(AnkiCardQueue, Resource, Course)
            .outerjoin(Resource, Resource.id == AnkiCardQueue.resource_id)
            .outerjoin(LearningTopic, LearningTopic.id == AnkiCardQueue.topic_id)
            .join(Course, Course.id == func.coalesce(Resource.course_id, LearningTopic.course_id))
            .where(or_(Resource.id.is_not(None), AnkiCardQueue.origin == "manual")))


def card_queue_router(settings: Settings, factory, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/anki")

    def require_agent(token: str):
        if not settings.anki_agent_token:
            raise HTTPException(503, "Anki-Agent nicht eingerichtet")
        if not compare_digest(token, settings.anki_agent_token):
            raise HTTPException(403, "Anki-Agent nicht autorisiert")

    @router.get("/queue", response_model=list[QueueItem])
    def queue(origin: CardOrigin | None = None):
        with factory() as session:
            return list_card_queue(session, origin=origin)

    @router.post("/queue/import", response_model=list[QueueItem], status_code=201)
    def import_cards(payload: CardImport):
        coordinator.assert_writer()
        with factory() as session:
            created = enqueue_cards(session, settings, payload)
            session.commit()
            return created

    @router.post("/queue/approve", response_model=list[int])
    def approve_selected(payload: BulkApproval):
        coordinator.assert_writer()
        if len(payload.ids) != len(set(payload.ids)):
            raise HTTPException(422, "Kartenvorschläge mehrfach ausgewählt")
        with factory() as session:
            items = session.scalars(select(AnkiCardQueue).where(AnkiCardQueue.id.in_(payload.ids))).all()
            if len(items) != len(payload.ids) or any(item.status != "proposed" for item in items):
                raise HTTPException(409, "Mindestens ein Kartenvorschlag ist nicht mehr offen")
            for item in items:
                item.status = "approved"
                resource = session.get(Resource, item.resource_id) if item.resource_id else None
                if resource is not None:
                    card = parse_stored_card(item.payload, item.origin)
                    item.topic_id = resolve_topic(session, resource.course_id, card.topic).id
            session.commit()
            return payload.ids

    @router.put("/queue/{item_id}", response_model=QueueItem)
    def decide(item_id: int, payload: CardDecision):
        coordinator.assert_writer()
        with factory() as session:
            item = session.get(AnkiCardQueue, item_id)
            if item is None or item.resource_id is None:
                raise HTTPException(404, "Kartenvorschlag nicht gefunden")
            if item.status != "proposed":
                raise HTTPException(409, "Kartenvorschlag wurde bereits entschieden")
            resource = session.get(Resource, item.resource_id)
            course = session.get(Course, resource.course_id) if resource else None
            if resource is None or course is None:
                raise HTTPException(404, "Material nicht gefunden")
            card = parse_stored_card(item.payload, item.origin)
            card = type(card).model_validate({**card.model_dump(), "front": payload.front,
                                             "back": payload.back, "topic": payload.topic})
            item.payload = card.model_dump_json()
            item.status = payload.status
            if payload.status == "approved":
                item.topic_id = resolve_topic(session, course.id, card.topic).id
            session.commit()
            return _queue_item(item, resource, course)

    @router.get("/agent/approved", response_model=list[AgentCard])
    def approved_for_agent(x_anki_agent_token: str = Header(default=""),
                           x_unios_anki_capabilities: str = Header(default="")):
        require_agent(x_anki_agent_token)
        from app.anki.collection import study_mode

        if study_mode(settings) == "integrated":
            return []
        with factory() as session:
            query = (
                queue_context_query()
                .where(AnkiCardQueue.status == "approved", or_(Resource.id.is_(None), Resource.group_category != "other_group"))
                .order_by(AnkiCardQueue.id)
                .limit(50)
            )
            if "manual-guid-v1" not in {value.strip() for value in x_unios_anki_capabilities.split(",")}:
                query = query.where(AnkiCardQueue.origin == "ai")
            rows = session.execute(query).all()
            result = []
            for item, resource, course in rows:
                semester = session.get(Semester, course.semester_id) if course.semester_id else None
                source = _manual_source(item)
                resource_name = (source.note_title if isinstance(source, NoteCardSource) else source.resource_name) if source else resource.name
                result.append(AgentCard(id=item.id, resource_name=resource_name,
                                        course_name=source.course_name if source else course.name,
                                        semester_name=semester.name if semester else "unbekannt",
                                        origin=item.origin, guid=item.mutation_id,
                                        card=parse_stored_card(item.payload, item.origin)))
            return result

    @router.post("/agent/pushed")
    def mark_pushed(payload: PushAck, x_anki_agent_token: str = Header(default=""),
                    x_unios_anki_capabilities: str = Header(default="")):
        require_agent(x_anki_agent_token)
        from app.anki.collection import study_mode

        if study_mode(settings) == "integrated":
            raise HTTPException(409, "Anki-Agent ist im integrierten Lernmodus deaktiviert")
        coordinator.assert_writer()
        with factory() as session:
            item = session.get(AnkiCardQueue, payload.queue_id)
            if item is None or (item.resource_id is None and item.origin != "manual"):
                raise HTTPException(404, "Kartenvorschlag nicht gefunden")
            if item.origin == "manual" and (
                    "manual-guid-v1" not in {value.strip() for value in x_unios_anki_capabilities.split(",")}
                    or payload.guid is None or str(payload.guid) != item.mutation_id):
                raise HTTPException(409, "Eigene Karte benötigt eine bestätigte Kartenkennung")
            existing = session.scalar(select(AnkiCard).where(AnkiCard.queue_id == item.id))
            if item.status == "pushed" and existing and existing.note_id == str(payload.note_id):
                return {"status": "pushed"}
            if item.status != "approved":
                raise HTTPException(409, "Kartenvorschlag nicht freigegeben")
            other = session.scalar(select(AnkiCard).where(AnkiCard.note_id == str(payload.note_id)))
            if other is not None or existing is not None:
                raise HTTPException(409, "Anki-Notiz bereits zugeordnet")
            session.add(AnkiCard(queue_id=item.id, note_id=str(payload.note_id)))
            item.status = "pushed"
            session.commit()
            return {"status": "pushed"}

    @router.get("/agent/notes", response_model=list[AgentNote])
    def pushed_notes(x_anki_agent_token: str = Header(default="")):
        require_agent(x_anki_agent_token)
        with factory() as session:
            notes = session.scalars(select(AnkiCard).order_by(AnkiCard.id)).all()
            return [AgentNote(note_id=int(note.note_id)) for note in notes]

    @router.post("/agent/reviews")
    def receive_reviews(payload: ReviewBatch, x_anki_agent_token: str = Header(default="")):
        require_agent(x_anki_agent_token)
        coordinator.assert_writer()
        mirror = ReviewMirrorService(ReviewMirrorRepository(factory))
        try:
            return {"imported": mirror.import_agent([AgentReviewEvent(str(review.note_id), review.review_id, review.rating)
                                                     for review in payload.reviews])}
        except ReviewMirrorError as exc:
            raise HTTPException(exc.status_code, exc.detail) from exc

    return router
