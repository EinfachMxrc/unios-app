# SPDX-License-Identifier: AGPL-3.0-or-later
"""Atomic reconciliation of projected appointments, retaining stable event IDs."""

from sqlalchemy import delete, select

from app.db.models import CalendarEvent


class TimetableRepository:
    def __init__(self, factory):
        self.factory = factory

    def replace(self, source: str, rows: list[dict], coordinator) -> None:
        with self.factory() as session:
            existing = {row.source_key: row for row in session.scalars(
                select(CalendarEvent).where(CalendarEvent.source == source)).all()}
            seen = set()
            for value in rows:
                key = value["source_key"]
                seen.add(key)
                row = existing.get(key)
                if row is None:
                    row = CalendarEvent(source=source, **value)
                    session.add(row)
                else:
                    for field, content in value.items():
                        setattr(row, field, content)
            # This table is a projection of the subscribed feed, not personal notes.
            # Cancellation/removal is applied only after a fully validated fetch.
            for key, row in existing.items():
                if key not in seen:
                    session.delete(row)
            coordinator.assert_writer()
            session.commit()

    def stop(self, source: str, coordinator) -> None:
        with self.factory() as session:
            session.execute(delete(CalendarEvent).where(CalendarEvent.source == source))
            coordinator.assert_writer()
            session.commit()

    def list_events(self, source: str, start, end) -> list[dict]:
        with self.factory() as session:
            rows = session.scalars(select(CalendarEvent).where(
                CalendarEvent.source == source, CalendarEvent.starts_at >= start,
                CalendarEvent.starts_at < end).order_by(CalendarEvent.starts_at)).all()
            return [{"id": row.id, "title": row.title, "starts_at": row.starts_at,
                     "ends_at": row.ends_at} for row in rows]
