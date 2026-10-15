# SPDX-License-Identifier: AGPL-3.0-or-later

"""Keep intake review explicit while preserving each source's original data."""

from datetime import UTC, datetime, timedelta
from typing import Literal, cast

from pydantic import BaseModel

from app.db.models import IntakeDecision
from app.intake.repository import Incoming, IntakeRepository

State = Literal["new", "review", "accepted", "rejected", "snoozed", "duplicate"]
TargetKind = Literal["topic", "assignment", "material", "project"]


class IntakeItem(BaseModel):
    source_kind: str
    source_id: str
    title: str
    detail: str
    url: str
    course_id: int | None
    state: State
    revision: int
    snoozed_until: datetime | None
    target_kind: TargetKind | None
    target_id: str | None
    duplicate_of: str | None
    created_at: datetime
    critical: bool


class IntakeTarget(BaseModel):
    kind: TargetKind
    id: str
    label: str


class IntakeNotFound(ValueError):
    pass


class IntakeConflict(ValueError):
    pass


class IntakeService:
    def __init__(self, repository: IntakeRepository):
        self.repository = repository

    def _view(self, source: Incoming, decision: IntakeDecision | None, now: datetime) -> IntakeItem:
        state = cast(State, decision.state if decision else ("accepted" if source.already_accepted else "new"))
        if decision and state == "snoozed" and decision.snoozed_until and decision.snoozed_until.replace(tzinfo=UTC) <= now:
            state = "new"
        return IntakeItem(source_kind=source.kind, source_id=source.id, title=source.title,
                          detail=source.detail, url=source.url,
                          course_id=decision.course_id if decision and decision.course_id is not None else source.course_id,
                          state=state, revision=decision.revision if decision else 0,
                          snoozed_until=decision.snoozed_until if decision else None,
                          target_kind=cast(TargetKind, decision.target_kind) if decision and decision.target_kind else None,
                          target_id=decision.target_id if decision else None,
                          duplicate_of=decision.duplicate_of if decision else None,
                          created_at=source.at, critical=source.critical)

    def items(self) -> list[IntakeItem]:
        sources, decisions = self.repository.sources()
        now = datetime.now(UTC)
        ordered = sorted(sources, key=lambda source: source.at.replace(tzinfo=None), reverse=True)
        return [self._view(source, decisions.get((source.kind, source.id)), now) for source in ordered[:350]]

    def targets(self, course_id: int) -> list[IntakeTarget]:
        if not self.repository.course_exists(course_id):
            raise IntakeNotFound("Kurs nicht gefunden")
        return [IntakeTarget(kind=cast(TargetKind, kind), id=target_id, label=label)
                for kind, target_id, label in self.repository.targets(course_id)]

    def update(self, kind: str, source_id: str, expected_revision: int, state: State,
               course_id: int | None, target_kind: TargetKind | None, target_id: str | None,
               duplicate_of: str | None, snoozed_until: datetime | None) -> IntakeItem:
        sources, _decisions = self.repository.sources()
        source = next((item for item in sources if item.kind == kind and item.id == source_id), None)
        if source is None:
            raise IntakeNotFound("Eingangseintrag nicht gefunden")
        effective_course = course_id if course_id is not None else source.course_id
        if effective_course is not None and not self.repository.course_exists(effective_course):
            raise IntakeNotFound("Kurs nicht gefunden")
        if state == "accepted" and effective_course is None:
            raise ValueError("Zum Annehmen einen Kurs wählen")
        if target_kind or target_id:
            if not target_kind or not target_id or effective_course is None:
                raise ValueError("Ziel braucht Typ, Eintrag und Kurs")
            if not self.repository.target_exists(target_kind, target_id, effective_course):
                raise ValueError("Ziel gehört nicht zum gewählten Kurs")
        if state == "duplicate":
            if not duplicate_of or duplicate_of == f"{kind}:{source_id}" or not any(
                f"{item.kind}:{item.id}" == duplicate_of for item in sources):
                raise ValueError("Ein anderes Eingangselement als Duplikat-Ziel wählen")
        else:
            duplicate_of = None
        now = datetime.now(UTC)
        if state == "snoozed":
            if snoozed_until is None or snoozed_until.tzinfo is None:
                raise ValueError("Später braucht einen Zeitpunkt mit Zeitzone")
            until = snoozed_until.astimezone(UTC)
            if not now + timedelta(minutes=1) <= until <= now + timedelta(days=365):
                raise ValueError("Erinnerung zwischen einer Minute und 365 Tagen wählen")
            if source.critical and until > now + timedelta(hours=12):
                raise ValueError("Wichtige Fristen höchstens zwölf Stunden verschieben")
            snoozed_until = until
        else:
            snoozed_until = None
        if not self.repository.save(kind, source_id, expected_revision, state, effective_course,
                                    target_kind, target_id, duplicate_of, snoozed_until,
                                    initial_state="accepted" if source.already_accepted else "new",
                                    initial_course=source.course_id):
            raise IntakeConflict("Eintrag wurde inzwischen geändert")
        refreshed, fresh_decisions = self.repository.sources()
        updated = next(item for item in refreshed if item.kind == kind and item.id == source_id)
        return self._view(updated, fresh_decisions[(kind, source_id)], now)
