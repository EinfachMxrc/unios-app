# SPDX-License-Identifier: AGPL-3.0-or-later

"""Show one copy of identical Moodle and mycampus appointments."""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.calendar.edit_repository import ADJUSTMENT, DELETED, CalendarEditRepository
from app.calendar.projection import effective_events
from app.calendar.selection import TimetableSelection
from app.config import Settings
from app.db.models import CalendarEvent
from app.timeutil import as_utc


def _instant(value: datetime) -> datetime:
    return as_utc(value).astimezone(UTC)


def visible_events(session: Session, settings: Settings | None = None) -> list[CalendarEvent]:
    events = list(session.scalars(select(CalendarEvent).where(CalendarEvent.source != DELETED)
                                  .order_by(CalendarEvent.starts_at, CalendarEvent.id)).all())
    selection = TimetableSelection(settings) if settings is not None else None
    hidden = selection.hidden() if selection is not None else set()
    events = effective_events([event for event in events if event.source == ADJUSTMENT or selection is None
                               or event.source != selection.source or selection.visible(
                                   {'title': event.title, 'starts_at': event.starts_at}, hidden)], CalendarEditRepository.rules(session))
    primary = {(event.title.strip().casefold(), _instant(event.starts_at))
               for event in events if not event.source.startswith("mycampus-")}
    seen_campus: set[tuple[str, datetime]] = set()
    visible: list[CalendarEvent] = []
    for event in events:
        if event.source.startswith("mycampus-"):
            key = (event.title.strip().casefold(), _instant(event.starts_at))
            if key in primary or key in seen_campus:
                continue
            seen_campus.add(key)
        visible.append(event)
    return visible
