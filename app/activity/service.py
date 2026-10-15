# SPDX-License-Identifier: AGPL-3.0-or-later

"""Turn existing facts into a concise, provenance-aware timeline."""

from datetime import datetime

from pydantic import BaseModel

from app.activity.repository import ActivityRepository, Fact


class ActivityItem(BaseModel):
    at: datetime
    title: str
    detail: str
    source: str


TITLES = {
    "topic_merge": "Lernthemen zusammengeführt",
    "relation_created": "Verknüpfung angelegt", "relation_removed": "Verknüpfung entfernt",
    "undo": "Änderung rückgängig gemacht", "intake_change": "Eingang bearbeitet",
    "change": "Änderung erkannt", "material_version": "Materialversion gespeichert",
    "annotation": "Markierung angelegt", "note_version": "Notizversion gespeichert",
    "submission": "Abgabeversuch erfasst", "registration": "Anmeldestatus geprüft",
    "grade": "Notenwert gespeichert", "project_created": "Projekt angelegt",
    "project_updated": "Projekt bearbeitet", "repo_snapshot": "Git-Stand erfasst",
    "anki_review": "Karte wiederholt", "exercise": "Übung bearbeitet",
    "metadata": "Eigenschaften zuletzt bearbeitet",
    "intake": "Eingang bearbeitet",
}


class ActivityService:
    def __init__(self, repository: ActivityRepository):
        self.repository = repository

    def list(self, kind: str, entity_id: str) -> list[ActivityItem] | None:
        if kind not in {"course", "material", "assignment", "note", "exam", "project", "topic"}:
            raise ValueError("Unbekannter Objekttyp")
        if kind != "note" and (not entity_id.isdecimal() or int(entity_id) < 1):
            raise ValueError("Ungültige Objekt-ID")
        facts = self.repository.facts(kind, entity_id)
        if facts is None:
            return None
        ordered: list[Fact] = sorted(facts, key=lambda item: item.at.replace(tzinfo=None), reverse=True)[:80]
        return [ActivityItem(at=row.at, title=TITLES[row.kind], detail=row.subject, source=row.source)
                for row in ordered]
