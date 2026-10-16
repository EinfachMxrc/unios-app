# SPDX-License-Identifier: AGPL-3.0-or-later

"""Quick captures with client UUIDs for safe offline retries."""

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import Course, Jot, Note, utc_now
from app.db.trash import INCLUDE_TRASHED
from app.intake.smart_capture import triage


class JotError(ValueError):
    pass


class JotConflict(JotError):
    pass


class JotMissing(JotError):
    pass


def _relation(session: Session, course_id: int | None, note_id: str | None) -> tuple[int | None, str | None]:
    if note_id is not None:
        try:
            note_id = str(UUID(note_id))
        except ValueError:
            raise JotError("Ungültige Notiz-ID") from None
        note = session.get(Note, note_id)
        if note is None:
            raise JotMissing("Notiz nicht gefunden")
        if course_id is not None and course_id != note.course_id:
            raise JotError("Notiz gehört nicht zu diesem Kurs")
        course_id = note.course_id
    if course_id is not None and session.get(Course, course_id) is None:
        raise JotMissing("Kurs nicht gefunden")
    return course_id, note_id


def capture(session: Session, *, jot_id: str, kind: str, body: str,
            created_at: datetime, course_id: int | None = None, note_id: str | None = None,
            settings: Settings | None = None) -> Jot:
    try:
        jot_id = str(UUID(jot_id))
    except ValueError:
        raise JotError("Ungültige Eintrags-ID") from None
    if kind not in {"thought", "question", "todo"}:
        raise JotError("Ungültige Art")
    body = body.strip()
    if not body or len(body) > 10_000:
        raise JotError("Text muss zwischen 1 und 10000 Zeichen enthalten")
    if created_at.tzinfo is None:
        raise JotError("Zeitstempel braucht eine Zeitzone")
    created_at = created_at.astimezone(UTC)
    # A retried capture that was trashed meanwhile stays in the trash.
    existing = session.get(Jot, jot_id, execution_options=INCLUDE_TRASHED)
    if existing is not None:
        if existing.kind != kind or existing.body != body:
            raise JotConflict("Eintrags-ID wurde bereits für anderen Inhalt benutzt")
        if settings is not None and existing.deleted_at is None:
            triage(session, existing, settings)
            session.commit()
        return existing
    course_id, note_id = _relation(session, course_id, note_id)
    jot = Jot(id=jot_id, kind=kind, body=body, course_id=course_id,
              note_id=note_id, created_at=created_at, updated_at=utc_now())
    session.add(jot)
    session.execute(text("INSERT INTO jots_fts(jot_id, body) VALUES (:id, :body)"),
                    {"id": jot_id, "body": body})
    if settings is not None:
        triage(session, jot, settings)
    session.commit()
    return jot


def assign(session: Session, jot_id: str, *, course_id: int | None, note_id: str | None,
           settings: Settings | None = None) -> Jot:
    try:
        jot_id = str(UUID(jot_id))
    except ValueError:
        raise JotMissing("Eintrag nicht gefunden") from None
    jot = session.get(Jot, jot_id)
    if jot is None:
        raise JotMissing("Eintrag nicht gefunden")
    course_id, note_id = _relation(session, course_id, note_id)
    jot.course_id = course_id
    jot.note_id = note_id
    jot.updated_at = utc_now()
    if settings is not None and course_id is not None:
        triage(session, jot, settings)
    session.commit()
    return jot


def search_jots(session: Session, query: str, *, course_id: int | None = None,
                semester_id: int | None = None, limit: int = 50) -> list[dict]:
    from app.extract.search import search_expression

    expression = search_expression(query)
    if not expression:
        return []
    rows = session.execute(text("""
        SELECT j.id, j.kind, j.course_id, c.name AS course_name,
               s.name AS semester_name, j.note_id, j.created_at,
               snippet(jots_fts, 1, '【', '】', '…', 18) AS excerpt
        FROM jots_fts
        JOIN jots AS j ON j.id = jots_fts.jot_id
        LEFT JOIN courses AS c ON c.id = j.course_id
        LEFT JOIN semesters AS s ON s.id = c.semester_id
        WHERE jots_fts MATCH :expression
          AND (:course_id IS NULL OR c.id = :course_id)
          AND (:semester_id IS NULL OR s.id = :semester_id)
        ORDER BY bm25(jots_fts), j.created_at DESC
        LIMIT :limit
    """), {"expression": expression, "course_id": course_id,
           "semester_id": semester_id, "limit": min(max(limit, 1), 100)}).mappings().all()
    return [dict(row) for row in rows]
