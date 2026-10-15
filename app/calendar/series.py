# SPDX-License-Identifier: AGPL-3.0-or-later
"""Weekly civil-time rules; canonical feed appointments retain their identity and values."""
import json
from datetime import UTC, datetime, time, timedelta
from hashlib import sha256
from zoneinfo import ZoneInfo

from app.calendar.selection import weekly_slot
from app.db.models import CalendarEvent, CalendarSeriesRule
from app.timeutil import as_utc

BERLIN = ZoneInfo('Europe/Berlin')


def series_slot(event: CalendarEvent, timezone=BERLIN) -> str:
    return weekly_slot({'title': event.title, 'starts_at': event.starts_at}, timezone)['id']


def rule_adjustment(event: CalendarEvent, rules: list[CalendarSeriesRule], timezone=BERLIN) -> CalendarEvent | None:
    if not event.source.startswith('timetable-'):
        return None
    day = as_utc(event.starts_at).astimezone(timezone).date()
    key = series_slot(event, timezone)
    rule = next((value for value in reversed(rules) if value.source == event.source and value.slot_id == key
                 and (value.from_day is None or day >= value.from_day)), None)
    if rule is None:
        return None
    payload = rule.payload

    def instant(name):
        clock = payload.get(name)
        if clock is None:
            return None
        civil = datetime.combine(day + timedelta(days=payload[name + '_day']), time.fromisoformat(clock))
        aware = civil.replace(tzinfo=timezone)
        # A missing civil time during the spring clock change is not a real appointment time.
        if aware.astimezone(UTC).astimezone(timezone).replace(tzinfo=None) != civil:
            raise ValueError('Diese Serienzeit existiert wegen der Zeitumstellung nicht')
        return aware.astimezone(UTC)

    return CalendarEvent(id=-rule.id, source='calendar-adjustment', source_key=f'series:{rule.id}',
                         title=payload['title'] or event.title, starts_at=instant('start'),
                         ends_at=instant('end'), course_id=event.course_id, url=None)


def series_revision(events: list[CalendarEvent], adjustments: dict, rules: list[CalendarSeriesRule],
                    key: str, source: str, timezone=BERLIN) -> str:
    def snapshot(event):
        if event is None:
            return None
        return {'id': event.id, 'key': event.source_key, 'title': event.title,
                'start': as_utc(event.starts_at).isoformat(),
                'end': as_utc(event.ends_at).isoformat() if event.ends_at else None}
    rows = [(snapshot(event), snapshot(adjustments.get(f'{event.source}:{event.source_key}')))
            for event in sorted(events, key=lambda row: row.id) if event.source == source and series_slot(event, timezone) == key]
    selected = [(rule.id, str(rule.from_day), rule.payload) for rule in rules if rule.source == source and rule.slot_id == key]
    return sha256(json.dumps([rows, selected], sort_keys=True).encode()).hexdigest()
