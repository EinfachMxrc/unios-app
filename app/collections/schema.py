# SPDX-License-Identifier: AGPL-3.0-or-later

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

SourceKind = Literal["topics", "materials", "deadlines", "questions", "notes", "cards"]
Kind = Literal["all", "topics", "materials", "deadlines", "questions", "notes", "cards"]
View = Literal["list", "table", "cards", "board", "calendar"]
Sort = Literal["date", "title", "progress"]
GroupBy = Literal["status", "course", "kind", "source"]
SOURCE_KINDS: tuple[SourceKind, ...] = ("topics", "materials", "deadlines", "questions", "notes", "cards")
VisibleField = Literal["title", "course", "date", "status", "source", "tags"]


def default_visible_fields() -> list[VisibleField]:
    return ["title", "course", "date", "status"]


class AnyGroup(BaseModel):
    """One AND clause; the list of clauses is combined with OR."""

    model_config = ConfigDict(extra="forbid")
    kind: SourceKind | None = None
    course_id: int | None = Field(default=None, ge=1)
    status: str | None = Field(default=None, max_length=40)
    source: str | None = Field(default=None, max_length=40)
    tag: str | None = Field(default=None, max_length=40)
    max_percent: int | None = Field(default=None, ge=0, le=100)
    own_group_only: bool = False


class CollectionConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Kind
    view: View = "list"
    course_id: int | None = None
    days: int | None = Field(default=None, ge=1, le=365)
    max_percent: int | None = Field(default=None, ge=0, le=100)
    own_group_only: bool = False
    include_unmeasured: bool = True
    sort: Sort = "date"
    tag: str | None = Field(default=None, max_length=40)
    priority: Literal["low", "medium", "high"] | None = None
    exam_relevant: bool | None = None
    difficulty: Literal["easy", "medium", "hard"] | None = None
    workflow_status: Literal["open", "working", "done"] | None = None
    group_by: GroupBy = "status"
    sort_direction: Literal["auto", "asc", "desc"] = "auto"
    visible_fields: list[VisibleField] = Field(default_factory=default_visible_fields, min_length=1, max_length=6)
    time_filter: Literal["all", "upcoming", "overdue"] = "all"
    unread_only: bool = False
    has_questions: bool = False
    submission_filter: Literal["all", "unsubmitted"] = "all"
    any_groups: list[AnyGroup] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def valid_for_kind(self):
        if len(set(self.visible_fields)) != len(self.visible_fields) or "title" not in self.visible_fields:
            raise ValueError("Sichtbare Felder benötigen genau einen Titel")
        if (self.time_filter != "all" or self.submission_filter != "all") and self.kind not in {"all", "deadlines"}:
            raise ValueError("Fristfilter passen nur zu Fristen")
        if (self.unread_only or self.has_questions) and self.kind not in {"all", "materials"}:
            raise ValueError("Materialfilter passen nur zu Materialien")
        if self.kind == "topics":
            if self.days is not None or self.own_group_only or self.view == "calendar":
                raise ValueError("Diese Filter oder Ansicht passen nicht zu Lernthemen")
        elif self.kind != "all" and (self.max_percent is not None or self.sort == "progress"):
            raise ValueError("Fortschritt ist nur für Lernthemen verfügbar")
        if self.kind == "all" and self.sort == "progress":
            raise ValueError("Gemischte Inhalte können nicht nach Lernstand sortiert werden")
        if self.kind != "materials" and self.own_group_only:
            raise ValueError("Gruppenfilter ist nur für Materialien verfügbar")
        return self


class CollectionInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    config: CollectionConfig


class CollectionUpdate(CollectionInput):
    expected_revision: int = Field(ge=1)


class CollectionView(BaseModel):
    id: int
    name: str
    config: CollectionConfig
    revision: int


class CollectionItem(BaseModel):
    id: str
    title: str
    subtitle: str
    course_name: str | None
    url: str
    date: datetime | None
    score: int | None
    status: str
    tags: list[str] = Field(default_factory=list)
    priority: str | None = None
    exam_relevant: bool | None = None
    kind: SourceKind = "topics"
    source: str = "lokal"
    course_id: int | None = None
    own_group: bool = False


class CollectionResult(BaseModel):
    items: list[CollectionItem]
    total: int


