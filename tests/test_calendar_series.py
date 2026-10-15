# SPDX-License-Identifier: AGPL-3.0-or-later
"""Fictional weekly slots: scope, DST, refresh, independent exceptions and guarded undo."""
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from icalendar import Calendar

from app.calendar.edit_service import CalendarEditError
from app.calendar.service import TimetableService
from app.db.models import CalendarEvent, Deadline
from app.main import create_app
from app.timeutil import as_utc

ZONE = ZoneInfo('Europe/Berlin')


def seed(service, coordinator, extra=False):
    rows = []
    for day in ['2026-10-06', '2026-10-13', '2026-10-27', '2026-10-08'] + (['2026-11-03'] if extra else []):
        start = datetime.fromisoformat(day + 'T14:15').replace(tzinfo=ZONE)
        end = start.replace(hour=15, minute=30)
        rows.append({'source_key': day, 'title': 'Fiktive Vorlesung · Raum A', 'starts_at': start.astimezone(UTC),
                     'ends_at': end.astimezone(UTC), 'course_id': None, 'url': None})
    service.repository.replace(service.source, rows, coordinator)


def event(service, day):
    return next(row for row in service.events(date.fromisoformat(day)) if row['starts_at'].astimezone(ZONE).date().isoformat() == day)


def edit(service, original, scope, start='2026-10-13T14:00+02:00', end='2026-10-13T15:30+02:00'):
    return service.edits.update(original['id'], original['revision'], original['title'],
        datetime.fromisoformat(start), datetime.fromisoformat(end), scope, original.get('series_revision'))


def test_weekly_future_rule_persists_across_sync_in_civil_time_and_undo_is_guarded(settings, factory, coordinator):
    service = TimetableService(settings, factory, coordinator)
    seed(service, coordinator)
    original = event(service, '2026-10-13')
    change = edit(service, original, 'future')
    assert event(service, '2026-10-06')['starts_at'].astimezone(ZONE).strftime('%H:%M') == '14:15'
    assert event(service, '2026-10-08')['starts_at'].astimezone(ZONE).strftime('%H:%M') == '14:15'
    assert event(service, '2026-10-27')['starts_at'] == datetime(2026, 10, 27, 13, tzinfo=UTC)
    with factory() as session:
        assert as_utc(session.get(CalendarEvent, original['id']).starts_at).hour == 12
        actions = service.edits.repository.action(session, change['undo_id'])
        assert actions.before['operation'] == 'series'
    # A normal sync can extend the feed; the saved rule also covers the new date.
    seed(service, coordinator, extra=True)
    assert event(service, '2026-11-03')['starts_at'].astimezone(ZONE).strftime('%H:%M') == '14:00'
    with pytest.raises(CalendarEditError, match='inzwischen'):
        service.edits.undo(change['undo_id'])
    with pytest.raises(CalendarEditError) as stale:
        edit(service, original, 'series')
    assert stale.value.status == 409


def test_whole_series_undo_and_single_instance_exceptions(settings, factory, coordinator):
    service = TimetableService(settings, factory, coordinator)
    seed(service, coordinator)
    original = event(service, '2026-10-13')
    single = event(service, '2026-10-27')
    exception = service.edits.update(single['id'], single['revision'], single['title'],
        datetime(2026, 10, 27, 15, tzinfo=UTC), datetime(2026, 10, 27, 16, tzinfo=UTC))
    change = edit(service, event(service, '2026-10-13'), 'series')
    assert event(service, '2026-10-06')['starts_at'].astimezone(ZONE).strftime('%H:%M') == '14:00'
    assert event(service, '2026-10-27')['starts_at'].hour == 15
    restored = service.edits.undo(change['undo_id'])
    assert restored['event']['starts_at'] == original['starts_at']
    assert event(service, '2026-10-06')['starts_at'].astimezone(ZONE).strftime('%H:%M') == '14:15'
    # Single edits retain their own version guard even when a series rule changes.
    assert service.edits.undo(exception['undo_id'])['event']['starts_at'] == single['starts_at']


def test_api_validates_scope_and_ical_source_filter_uses_effective_events(settings, factory, coordinator):
    service = TimetableService(settings, factory, coordinator)
    seed(service, coordinator)
    original = event(service, '2026-10-13')
    own = service.edits.create('Fiktiver eigener Termin', datetime(2026, 10, 13, 9, tzinfo=UTC), datetime(2026, 10, 13, 10, tzinfo=UTC))
    with factory() as session:
        session.add(Deadline(source='test', source_key='deadline', title='Fiktive Abgabe', due_at=datetime(2026, 10, 20, 8, tzinfo=UTC)))
        session.commit()
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        base = {'revision': original['revision'], 'title': original['title'], 'starts_at': '2026-10-13T12:00:00Z', 'ends_at': '2026-10-13T13:30:00Z'}
        assert client.patch(f"/api/timetable/events/{original['id']}", json={**base, 'scope': 'unknown'}).status_code == 422
        assert client.patch(f"/api/timetable/events/{original['id']}", json={**base, 'scope': 'series'}).status_code == 409
        change = client.patch(f"/api/timetable/events/{original['id']}", json={**base, 'scope': 'series', 'series_revision': original['series_revision']})
        assert change.status_code == 200
        timetable = Calendar.from_ical(client.get('/calendar.ics?sources=timetable').content).walk('VEVENT')
        assert len(timetable) == 4
        assert {str(row['SUMMARY']) for row in timetable} == {original['title']}
        assert timetable[0].decoded('DTSTART').astimezone(ZONE).strftime('%H:%M') == '14:00'
        personal = Calendar.from_ical(client.get('/calendar.ics?sources=personal').content).walk('VEVENT')
        assert len(personal) == 1 and str(personal[0]['SUMMARY']) == own['event']['title']
        assert len(Calendar.from_ical(client.get('/calendar.ics').content).walk('VEVENT')) == 6
        assert client.get('/calendar.ics?sources=unknown').status_code == 400
        assert client.get('/calendar.ics?sources=').status_code == 400
        actions = client.get('/api/local-actions?kind=calendar').json()
        assert next(row for row in actions if row['id'] == change.json()['undo_id'])['undoable']
        assert client.post(f"/api/local-actions/{change.json()['undo_id']}/undo").status_code == 200
