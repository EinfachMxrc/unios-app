# SPDX-License-Identifier: AGPL-3.0-or-later

"""Notes that quote a PDF, derived from the source links the reader writes.

The reader inserts excerpts as ``[Name · 4](/material/<version>?page=4)``.
Reading those links back gives the reverse direction for free: no second
index to keep consistent, and a deleted quote disappears on the next save.
"""

import re
from typing import TypedDict

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.db.models import ResourceVersion

SOURCE_LINK = re.compile(r"\(/material/(\d+)\?page=(\d+)\)")
CITATION_LIMIT = 50


class Citation(TypedDict):
    note_id: str
    title: str
    course_name: str
    revision: int
    pages: list[int]
    current_version: bool


def cited_pages(body: str, version_ids: set[int]) -> list[int]:
    """Sorted, distinct pages of the given versions that ``body`` links to."""
    pages = {
        int(page)
        for version, page in SOURCE_LINK.findall(body)
        if int(version) in version_ids and int(page) >= 1
    }
    return sorted(pages)


def citations_for(session: Session, version: ResourceVersion) -> list[Citation]:
    """Newest notes first; a quote of an older version of the same file still counts."""
    version_ids = set(session.scalars(
        select(ResourceVersion.id).where(ResourceVersion.resource_id == version.resource_id)).all())
    # Cheap pre-filter in SQLite; the exact link grammar is checked in Python.
    rows = session.execute(text("""
        SELECT n.id, n.title, n.current_revision, c.name AS course_name, f.body
        FROM notes AS n JOIN courses AS c ON c.id = n.course_id
        JOIN notes_fts AS f ON f.note_id = n.id
        WHERE instr(f.body, '(/material/') > 0
        ORDER BY n.updated_at DESC
    """)).mappings()
    citations: list[Citation] = []
    for row in rows:
        body = row["body"]
        pages = cited_pages(body, version_ids)
        if not pages:
            continue
        citations.append({
            "note_id": row["id"], "title": row["title"], "course_name": row["course_name"],
            "revision": row["current_revision"], "pages": pages,
            "current_version": bool(cited_pages(body, {version.id})),
        })
        if len(citations) >= CITATION_LIMIT:
            break
    return citations
