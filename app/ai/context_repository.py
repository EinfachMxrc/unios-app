# SPDX-License-Identifier: AGPL-3.0-or-later
"""Bounded read queries for assistant context."""

from sqlalchemy import select

from app.calendar.dedupe import visible_events
from app.db.models import Deadline, MailItem
from app.timeutil import as_utc


def timetable_rows(session, start, end):
    return [row for row in visible_events(session)
            if as_utc(start) <= as_utc(row.starts_at) < as_utc(end)][:500]


def mail_rows(session, since, limit):
    return session.execute(select(MailItem, Deadline.course_id)
        .outerjoin(Deadline, MailItem.deadline_id == Deadline.id)
        .where(MailItem.received_at >= since)
        .order_by(MailItem.received_at.desc(), MailItem.id.desc()).limit(limit)).all()
