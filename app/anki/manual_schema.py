# SPDX-License-Identifier: AGPL-3.0-or-later
"""Explicitly confirmed Basic cards and their frozen PDF source."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.anki.card_schema import StoredCardData


class ManualCardSourceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version_id: int = Field(gt=0)
    annotation_id: UUID
    expected_revision: int = Field(ge=1)
    page: int = Field(ge=1)


class ManualCardInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mutation_id: UUID
    front: str = Field(min_length=1, max_length=4000)
    back: str = Field(min_length=1, max_length=8000)
    topic: str = Field(min_length=1, max_length=200)
    source: ManualCardSourceInput

    @field_validator("front", "back", "topic")
    @classmethod
    def nonblank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Leerer Karteninhalt")
        return value


class ManualCardSource(BaseModel):
    resource_id: int
    resource_name: str
    course_id: int
    course_name: str
    version_id: int
    version: int
    sha256: str
    page: int
    quote: str
    annotation_id: str
    annotation_revision: int
    url: str


class ManualCardResponse(BaseModel):
    queue_id: int
    status: Literal["approved", "pushed"]
    card: StoredCardData
    source: ManualCardSource
    deck_name: str
    note_id: int | None
    transfer_error: str | None


ManualCardErrorCode = Literal["MANUAL_SOURCE_CHANGED", "MANUAL_MUTATION_CONFLICT", "MANUAL_CARD_ERROR"]


class ManualCardFailure(BaseModel):
    detail: str
    code: ManualCardErrorCode | None = None
