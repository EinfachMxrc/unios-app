# SPDX-License-Identifier: AGPL-3.0-or-later

"""Typed study contract; scheduler counters are separate from queue windows."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.anki.manual_schema import ManualCardSource
from app.anki.note_schema import NoteCardSource


class StudyCounts(BaseModel):
    new: int = Field(ge=0)
    learning: int = Field(ge=0)
    review: int = Field(ge=0)

    @property
    def total(self) -> int:
        return self.new + self.learning + self.review


class StudyScope(BaseModel):
    deck_id: int = Field(gt=0)
    deck_name: str
    includes_subdecks: Literal[True]


class StudyFSRS(BaseModel):
    due: str
    stability: float
    difficulty: float
    elapsed_days: int
    scheduled_days: int
    learning_steps: int
    reps: int
    lapses: int
    state: int
    last_review: str | None


class StudyCard(BaseModel):
    id: int
    note_id: int
    front: str
    back: str
    front_html: str
    back_html: str
    deck: str
    tags: list[str]
    due: int
    queue: int
    fsrs: StudyFSRS
    source: ManualCardSource | NoteCardSource | None = None


class StudyDueResponse(BaseModel):
    cards: list[StudyCard]
    generated_at: str
    scope: StudyScope | None
    counts: StudyCounts
    has_more: bool


class StudyStatusResponse(BaseModel):
    mode: Literal["external", "integrated"]
    cards: int
    notes: int
    due: int
    reviews: int
    counts: StudyCounts


class StudyDeck(BaseModel):
    deck_id: int
    name: str
    cards: int
    scope_cards: int
    counts: StudyCounts


class StudyDay(BaseModel):
    day: str
    count: int


class StudyStatsResponse(BaseModel):
    daily_reviews: list[StudyDay]
    retention: float | None
    decks: list[StudyDeck]


class ReviewInput(BaseModel):
    card_id: int = Field(gt=0)
    rating: int = Field(ge=1, le=4)
    review_id: str = Field(min_length=8, max_length=100)
    offline: bool = False
    reviewed_at: datetime | None = None
    study_deck_id: int | None = Field(default=None, gt=0)


class StudyReviewResponse(BaseModel):
    card: StudyCard | None
    already_applied: bool = False

    @model_validator(mode="after")
    def require_card_for_first_answer(self):
        if self.card is None and not self.already_applied:
            raise ValueError("Eine neue Bewertung benötigt ihre bestätigte Karte")
        return self


class StudyUndoInput(BaseModel):
    review_id: str = Field(min_length=8, max_length=100)
    card_id: int = Field(gt=0)
    rating: int = Field(ge=1, le=4)


class StudyUndoResponse(BaseModel):
    review_id: str
    card: StudyCard | None
    already_undone: bool = False
