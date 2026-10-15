# SPDX-License-Identifier: AGPL-3.0-or-later

"""A suspiciously small Moodle snapshot must never mark the user's files as removed;
calendar events are stored without one query per event."""

import pytest
from sqlalchemy import event, select

from app.connectors.base import RemoteEvent
from app.db.models import CalendarEvent, Course
from app.notify.service import Notifier
from app.sync.engine import SyncEngine, from_timestamp, snapshot_implausible


@pytest.mark.parametrize(("previous_courses", "previous_resources", "courses", "resources", "expected"), [
    (None, None, 4, 30, False),     # first run with data
    (None, None, 0, 0, True),       # no course at all is never trusted
    (6, 120, 6, 118, False),        # normal small change
    (6, 120, 2, 118, True),         # fewer than half the courses
    (2, 120, 1, 118, False),        # tiny course counts are not judged by ratio
    (6, 120, 6, 50, True),          # fewer than half the files
    (6, 2, 6, 1, False),            # tiny file counts are not judged by ratio
    (6, 1, 6, 0, True),             # files existed, now none
    (6, 0, 6, 0, False),            # still no files is consistent
])
def test_snapshot_plausibility(previous_courses, previous_resources, courses, resources, expected):
    assert snapshot_implausible(previous_courses, previous_resources, courses, resources) is expected


def test_calendar_events_are_upserted_with_two_lookups_however_many_there_are(settings, factory, coordinator):
    with factory() as session:
        session.add(Course(source="moodle", source_id="c-1", name="Fiktive Mathematik"))
        session.add(CalendarEvent(source="moodle", source_key="e-0", title="Alt", starts_at=from_timestamp(1_800_000_000)))
        session.commit()
        engine = SyncEngine(factory, settings, [], Notifier(settings, coordinator), coordinator)
        events = [RemoteEvent(key=f"e-{index}", title=f"Termin {index}", starts_timestamp=1_800_000_000 + index * 3600,
                              ends_timestamp=None, url=None, course_key="c-1" if index % 2 == 0 else None)
                  for index in range(40)]
        selects: list[str] = []

        def count(_conn, _cursor, statement, *_args):
            if statement.lstrip().upper().startswith("SELECT"):
                selects.append(statement)

        bind = session.get_bind()
        event.listen(bind, "before_cursor_execute", count)
        try:
            engine._upsert_events(session, "moodle", events)
        finally:
            event.remove(bind, "before_cursor_execute", count)
        session.flush()
        # Was one per event plus one per linked course (60 here); now one each.
        assert len(selects) == 2
        stored = {item.source_key: item for item in session.scalars(select(CalendarEvent)).all()}
        course = session.scalar(select(Course))
        assert len(stored) == 40
        assert stored["e-0"].title == "Termin 0"
        assert stored["e-2"].course_id == course.id
        assert stored["e-1"].course_id is None
