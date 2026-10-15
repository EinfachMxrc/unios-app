# SPDX-License-Identifier: AGPL-3.0-or-later

"""Explainable local suggestions from terms shared by current note revisions."""

import math
import re
from collections import Counter

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.db.models import Course, LinkEdge, Note, Semester

STOP = {"aber", "alle", "auch", "beim", "dann", "dass", "deine", "dieser", "eine", "einem",
        "einen", "einer", "für", "haben", "hier", "oder", "sich", "sind", "über", "unter",
        "und", "wird", "wurde", "werden", "vorlesung", "kernkonzepte", "hinweise", "prüfung",
        "offene", "fragen", "verknüpfte", "übungsblätter"}


def _terms(value: str) -> set[str]:
    return {word for word in re.findall(r"[a-zäöüß]{4,}", value.casefold()) if word not in STOP}


def related_notes(session: Session, note_id: str, limit: int = 5) -> list[dict]:
    source = session.get(Note, note_id)
    if source is None:
        return []
    rows = session.execute(text("SELECT note_id, title, body FROM notes_fts")).mappings().all()
    terms = {row["note_id"]: _terms(row["title"] + " " + row["body"][:8000]) for row in rows}
    own = terms.get(note_id, set())
    if not own:
        return []
    frequency = Counter(word for words in terms.values() for word in words)
    linked = {edge.to_id if edge.from_id == note_id else edge.from_id for edge in session.scalars(
        select(LinkEdge).where(
            ((LinkEdge.from_type == "note") & (LinkEdge.from_id == note_id) & (LinkEdge.to_type == "note")) |
            ((LinkEdge.to_type == "note") & (LinkEdge.to_id == note_id) & (LinkEdge.from_type == "note"))
        )).all()}
    found = []
    for row in rows:
        other_id = row["note_id"]
        if other_id == note_id or other_id in linked:
            continue
        common = own & terms[other_id]
        if not common:
            continue
        rank = sum(math.log((len(rows) + 1) / (frequency[word] + 1)) + 1 for word in common)
        other = session.get(Note, other_id)
        if other is None:
            continue
        course = session.get(Course, other.course_id)
        semester = session.get(Semester, course.semester_id) if course and course.semester_id else None
        found.append((rank, {
            "id": other.id, "title": other.title, "course_name": course.name if course else "",
            "semester_name": semester.name if semester else None,
            "shared_terms": sorted(common, key=lambda word: (-len(word), word))[:3],
        }))
    return [item for _, item in sorted(found, key=lambda row: (-row[0], row[1]["title"]))[:limit]]
