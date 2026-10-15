# SPDX-License-Identifier: AGPL-3.0-or-later
"""Invented calendar appointments: persistence, overlays, undo and concurrent-device protection."""

from datetime import UTC, date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from app.calendar.edit_service import CalendarEditError
from app.calendar.service import TimetableService
from app.corpus.repository import sources
from app.db.models import CalendarEvent, LocalAction
from app.main import create_app
from app.timeutil import as_utc


def payload(**changes):
    return {'title': 'Mathe üben', 'starts_at': '2026-10-06T12:00:00Z',
            'ends_at': '2026-10-06T13:00:00Z', **changes}


def seed(service, coordinator, *, ends_at=True):
    service.repository.replace(service.source, [{'source_key': 'fictional-lecture', 'title': 'Testvorlesung · Raum A',
        'starts_at': datetime(2026, 10, 6, 8, tzinfo=UTC),
        'ends_at': datetime(2026, 10, 6, 9, tzinfo=UTC) if ends_at else None, 'course_id': None, 'url': None}], coordinator)
    return next(iter(service.events(date(2026, 10, 5))), None)


def test_own_events_work_without_subscription_persist_and_appear_in_every_calendar(settings, factory, coordinator):
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert not client.get('/api/timetable/status').json()['subscribed']
        response = client.post('/api/timetable/events', json=payload())
        assert response.status_code == 201
        change = response.json()
        event = change['event']
        assert event['personal'] and not event['adjusted']
        assert client.get('/api/timetable/events?day=2026-10-05').json()[0]['id'] == event['id']
        assert client.get('/api/deadlines').json()['events'][0]['title'] == 'Mathe üben'
        assert client.get('/api/journal/2026-10-06').json()['sessions'][0]['id'] == event['id']
        assert 'Mathe üben' in client.get('/calendar.ics').text
        moved = client.patch(f"/api/timetable/events/{event['id']}", json=payload(
            revision=event['revision'], starts_at='2026-10-13T13:00:00Z', ends_at='2026-10-13T14:30:00Z')).json()
        assert client.get('/api/timetable/events?day=2026-10-05').json() == []
        assert client.get('/api/timetable/events?day=2026-10-12').json()[0]['ends_at'].startswith('2026-10-13T14:30')
        assert client.patch(f"/api/timetable/events/{event['id']}", json=payload(revision=event['revision'])).status_code == 409
        restored = client.post(f"/api/timetable/changes/{moved['undo_id']}/undo").json()['event']
        assert restored['starts_at'].startswith('2026-10-06T12:00')
        assert client.post(f"/api/timetable/changes/{moved['undo_id']}/undo").status_code == 409
        deleted = client.request('DELETE', f"/api/timetable/events/{event['id']}", json={'revision': restored['revision']}).json()
        assert deleted['event'] is None
        assert 'Mathe üben' not in client.get('/calendar.ics').text
        assert not client.get('/api/journal/2026-10-06').json()['sessions']
        assert client.post(f"/api/timetable/changes/{deleted['undo_id']}/undo").json()['event']['id'] == event['id']
        actions = client.get('/api/local-actions?kind=calendar').json()
        creation = next(action for action in actions if action['id'] == change['undo_id'])
        assert creation['undoable']
        assert client.post(f"/api/local-actions/{change['undo_id']}/undo").status_code == 200
        assert client.get('/api/timetable/events?day=2026-10-05').json() == []
        assert client.post(f"/api/timetable/changes/{change['undo_id']}/undo").status_code == 409
        # A fresh own appointment is retained across construction of another service.
        client.post('/api/timetable/events', json=payload())
    reloaded = TimetableService(settings, factory, coordinator)
    assert reloaded.events(date(2026, 10, 5))[0]['title'] == 'Mathe üben'


