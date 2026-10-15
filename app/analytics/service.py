# SPDX-License-Identifier: AGPL-3.0-or-later

"""Convert recorded work into small, honest course and overall trends."""

from datetime import UTC, date, datetime, timedelta

from pydantic import BaseModel

from app.analytics.repository import AnalyticsRepository, AnalyticsRows
from app.config import Settings
from app.timeutil import as_utc


class DailyWork(BaseModel):
    day: date
    reviews: int
    attempts: int


class StudyStats(BaseModel):
    course_id: int | None
    name: str
    new_versions_7d: int
    new_versions_opened: int
    notes_created_7d: int
    reviews_7d: int
    attempts_7d: int
    open_questions: int
    upcoming_deadlines: int
    upcoming_exams: int
    topic_count: int
    measured_topics: int
    weak_topics: int
    measured_score: float | None
    retention_14d: float | None
    retention_delta_points: int | None
    exercise_accuracy_14d: float | None
    daily_work: list[DailyWork]


class StudyAnalytics(BaseModel):
    overall: StudyStats
    courses: list[StudyStats]
    computed_at: datetime


class AnalyticsService:
    def __init__(self, repository: AnalyticsRepository, settings: Settings):
        self.repository = repository
        self.settings = settings

    def report(self, now: datetime | None = None) -> StudyAnalytics:
        now = now or datetime.now(UTC)
        rows = self.repository.snapshot(self.settings, now)
        return StudyAnalytics(overall=self._stats(rows, now, None, "Gesamt"),
                              courses=[self._stats(rows, now, course.id, course.name) for course in rows.courses],
                              computed_at=now)

    def _stats(self, rows: AnalyticsRows, now: datetime, course_id: int | None, name: str) -> StudyStats:
        def selected(id_value: int | None) -> bool:
            return course_id is None or id_value == course_id

        versions = [version for version, resource in rows.versions
                    if selected(resource.course_id) and version.mime_type == "application/pdf"]
        notes = [item for item in rows.notes if selected(item.course_id)]
        questions = [item for item, resource in rows.questions if selected(resource.course_id)]
        progress = [item for item in rows.progress if selected(item.topic.course_id)]
        topic_scores: list[float] = []
        for item in progress:
            values = [value for value in (item.anki_retention, item.exercise_accuracy)
                      if value is not None]
            if values:
                topic_scores.append(sum(values) / len(values))
        topic_courses = {item.topic.id: item.topic.course_id for item in rows.progress}
        reviews = [item for item, topic_id in rows.reviews if selected(topic_courses.get(topic_id))]
        attempts = [item for item, topic_id in rows.attempts if selected(topic_courses.get(topic_id))]
        since_7 = now - timedelta(days=7)
        since_14 = now - timedelta(days=14)
        since_28 = now - timedelta(days=28)
        current = [item for item in reviews if as_utc(item.reviewed_at) >= since_14]
        previous = [item for item in reviews if since_28 <= as_utc(item.reviewed_at) < since_14]
        retention = (sum(item.rating > 1 for item in current) / len(current)
                     if len(current) >= self.settings.learning_min_reviews else None)
        previous_retention = (sum(item.rating > 1 for item in previous) / len(previous)
                              if len(previous) >= self.settings.learning_min_reviews else None)
        recent_attempts = [item for item in attempts if as_utc(item.attempted_at) >= since_14]
        accuracy = (sum(item.correct for item in recent_attempts) / len(recent_attempts)
                    if len(recent_attempts) >= self.settings.learning_min_attempts else None)
        local_today = now.astimezone(self.settings.timezone).date()
        daily = [DailyWork(day=local_today - timedelta(days=offset), reviews=0, attempts=0)
                 for offset in range(13, -1, -1)]
        by_day = {item.day: item for item in daily}
        for review in current:
            day = as_utc(review.reviewed_at).astimezone(self.settings.timezone).date()
            if day in by_day:
                by_day[day].reviews += 1
        for attempt in recent_attempts:
            day = as_utc(attempt.attempted_at).astimezone(self.settings.timezone).date()
            if day in by_day:
                by_day[day].attempts += 1
        return StudyStats(
            course_id=course_id, name=name, new_versions_7d=len(versions),
            new_versions_opened=sum(item.first_opened_at is not None for item in versions),
            notes_created_7d=len(notes),
            reviews_7d=sum(as_utc(item.reviewed_at) >= since_7 for item in reviews),
            attempts_7d=sum(as_utc(item.attempted_at) >= since_7 for item in attempts),
            open_questions=len(questions),
            upcoming_deadlines=sum(selected(item.course_id) for item in rows.deadlines),
            upcoming_exams=sum(selected(item.course_id) for item in rows.exams),
            topic_count=len(progress),
            measured_topics=sum(item.anki_retention is not None or item.exercise_accuracy is not None
                                for item in progress),
            weak_topics=sum(item.is_weak for item in progress),
            measured_score=sum(topic_scores) / len(topic_scores) if topic_scores else None,
            retention_14d=retention,
            retention_delta_points=(round((retention - previous_retention) * 100)
                                    if retention is not None and previous_retention is not None else None),
            exercise_accuracy_14d=accuracy,
            daily_work=daily)
