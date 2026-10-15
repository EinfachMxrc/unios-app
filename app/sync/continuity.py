# SPDX-License-Identifier: AGPL-3.0-or-later

"""Read-only continuity status shared by the scheduler and dashboard."""

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import select

from app.db.models import SyncRun
from app.timeutil import as_utc


@dataclass(frozen=True)
class SyncContinuity:
    state: Literal["never", "current", "overdue", "recovered"]
    hours_since: int | None
    recovered_gap_hours: int | None
    last_usable_at: datetime | None


def sync_continuity(session, stale_after_hours: int, now: datetime | None = None) -> SyncContinuity:
    moment = now or datetime.now(UTC)
    usable = (SyncRun.status == "success") | ((SyncRun.status == "warning") & (SyncRun.course_count > 0))
    runs = session.scalars(select(SyncRun).where(usable, SyncRun.finished_at.is_not(None))
                           .order_by(SyncRun.finished_at.desc(), SyncRun.id.desc()).limit(2)).all()
    if not runs:
        return SyncContinuity("never", None, None, None)
    last = as_utc(runs[0].finished_at)
    elapsed = max(0.0, (moment - last).total_seconds() / 3600)
    if elapsed >= stale_after_hours:
        return SyncContinuity("overdue", int(elapsed), None, last)
    if len(runs) > 1:
        gap = (last - as_utc(runs[1].finished_at)).total_seconds() / 3600
        if gap >= stale_after_hours:
            return SyncContinuity("recovered", int(elapsed), int(gap), last)
    return SyncContinuity("current", int(elapsed), None, last)
