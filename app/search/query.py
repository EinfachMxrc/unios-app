# SPDX-License-Identifier: AGPL-3.0-or-later

"""Strict, bounded search syntax; values are always SQL parameters."""

import shlex
from dataclasses import dataclass
from datetime import date

TYPES = {"document", "material", "resource", "note", "question", "annotation",
         "announcement", "course_note", "jot", "clip"}


@dataclass(frozen=True)
class SearchQuery:
    text: str = ""
    course: str | None = None
    semester: str | None = None
    kind: str | None = None
    before: date | None = None
    questions: bool = False


def parse(value: str) -> SearchQuery:
    if len(value) > 400:
        raise ValueError("Suchbegriff zu lang")
    try:
        tokens = shlex.split(value)
    except ValueError:
        raise ValueError("Anführungszeichen in der Suche schließen") from None
    words, operators = [], {}
    for token in tokens:
        key, separator, content = token.partition(":")
        if separator and key in {"course", "semester", "type", "has", "before"}:
            if key in operators or not content:
                raise ValueError("Suchoperator fehlt oder wurde doppelt angegeben: " + key)
            operators[key] = content
        elif separator and key.isalpha():
            raise ValueError("Unbekannter Suchoperator: " + key)
        else:
            words.append(token)
    kind = operators.get("type")
    if kind is not None and kind not in TYPES:
        raise ValueError("Unbekannter Inhaltstyp")
    if "has" in operators and operators["has"] != "question":
        raise ValueError("Unterstützt wird has:question")
    try:
        before = date.fromisoformat(operators["before"]) if "before" in operators else None
    except ValueError:
        raise ValueError("before erwartet ein Datum im Format JJJJ-MM-TT") from None
    return SearchQuery(" ".join(words), operators.get("course"), operators.get("semester"),
                       kind, before, operators.get("has") == "question")
