# SPDX-License-Identifier: AGPL-3.0-or-later

"""Conservative PRIMUSS grade import from an explicitly reviewed HTML profile."""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from hashlib import sha256

from bs4 import BeautifulSoup
from bs4.element import Tag
from soupsieve.util import SelectorSyntaxError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import AcademicModule, AcademicModuleRevision, utc_now
from app.grades.calculation import hundredths
from app.grades.history import module_snapshot

REQUIRED_GRADE_FIELDS = (
    "grades_link", "grades", "grade_key_attr", "grade_title", "grade_ects",
    "grade_status", "grade_value", "grade_status_passed", "grade_status_failed",
)
MAX_ROWS = 200


@dataclass(frozen=True)
class ParsedGrade:
    source_key: str
    title: str
    ects_hundredths: int
    grade_hundredths: int | None
    attempt: int | None
    status: str


def grade_configured(selectors: dict[str, str | None]) -> bool:
    key_attr = selectors.get("grade_key_attr")
    passed = (selectors.get("grade_status_passed") or "").strip().casefold()
    failed = (selectors.get("grade_status_failed") or "").strip().casefold()
    opened = (selectors.get("grade_status_open") or "").strip().casefold()
    return (all(selectors.get(field) for field in REQUIRED_GRADE_FIELDS)
            and bool(key_attr == "id" or (key_attr and re.fullmatch(r"data-[a-z0-9-]{1,50}", key_attr)))
            and bool(passed and failed and passed != failed)
            and (not opened or opened not in {passed, failed}))


def _text(row: Tag, selector: str | None) -> str | None:
    element = row.select_one(selector) if selector else None
    if element is None:
        return None
    value = " ".join(element.stripped_strings).strip()
    return value or None


def _amount(value: str | None, *, required: bool, maximum: int) -> int | None:
    if value is None:
        return None
    if not re.fullmatch(r"\d{1,3}(?:[,.]\d{1,2})?", value):
        return None
    try:
        amount = Decimal(value.replace(",", "."))
    except InvalidOperation:
        return None
    if amount < (Decimal("0.01") if required else Decimal(0)) or amount > maximum:
        return None
    return hundredths(amount)


def parse_grade_rows(html: str, selectors: dict[str, str | None]) -> tuple[list[ParsedGrade], list[str]]:
    if not grade_configured(selectors):
        raise ValueError("PRIMUSS-Notenfelder sind nicht vollständig geprüft")
    try:
        rows = BeautifulSoup(html, "html.parser").select(selectors["grades"] or "")
        if not rows or len(rows) > MAX_ROWS:
            raise ValueError("Keine eindeutige Notenliste erkannt; Seitenstruktur prüfen")
        parsed: list[ParsedGrade] = []
        warnings: list[str] = []
        seen: set[str] = set()
        mapping = {
            (selectors["grade_status_passed"] or "").strip().casefold(): "passed",
            (selectors["grade_status_failed"] or "").strip().casefold(): "failed",
        }
        if selectors.get("grade_status_open"):
            mapping[(selectors["grade_status_open"] or "").strip().casefold()] = "open"
        for index, row in enumerate(rows, start=1):
            if not isinstance(row, Tag):
                continue
            identity = row.get(selectors["grade_key_attr"] or "")
            if (not isinstance(identity, str) or not 1 <= len(identity.strip()) <= 200
                    or re.search(r"(?i)(?:session|user|token)=", identity)):
                warnings.append(f"Notenzeile {index}: stabiler Schlüssel fehlt; ausgelassen.")
                continue
            source_key = "module:" + sha256(identity.strip().encode("utf-8")).hexdigest()
            if source_key in seen:
                raise ValueError("PRIMUSS-Notenliste enthält doppelte Modulschlüssel")
            seen.add(source_key)
            title = _text(row, selectors["grade_title"])
            ects_text = _text(row, selectors["grade_ects"])
            ects = _amount(ects_text, required=True, maximum=120)
            grade_text = _text(row, selectors["grade_value"])
            grade = _amount(grade_text, required=False, maximum=100)
            status_text = _text(row, selectors["grade_status"])
            status = mapping.get(status_text.strip().casefold()) if status_text else None
            attempt_text = _text(row, selectors.get("grade_attempt"))
            attempt = int(attempt_text) if attempt_text and re.fullmatch(r"\d{1,2}", attempt_text) else None
            if (not title or len(title) > 300 or ects is None or status is None
                    or (grade_text is not None and grade is None)
                    or (status == "open" and grade is not None)
                    or (attempt_text is not None and (attempt is None or not 1 <= attempt <= 20))):
                warnings.append(f"Notenzeile {index}: Titel, ECTS, Note, Versuch oder Status unklar; ausgelassen.")
                continue
            parsed.append(ParsedGrade(source_key, title, ects, grade, attempt, status))
        if not parsed:
            raise ValueError("Keine vollständig lesbaren Notenzeilen; nichts gespeichert")
        return parsed, warnings
    except SelectorSyntaxError as exc:
        raise ValueError("PRIMUSS-Notenselektor ist ungültig") from exc


def store_grade_rows(session: Session, rows: list[ParsedGrade]) -> tuple[int, int, int]:
    created = updated = unchanged = 0
    for row in rows:
        item = session.scalar(select(AcademicModule).where(
            AcademicModule.source == "primuss", AcademicModule.source_key == row.source_key))
        values = (row.title, row.ects_hundredths, row.grade_hundredths, row.attempt, row.status)
        if item is None:
            item = AcademicModule(
                source="primuss", source_key=row.source_key, title=row.title,
                semester_id=None, ects_hundredths=row.ects_hundredths,
                grade_hundredths=row.grade_hundredths, weight_hundredths=None,
                attempt=row.attempt, status=row.status, revision=1,
            )
            session.add(item)
            session.flush()
            session.add(AcademicModuleRevision(module_id=item.id, revision=1,
                                               snapshot=module_snapshot(item)))
            created += 1
            continue
        previous = (item.title, item.ects_hundredths, item.grade_hundredths, item.attempt, item.status)
        item.updated_at = utc_now()
        if previous == values:
            unchanged += 1
            continue
        item.title, item.ects_hundredths, item.grade_hundredths, item.attempt, item.status = values
        item.revision += 1
        session.add(AcademicModuleRevision(module_id=item.id, revision=item.revision,
                                           snapshot=module_snapshot(item)))
        updated += 1
    return created, updated, unchanged
