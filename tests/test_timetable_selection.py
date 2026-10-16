# SPDX-License-Identifier: AGPL-3.0-or-later
"""Personal slot selection across schedule, journal and iCal, using invented events."""

from datetime import UTC, date, datetime

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.calendar.feed import build_calendar
from app.calendar.selection import TimetableSelection, slot
from app.calendar.service import TimetableService
from app.db.models import CalendarEvent
from app.main import create_app


def row(key: str, hour: int, minute: int = 0, *, day: int = 5, room: str = 'A-12') -> dict:
    return {'source_key': key, 'title': f'English Workshop · {room}',
            'starts_at': datetime(2026, 10, day, hour, minute, tzinfo=UTC),
            'ends_at': datetime(2026, 10, day, hour + 1, minute, tzinfo=UTC),
            'course_id': None, 'url': None}


def test_selection_survives_reload_room_change_sync_and_dst_without_deleting_events(settings, factory, coordinator):
    service = TimetableService(settings, factory, coordinator)
    rows = [row('first', 8), row('second', 9, 45), row('third', 12, 15)]
    service.repository.replace(service.source, rows, coordinator)
    for option in service.slots():
        service.select_slot(option['id'], option['start_time'] == '10:00')
    reloaded = TimetableService(settings, factory, coordinator)
    assert [value['id'] for value in reloaded.events(date(2026, 10, 5))] == [service.events(date(2026, 10, 5))[0]['id']]
    assert len(reloaded.events(date(2026, 10, 5))) == 1
    rows += [row('winter-first', 9, day=26, room='B-44'), row('winter-second', 10, 45, day=26, room='B-44')]
    service.repository.replace(service.source, rows, coordinator)
    assert len(reloaded.events(date(2026, 10, 26))) == 1  # 10:00 after DST, room-independent
    # A moved or new slot must appear for review, never be silently inferred.
    rows.append(row('moved', 13, day=26))
    service.repository.replace(service.source, rows, coordinator)
    assert len(reloaded.events(date(2026, 10, 26))) == 2
    other_profile = settings.model_copy(update={'institution_slug': 'generic'})
    assert TimetableSelection(other_profile).hidden() == set()
    with factory() as session:
        assert session.scalar(select(func.count(CalendarEvent.id))) == 6


def test_api_selection_filters_every_personal_calendar_view_but_retains_manual_events(settings, factory, coordinator):
    service = TimetableService(settings, factory, coordinator)
    rows = [row('first', 8), row('second', 9, 45)]
    service.repository.replace(service.source, rows, coordinator)
    with factory() as session:
        session.add(CalendarEvent(source='manual', **row('personal', 9, 45)))
        session.commit()
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        options = client.get('/api/timetable/selection').json()
        later = next(value for value in options if value['start_time'] == '11:45')
        assert client.put('/api/timetable/selection', json={'slot_id': later['id'], 'visible': False}).status_code == 200
        assert len(client.get('/api/timetable/events?day=2026-10-05').json()) == 1
        assert len(client.get('/api/deadlines').json()['events']) == 2
        assert len(client.get('/api/journal/2026-10-05').json()['sessions']) == 2
        calendar = client.get('/calendar.ics').text
        assert calendar.count('BEGIN:VEVENT') == 2
        assert client.put('/api/timetable/selection', json={'slot_id': 'a' * 64, 'visible': False}).status_code == 400
        assert client.put('/api/timetable/selection', json={'slot_id': later['id'], 'visible': True}).status_code == 200
        assert len(client.get('/api/timetable/events?day=2026-10-05').json()) == 2
    with factory() as session:
        assert session.scalar(select(func.count(CalendarEvent.id))) == 3
        assert build_calendar(session).count(b'BEGIN:VEVENT') == 3  # portable export retains originals


def test_slot_identity_is_subject_and_local_weekly_slot_not_room_or_event_id(settings):
    assert slot(row('one', 8), settings)['id'] == slot(row('two', 8, day=12, room='Other'), settings)['id']
    assert slot(row('one', 8), settings)['id'] != slot(row('two', 8, day=6), settings)['id']


def test_slots_the_student_hid_stay_hidden_from_the_assistant(settings, factory, coordinator):
    from app.ai.context import timetable_context

    service = TimetableService(settings, factory, coordinator)
    service.repository.replace(service.source, [row('first', 8), row('second', 9, 45)], coordinator)
    later = next(option for option in service.slots() if option['start_time'] == '11:45')
    service.select_slot(later['id'], False)
    start, end = datetime(2026, 10, 5, tzinfo=UTC), datetime(2026, 10, 6, tzinfo=UTC)
    with factory() as session:
        assert len(timetable_context(session, start, end, settings)) == 1
        assert len(timetable_context(session, start, end)) == 2  # without settings nothing is hidden


def test_hidden_slots_do_not_block_study_blocks(settings, factory, coordinator):
    from app.learning.blocks import _busy_intervals

    service = TimetableService(settings, factory, coordinator)
    service.repository.replace(service.source, [row('first', 8), row('second', 9, 45)], coordinator)
    option = next(value for value in service.slots() if value['start_time'] == '11:45')
    service.select_slot(option['id'], False)
    with factory() as session:
        assert len(_busy_intervals(session, settings)) == 1
