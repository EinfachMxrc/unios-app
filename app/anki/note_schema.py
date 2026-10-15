# SPDX-License-Identifier: AGPL-3.0-or-later
"""Own cards cite an immutable note revision, never a guessed PDF page."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.anki.card_schema import StoredCardData


class NoteCardSourceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    note_id: UUID
    revision: int = Field(ge=1)
    quote: str = Field(min_length=1, max_length=8000)

    @field_validator("quote")
    @classmethod
    def nonblank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Notizauswahl fehlt")
        return value.strip()


class NoteCardInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mutation_id: UUID
    front: str = Field(min_length=1, max_length=4000)
    back: str = Field(min_length=1, max_length=8000)
    topic: str = Field(min_length=1, max_length=200)
    source: NoteCardSourceInput

    @field_validator("front", "back", "topic")
    @classmethod
    def nonblank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Leerer Karteninhalt")
        return value.strip()


class NoteCardSource(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["note"] = "note"
    note_id: UUID
    note_title: str
    revision: int = Field(ge=1)
    sha256: str
    course_id: int
    course_name: str
    quote: str
    url: str


class NoteCardResponse(BaseModel):
    queue_id: int
    status: Literal["approved", "pushed"]
    card: StoredCardData
    source: NoteCardSource
    deck_name: str
    note_id: int | None
    transfer_error: str | None
