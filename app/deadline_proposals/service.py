# SPDX-License-Identifier: AGPL-3.0-or-later

"""Conservatively stage one unambiguous date per new document version."""

import re
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import (
    Deadline,
    DeadlineProposal,
    Resource,
    ResourceText,
    ResourceVersion,
    utc_now,
)
from app.mail.ingest import DATE_PATTERN

DEADLINE_CONTEXT = re.compile(r"\b(?:\w*frist|anmeldeschluss|abgabeschluss|bewerbungsschluss)\b|\bbis zum\b",
                              re.IGNORECASE)


def upcoming_deadlines(session: Session, days: int = 14) -> list[Deadline]:
    """Deadlines that have not passed yet, soonest first, within the given day window."""
    now = utc_now()
    horizon = now + timedelta(days=days)
    return list(session.scalars(select(Deadline).where(
        Deadline.removed_upstream.is_(False),
        Deadline.due_at >= now,
        Deadline.due_at <= horizon,
    ).order_by(Deadline.due_at)).all())


def stage_document_date(session: Session, resource: Resource, version: ResourceVersion) -> None:
    if session.scalar(select(DeadlineProposal.id).where(DeadlineProposal.version_id == version.id)):
        return
    pages = session.scalars(select(ResourceText).where(ResourceText.version_id == version.id)
                            .order_by(ResourceText.page_number)).all()
    matches = []
    for page in pages:
        for found in DATE_PATTERN.finditer(page.text[:30_000]):
            context = page.text[max(0, found.start() - 100):found.start()]
            if not DEADLINE_CONTEXT.search(context):
                continue
            try:
                candidate = datetime(int(found[3]), int(found[2]), int(found[1]), tzinfo=UTC).date()
            except ValueError:
                continue
            if candidate < utc_now().date():
                continue
            quote = " ".join(page.text[max(0, found.start() - 95):min(len(page.text), found.end() + 75)].split())[:300]
            matches.append((candidate, page.page_number, quote))
    if len({item[0] for item in matches}) != 1 or not matches:
        return
    candidate, page_number, quote = matches[0]
    old = session.scalar(select(Deadline).where(
        Deadline.source == "document", Deadline.source_key == f"resource:{resource.id}:deadline"))
    if old and old.due_at.date() == candidate:
        return
    for pending in session.scalars(select(DeadlineProposal).where(
        DeadlineProposal.resource_id == resource.id, DeadlineProposal.status == "proposed")).all():
        pending.status = "superseded"
        pending.decided_at = utc_now()
    session.add(DeadlineProposal(resource_id=resource.id, version_id=version.id,
                                 page_number=page_number, quote=quote, candidate_date=candidate,
                                 status="proposed", created_at=utc_now()))