def test_dragged_import_is_a_personal_overlay_survives_sync_and_reset_is_undoable(settings, factory, coordinator):
    service = TimetableService(settings, factory, coordinator)
    original = seed(service, coordinator)
    changed = service.edits.update(original['id'], original['revision'], 'Testvorlesung · Raum A',
        datetime(2026, 10, 14, 10, tzinfo=UTC), datetime(2026, 10, 14, 11, tzinfo=UTC))
    assert changed['event']['adjusted'] and not changed['event']['personal']
    assert service.events(date(2026, 10, 5)) == []
    assert service.events(date(2026, 10, 12))[0]['id'] == original['id']
    with factory() as session:
        upstream = session.get(CalendarEvent, original['id'])
        assert as_utc(upstream.starts_at) == datetime(2026, 10, 6, 8, tzinfo=UTC)
    seed(service, coordinator)  # Normal reconciliation retains the overlay and the source identity.
    assert service.events(date(2026, 10, 12))[0]['starts_at'] == datetime(2026, 10, 14, 10, tzinfo=UTC)
    reset = service.edits.remove(original['id'], changed['event']['revision'], reset=True)
    assert not reset['event']['adjusted']
    service.edits.create('Other event', datetime(2026, 10, 15, 8, tzinfo=UTC), datetime(2026, 10, 15, 9, tzinfo=UTC))
    assert service.edits.undo(reset['undo_id'])['event']['adjusted']
    with factory() as session:
        assert len(session.scalars(select(LocalAction)).all()) == 3
    service.repository.stop(service.source, coordinator)
    assert [row['title'] for row in service.events(date(2026, 10, 12))] == ['Other event']  # No ghost of a cancelled source.


def test_feed_change_blocks_stale_undo_and_unknown_end_is_never_invented(settings, factory, coordinator):
    service = TimetableService(settings, factory, coordinator)
    original = seed(service, coordinator, ends_at=False)
    moved = service.edits.update(original['id'], original['revision'], original['title'], datetime(2026, 10, 7, 8, tzinfo=UTC), None)
    assert moved['event']['ends_at'] is None
    seed(service, coordinator)  # University supplies a real duration after the user's edit.
    with pytest.raises(CalendarEditError) as failure:
        service.edits.undo(moved['undo_id'])
    assert failure.value.status == 409


def test_api_validates_ranges_timezones_and_cannot_delete_university_events(settings, factory, coordinator):
    service = TimetableService(settings, factory, coordinator)
    imported = seed(service, coordinator)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        for values in [payload(title='  '), payload(ends_at='2026-10-06T11:00:00Z'), payload(starts_at='2026-10-06T12:00:00'),
                       payload(ends_at='2026-12-06T13:00:00Z')]:
            assert client.post('/api/timetable/events', json=values).status_code == 422
        assert client.request('DELETE', f"/api/timetable/events/{imported['id']}", json={'revision': imported['revision']}).status_code == 422
        assert client.patch('/api/timetable/events/999999', json=payload(revision='a' * 64)).status_code == 404


def test_week_window_uses_civil_days_and_includes_overnight_continuations(settings, factory, coordinator):
    service = TimetableService(settings, factory, coordinator)
    event = service.edits.create('Late study', datetime(2026, 10, 24, 21, tzinfo=UTC), datetime(2026, 10, 25, 1, tzinfo=UTC))['event']
    assert service.events(date(2026, 10, 25))[0]['id'] == event['id']
    service.edits.create('Last winter hour', datetime(2026, 10, 25, 22, 45, tzinfo=UTC), datetime(2026, 10, 25, 23, tzinfo=UTC))
    assert len(service.events(date(2026, 10, 19))) == 2  # Seven Berlin days contain 169 hours this week.


def test_search_context_indexes_effective_events_and_never_indexes_removed_or_internal_rows(settings, factory, coordinator):
    service = TimetableService(settings, factory, coordinator)
    original = seed(service, coordinator)
    service.edits.update(original['id'], original['revision'], 'Moved study', datetime(2026, 10, 14, 10, tzinfo=UTC),
                         datetime(2026, 10, 14, 11, tzinfo=UTC))
    with factory() as session:
        projected = list(sources(session, settings, f"event:{original['id']}"))
        assert projected[0].title == 'Moved study'
        assert '2026-10-14 10:00' in projected[0].pages[0][1]
        assert session.scalar(text('SELECT generation FROM corpus_dirty WHERE entity_ref=:ref'),
                              {'ref': f"event:{original['id']}"}) >= 2
        internal = session.scalar(select(CalendarEvent).where(CalendarEvent.source == 'calendar-adjustment'))
        assert list(sources(session, settings, f'event:{internal.id}')) == []
    own = service.edits.create('Private appointment', datetime(2026, 10, 15, 8, tzinfo=UTC), datetime(2026, 10, 15, 9, tzinfo=UTC))['event']
    service.edits.remove(own['id'], own['revision'])
    with factory() as session:
        assert list(sources(session, settings, f"event:{own['id']}")) == []
