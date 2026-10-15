# SPDX-License-Identifier: AGPL-3.0-or-later

"""Private review flow for selected messages and proposed dates."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.db.models import Change, Deadline, MailItem
from app.host.lease import HostCoordinator
from app.mail.ingest import MAX_MAIL_BYTES, MailParseError, parse_eml


class MailView(BaseModel):
    id: int
    sender: str
    subject: str
    received_at: datetime | None
    candidate_date: str | None
    status: str
    deadline_id: int | None
    imported_at: datetime


class ConfirmDate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    due_at: datetime


def mail_router(factory, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/mail")

    @router.get("", response_model=list[MailView])
    def list_mail(response: Response):
        response.headers["Cache-Control"] = "private, no-store"
        with factory() as session:
            rows = session.scalars(select(MailItem).order_by(MailItem.id.desc()).limit(100)).all()
            return [MailView(id=row.id, sender=row.sender, subject=row.subject,
                             received_at=row.received_at,
                             candidate_date=row.candidate_date.isoformat() if row.candidate_date else None,
                             status=row.status, deadline_id=row.deadline_id,
                             imported_at=row.imported_at) for row in rows]

    @router.post("/import")
    async def import_mail(file: Annotated[UploadFile, File()]):
        coordinator.assert_writer()
        raw = await file.read(MAX_MAIL_BYTES + 1)
        await file.close()
        try:
            parsed = parse_eml(raw)
        except MailParseError as exc:
            raise HTTPException(400, str(exc)) from None
        with factory() as session:
            existing = session.scalar(select(MailItem).where(MailItem.source_hash == parsed.source_hash))
            if existing is not None:
                return {"id": existing.id, "created": False, "candidate_date":
                        existing.candidate_date.isoformat() if existing.candidate_date else None}
            row = MailItem(source_hash=parsed.source_hash, sender=parsed.sender,
                           subject=parsed.subject, received_at=parsed.received_at,
                           candidate_date=parsed.candidate_date,
                           status="proposed" if parsed.candidate_date else "info")
            session.add(row)
            session.flush()
            session.add(Change(kind="mail", summary="Ausgewählte Hochschul-Mail geprüft",
                               course_id=None))
            session.commit()
            return {"id": row.id, "created": True,
                    "candidate_date": parsed.candidate_date.isoformat() if parsed.candidate_date else None}

    @router.post("/{mail_id}/confirm")
    def confirm_date(mail_id: int, payload: ConfirmDate):
        coordinator.assert_writer()
        if payload.due_at.tzinfo is None or payload.due_at.utcoffset() is None:
            raise HTTPException(400, "Bitte Datum und Uhrzeit mit Zeitzone angeben")
        title = " ".join(payload.title.split())
        if not title:
            raise HTTPException(400, "Titel fehlt")
        with factory() as session:
            row = session.get(MailItem, mail_id)
            if row is None:
                raise HTTPException(404, "Mail nicht gefunden")
            if row.status != "proposed":
                raise HTTPException(409, "Für diese Mail ist kein offener Vorschlag vorhanden")
            deadline = Deadline(source="mail", source_key=row.source_hash,
                                title=title, due_at=payload.due_at.astimezone(UTC),
                                course_id=None, assignment_id=None, url=None)
            session.add(deadline)
            session.flush()
            row.status = "accepted"
            row.deadline_id = deadline.id
            session.commit()
            return {"deadline_id": deadline.id}

    @router.post("/{mail_id}/dismiss")
    def dismiss(mail_id: int):
        coordinator.assert_writer()
        with factory() as session:
            row = session.get(MailItem, mail_id)
            if row is None:
                raise HTTPException(404, "Mail nicht gefunden")
            if row.status not in {"proposed", "info"}:
                raise HTTPException(409, "Mail wurde bereits geprüft")
            row.status = "dismissed"
            session.commit()
            return {"status": "dismissed"}

    return router
