# SPDX-License-Identifier: AGPL-3.0-or-later
from app.courses.repository import CourseRepository


class CourseService:
    def __init__(self, repository: CourseRepository, coordinator):
        self.repository = repository
        self.coordinator = coordinator

    def set_activity(self, course_id: int, active: bool, expected: bool) -> bool:
        self.coordinator.assert_writer()
        return self.repository.set_activity(course_id, active, expected, self.coordinator)

    def set_display_name(self, course_id: int, name: str | None, expected: str | None) -> str | None:
        self.coordinator.assert_writer()
        normalized = ' '.join(name.split()) if name else None
        return self.repository.set_display_name(course_id, normalized or None, expected, self.coordinator)
