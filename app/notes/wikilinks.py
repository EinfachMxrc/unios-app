# SPDX-License-Identifier: AGPL-3.0-or-later

"""Keep explicit [[note title]] links bidirectional without changing note files."""

import re

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.db.models import LinkEdge, Note, utc_now
from app.notes.link_repository import title_rows
from app.notes.link_service import index_titles, title_key

WIKILINK = re.compile(r"\[\[([^\[\]\n]{1,200})\]\]")


def _sync_source(session: Session, note_id: str, body: str, index: dict[str, list[str]],
                 existing: list[LinkEdge]) -> None:
    titles = {title_key(match.group(1)) for match in WIKILINK.finditer(body)}
    titles.discard("")
    # Ambiguity is global, including a source with the same title. Never guess
    # at a duplicate title by excluding one candidate before resolving it.
    targets = {index[title][0] for title in titles if len(index.get(title, [])) == 1
               and index[title][0] != note_id}
    linked = {edge.to_id for edge in existing}
    for edge in existing:
        if edge.to_id not in targets:
            session.delete(edge)
    for target in targets - linked:
        session.add(LinkEdge(from_type="note", from_id=note_id, to_type="note",
                             to_id=target, relation="wikilink", created_at=utc_now()))


def sync_wikilinks(session: Session, note: Note, body: str) -> dict[str, list[str]]:
    index = index_titles(title_rows(session))
    existing = list(session.scalars(select(LinkEdge).where(
        LinkEdge.from_type == "note", LinkEdge.from_id == note.id,
        LinkEdge.to_type == "note", LinkEdge.relation == "wikilink",
    )))
    _sync_source(session, note.id, body, index, existing)
    return index


def refresh_incoming_wikilinks(session: Session, changed_note_id: str,
                              title_index: dict[str, list[str]] | None = None) -> None:
    """Resolve links written before their target existed, including title changes."""
    rows = session.execute(text("SELECT note_id, body FROM notes_fts "
                                "WHERE note_id != :id AND body LIKE '%[[%'"),
                           {"id": changed_note_id}).all()
    index = title_index if title_index is not None else index_titles(title_rows(session))
    known_ids = {identifier for matches in index.values() for identifier in matches}
    edges: dict[str, list[LinkEdge]] = {}
    for edge in session.scalars(select(LinkEdge).where(
        LinkEdge.from_type == "note", LinkEdge.to_type == "note", LinkEdge.relation == "wikilink",
    )):
        edges.setdefault(edge.from_id, []).append(edge)
    for source_id, body in rows:
        if source_id in known_ids:
            _sync_source(session, source_id, body, index, edges.get(source_id, []))
