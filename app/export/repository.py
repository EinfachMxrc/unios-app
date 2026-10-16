# SPDX-License-Identifier: AGPL-3.0-or-later

"""Read public study data from the consistent export snapshot."""

from pathlib import Path

from sqlalchemy import URL, create_engine, select
from sqlalchemy.orm import Session

from app.calendar.feed import build_calendar
from app.config import Settings
from app.db.models import Base

TABLES = {
    "courses": "courses", "semesters": "semesters", "assignments": "assignments",
    "exams": "exams", "deadlines": "deadlines", "notes": "notes",
    "note_versions": "note_versions", "materials": "resources", "material_versions": "resource_versions",
    "annotations": "material_annotations", "relationships": "links", "topics": "learning_topics",
    "exercises": "exercises", "exercise_attempts": "exercise_attempts", "projects": "projects",
    "captures": "jots", "journal": "study_journal_days", "journal_courses": "study_journal_courses",
    "card_proposals": "anki_card_queue", "card_links": "anki_cards", "card_reviews": "anki_reviews",
    "views": "smart_collections", "properties": "object_metadata", "calendar_events": "calendar_events", "calendar_series_rules": "calendar_series_rules",
    "grades": "grades", "mail": "mail_items", "inbox": "inbox_clips", "voice": "voice_memos",
}


def portable_rows(snapshot: Path, settings: Settings) -> tuple[dict[str, list[dict]], bytes]:
    engine = create_engine(URL.create("sqlite", database=str(snapshot)))
    try:
        with Session(engine) as session:
            rows = {name: [dict(row) for row in session.execute(select(Base.metadata.tables[table])).mappings()]
                    for name, table in TABLES.items()}
            return rows, build_calendar(session, settings)
    finally:
        engine.dispose()
