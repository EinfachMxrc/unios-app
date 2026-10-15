# SPDX-License-Identifier: AGPL-3.0-or-later

"""Stable accepted learning context; deck scope is broader than topic membership."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

FocusKind = Literal["block", "cycle", "course"]


class FocusTopic(BaseModel):
    id: int
    name: str


class FocusDeck(BaseModel):
    deck_id: int
    name: str


class FocusCardScope(BaseModel):
    mode: Literal["integrated", "external"]
    decks: list[FocusDeck]
    scope: Literal["course_related_decks"]
    uncertain: bool


class LearningFocusView(BaseModel):
    kind: FocusKind
    id: int
    label: str
    status: Literal["accepted", "direct"]
    course_id: int
    course_name: str
    exam_id: int | None
    exam_title: str | None
    exam_at: datetime | None
    exam_changed: bool | None
    topics: list[FocusTopic]
    missing_topic_ids: list[int]
    duration_minutes: int | None
    starts_at: datetime | None
    ends_at: datetime | None
    card_scope: FocusCardScope
