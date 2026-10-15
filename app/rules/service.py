# SPDX-License-Identifier: AGPL-3.0-or-later

"""Evaluate bounded, typed rules against existing local study data."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import (
    Course,
    Deadline,
    LearningTopic,
    Resource,
    ResourceVersion,
    RuleExecution,
    StudyRule,
    utc_now,
)
from app.host.lease import HostCoordinator
from app.learning.progress import progress_for_topics
from app.notify.service import Notifier
from app.timeutil import as_utc


@dataclass(frozen=True)
class Candidate:
    object_type: str
    object_id: str
    title: str
    course_name: str | None
    url: str


def candidates(session: Session, settings: Settings, rule: StudyRule) -> list[Candidate]:
    now = datetime.now(UTC)
    found: list[Candidate] = []
    if rule.trigger == "new_material":
        material_query = (select(ResourceVersion, Resource, Course)
                 .join(Resource, ResourceVersion.resource_id == Resource.id)
                 .join(Course, Resource.course_id == Course.id)
                 .where(ResourceVersion.downloaded_at >= now - timedelta(days=rule.days or 1),
                        Resource.group_category != "other_group", Resource.removed_upstream.is_(False)))
        if rule.course_id is not None:
            material_query = material_query.where(Resource.course_id == rule.course_id)
        for version, resource, course in session.execute(material_query.order_by(ResourceVersion.downloaded_at.desc()).limit(500)):
            found.append(Candidate("material", str(version.id), resource.name, course.name,
                                   f"/material/{version.id}"))
    elif rule.trigger == "deadline_soon":
        deadline_query = (select(Deadline, Course).outerjoin(Course, Deadline.course_id == Course.id)
                 .where(Deadline.due_at >= now, Deadline.due_at <= now + timedelta(days=rule.days or 7),
                        Deadline.removed_upstream.is_(False)))
        if rule.course_id is not None:
            deadline_query = deadline_query.where(Deadline.course_id == rule.course_id)
        for deadline, course in session.execute(deadline_query.order_by(Deadline.due_at).limit(500)):
            found.append(Candidate("deadline", str(deadline.id), deadline.title,
                                   course.name if course else None, "/deadlines"))
    else:
        topic_query = select(LearningTopic, Course).join(Course, LearningTopic.course_id == Course.id)
        if rule.course_id is not None:
            topic_query = topic_query.where(LearningTopic.course_id == rule.course_id)
        rows = session.execute(topic_query.order_by(Course.name, LearningTopic.name).limit(500)).all()
        progress = progress_for_topics(session, settings, [topic for topic, _ in rows])
        for (topic, course), state in zip(rows, progress, strict=True):
            measured = [round(value * 100) for value in (state.anki_retention, state.exercise_accuracy)
                        if value is not None]
            if measured and min(measured) < (rule.max_percent if rule.max_percent is not None else 70):
                found.append(Candidate("topic", str(topic.id), topic.name, course.name,
                                       f"/learning?topic={topic.id}"))
    return found


def pending(session: Session, settings: Settings, rule: StudyRule) -> list[Candidate]:
    existing = set(session.execute(select(RuleExecution.object_type, RuleExecution.object_id)
                                   .where(RuleExecution.rule_id == rule.id,
                                          RuleExecution.generation == rule.generation)).all())
    return [item for item in candidates(session, settings, rule)
            if (item.object_type, item.object_id) not in existing]


def execute_rule(session: Session, settings: Settings, rule: StudyRule, notifier: Notifier) -> int:
    count = 0
    for item in pending(session, settings, rule)[:50]:
        session.add(RuleExecution(rule_id=rule.id, generation=rule.generation, object_type=item.object_type,
                                  object_id=item.object_id, title=item.title[:300],
                                  url=item.url, action=rule.action, created_at=utc_now()))
        if rule.action in {"notify", "pin_notify"}:
            notifier.enqueue(session, f"rule:{rule.id}:{rule.generation}:{item.object_type}:{item.object_id}",
                             "Neue Studienregel", "Eine deiner Regeln hat einen neuen Treffer.")
        count += 1
    return count


def evaluate_enabled(factory, settings: Settings, coordinator: HostCoordinator, notifier: Notifier) -> int:
    coordinator.assert_writer()
    with factory() as session:
        rules = session.scalars(select(StudyRule).where(StudyRule.enabled.is_(True)).order_by(StudyRule.id)).all()
        total = sum(execute_rule(session, settings, rule, notifier) for rule in rules)
        session.commit()
    if total and any(rule.action in {"notify", "pin_notify"} for rule in rules):
        notifier.deliver_pending(factory)
    return total


def active_pins(session: Session) -> list[dict[str, str | int]]:
    rows = session.execute(select(RuleExecution, StudyRule)
                           .join(StudyRule, RuleExecution.rule_id == StudyRule.id)
                           .where(RuleExecution.action.in_(["pin", "pin_notify"]),
                                  RuleExecution.undone_at.is_(None))
                           .order_by(RuleExecution.created_at.desc()).limit(20)).all()
    return [{"id": entry.id, "title": entry.title, "url": entry.url, "rule_name": rule.name,
             "created_at": as_utc(entry.created_at).isoformat()} for entry, rule in rows]
