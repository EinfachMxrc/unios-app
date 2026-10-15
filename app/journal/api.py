# SPDX-License-Identifier: AGPL-3.0-or-later

"""Daily study facts from existing records, with versioned personal additions."""

from datetime import UTC, date, datetime, time, timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.calendar.dedupe import visible_events
from app.config import Settings
from app.courses.classification import teaching_courses
from app.db.models import (
    AnkiReview,
    Course,
    ExerciseAttempt,
    Jot,
    MaterialAnnotation,
    Note,
    Resource,
    ResourceVersion,
    StudyJournalCourse,
    StudyJournalDay,
    utc_now,
)
from app.host.lease import HostCoordinator
from app.timeutil import as_utc


class JournalSession(BaseModel):
    id: int
    title: str
    course_id: int | None
    course_name: str | None
    starts_at: datetime
    ends_at: datetime | None


class JournalItem(BaseModel):
    id: str
    title: str
    course_id: int | None = None
    course_name: str | None = None
    url: str | None = None


class JournalCourse(BaseModel):
    course_id: int
    course_name: str
    covered: str
    revision: int


class JournalView(BaseModel):
    day: date
    reflection: str
    revision: int
    sessions: list[JournalSession]
    materials: list[JournalItem]
    notes: list[JournalItem]
    questions: list[JournalItem]
    jots: list[JournalItem]
    reviews: int
    attempts: int
    incorrect_attempts: int
    courses: list[JournalCourse]


class ReflectionInput(BaseModel):
    expected_revision: int = Field(ge=0)
    reflection: str = Field(max_length=10_000)


class CourseCoverageInput(BaseModel):
    expected_revision: int = Field(ge=0)
    covered: str = Field(max_length=5_000)


def _window(day: date, settings: Settings) -> tuple[datetime, datetime]:
    start = datetime.combine(day, time.min, tzinfo=settings.timezone)
    end = datetime.combine(day + timedelta(days=1), time.min, tzinfo=settings.timezone)
    return (start.astimezone(UTC).replace(tzinfo=None),
            end.astimezone(UTC).replace(tzinfo=None))


