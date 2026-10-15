# SPDX-License-Identifier: AGPL-3.0-or-later
"""Read-only effective appointments shared by calendar, journal and export."""

from zoneinfo import ZoneInfo

from app.calendar.edit_repository import ADJUSTMENT, DELETED, adjustment_key
from app.calendar.series import rule_adjustment
from app.db.models import CalendarEvent, CalendarSeriesRule
from app.timeutil import as_utc

BERLIN = ZoneInfo('Europe/Berlin')


def effective_events(events: list[CalendarEvent], rules: list[CalendarSeriesRule] | None = None, timezone=BERLIN) -> list[CalendarEvent]:
    adjustments = {event.source_key: event for event in events if event.source == ADJUSTMENT}
    result = []
    for event in events:
        if event.source in {ADJUSTMENT, DELETED}:
            continue
        adjustment = adjustments.get(adjustment_key(event))
        if adjustment is None:
            try:
                adjustment = rule_adjustment(event, rules or [], timezone)
            except ValueError:
                pass
        if adjustment is not None:
            event = CalendarEvent(id=event.id, source=event.source, source_key=event.source_key,
                                  course_id=event.course_id, url=event.url, title=adjustment.title,
                                  starts_at=adjustment.starts_at, ends_at=adjustment.ends_at)
        result.append(event)
    return sorted(result, key=lambda event: (as_utc(event.starts_at), event.id))
