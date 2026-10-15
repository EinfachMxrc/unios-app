# SPDX-License-Identifier: AGPL-3.0-or-later
"""Approved calendar and mail metadata, with no private feed/source URLs."""

from datetime import UTC

from app.ai.access import course_access
from app.ai.context_repository import mail_rows, timetable_rows


def timetable_context(session, start, end) -> list[dict]:
    permitted = course_access(session)
    return [{"id": item.id, "title": item.title, "course_id": item.course_id,
             "starts_at": item.starts_at.replace(tzinfo=UTC).isoformat(),
             "ends_at": item.ends_at.replace(tzinfo=UTC).isoformat() if item.ends_at else None}
            for item in timetable_rows(session, start, end)
            if permitted(item.course_id)]


def mail_context(session, since, limit) -> list[dict]:
    permitted = course_access(session)
    return [{"id": item.id, "sender": item.sender, "subject": item.subject,
             "received_at": item.received_at.replace(tzinfo=UTC).isoformat() if item.received_at else None,
             "candidate_date": item.candidate_date.isoformat() if item.candidate_date else None,
             "status": item.status}
            for item, course_id in mail_rows(session, since, limit)
            if permitted(course_id)]
