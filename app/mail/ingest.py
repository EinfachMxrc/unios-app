# SPDX-License-Identifier: AGPL-3.0-or-later

"""Parse explicitly selected mail without executing HTML or changing a mailbox."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, date, datetime
from email import policy
from email.parser import BytesParser
from email.utils import parsedate_to_datetime
from hashlib import sha256

from bs4 import BeautifulSoup

MAX_MAIL_BYTES = 512 * 1024
DATE_PATTERN = re.compile(r"(?<!\d)(\d{1,2})\.(\d{1,2})\.(20\d{2})(?!\d)")
DEADLINE_WORDS = re.compile(r"\b(frist|anmeldeschluss|abgabeschluss|bewerbungsschluss|bis zum)\b", re.IGNORECASE)
MAILBOX = re.compile(r"^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$")


class MailParseError(ValueError):
    pass


@dataclass(frozen=True)
class ParsedMail:
    source_hash: str
    sender: str
    subject: str
    received_at: datetime | None
    candidate_date: date | None


def sender_matches(sender: str, rules: list[str]) -> bool:
    sender = sender.casefold()
    for raw in rules:
        rule = raw.strip().casefold()
        if rule.startswith("@") and MAILBOX.fullmatch("x" + rule):
            if sender.endswith(rule):
                return True
        elif MAILBOX.fullmatch(rule) and sender == rule:
            return True
    return False


def _body(message) -> str:
    for subtype in ("plain", "html"):
        for part in message.walk():
            if part.get_content_disposition() == "attachment" or part.get_content_type() != f"text/{subtype}":
                continue
            try:
                content = part.get_content()
            except (LookupError, UnicodeError, ValueError):
                continue
            if not isinstance(content, str):
                continue
            if subtype == "html":
                content = BeautifulSoup(content, "html.parser").get_text(" ", strip=True)
            return content[:20_000]
    return ""


def _candidate(text: str) -> date | None:
    dates: set[date] = set()
    for match in DATE_PATTERN.finditer(text[:20_000]):
        context = text[max(0, match.start() - 90):match.start()]
        if not DEADLINE_WORDS.search(context):
            continue
        try:
            value = date(int(match[3]), int(match[2]), int(match[1]))
        except ValueError:
            continue
        if value >= datetime.now(UTC).date():
            dates.add(value)
    return next(iter(dates)) if len(dates) == 1 else None


def parse_eml(raw: bytes, sender_rules: list[str] | None = None,
              require_rule: bool = False, *, max_bytes: int = MAX_MAIL_BYTES) -> ParsedMail:
    if not raw or len(raw) > max_bytes:
        raise MailParseError("Mail ist leer oder zu groß")
    try:
        message = BytesParser(policy=policy.default).parsebytes(raw)
        header = message["from"]
        addresses = header.addresses if header is not None else []
        if len(addresses) != 1:
            raise MailParseError("Absender ist nicht eindeutig")
        sender = addresses[0].addr_spec.casefold()
        if not MAILBOX.fullmatch(sender):
            raise MailParseError("Absender ist ungültig")
        if require_rule and not sender_matches(sender, sender_rules or []):
            raise MailParseError("Absender entspricht keiner Profilregel")
        subject = " ".join(str(message.get("subject", "")).split())[:500]
        if not subject:
            raise MailParseError("Betreff fehlt")
        received_at = None
        if message.get("date"):
            try:
                parsed = parsedate_to_datetime(str(message["date"]))
                received_at = parsed.astimezone(UTC) if parsed.tzinfo else None
            except (TypeError, ValueError):
                pass
        return ParsedMail(
            source_hash=sha256(raw).hexdigest(), sender=sender, subject=subject,
            received_at=received_at, candidate_date=_candidate(subject + "\n" + _body(message)),
        )
    except MailParseError:
        raise
    except (TypeError, ValueError, UnicodeError) as exc:
        raise MailParseError("Mail konnte nicht gelesen werden") from exc
