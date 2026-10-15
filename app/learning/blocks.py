# SPDX-License-Identifier: AGPL-3.0-or-later

"""Rule-based study block suggestions: weak topics before an upcoming exam,
scheduled around the timetable, exams, deadlines and other study blocks
instead of blindly at 18:00 every day.
"""

from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import or_, select

from app.calendar.dedupe import visible_events
from app.config import Settings
from app.db.models import (
    Deadline,
    Exam,
    Resource,
    ResourceVersion,
    StudyBlockSuggestion,
)
from app.learning.progress import topics_for_course
from app.timeutil import as_utc

# Preference order for a study slot's local start time: the usual evening
# slot first, then a bit earlier, then a bit later, then early afternoon.
CANDIDATE_HOURS: tuple[int, ...] = (18, 16, 20, 14)

# A calendar event without an explicit end (rare, but the field is optional)
# is assumed to block a typical single class slot rather than nothing.
DEFAULT_EVENT_DURATION = timedelta(hours=1)
EXAM_DURATION = timedelta(hours=2)
DEADLINE_LEAD_TIME = timedelta(hours=1)

BusyInterval = tuple[datetime, datetime]


def _local_slot(settings: Settings, day: date, hour: int) -> datetime:
    """``hour``:00 wall-clock time in ``settings.timezone`` on ``day``, converted to UTC.

    Building this directly in UTC (``slot.replace(hour=...)``) silently
    picks that hour in UTC, which is an hour or two off from Europe/Berlin
    depending on DST.
    """
    return datetime.combine(day, time(hour, 0), settings.timezone).astimezone(UTC)


def _busy_intervals(session, *, exclude_block_ids: set[int] | None = None) -> list[BusyInterval]:
    """Every already-committed instant a new study block must not overlap."""
    busy: list[BusyInterval] = []
    for event in visible_events(session):
        start = as_utc(event.starts_at)
        end = as_utc(event.ends_at) if event.ends_at is not None else start + DEFAULT_EVENT_DURATION
        busy.append((start, end))
    for exam in session.scalars(select(Exam).where(Exam.exam_at.is_not(None))).all():
        start = as_utc(exam.exam_at)
        busy.append((start, start + EXAM_DURATION))
    for deadline in session.scalars(select(Deadline).where(Deadline.removed_upstream.is_(False))).all():
        due = as_utc(deadline.due_at)
        busy.append((due - DEADLINE_LEAD_TIME, due))
    for block in session.scalars(select(StudyBlockSuggestion).where(
            StudyBlockSuggestion.status == "accepted")).all():
        if exclude_block_ids and block.id in exclude_block_ids:
            continue
        start = as_utc(block.starts_at)
        busy.append((start, start + timedelta(minutes=block.duration_minutes)))
    return busy


def _overlaps_any(start: datetime, end: datetime, busy: list[BusyInterval]) -> bool:
    return any(start < busy_end and busy_start < end for busy_start, busy_end in busy)


def _find_slot(settings: Settings, day: date, now: datetime, exam_at: datetime,
               duration_minutes: int, busy: list[BusyInterval]) -> datetime | None:
    """Walk backward day by day from ``day`` for the first free candidate hour.

    Stops once a day has no candidate strictly between ``now`` and
    ``exam_at`` -- every earlier day is further in the past and would not
    have one either.
    """
    duration = timedelta(minutes=duration_minutes)
    while True:
        candidates = [slot for slot in (_local_slot(settings, day, hour) for hour in CANDIDATE_HOURS)
                      if now < slot and slot + duration <= exam_at]
        for candidate in candidates:
            if not _overlaps_any(candidate, candidate + duration, busy):
                return candidate
        if not candidates:
            return None
        day -= timedelta(days=1)


def suggest_blocks(session, settings: Settings, now: datetime) -> None:
    """Replan open suggestions from current progress and exam dates; keep decisions stable."""
    horizon = now + timedelta(days=settings.study_block_lookahead_days)
    exams = session.scalars(select(Exam).where(
        Exam.exam_at.is_not(None), Exam.exam_at > now, Exam.exam_at <= horizon,
        Exam.course_id.is_not(None),
    )).all()
    for block, exam in session.execute(select(StudyBlockSuggestion, Exam)
            .join(Exam, Exam.id == StudyBlockSuggestion.exam_id)
            .where(StudyBlockSuggestion.status == "proposed")).all():
        if exam.exam_at is None or not now < as_utc(exam.exam_at) <= horizon:
            session.delete(block)
    if not exams:
        session.commit()
        return
    busy = _busy_intervals(session)
    for exam in exams:
        all_progress = topics_for_course(session, settings, exam.course_id)
        progress = [item for item in all_progress if item.is_weak]
        if not progress:
            past_paper = session.scalar(select(Resource.id).join(
                ResourceVersion, ResourceVersion.resource_id == Resource.id).where(
                    Resource.course_id == exam.course_id,
                    Resource.group_category != "other_group",
                    Resource.removed_upstream.is_(False),
                    ResourceVersion.downloaded_at >= now - timedelta(days=14),
                    or_(Resource.name.ilike("%altklausur%"), Resource.name.ilike("%probeklausur%"),
                        Resource.name.ilike("%musterklausur%")),
                ).limit(1))
            if past_paper is not None and all_progress:
                progress = [min(all_progress, key=lambda item: min(
                    item.anki_retention if item.anki_retention is not None else 0.5,
                    item.exercise_accuracy if item.exercise_accuracy is not None else 0.5))]
        progress.sort(key=lambda item: min(
            item.anki_retention if item.anki_retention is not None else 0.5,
            item.exercise_accuracy if item.exercise_accuracy is not None else 0.5))
        existing = {row.topic_id: row for row in session.scalars(select(StudyBlockSuggestion).where(
            StudyBlockSuggestion.exam_id == exam.id)).all()}
        weak_ids = {item.topic.id for item in progress}
        for topic_id, row in existing.items():
            if row.status == "proposed" and topic_id not in weak_ids:
                session.delete(row)
        exam_at = as_utc(exam.exam_at)
        slot_day = (exam_at - timedelta(days=1)).astimezone(settings.timezone).date()
        for item in progress:
            topic = item.topic
            previous = existing.get(topic.id)
            if previous is not None and previous.status != "proposed":
                continue
            starts_at = _find_slot(settings, slot_day, now, exam_at, settings.study_block_minutes, busy)
            slot_day -= timedelta(days=1)
            if starts_at is None:
                continue
            if previous is None:
                session.add(StudyBlockSuggestion(
                    exam_id=exam.id, topic_id=topic.id, duration_minutes=settings.study_block_minutes,
                    starts_at=starts_at, status="proposed", created_at=now))
            else:
                previous.starts_at = starts_at
            # Keep this exam's own remaining topics (and any later exam) from
            # landing on the slot just handed out.
            busy.append((starts_at, starts_at + timedelta(minutes=settings.study_block_minutes)))
    session.commit()
