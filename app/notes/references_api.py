# SPDX-License-Identifier: AGPL-3.0-or-later

"""Incoming wikilinks and exact title mentions in current note versions."""

import re
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, text

from app.config import Settings
from app.db.models import LinkEdge, Note
from app.host.lease import HostCoordinator
from app.notes.document import link_first_mention
from app.notes.link_repository import title_rows
from app.notes.link_service import index_titles, title_key
from app.notes.store import (
    NoteConflict,
    NoteCorrupt,
    NoteMissing,
    read_note_document,
    update_note,
)

PROTECTED = re.compile(r"\[\[[^\]\n]+\]\]|`[^`\n]*`")


class ReferenceView(BaseModel):
    id: str
    title: str
    course_name: str
    excerpt: str
    revision: int


class ReferencesView(BaseModel):
    backlinks: list[ReferenceView]
    mentions: list[ReferenceView]
    can_link: bool


class LinkMentionInput(BaseModel):
    expected_revision: int = Field(ge=1)


def _first_unlinked(body: str, title: str) -> tuple[int, int] | None:
    pattern = re.compile(r"(?<!\w)" + re.escape(title) + r"(?!\w)", re.IGNORECASE)
    fenced = False
    offset = 0
    for line in body.splitlines(keepends=True):
        if line.lstrip().startswith("```"):
            fenced = not fenced
        elif not fenced:
            cursor = 0
            for protected in PROTECTED.finditer(line):
                found = pattern.search(line, cursor, protected.start())
                if found:
                    return offset + found.start(), offset + found.end()
                cursor = protected.end()
            found = pattern.search(line, cursor)
            if found:
                return offset + found.start(), offset + found.end()
        offset += len(line)
    return None


def _excerpt(body: str, span: tuple[int, int]) -> str:
    start, end = span
    return " ".join(body[max(0, start - 65): min(len(body), end + 95)].split())


def references_router(settings: Settings, factory, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/notes")

    @router.get("/{note_id}/references", response_model=ReferencesView)
    def references(note_id: UUID):
        target_id = str(note_id)
        with factory() as session:
            target = session.get(Note, target_id)
            if target is None:
                raise HTTPException(404, "Notiz nicht gefunden")
            same_title = index_titles(title_rows(session)).get(title_key(target.title), [])
            can_link = len(same_title) == 1
            linked_ids = set(session.scalars(select(LinkEdge.from_id).where(
                LinkEdge.from_type == "note", LinkEdge.to_type == "note",
                LinkEdge.to_id == target_id, LinkEdge.relation == "wikilink")).all())
            rows = session.execute(text("""
                SELECT n.id, n.title, n.current_revision, c.name AS course_name, f.body
                FROM notes AS n JOIN courses AS c ON c.id = n.course_id
                JOIN notes_fts AS f ON f.note_id = n.id
                WHERE n.id != :target
                ORDER BY n.updated_at DESC
            """), {"target": target_id}).mappings().all()
            backlinks: list[ReferenceView] = []
            mentions: list[ReferenceView] = []
            for row in rows:
                body = row["body"]
                span = _first_unlinked(body, target.title)
                item = ReferenceView(id=row["id"], title=row["title"], course_name=row["course_name"],
                                     excerpt=_excerpt(body, span) if span else body[:160].replace("\n", " "),
                                     revision=row["current_revision"])
                if row["id"] in linked_ids:
                    backlinks.append(item)
                elif span:
                    mentions.append(item)
                if len(backlinks) >= 50 and len(mentions) >= 50:
                    break
            return ReferencesView(backlinks=backlinks[:50], mentions=mentions[:50], can_link=can_link)

    @router.post("/{note_id}/link-mention/{source_id}", response_model=ReferencesView)
    def link_mention(note_id: UUID, source_id: UUID, payload: LinkMentionInput):
        coordinator.assert_writer()
        if note_id == source_id:
            raise HTTPException(400, "Notiz kann nicht auf sich selbst verweisen")
        with factory() as session:
            target = session.get(Note, str(note_id))
            if target is None:
                raise HTTPException(404, "Zielnotiz nicht gefunden")
            same_title = index_titles(title_rows(session)).get(title_key(target.title), [])
            if len(same_title) != 1:
                raise HTTPException(409, "Notiztitel ist nicht eindeutig")
            try:
                source, _, document, _ = read_note_document(session, settings, str(source_id))
                if source.current_revision != payload.expected_revision:
                    raise HTTPException(409, "Ausgangsnotiz wurde inzwischen geändert")
                if not link_first_mention(document, target.title):
                    raise HTTPException(409, "Erwähnung nicht mehr vorhanden")
                update_note(session, settings, source.id, expected_revision=payload.expected_revision,
                            title=source.title, document=document)
            except NoteMissing:
                raise HTTPException(404, "Ausgangsnotiz nicht gefunden") from None
            except NoteConflict:
                raise HTTPException(409, "Ausgangsnotiz wurde inzwischen geändert") from None
            except NoteCorrupt:
                raise HTTPException(503, "Notizdatei konnte nicht geprüft werden") from None
        return references(note_id)

    return router
