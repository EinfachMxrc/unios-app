# SPDX-License-Identifier: AGPL-3.0-or-later

"""Read enrollment state without inferring payment or using a portal write."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime
from hashlib import sha256

from bs4 import BeautifulSoup
from bs4.element import Tag
from soupsieve.util import SelectorSyntaxError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Deadline, EnrollmentCheck, utc_now

REQUIRED_ENROLLMENT_FIELDS = (
    "enrollment_link", "enrollment", "enrollment_key_attr", "enrollment_title",
    "enrollment_status", "enrollment_deadline", "enrollment_complete_text",
    "enrollment_open_text",
)


@dataclass(frozen=True)
class EnrollmentRow:
    source_key: str
    title: str
    status: str
    deadline_at: datetime | None


def enrollment_configured(selectors: dict[str, str | None]) -> bool:
    key_attr = selectors.get("enrollment_key_attr")
    complete = (selectors.get("enrollment_complete_text") or "").strip().casefold()
    opened = (selectors.get("enrollment_open_text") or "").strip().casefold()
    return (all(selectors.get(key) for key in REQUIRED_ENROLLMENT_FIELDS)
            and bool(key_attr == "id" or (key_attr and re.fullmatch(r"data-[a-z0-9-]{1,50}", key_attr)))
            and bool(complete and opened and complete != opened))


def _text(row: Tag, selector: str) -> str | None:
    element = row.select_one(selector)
    if element is None:
        return None
    value = " ".join(element.stripped_strings).strip()
    return value or None


def _deadline(row: Tag, selector: str) -> datetime | None:
    element = row.select_one(selector)
    raw = element.get("datetime") if element else None
    if not isinstance(raw, str):
        return None
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    return parsed.astimezone(UTC) if parsed.tzinfo else None


def parse_enrollment_rows(html: str, selectors: dict[str, str | None]) -> tuple[list[EnrollmentRow], list[str]]:
    if not enrollment_configured(selectors):
        raise ValueError("PRIMUSS-Rückmeldefelder sind nicht vollständig geprüft")
    try:
        rows = BeautifulSoup(html, "html.parser").select(selectors["enrollment"] or "")
        if not rows or len(rows) > 20:
            raise ValueError("Keine eindeutige Rückmeldeliste erkannt; Seitenstruktur prüfen")
        parsed: list[EnrollmentRow] = []
        warnings: list[str] = []
        seen: set[str] = set()
        complete = (selectors["enrollment_complete_text"] or "").strip().casefold()
        opened = (selectors["enrollment_open_text"] or "").strip().casefold()
        for index, row in enumerate(rows, start=1):
            if not isinstance(row, Tag):
                continue
            identity = row.get(selectors["enrollment_key_attr"] or "")
            title = _text(row, selectors["enrollment_title"] or "")
            if (not isinstance(identity, str) or not 1 <= len(identity.strip()) <= 200
                    or re.search(r"(?i)(?:session|user|token)=", identity)
                    or not title or len(title) > 300):
                warnings.append(f"Rückmeldezeile {index}: Semester-Schlüssel oder Titel unklar; ausgelassen.")
                continue
            source_key = "enrollment:" + sha256(identity.strip().encode("utf-8")).hexdigest()
            if source_key in seen:
                raise ValueError("PRIMUSS-Rückmeldeliste enthält doppelte Semester-Schlüssel")
            seen.add(source_key)
            raw_status = _text(row, selectors["enrollment_status"] or "")
            normalized = raw_status.casefold() if raw_status else ""
            status = "complete" if normalized == complete else "open" if normalized == opened else "unclear"
            deadline = _deadline(row, selectors["enrollment_deadline"] or "")
            if status == "unclear":
                warnings.append(f"Rückmeldezeile {index}: Status unklar; bitte direkt im Portal prüfen.")
            if deadline is None and status != "complete":
                warnings.append(f"Rückmeldezeile {index}: Frist unklar; bitte direkt im Portal prüfen.")
            parsed.append(EnrollmentRow(source_key, title, status, deadline))
        if not parsed:
            raise ValueError("Keine Rückmeldezeile eindeutig erkannt; nichts gespeichert")
        return parsed, warnings
    except SelectorSyntaxError as exc:
        raise ValueError("PRIMUSS-Rückmeldeselektor ist ungültig") from exc


def store_enrollment_rows(session: Session, rows: list[EnrollmentRow]) -> None:
    checked_at = utc_now()
    for row in rows:
        session.add(EnrollmentCheck(source_key=row.source_key, title=row.title, status=row.status,
                                    deadline_at=row.deadline_at, checked_at=checked_at))
        deadline = session.scalar(select(Deadline).where(
            Deadline.source == "primuss-enrollment", Deadline.source_key == row.source_key))
        if row.status == "complete":
            if deadline is not None:
                deadline.removed_upstream = True
            continue
        if row.deadline_at is None:
            continue  # An uncertain date must not erase an earlier known warning.
        if deadline is None:
            deadline = Deadline(source="primuss-enrollment", source_key=row.source_key,
                                course_id=None, assignment_id=None)
            session.add(deadline)
        deadline.title = f"Rückmeldung: {row.title}"
        deadline.due_at = row.deadline_at
        deadline.url = None  # Never persist a URL that might contain a PRIMUSS session.
        deadline.removed_upstream = False


def latest_enrollment_rows(session: Session) -> list[dict]:
    checks = session.scalars(select(EnrollmentCheck)
                             .order_by(EnrollmentCheck.checked_at.desc(), EnrollmentCheck.id.desc())).all()
    latest: dict[str, EnrollmentCheck] = {}
    for check in checks:
        latest.setdefault(check.source_key, check)
    return [{"title": item.title, "status": item.status, "deadline_at": item.deadline_at,
             "checked_at": item.checked_at} for item in latest.values()]
