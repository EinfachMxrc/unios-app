# SPDX-License-Identifier: AGPL-3.0-or-later

"""Explicit calendar review for dates found in local study documents."""

from datetime import UTC, date, datetime

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.db.models import (
    Change,
    Course,
    Deadline,
    DeadlineProposal,
    Resource,
    ResourceVersion,
    utc_now,
)
from app.host.lease import HostCoordinator


class ProposalView(BaseModel):
    id: int
    resource_name: str
    course_name: str
    version_id: int
    page_number: int
    quote: str
    candidate_date: date
    previous_due_at: datetime | None


class Approval(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    due_at: datetime


def proposal_router(factory, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/deadline-proposals")

    @router.get("", response_model=list[ProposalView])
    def proposals(response: Response):
        response.headers["Cache-Control"] = "private, no-store"
        with factory() as session:
            rows = session.execute(select(DeadlineProposal, Resource, Course)
                .join(Resource, Resource.id == DeadlineProposal.resource_id)
                .join(Course, Course.id == Resource.course_id)
                .where(DeadlineProposal.status == "proposed")
                .order_by(DeadlineProposal.created_at.desc()).limit(100)).all()
            result = []
            for item, resource, course in rows:
                old = session.scalar(select(Deadline).where(Deadline.source == "document",
                    Deadline.source_key == f"resource:{resource.id}:deadline"))
                result.append(ProposalView(id=item.id, resource_name=resource.name,
                    course_name=course.name, version_id=item.version_id,
                    page_number=item.page_number, quote=item.quote,
                    candidate_date=item.candidate_date,
                    previous_due_at=old.due_at if old else None))
            return result

    @router.post("/{proposal_id}/accept")
    def accept(proposal_id: int, payload: Approval):
        coordinator.assert_writer()
        if payload.due_at.tzinfo is None or payload.due_at.utcoffset() is None:
            raise HTTPException(422, "Uhrzeit mit Zeitzone angeben")
        if not payload.title.strip():
            raise HTTPException(422, "Titel fehlt")
        with factory() as session:
            item = session.get(DeadlineProposal, proposal_id)
            if item is None:
                raise HTTPException(404, "Vorschlag nicht gefunden")
            if item.status != "proposed":
                raise HTTPException(409, "Vorschlag wurde bereits entschieden")
            resource = session.get(Resource, item.resource_id)
            latest = session.scalar(select(ResourceVersion.id).where(ResourceVersion.resource_id == item.resource_id)
                                    .order_by(ResourceVersion.version.desc()))
            if resource is None or resource.removed_upstream or latest != item.version_id:
                raise HTTPException(409, "Quelle wurde inzwischen geändert; bitte neu prüfen")
            source_key = f"resource:{resource.id}:deadline"
            deadline = session.scalar(select(Deadline).where(Deadline.source == "document",
                                                               Deadline.source_key == source_key))
            if deadline is None:
                deadline = Deadline(source="document", source_key=source_key,
                                    course_id=resource.course_id, assignment_id=None,
                                    title=payload.title.strip(), due_at=payload.due_at.astimezone(UTC),
                                    url=f"/material/{item.version_id}?page={item.page_number}")
                session.add(deadline)
            else:
                deadline.title = payload.title.strip()
                deadline.due_at = payload.due_at.astimezone(UTC)
                deadline.url = f"/material/{item.version_id}?page={item.page_number}"
            item.status = "accepted"
            item.decided_at = utc_now()
            session.add(Change(kind="deadline_approved", resource_id=resource.id,
                               course_id=resource.course_id, summary="Frist aus Dokument bestätigt"))
            session.commit()
            return {"deadline_id": deadline.id, "status": "accepted"}

    @router.post("/{proposal_id}/dismiss")
    def dismiss(proposal_id: int):
        coordinator.assert_writer()
        with factory() as session:
            item = session.get(DeadlineProposal, proposal_id)
            if item is None:
                raise HTTPException(404, "Vorschlag nicht gefunden")
            if item.status != "proposed":
                raise HTTPException(409, "Vorschlag wurde bereits entschieden")
            item.status = "dismissed"
            item.decided_at = utc_now()
            session.commit()
            return {"status": "dismissed"}

    return router
