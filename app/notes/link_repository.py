# SPDX-License-Identifier: AGPL-3.0-or-later

"""Metadata projections for note-title resolution; no note files or bodies."""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Course, Note


@dataclass(frozen=True)
class NoteLinkTarget:
    id: str
    title: str
    course_name: str


def title_rows(session: Session) -> list[tuple[str, str]]:
    return [(identifier, title) for identifier, title in session.execute(select(Note.id, Note.title))]


class NoteLinkRepository:
    def __init__(self, factory):
        self.factory = factory

    def targets(self) -> list[NoteLinkTarget]:
        with self.factory() as session:
            rows = session.execute(select(Note.id, Note.title, Course.name).join(Course))
            return [NoteLinkTarget(identifier, title, course_name) for identifier, title, course_name in rows]
