# SPDX-License-Identifier: AGPL-3.0-or-later

from datetime import UTC, datetime, timedelta

from icalendar import Calendar, Event
from sqlalchemy import select

from app.calendar.dedupe import visible_events
from app.config import Settings
from app.db.models import (
    Deadline,
    Exam,
    LearningTopic,
    PublicSemesterPeriod,
    StudyBlockSuggestion,
)
from app.files.sidecars import safe_external_url
from app.timeutil import as_utc

EXPORT_SOURCES = frozenset({'timetable', 'appointments', 'personal', 'deadlines', 'exams', 'study', 'periods'})


def build_calendar(session, settings: Settings | None = None, sources: set[str] | None = None) -> bytes:
    selected = EXPORT_SOURCES if sources is None else sources
    if not selected <= EXPORT_SOURCES:
        raise ValueError('Unbekannte Kalenderquelle')
    calendar = Calendar()
    calendar.add("prodid", "-//UniOS//DE")
    calendar.add("version", "2.0")
    calendar.add("x-wr-calname", "UniOS")

    def add_item(kind: str, item_id: int, title: str, start: datetime,
                 end: datetime | None = None, url: str | None = None):
        event = Event()
        event.add("uid", f"{kind}-{item_id}@marc-uni-os.local")
        event.add("summary", title)
        event.add("dtstart", as_utc(start))
        if end:
            event.add("dtend", as_utc(end))
        event.add("dtstamp", datetime.now(UTC))
        clean_url = safe_external_url(url)
        if clean_url:
            event.add("url", clean_url)
        calendar.add_component(event)

    for item in session.scalars(select(Deadline).where(Deadline.removed_upstream.is_(False))).all() if "deadlines" in selected else []:
        title = item.title if item.source in {"primuss-registration", "primuss-enrollment"} else f"Abgabe: {item.title}"
        add_item("deadline", item.id, title, item.due_at, url=item.url)
    for item in visible_events(session, settings):
        source = 'timetable' if item.source.startswith('timetable-') else 'personal' if item.source == 'calendar-personal' else 'appointments'
        if source not in selected:
            continue
        add_item("event", item.id, item.title, item.starts_at, item.ends_at, item.url)
    for item in session.scalars(select(Exam).where(Exam.exam_at.is_not(None))).all() if "exams" in selected else []:
        add_item("exam", item.id, f"Prüfung: {item.title}", item.exam_at)
    for block, topic in session.execute(
        select(StudyBlockSuggestion, LearningTopic)
        .join(LearningTopic, LearningTopic.id == StudyBlockSuggestion.topic_id)
        .where(StudyBlockSuggestion.status == "accepted")
    ).all() if "study" in selected else []:
        end = block.starts_at + timedelta(minutes=block.duration_minutes)
        add_item("study-block", block.id, f"Lernblock: {topic.name}", block.starts_at, end)
    for item in session.scalars(select(PublicSemesterPeriod)).all() if "periods" in selected else []:
        event = Event()
        event.add("uid", f"public-period-{item.id}@marc-uni-os.local")
        kind = "Rückmeldezeitraum" if item.kind == "enrollment" else "Prüfungsanmeldung"
        event.add("summary", f"Öffentliche Frist: {kind} · {item.semester} (persönlichen Status prüfen)")
        event.add("dtstart", item.ends_on)
        event.add("dtend", item.ends_on + timedelta(days=1))
        event.add("dtstamp", datetime.now(UTC))
        event.add("url", item.source_url)
        calendar.add_component(event)
    return calendar.to_ical()
