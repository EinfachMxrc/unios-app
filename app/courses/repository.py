# SPDX-License-Identifier: AGPL-3.0-or-later
from sqlalchemy import update

from app.db.models import Course


class CourseRepository:
    def __init__(self, factory):
        self.factory = factory

    def set_display_name(self, course_id: int, name: str | None, expected: str | None, coordinator) -> str | None:
        with self.factory() as session:
            if session.get(Course, course_id) is None:
                raise LookupError("Kurs nicht gefunden")
            condition = Course.display_name.is_(None) if expected is None else Course.display_name == expected
            result = session.execute(update(Course).where(Course.id == course_id, condition).values(display_name=name))
            if result.rowcount != 1:
                session.rollback()
                raise ValueError("Der Anzeigename wurde inzwischen geändert. Bitte lade den Kurs neu.")
            coordinator.assert_writer()
            session.commit()
            return name

    def set_activity(self, course_id: int, active: bool, expected: bool, coordinator) -> bool:
        with self.factory() as session:
            course = session.get(Course, course_id)
            if course is None:
                raise LookupError("Kurs nicht gefunden")
            if course.is_active != expected:
                raise ValueError("Der Kursstatus wurde inzwischen geändert")
            result = session.execute(update(Course).where(Course.id == course_id, Course.is_active == expected)
                                     .values(is_active=active))
            if result.rowcount != 1:
                session.rollback()
                raise ValueError("Der Kursstatus wurde inzwischen geändert")
            coordinator.assert_writer()
            session.commit()
            return active
