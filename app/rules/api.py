# SPDX-License-Identifier: AGPL-3.0-or-later

"""Preview, save, run and audit safe user-defined study rules."""

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select

from app.config import Settings
from app.db.models import Course, RuleExecution, StudyRule, utc_now
from app.host.lease import HostCoordinator
from app.notify.service import Notifier
from app.rules.service import active_pins, candidates, execute_rule

Trigger = Literal["new_material", "deadline_soon", "weak_topic"]
Action = Literal["pin", "notify", "pin_notify"]


class RuleConfig(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    trigger: Trigger
    action: Action = "pin"
    course_id: int | None = None
    days: int | None = Field(default=None, ge=1, le=30)
    max_percent: int | None = Field(default=None, ge=0, le=100)
    enabled: bool = False

    @model_validator(mode="after")
    def matching_conditions(self):
        if self.trigger == "weak_topic" and self.days is not None:
            raise ValueError("Ein Zeitraum passt nicht zum Lernstand")
        if self.trigger != "weak_topic" and self.max_percent is not None:
            raise ValueError("Ein Lernwert passt nur zu Lernthemen")
        return self


class RuleUpdate(RuleConfig):
    expected_revision: int = Field(ge=1)


class RuleView(RuleConfig):
    id: int
    revision: int


class CandidateView(BaseModel):
    object_type: str
    object_id: str
    title: str
    course_name: str | None
    url: str


class PreviewView(BaseModel):
    total: int
    items: list[CandidateView]
    action_description: str


class RunView(BaseModel):
    created: int


class AuditView(BaseModel):
    id: int
    rule_id: int
    rule_name: str
    title: str
    url: str
    action: Action
    created_at: str
    undone_at: str | None


def _from_rule(rule: StudyRule) -> RuleView:
    return RuleView.model_validate({"id": rule.id, "name": rule.name, "trigger": rule.trigger,
                    "action": rule.action, "course_id": rule.course_id, "days": rule.days,
                    "max_percent": rule.max_percent, "enabled": rule.enabled, "revision": rule.revision})


def _apply(rule: StudyRule, payload: RuleConfig) -> None:
    rule.name = payload.name.strip()
    rule.trigger = payload.trigger
    rule.action = payload.action
    rule.course_id = payload.course_id
    rule.days = payload.days
    rule.max_percent = payload.max_percent
    rule.enabled = payload.enabled
    rule.updated_at = utc_now()


def _validate_course(session, course_id: int | None) -> None:
    if course_id is not None and session.get(Course, course_id) is None:
        raise HTTPException(404, "Kurs nicht gefunden")


def rules_router(settings: Settings, factory, coordinator: HostCoordinator, notifier: Notifier) -> APIRouter:
    router = APIRouter(prefix="/api/rules")

    @router.get("", response_model=list[RuleView])
    def list_rules():
        with factory() as session:
            return [_from_rule(rule) for rule in session.scalars(select(StudyRule)
                    .order_by(StudyRule.updated_at.desc())).all()]

    @router.post("/preview", response_model=PreviewView)
    def preview(payload: RuleConfig):
        with factory() as session:
            _validate_course(session, payload.course_id)
            rule = StudyRule(name=payload.name, trigger=payload.trigger, action=payload.action,
                             course_id=payload.course_id, days=payload.days,
                             max_percent=payload.max_percent, enabled=payload.enabled)
            matches = candidates(session, settings, rule)
            action = {"pin": "Auf Heute anpinnen", "notify": "Neutralen Hinweis senden",
                      "pin_notify": "Auf Heute anpinnen und neutralen Hinweis senden"}[payload.action]
            return PreviewView(total=len(matches), items=[CandidateView.model_validate(item.__dict__)
                            for item in matches[:20]], action_description=action)

    @router.post("", response_model=RuleView)
    def create_rule(payload: RuleConfig):
        coordinator.assert_writer()
        if not payload.name.strip():
            raise HTTPException(400, "Name fehlt")
        with factory() as session:
            _validate_course(session, payload.course_id)
            rule = StudyRule(name="", trigger=payload.trigger, action=payload.action,
                             revision=1, generation=1, created_at=utc_now(), updated_at=utc_now())
            _apply(rule, payload)
            session.add(rule)
            session.commit()
            return _from_rule(rule)

    @router.put("/{rule_id}", response_model=RuleView)
    def update_rule(rule_id: int, payload: RuleUpdate):
        coordinator.assert_writer()
        if not payload.name.strip():
            raise HTTPException(400, "Name fehlt")
        with factory() as session:
            rule = session.get(StudyRule, rule_id)
            if rule is None:
                raise HTTPException(404, "Regel nicht gefunden")
            if rule.revision != payload.expected_revision:
                raise HTTPException(409, "Regel wurde inzwischen geändert")
            _validate_course(session, payload.course_id)
            changed = (rule.trigger, rule.action, rule.course_id, rule.days, rule.max_percent) != (
                payload.trigger, payload.action, payload.course_id, payload.days, payload.max_percent)
            if changed:
                for item in session.scalars(select(RuleExecution).where(
                        RuleExecution.rule_id == rule.id, RuleExecution.undone_at.is_(None),
                        RuleExecution.action.in_(["pin", "pin_notify"]))):
                    item.undone_at = utc_now()
                rule.generation += 1
            _apply(rule, payload)
            rule.revision += 1
            session.commit()
            return _from_rule(rule)

    @router.delete("/{rule_id}", status_code=204)
    def disable_rule(rule_id: int):
        coordinator.assert_writer()
        with factory() as session:
            rule = session.get(StudyRule, rule_id)
            if rule is None:
                raise HTTPException(404, "Regel nicht gefunden")
            rule.enabled = False
            rule.updated_at = utc_now()
            rule.revision += 1
            session.commit()

    @router.post("/{rule_id}/run", response_model=RunView)
    def run_rule(rule_id: int):
        coordinator.assert_writer()
        with factory() as session:
            rule = session.get(StudyRule, rule_id)
            if rule is None:
                raise HTTPException(404, "Regel nicht gefunden")
            count = execute_rule(session, settings, rule, notifier)
            session.commit()
        if count and rule.action in {"notify", "pin_notify"}:
            notifier.deliver_pending(factory)
        return RunView(created=count)

    @router.get("/audit", response_model=list[AuditView])
    def audit():
        with factory() as session:
            rows = session.execute(select(RuleExecution, StudyRule)
                                   .join(StudyRule, RuleExecution.rule_id == StudyRule.id)
                                   .order_by(RuleExecution.created_at.desc()).limit(100)).all()
            return [AuditView(id=item.id, rule_id=rule.id, rule_name=rule.name, title=item.title,
                              url=item.url, action=item.action, created_at=item.created_at.isoformat(),
                              undone_at=item.undone_at.isoformat() if item.undone_at else None)
                    for item, rule in rows]

    @router.post("/audit/{execution_id}/undo", status_code=204)
    def undo_pin(execution_id: int):
        coordinator.assert_writer()
        with factory() as session:
            item = session.get(RuleExecution, execution_id)
            if item is None:
                raise HTTPException(404, "Ausführung nicht gefunden")
            if item.action not in {"pin", "pin_notify"}:
                raise HTTPException(409, "Ein versandter Hinweis kann nicht zurückgenommen werden")
            item.undone_at = utc_now()
            session.commit()

    @router.get("/pins")
    def pins():
        with factory() as session:
            return active_pins(session)

    return router
