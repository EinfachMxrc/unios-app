# SPDX-License-Identifier: AGPL-3.0-or-later

"""An exam holds its tasks, attempts and reports only while its time has not run out."""

from datetime import UTC, datetime

from app.db.models import AssessmentSession


def is_running(exam: AssessmentSession, now: datetime | None = None) -> bool:
    """Running and not expired; an expired exam releases everything even before it is ended manually."""
    ends_at = exam.ends_at if exam.ends_at.tzinfo else exam.ends_at.replace(tzinfo=UTC)
    return exam.state == "running" and ends_at > (now or datetime.now(UTC))
