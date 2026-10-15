# SPDX-License-Identifier: AGPL-3.0-or-later

"""Persist course module labels without duplicating learning topics."""

from sqlalchemy import select

from app.config import Settings
from app.db.models import Course, LearningTopic, StudyModule, utc_now
from app.learning.progress import TopicProgress, progress_for_topics


class ModuleRepository:
    def __init__(self, factory):
        self.factory = factory

    def overview(self, settings: Settings) -> tuple[list[tuple[StudyModule, Course]], list[TopicProgress]]:
        with self.factory() as session:
            modules = list(session.execute(select(StudyModule, Course)
                .join(Course, Course.id == StudyModule.course_id)
                .order_by(Course.name, StudyModule.name)).all())
            topics = list(session.scalars(select(LearningTopic)).all())
            return modules, progress_for_topics(session, settings, topics)

    def course_exists(self, course_id: int) -> bool:
        with self.factory() as session:
            return session.get(Course, course_id) is not None

    def names(self, course_id: int) -> list[str]:
        with self.factory() as session:
            return list(session.scalars(select(StudyModule.name).where(
                StudyModule.course_id == course_id)).all())

    def create(self, course_id: int, name: str) -> StudyModule:
        with self.factory() as session:
            module = StudyModule(course_id=course_id, name=name, revision=1,
                                 created_at=utc_now(), updated_at=utc_now())
            session.add(module)
            session.commit()
            return module

    def rename(self, module_id: int, name: str, expected_revision: int) -> str:
        with self.factory() as session:
            module = session.get(StudyModule, module_id)
            if module is None:
                return "missing"
            if module.revision != expected_revision:
                return "conflict"
            existing = session.scalars(select(StudyModule).where(
                StudyModule.course_id == module.course_id, StudyModule.id != module_id)).all()
            if any(item.name.casefold() == name.casefold() for item in existing):
                return "duplicate"
            module.name = name
            module.revision += 1
            module.updated_at = utc_now()
            session.commit()
            return "ok"

    def assign(self, topic_id: int, module_id: int | None, expected_module_id: int | None) -> str:
        with self.factory() as session:
            topic = session.get(LearningTopic, topic_id)
            if topic is None:
                return "missing"
            if topic.module_id != expected_module_id:
                return "conflict"
            if module_id is not None:
                module = session.get(StudyModule, module_id)
                if module is None or module.course_id != topic.course_id:
                    return "wrong_course"
            topic.module_id = module_id
            session.commit()
            return "ok"
