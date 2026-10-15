# SPDX-License-Identifier: AGPL-3.0-or-later

"""Build honest module summaries from measured topic outcomes."""

from pydantic import BaseModel

from app.config import Settings
from app.modules.repository import ModuleRepository


class ModuleView(BaseModel):
    id: int
    course_id: int
    course_name: str
    name: str
    revision: int
    topic_ids: list[int]
    measured_topics: int
    topic_count: int
    anki_retention: float | None
    exercise_accuracy: float | None


class ModuleService:
    def __init__(self, repository: ModuleRepository, settings: Settings):
        self.repository = repository
        self.settings = settings

    def list(self) -> list[ModuleView]:
        modules, progress = self.repository.overview(self.settings)
        result: list[ModuleView] = []
        for module, course in modules:
            included = [item for item in progress if item.topic.module_id == module.id]
            reviews = [(item.anki_retention, item.anki_review_count) for item in included
                       if item.anki_retention is not None]
            attempts = [(item.exercise_accuracy, item.exercise_attempt_count) for item in included
                        if item.exercise_accuracy is not None]
            result.append(ModuleView(
                id=module.id, course_id=course.id, course_name=course.name,
                name=module.name, revision=module.revision,
                topic_ids=[item.topic.id for item in included],
                measured_topics=sum(item.anki_retention is not None or item.exercise_accuracy is not None
                                    for item in included), topic_count=len(included),
                anki_retention=(sum(value * count for value, count in reviews) / sum(count for _, count in reviews)
                                if reviews else None),
                exercise_accuracy=(sum(value * count for value, count in attempts) / sum(count for _, count in attempts)
                                   if attempts else None)))
        return result

    def create(self, course_id: int, name: str) -> None:
        name = name.strip()
        if not name:
            raise ValueError("Name fehlt")
        if not self.repository.course_exists(course_id):
            raise LookupError("Kurs nicht gefunden")
        if any(existing.casefold() == name.casefold() for existing in self.repository.names(course_id)):
            raise ValueError("Modulname existiert bereits")
        self.repository.create(course_id, name)

    def rename(self, module_id: int, name: str, expected_revision: int) -> None:
        if not name.strip():
            raise ValueError("Name fehlt")
        result = self.repository.rename(module_id, name.strip(), expected_revision)
        if result == "missing":
            raise LookupError("Lernmodul nicht gefunden")
        if result == "conflict":
            raise RuntimeError("Lernmodul wurde inzwischen geändert")
        if result == "duplicate":
            raise ValueError("Modulname existiert bereits")

    def assign(self, topic_id: int, module_id: int | None, expected_module_id: int | None) -> None:
        result = self.repository.assign(topic_id, module_id, expected_module_id)
        if result == "missing":
            raise LookupError("Lernthema nicht gefunden")
        if result == "conflict":
            raise RuntimeError("Lernthema wurde inzwischen verschoben")
        if result == "wrong_course":
            raise ValueError("Modul gehört nicht zum Kurs")
