# SPDX-License-Identifier: AGPL-3.0-or-later

"""Conservative local triage of short captures; ambiguous matches remain reviewable."""

import re
from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta

from app.config import Settings
from app.db.models import Jot
from app.intake.smart_capture_repository import SmartCaptureRepository
from app.timeutil import as_utc

ACTION = re.compile(r"\b(durchgehen|erledigen|bearbeiten|machen|lösen|lernen|wiederholen|besprechen|abgeben)\b", re.IGNORECASE)
CONTEXT = re.compile(r"\b(aufgabe|übungsblatt|klausur|prüfung|lernen|vorlesung|zettel)\b", re.IGNORECASE)
DATE = re.compile(r"\bbis\s+(\d{1,2})\.(\d{1,2})\.(\d{4})\b", re.IGNORECASE)
WEEKDAY = re.compile(r"\bbis\s+(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b", re.IGNORECASE)
WEEKDAYS = {"montag": 0, "dienstag": 1, "mittwoch": 2, "donnerstag": 3,
            "freitag": 4, "samstag": 5, "sonntag": 6}


@dataclass(frozen=True)
class CaptureAnalysis:
    task_intent: bool
    course_id: int | None
    due_at: datetime | None
    needs_review: bool


def _due_at(body: str, captured_at: datetime, settings: Settings) -> datetime | None:
    captured_at = as_utc(captured_at)
    local = captured_at.astimezone(settings.timezone)
    day_match = DATE.search(body)
    if day_match:
        try:
            due_day = local.date().replace(year=int(day_match[3]), month=int(day_match[2]), day=int(day_match[1]))
        except ValueError:
            return None
    else:
        weekday_match = WEEKDAY.search(body)
        if weekday_match is None:
            return None
        days = (WEEKDAYS[weekday_match[1].casefold()] - local.weekday()) % 7
        if days == 0 and local.hour >= 18:
            days = 7
        due_day = local.date() + timedelta(days=days)
    candidate = datetime.combine(due_day, time(18), settings.timezone).astimezone(UTC)
    return candidate if candidate > captured_at else None


def analyze(repo: SmartCaptureRepository, jot: Jot, settings: Settings) -> CaptureAnalysis:
    body = jot.body.casefold()
    task_intent = jot.kind == "todo" or bool(ACTION.search(body) and CONTEXT.search(body))
    if not task_intent:
        return CaptureAnalysis(False, jot.course_id, None, False)
    course_id: int | None
    if jot.course_id is not None:
        course_id = jot.course_id
    else:
        course_ids = {course.id for course in repo.courses()
                      if any(len(name.strip()) >= 4 and name.casefold() in body
                             for name in (course.name, course.short_name or ""))}
        if not course_ids:
            for resource in repo.resources():
                title = resource.name.casefold().removesuffix(".pdf").strip()
                if len(title) >= 6 and title in body:
                    course_ids.add(resource.course_id)
        course_id = next(iter(course_ids)) if len(course_ids) == 1 else None
    return CaptureAnalysis(True, course_id, _due_at(jot.body, jot.created_at, settings), course_id is None)


def triage(session, jot: Jot, settings: Settings, *, source_kind: str = "jot",
           source_id: str | None = None) -> CaptureAnalysis:
    repo = SmartCaptureRepository(session)
    result = analyze(repo, jot, settings)
    if not result.task_intent:
        return result
    source_id = source_id or jot.id
    if repo.assignment(jot.id) is not None or not repo.automatic_allowed(source_kind, source_id):
        return result
    if result.course_id is None:
        repo.decision(source_kind, source_id, state="review")
    else:
        jot.course_id = result.course_id
        repo.save_task(jot, course_id=result.course_id, due_at=result.due_at,
                       source_kind=source_kind, source_id=source_id)
    return result
