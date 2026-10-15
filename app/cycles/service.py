# SPDX-License-Identifier: AGPL-3.0-or-later

"""Suggest exam phases from weak topics and count only recorded study work."""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Literal, cast

from pydantic import BaseModel

from app.config import Settings
from app.cycles.impact import ExamImpactView, build_impact, validate_impact
from app.cycles.planning import PHASE_LABELS, PHASES
from app.cycles.repository import CycleRepository
from app.db.models import StudyCycle
from app.timeutil import as_utc


class CycleView(BaseModel):
    id: int
    exam_id: int
    exam_title: str
    course_id: int
    course_name: str
    phase: str
    phase_label: str
    starts_at: datetime
    ends_at: datetime
    topic_names: list[str]
    topic_ids: list[int]
    review_goal: int
    attempt_goal: int
    reviews_done: int
    attempts_done: int
    progress_percent: int | None
    status: Literal["proposed", "accepted", "rejected"]
    exam_changed: bool
    exam_at_snapshot: datetime
    current_exam_at: datetime | None
    new_exam_materials: list[dict[str, str | int]]


class CycleService:
    def __init__(self, repository: CycleRepository, settings: Settings):
        self.repository = repository
        self.settings = settings

    def exam_impact(self, cycle_id: int) -> ExamImpactView:
        planned_at = datetime.now(UTC)
        with self.repository.read_transaction() as session:
            state = self.repository.exam_plan(session, cycle_id, planned_at)
            return build_impact(state, self.settings, planned_at)

    def confirm_exam_impact(self, cycle_id: int, planned_at: datetime, revision: str,
                            assert_writer: Callable[[], None]) -> ExamImpactView:
        with self.repository.transaction() as session:
            assert_writer()
            planned_at = as_utc(planned_at)
            state = self.repository.exam_plan(session, cycle_id, planned_at)
            preview = build_impact(state, self.settings, planned_at)
            validate_impact(preview, revision, datetime.now(UTC))
            self.repository.apply_exam_plan(session, preview)
            self.repository.commit(session, assert_writer)
            return preview

    def suggest(self, now: datetime) -> None:
        horizon = now + timedelta(days=max(self.settings.study_block_lookahead_days, 21))
        proposals: list[StudyCycle] = []
        for exam, _course in self.repository.exams(now, horizon):
            if exam.course_id is None or exam.exam_at is None:
                continue
            progress = self.repository.topics(self.settings, exam.course_id)
            weak = [item.topic.id for item in progress if item.is_weak]
            if not weak:
                continue
            cards, exercises = self.repository.available_work(weak)
            exam_at = as_utc(exam.exam_at)
            for phase, before_start, before_end in PHASES:
                start = max(now, exam_at - timedelta(days=before_start))
                end = exam_at - timedelta(days=before_end)
                if start >= end:
                    continue
                proposals.append(StudyCycle(
                    exam_id=exam.id, phase=phase, starts_at=start, ends_at=end,
                    exam_at_snapshot=exam_at, topic_ids=weak,
                    review_goal=min(cards, 120), attempt_goal=min(exercises, 25),
                    status="proposed", created_at=now))
        self.repository.upsert_proposals(proposals)

    def list(self, *, may_suggest: bool) -> list[CycleView]:
        if may_suggest:
            self.suggest(datetime.now(UTC))
        result: list[CycleView] = []
        for cycle, exam, course in self.repository.rows():
            done_reviews, done_attempts = self.repository.completed(cycle)
            total = cycle.review_goal + cycle.attempt_goal
            progress_percent = (round(100 * (min(done_reviews, cycle.review_goal)
                                             + min(done_attempts, cycle.attempt_goal)) / total)
                                if total else None)
            topic_names = [item.topic.name for item in self.repository.topics(self.settings, course.id)
                           if item.topic.id in cycle.topic_ids]
            materials = self.repository.recent_exam_materials(course.id, datetime.now(UTC) - timedelta(days=14))
            result.append(CycleView(
                id=cycle.id, exam_id=exam.id, exam_title=exam.title, course_id=course.id, course_name=course.name,
                phase=cycle.phase, phase_label=PHASE_LABELS[cycle.phase],
                starts_at=as_utc(cycle.starts_at), ends_at=as_utc(cycle.ends_at),
                topic_names=topic_names, topic_ids=list(cycle.topic_ids), review_goal=cycle.review_goal,
                attempt_goal=cycle.attempt_goal, reviews_done=done_reviews,
                attempts_done=done_attempts, progress_percent=progress_percent,
                status=cast(Literal["proposed", "accepted", "rejected"], cycle.status),
                exam_changed=exam.exam_at is None or as_utc(exam.exam_at) != as_utc(cycle.exam_at_snapshot),
                exam_at_snapshot=as_utc(cycle.exam_at_snapshot),
                current_exam_at=as_utc(exam.exam_at) if exam.exam_at is not None else None,
                new_exam_materials=[{"id": version_id, "name": name} for version_id, name in materials]))
        return result

    def decide(self, cycle_id: int, status: Literal["accepted", "rejected"]) -> None:
        result = self.repository.decide(cycle_id, status)
        if result is None:
            raise LookupError("Lernzyklus nicht gefunden")
        if not result:
            raise ValueError("Lernzyklus wurde bereits entschieden")
