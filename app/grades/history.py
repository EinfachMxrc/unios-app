# SPDX-License-Identifier: AGPL-3.0-or-later

"""A single revision snapshot shape for manual and portal modules."""

from app.db.models import AcademicModule


def module_snapshot(item: AcademicModule) -> dict:
    return {"title": item.title, "semester_id": item.semester_id,
            "ects_hundredths": item.ects_hundredths, "grade_hundredths": item.grade_hundredths,
            "weight_hundredths": item.weight_hundredths, "attempt": item.attempt,
            "status": item.status, "archived_at": item.archived_at.isoformat() if item.archived_at else None}
