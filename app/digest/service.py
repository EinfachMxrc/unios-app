# SPDX-License-Identifier: AGPL-3.0-or-later

"""Prepare a local weekly summary; push contains only a neutral link."""

from datetime import UTC, date, datetime, time, timedelta

from pydantic import BaseModel
from sqlalchemy import func, select

from app.config import Settings
from app.db.models import (
    AnkiCard,
    AnkiCardQueue,
    AnkiReview,
    Course,
    CourseSection,
    Deadline,
    DigestPreference,
    Resource,
    ResourceVersion,
    SectionGroupAssignment,
    WeeklyDigest,
    utc_now,
)
from app.files.sidecars import safe_external_url
from app.host.lease import HostCoordinator
from app.notify.links import dashboard_link_or_notice
from app.notify.service import Notifier


class CourseMaterialCount(BaseModel):
    course_id: int
    course_name: str
    count: int


class UpcomingDeadline(BaseModel):
    id: int
    title: str
    course_name: str | None
    due_at: datetime
    url: str | None


class OpenAssignmentCount(BaseModel):
    course_id: int
    course_name: str
    count: int


class AnkiStand(BaseModel):
    available: bool
    card_count: int
    review_count: int
    proposed_count: int


class DigestSummary(BaseModel):
    week_start: date
    week_end: date
    next_week_end: date
    materials: list[CourseMaterialCount]
    deadlines: list[UpcomingDeadline]
    anki: AnkiStand
    open_assignments: list[OpenAssignmentCount]


def week_start_for(moment: datetime, settings: Settings) -> date:
    local = moment.astimezone(settings.timezone)
    return local.date() - timedelta(days=local.weekday())


def _utc_bounds(day: date, settings: Settings) -> datetime:
    return datetime.combine(day, time.min, settings.timezone).astimezone(UTC).replace(tzinfo=None)


def build_digest(session, settings: Settings, moment: datetime) -> DigestSummary:
    week_start = week_start_for(moment, settings)
    week_end = week_start + timedelta(days=7)
    next_week_end = week_end + timedelta(days=7)
    start_utc = _utc_bounds(week_start, settings)
    end_utc = _utc_bounds(week_end, settings)
    next_end_utc = _utc_bounds(next_week_end, settings)
    materials = [
        CourseMaterialCount(course_id=course_id, course_name=name, count=count)
        for course_id, name, count in session.execute(
            select(Course.id, Course.name, func.count(ResourceVersion.id))
            .join(Resource, Resource.course_id == Course.id)
            .join(ResourceVersion, ResourceVersion.resource_id == Resource.id)
            .where(ResourceVersion.downloaded_at >= start_utc,
                   ResourceVersion.downloaded_at < end_utc,
                   Resource.group_category != "other_group")
            .group_by(Course.id, Course.name).order_by(Course.name)
        ).all()
    ]
    deadlines = [
        UpcomingDeadline(id=item.id, title=item.title, course_name=course_name,
                         due_at=item.due_at, url=safe_external_url(item.url))
        for item, course_name in session.execute(
            select(Deadline, Course.name).outerjoin(Course, Course.id == Deadline.course_id)
            .where(Deadline.due_at >= end_utc, Deadline.due_at < next_end_utc,
                   Deadline.removed_upstream.is_(False))
            .order_by(Deadline.due_at, Deadline.id)
        ).all()
    ]
    open_assignments = [
        OpenAssignmentCount(course_id=course_id, course_name=name, count=count)
        for course_id, name, count in session.execute(
            select(Course.id, Course.name, func.count(SectionGroupAssignment.id))
            .join(CourseSection, CourseSection.course_id == Course.id)
            .join(SectionGroupAssignment, SectionGroupAssignment.section_id == CourseSection.id)
            .where(SectionGroupAssignment.needs_confirmation.is_(True))
            .group_by(Course.id, Course.name).order_by(Course.name)
        ).all()
    ]
    card_count = session.scalar(select(func.count()).select_from(AnkiCard)) or 0
    review_count = session.scalar(select(func.count()).select_from(AnkiReview).where(
        AnkiReview.reviewed_at >= start_utc, AnkiReview.reviewed_at < end_utc)) or 0
    proposed_count = session.scalar(select(func.count()).select_from(AnkiCardQueue).where(
        AnkiCardQueue.status == "proposed")) or 0
    return DigestSummary(
        week_start=week_start, week_end=week_end, next_week_end=next_week_end,
        materials=materials, deadlines=deadlines, open_assignments=open_assignments,
        anki=AnkiStand(available=bool(card_count), card_count=card_count,
                       review_count=review_count, proposed_count=proposed_count),
    )


def digest_enabled(session) -> bool:
    preference = session.get(DigestPreference, 1)
    return preference.enabled if preference else True


def latest_digest(session) -> tuple[DigestSummary, datetime] | None:
    item = session.scalar(select(WeeklyDigest).order_by(WeeklyDigest.week_start.desc()).limit(1))
    if item is None:
        return None
    return DigestSummary.model_validate_json(item.summary_json), item.generated_at


def send_weekly_digest(factory, settings: Settings, coordinator: HostCoordinator,
                       notifier: Notifier, moment: datetime | None = None) -> WeeklyDigest | None:
    coordinator.assert_writer()
    moment = moment or datetime.now(settings.timezone)
    with factory() as session:
        if not digest_enabled(session):
            return None
        week_start = week_start_for(moment, settings)
        item = session.scalar(select(WeeklyDigest).where(WeeklyDigest.week_start == week_start))
        if item is None:
            item = WeeklyDigest(week_start=week_start, generated_at=utc_now(),
                                summary_json=build_digest(session, settings, moment).model_dump_json())
            session.add(item)
            session.flush()
        notifier.enqueue(session, f"weekly-digest:{week_start.isoformat()}", "Dein Wochenüberblick",
                         f"Dein Wochenüberblick ist bereit: {dashboard_link_or_notice(settings, '/digest')}")
        session.commit()
    notifier.deliver_pending(factory)
    return item
