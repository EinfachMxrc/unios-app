# SPDX-License-Identifier: AGPL-3.0-or-later

"""Server-side permissions shared by every AI entry point."""

from collections.abc import Callable

from sqlalchemy import select

from app.db.models import AiAccess

CATEGORIES = {"course_material": "Kursmaterial", "learning_questions": "Offene Fragen",
              "deadlines": "Fristen", "projects": "Projekt-Repositories",
              "exam_status": "Prüfungsstatus", "submission_status": "Abgabestatus",
              "timetable": "Stundenplan", "mail": "Mail-Hinweise (ohne Inhalt und Anhänge)",
              "notes": "Eigene Notizen und Schnellerfassung", "exercises": "Übungen und Lösungen",
              "project_code": "Projektcode und Symbole", "learning_state": "Freigegebene Lernkarten",
              "coding_tutor": "Coding-Aufgaben, Versuche und angefordertes Tutor-Feedback"}
DEFAULT_CATEGORIES = {"course_material", "learning_questions"}


def allowed(session, key: str) -> bool:
    item = session.get(AiAccess, key)
    if item is not None:
        return item.allowed
    if key.startswith("course:"):
        return True
    return key.removeprefix("category:") in DEFAULT_CATEGORIES if key.startswith("category:") else False


def course_access(session) -> Callable[[int | None], bool]:
    """Course permissions for a whole list in one query; answers like ``allowed(session, "course:<id>")``.

    A course is released unless it was explicitly blocked, so only blocked rows are read.
    """
    blocked = set(session.scalars(select(AiAccess.key).where(
        AiAccess.key.startswith("course:"), AiAccess.allowed.is_(False))).all())
    return lambda course_id: f"course:{course_id}" not in blocked
