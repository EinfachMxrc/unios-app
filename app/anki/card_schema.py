# SPDX-License-Identifier: AGPL-3.0-or-later

"""Shared persisted card content; AI proposal validation stays explicit."""

import html
import re
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

CardOrigin = Literal["ai", "manual"]
Confidence = Literal["low", "medium", "high"]


class CardContent(BaseModel):
    card_type: Literal["basic", "cloze"]
    front: str = Field(min_length=1, max_length=4000)
    back: str = Field(min_length=1, max_length=8000)
    course: str = Field(min_length=1, max_length=200)
    topic: str = Field(min_length=1, max_length=200)
    source_page: int | None = Field(default=None, gt=0)
    source_question_id: UUID | None = None

    @field_validator("front", "back", "course", "topic")
    @classmethod
    def nonblank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Leerer Karteninhalt")
        return value

    @model_validator(mode="after")
    def valid_cloze(self):
        if self.card_type == "cloze" and not re.search(r"\{\{c\d+::.+?\}\}", self.front, re.DOTALL):
            raise ValueError("Lückentext benötigt eine {{c1::...}}-Markierung")
        return self


class StoredCardData(CardContent):
    confidence: Confidence | None = None


class CardProposal(StoredCardData):
    confidence: Confidence


def parse_stored_card(payload: str, origin: str) -> StoredCardData:
    if origin == "ai":
        return CardProposal.model_validate_json(payload)
    if origin != "manual":
        raise ValueError("Unbekannte Kartenherkunft")
    card = StoredCardData.model_validate_json(payload)
    if card.card_type != "basic" or card.confidence is not None:
        raise ValueError("Eigene Karten benötigen Basic-Inhalt ohne KI-Metadaten")
    return card


def manual_note_marker(mutation_id: str) -> str:
    """Canonical UUID is shared by Anki Desktop, host and imported packages."""
    return f"unios-manual-{UUID(mutation_id)}"


def is_manual_note_marker(value: str | None) -> bool:
    if value is None or not value.startswith("unios-manual-"):
        return False
    try:
        return manual_note_marker(value.removeprefix("unios-manual-")) == value
    except ValueError:
        return False


def plain_card_html(value: str) -> str:
    """Literal authored text, preserving line breaks without executable markup."""
    return html.escape(value).replace("\r\n", "\n").replace("\r", "\n").replace("\n", "<br>")
