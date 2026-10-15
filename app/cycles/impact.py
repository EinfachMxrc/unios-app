# SPDX-License-Identifier: AGPL-3.0-or-later

"""Pure preview of explicitly replanning accepted work after an exam change."""

import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from hashlib import sha256
from typing import Literal

from pydantic import BaseModel

from app.config import Settings
from app.cycles.planning import PHASE_LABELS, PHASES
from app.db.models import Exam, StudyBlockSuggestion, StudyCycle
from app.learning.blocks import _find_slot
from app.timeutil import as_utc

ImpactReason = Literal["undated", "exam_past", "unchanged", "history_only", "phase_elapsed", "no_slot"]


class PhaseImpact(BaseModel):
    id: int
    phase_label: str
    old_starts_at: datetime
    old_ends_at: datetime
    new_starts_at: datetime | None
    new_ends_at: datetime | None


class BlockImpact(BaseModel):
    id: int
    topic: str
    duration_minutes: int
    old_starts_at: datetime
    new_starts_at: datetime | None


class ExamImpactView(BaseModel):
    cycle_id: int
    exam_id: int
    exam_title: str
    old_exam_at: datetime
    current_exam_at: datetime | None
    planned_at: datetime
    revision: str
    phases: list[PhaseImpact]
    blocks: list[BlockImpact]
    history_count: int
    can_apply: bool
    reasons: list[ImpactReason]


@dataclass
class ExamPlanState:
    anchor: StudyCycle
    exam: Exam
    cycles: list[StudyCycle]
    blocks: list[tuple[StudyBlockSuggestion, str]]
    busy: list[tuple[datetime, datetime]]


def build_impact(state: ExamPlanState, settings: Settings, planned_at: datetime) -> ExamImpactView:
    anchor, exam = state.anchor, state.exam
    cycle_id = anchor.id
    old_exam_at = as_utc(anchor.exam_at_snapshot)
    current_exam_at = as_utc(exam.exam_at) if exam.exam_at else None
    cycles, block_rows = state.cycles, state.blocks
    future_blocks = [(block, name) for block, name in block_rows if as_utc(block.starts_at) > planned_at]
    movable_cycles = [cycle for cycle in cycles if as_utc(cycle.ends_at) > planned_at]
    history_count = len(cycles) + len(block_rows) - len(future_blocks) - len(movable_cycles)
    busy = state.busy
    reasons: list[ImpactReason] = []
    if current_exam_at is None:
        reasons.append("undated")
    elif current_exam_at <= planned_at:
        reasons.append("exam_past")
    elif current_exam_at == old_exam_at:
        reasons.append("unchanged")
    if not future_blocks and not movable_cycles:
        reasons.append("history_only")
    elif as_utc(anchor.ends_at) <= planned_at:
        # A completed phase retains its original exam snapshot as history; it
        # must not be reused to shift an already replanned future block twice.
        reasons.append("history_only")
    phases: list[PhaseImpact] = []
    offsets = {phase: (before_start, before_end) for phase, before_start, before_end in PHASES}
    for cycle in movable_cycles:
        start, end = as_utc(cycle.starts_at), as_utc(cycle.ends_at)
        new_start = new_end = None
        if current_exam_at is not None and current_exam_at > planned_at:
            before_start, before_end = offsets[cycle.phase]
            # Keep the beginning of a phase that already started: recorded work
            # must remain inside its window instead of disappearing from progress.
            new_start = start if start <= planned_at else max(planned_at, current_exam_at - timedelta(days=before_start))
            new_end = current_exam_at - timedelta(days=before_end)
            if new_end <= max(new_start, planned_at):
                new_start = new_end = None
                if "phase_elapsed" not in reasons:
                    reasons.append("phase_elapsed")
        phases.append(PhaseImpact(id=cycle.id, phase_label=PHASE_LABELS[cycle.phase], old_starts_at=start,
                                  old_ends_at=end, new_starts_at=new_start, new_ends_at=new_end))
    blocks: list[BlockImpact] = []
    planned_busy = list(busy)
    for block, name in future_blocks:
        start = as_utc(block.starts_at)
        new_start = None
        if current_exam_at is not None and current_exam_at > planned_at:
            shifted = start + (current_exam_at - old_exam_at)
            day = min(shifted, current_exam_at - timedelta(days=1)).astimezone(settings.timezone).date()
            new_start = _find_slot(settings, day, planned_at, current_exam_at, block.duration_minutes, planned_busy)
            if new_start is not None:
                planned_busy.append((new_start, new_start + timedelta(minutes=block.duration_minutes)))
            elif "no_slot" not in reasons:
                reasons.append("no_slot")
        blocks.append(BlockImpact(id=block.id, topic=name, duration_minutes=block.duration_minutes,
                                  old_starts_at=start, new_starts_at=new_start))
    snapshot = {
        "anchor": cycle_id, "exam": [exam.id, exam.title, exam.course_id, current_exam_at.isoformat() if current_exam_at else None],
        "planned_at": planned_at.isoformat(),
        "cycles": [[cycle.id, cycle.phase, as_utc(cycle.starts_at).isoformat(), as_utc(cycle.ends_at).isoformat(),
                    as_utc(cycle.exam_at_snapshot).isoformat(), cycle.topic_ids, cycle.review_goal, cycle.attempt_goal] for cycle in cycles],
        "blocks": [[block.id, block.topic_id, name, as_utc(block.starts_at).isoformat(), block.duration_minutes] for block, name in block_rows],
        "busy": sorted((start.isoformat(), end.isoformat()) for start, end in busy),
        "phases": [phase.model_dump(mode="json") for phase in phases],
        "new_blocks": [block.model_dump(mode="json") for block in blocks],
        "reasons": reasons,
    }
    revision = sha256(json.dumps(snapshot, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    return ExamImpactView(cycle_id=cycle_id, exam_id=exam.id, exam_title=exam.title, old_exam_at=old_exam_at,
                          current_exam_at=current_exam_at, planned_at=planned_at, revision=revision,
                          phases=phases, blocks=blocks, history_count=history_count, can_apply=not reasons, reasons=reasons)


def validate_impact(preview: ExamImpactView, revision: str, now: datetime) -> None:
    if preview.planned_at > now + timedelta(seconds=5) or now - preview.planned_at > timedelta(minutes=10):
        raise ValueError("Die Vorschau ist abgelaufen. Bitte den Lernplan erneut prüfen.")
    if preview.revision != revision:
        raise ValueError("Prüfung, Kalender oder Lernplan wurden verändert. Bitte eine neue Vorschau laden.")
    if not preview.can_apply or preview.current_exam_at is None:
        raise ValueError("Dieser Lernplan kann derzeit nicht sicher neu geplant werden.")
    if any(block.new_starts_at is None or block.new_starts_at <= now for block in preview.blocks):
        raise ValueError("Ein vorgeschlagener Termin liegt inzwischen in der Vergangenheit. Bitte neu prüfen.")
