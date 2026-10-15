# SPDX-License-Identifier: AGPL-3.0-or-later
"""Calendar edits and their history use existing tables, without a schema migration."""

from contextlib import contextmanager
from uuid import uuid4

from sqlalchemy import select, text

from app.db.models import CalendarEvent, CalendarSeriesRule, LocalAction

PERSONAL = 'calendar-personal'
ADJUSTMENT = 'calendar-adjustment'
DELETED = 'calendar-deleted'


def adjustment_key(event: CalendarEvent) -> str:
    return f'{event.source}:{event.source_key}'


class CalendarEditRepository:
    def __init__(self, factory):
        self.factory = factory

    @contextmanager
    def transaction(self):
        with self.factory() as session:
            # Lock before checking revisions, including competing devices and background sync.
            session.connection().exec_driver_sql('BEGIN IMMEDIATE')
            yield session

    @staticmethod
    def rows(session) -> list[CalendarEvent]:
        return list(session.scalars(select(CalendarEvent).where(CalendarEvent.source != DELETED)).all())

    @staticmethod
    def rules(session) -> list[CalendarSeriesRule]:
        return list(session.scalars(select(CalendarSeriesRule).where(CalendarSeriesRule.active.is_(True))
                                   .order_by(CalendarSeriesRule.id)).all())

    @staticmethod
    def add_rule(session, values: dict) -> CalendarSeriesRule:
        rule = CalendarSeriesRule(**values)
        session.add(rule)
        session.flush()
        return rule

    @staticmethod
    def get_rule(session, identifier: int) -> CalendarSeriesRule | None:
        return session.get(CalendarSeriesRule, identifier)

    @staticmethod
    def get(session, identifier: int) -> CalendarEvent | None:
        return session.get(CalendarEvent, identifier)

    @staticmethod
    def adjustment(session, key: str) -> CalendarEvent | None:
        return session.scalar(select(CalendarEvent).where(CalendarEvent.source == ADJUSTMENT,
                                                           CalendarEvent.source_key == key))

    @staticmethod
    def add(session, values: dict) -> CalendarEvent:
        event = CalendarEvent(**values)
        session.add(event)
        session.flush()
        return event

    @staticmethod
    def remove(session, event: CalendarEvent) -> None:
        session.delete(event)
        session.flush()

    @staticmethod
    def invalidate(session, identifier: int) -> None:
        session.execute(text("INSERT INTO corpus_dirty(entity_ref) VALUES(:ref) "
                             "ON CONFLICT(entity_ref) DO UPDATE SET generation=generation+1"),
                        {'ref': f'event:{identifier}'})

    @staticmethod
    def history(session, identifier: int, before: dict) -> str:
        action = LocalAction(id=str(uuid4()), kind='calendar', entity_id=str(identifier),
                             course_id=None, before=before, expected_revision=0)
        session.add(action)
        return action.id

    @staticmethod
    def action(session, identifier: str) -> LocalAction | None:
        return session.get(LocalAction, identifier)

    @staticmethod
    def commit(session, coordinator) -> None:
        coordinator.assert_writer()
        session.commit()
