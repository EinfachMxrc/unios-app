# SPDX-License-Identifier: AGPL-3.0-or-later
"""Conservative extraction: no guessed calendar date from relative course prose."""
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo


@dataclass(frozen=True)
class AssignmentContext:
    due_at: datetime | None
    quote: str
    delivery: str


def assignment_context(body: str, opens_timestamp: int | None, timezone: ZoneInfo) -> AssignmentContext:
    delivery = "in_person" if re.search(
        r"usb.?stick|vor\s+ort|persönlich|präsentationsraum|in\s+papierform|ausgedruckt", body, re.IGNORECASE) else "unknown"
    sentences = re.split(r"(?<=[.!?])\s+(?=[A-ZÄÖÜ])|[\r\n]+", body)
    candidates: list[tuple[datetime, str]] = []
    notes = []
    weekdays = {name: index for index, name in enumerate(
        ("montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag", "sonntag"))}
    for sentence in sentences:
        if not re.search(r"abgab|abgeben|einreich|frist|spätestens|fällig", sentence, re.IGNORECASE):
            continue
        notes.append(sentence[:1000])
        clock = re.search(r"\b([01]?\d|2[0-3])(?::([0-5]\d)\b|\.([0-5]\d)\s*Uhr)", sentence)
        if not clock:
            continue
        date_match = re.search(r"\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b", sentence)
        try:
            if date_match:
                day, month, year = map(int, date_match.groups())
                date = datetime(year, month, day, tzinfo=timezone)
            elif opens_timestamp:
                weekday = re.search(r"\b(" + "|".join(weekdays) + r")(?:s)?\b", sentence, re.IGNORECASE)
                if not weekday:
                    continue
                opening = datetime.fromtimestamp(opens_timestamp, timezone)
                date = opening + timedelta(days=(weekdays[weekday[1].lower()] - opening.weekday()) % 7)
                if date.replace(hour=int(clock[1]), minute=int(clock[2] or clock[3])) < opening:
                    date += timedelta(days=7)
            else:
                continue
            due = date.replace(hour=int(clock[1]), minute=int(clock[2] or clock[3]), second=0, microsecond=0).astimezone(UTC)
            candidates.append((due, sentence[:1000]))
        except ValueError:
            continue
    unique = {due for due, _ in candidates}
    if len(unique) == 1:
        return AssignmentContext(candidates[0][0], candidates[0][1], delivery)
    return AssignmentContext(None, "\n".join(notes)[:3000], delivery)
