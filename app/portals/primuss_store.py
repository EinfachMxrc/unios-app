# SPDX-License-Identifier: AGPL-3.0-or-later

"""Persist only proof-backed exam registrations with stable portal identities."""

from __future__ import annotations

from datetime import UTC
from typing import TYPE_CHECKING

from sqlalchemy import select

from app.db.models import Deadline, Exam, ExamRegistration

if TYPE_CHECKING:
    from app.portals.primuss import PrimussPreview


class PrimussStoreError(ValueError):
    """The current portal data cannot be identified without ambiguity."""


def store_verified_exams(session, preview: PrimussPreview) -> None:
    keys = [exam.source_key for exam in preview.exams]
    if (not keys or any(key is None for key in keys) or len(set(keys)) != len(keys)
            or preview.proof_id is None or preview.proof_at is None):
        raise PrimussStoreError("Prüfungen haben keinen eindeutigen Schlüssel oder Nachweis")
    for row in preview.exams:
        assert row.source_key is not None
        exam_at = row.exam_at.astimezone(UTC) if row.exam_at else None
        exam = session.scalar(select(Exam).where(Exam.source_key == row.source_key))
        if exam is None:
            exam = Exam(source_key=row.source_key, title=row.title, exam_at=exam_at)
            session.add(exam)
            session.flush()
        else:
            exam.title = row.title
            exam.exam_at = exam_at
        session.add(ExamRegistration(
            exam_id=exam.id, status=row.registration, checked_at=preview.proof_at,
            screenshot_path=f"portal-proofs/primuss/{preview.proof_id}.png",
        ))
        deadline = session.scalar(select(Deadline).where(
            Deadline.source == "primuss-registration", Deadline.source_key == row.source_key))
        if row.registration == "registered" or row.registration_deadline is None:
            if deadline is not None:
                deadline.removed_upstream = True
            continue
        if deadline is None:
            deadline = Deadline(source="primuss-registration", source_key=row.source_key,
                                course_id=None, assignment_id=None)
            session.add(deadline)
        deadline.title = f"Prüfungsanmeldung: {row.title}"
        deadline.due_at = row.registration_deadline.astimezone(UTC)
        deadline.url = None  # A PRIMUSS session URL must never enter the database.
        deadline.removed_upstream = False


def saved_exam_rows(session) -> list[dict]:
    exams = session.scalars(select(Exam).where(Exam.source_key.like("primuss:%"))
                            .order_by(Exam.title, Exam.id)).all()
    result = []
    for exam in exams:
        latest = session.scalar(select(ExamRegistration)
                                .where(ExamRegistration.exam_id == exam.id)
                                .order_by(ExamRegistration.checked_at.desc(), ExamRegistration.id.desc()))
        if latest is None:
            continue
        proof_id = None
        if latest.screenshot_path and latest.screenshot_path.startswith("portal-proofs/primuss/"):
            proof_id = latest.screenshot_path.removeprefix("portal-proofs/primuss/").removesuffix(".png")
        result.append({"id": exam.id, "title": exam.title, "exam_at": exam.exam_at,
                       "registration": latest.status, "checked_at": latest.checked_at,
                       "proof_id": proof_id})
    return result