def journal_router(settings: Settings, factory, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/journal")

    @router.get("/{day}", response_model=JournalView)
    def read_day(day: date):
        start, end = _window(day, settings)
        with factory() as session:
            entry = session.get(StudyJournalDay, day)
            course_by_id = {course.id: course for course in session.scalars(select(Course)).all()}
            sessions = [JournalSession(id=event.id, title=event.title, course_id=course.id if course else None,
                                       course_name=course.name if course else None,
                                       starts_at=event.starts_at, ends_at=event.ends_at)
                        for event in visible_events(session, settings)
                        for course in [course_by_id.get(event.course_id)]
                        if as_utc(start) <= as_utc(event.starts_at) < as_utc(end)]
            materials = [JournalItem(id=str(version.id), title=resource.name, course_id=course.id,
                                     course_name=course.name, url=f"/material/{version.id}")
                         for version, resource, course in session.execute(
                             select(ResourceVersion, Resource, Course)
                             .join(Resource, ResourceVersion.resource_id == Resource.id)
                             .join(Course, Resource.course_id == Course.id)
                             .where(ResourceVersion.downloaded_at >= start, ResourceVersion.downloaded_at < end,
                                    Resource.group_category != "other_group")
                             .order_by(ResourceVersion.downloaded_at.desc())).all()]
            notes = [JournalItem(id=note.id, title=note.title, course_id=course.id,
                                 course_name=course.name, url=f"/notes?id={note.id}")
                     for note, course in session.execute(select(Note, Course).join(Course, Note.course_id == Course.id)
                         .where(Note.updated_at >= start, Note.updated_at < end)
                         .order_by(Note.updated_at.desc())).all()]
            questions = [JournalItem(id=item.id, title=item.comment or item.quote[:160],
                                     course_id=course.id, course_name=course.name,
                                     url=f"/material/{item.source_version_id}#annotation-{item.id}")
                         for item, course in session.execute(
                             select(MaterialAnnotation, Course)
                             .join(Resource, MaterialAnnotation.resource_id == Resource.id)
                             .join(Course, Resource.course_id == Course.id)
                             .where(MaterialAnnotation.kind == "question", MaterialAnnotation.resolved.is_(False),
                                    MaterialAnnotation.created_at >= start, MaterialAnnotation.created_at < end,
                                    Resource.group_category != "other_group")
                             .order_by(MaterialAnnotation.created_at.desc())).all()]
            jots = [JournalItem(id=jot.id, title=jot.body[:160], course_id=course.id if course else None,
                                course_name=course.name if course else None, url=f"/jots#jot-{jot.id}")
                    for jot, course in session.execute(select(Jot, Course).outerjoin(Course, Jot.course_id == Course.id)
                        .where(Jot.created_at >= start, Jot.created_at < end)
                        .order_by(Jot.created_at.desc())).all()]
            reviews = session.scalar(select(func.count()).select_from(AnkiReview)
                                     .where(AnkiReview.reviewed_at >= start, AnkiReview.reviewed_at < end)) or 0
            attempts = session.scalar(select(func.count()).select_from(ExerciseAttempt)
                                      .where(ExerciseAttempt.attempted_at >= start,
                                             ExerciseAttempt.attempted_at < end)) or 0
            incorrect = session.scalar(select(func.count()).select_from(ExerciseAttempt)
                                       .where(ExerciseAttempt.attempted_at >= start,
                                              ExerciseAttempt.attempted_at < end,
                                              ExerciseAttempt.correct.is_(False))) or 0
            coverage = session.execute(select(StudyJournalCourse, Course)
                                       .join(Course, StudyJournalCourse.course_id == Course.id)
                                       .where(StudyJournalCourse.day == day)).all()
            active_ids = set(session.scalars(select(Course.id).where(Course.is_active.is_(True), teaching_courses())))
            # Downloading a file is not evidence that a lecture took place.
            names = {item.course_id: item.course_name for item in sessions
                     if item.course_id and item.course_id in active_ids and item.course_name}
            names.update({course.id: course.name for _, course in coverage})
            covered_by_course = {item.course_id: item for item, _ in coverage}
            courses = [JournalCourse(course_id=course_id, course_name=name,
                                     covered=covered_by_course[course_id].covered if course_id in covered_by_course else "",
                                     revision=covered_by_course[course_id].revision if course_id in covered_by_course else 0)
                       for course_id, name in sorted(names.items(), key=lambda pair: pair[1].casefold())]
            return JournalView(day=day, reflection=entry.reflection if entry else "",
                               revision=entry.revision if entry else 0, sessions=sessions, materials=materials,
                               notes=notes, questions=questions, jots=jots, reviews=reviews, attempts=attempts,
                               incorrect_attempts=incorrect, courses=courses)

    @router.put("/{day}/reflection", response_model=JournalView)
    def save_reflection(day: date, payload: ReflectionInput):
        coordinator.assert_writer()
        with factory() as session:
            entry = session.get(StudyJournalDay, day)
            revision = entry.revision if entry else 0
            if payload.expected_revision != revision:
                raise HTTPException(409, "Der Studientag wurde inzwischen geändert")
            if entry is None:
                session.add(StudyJournalDay(day=day, reflection=payload.reflection.strip(),
                                            revision=1, updated_at=utc_now()))
            else:
                entry.reflection = payload.reflection.strip()
                entry.revision += 1
                entry.updated_at = utc_now()
            session.commit()
        return read_day(day)

    @router.put("/{day}/courses/{course_id}", response_model=JournalView)
    def save_coverage(day: date, course_id: int, payload: CourseCoverageInput):
        coordinator.assert_writer()
        with factory() as session:
            if session.get(Course, course_id) is None:
                raise HTTPException(404, "Kurs nicht gefunden")
            entry = session.scalar(select(StudyJournalCourse).where(
                StudyJournalCourse.day == day, StudyJournalCourse.course_id == course_id))
            revision = entry.revision if entry else 0
            if payload.expected_revision != revision:
                raise HTTPException(409, "Kursnotiz wurde inzwischen geändert")
            if entry is None:
                session.add(StudyJournalCourse(day=day, course_id=course_id,
                                               covered=payload.covered.strip(), revision=1,
                                               updated_at=utc_now()))
            else:
                entry.covered = payload.covered.strip()
                entry.revision += 1
                entry.updated_at = utc_now()
            session.commit()
        return read_day(day)

    return router
