# SPDX-License-Identifier: AGPL-3.0-or-later
"""Bounded retrieval contracts shared by HTTP, CLI and MCP."""

import re
from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Kind = Literal['resource', 'note', 'question', 'assignment', 'deadline', 'event', 'mail',
               'topic', 'exercise', 'project', 'exam', 'jot', 'course', 'code', 'card', 'voice', 'coding_task', 'coding_attempt', 'assessment_task', 'assessment_attempt']

MATERIAL_SOURCE_LINK = re.compile(r'/material/([1-9][0-9]{0,15})(?:\?page=([1-9][0-9]{0,15}))?')


def material_source_ref(ref: str) -> tuple[int, int | None] | None:
    """Only the reader's exact relative source links are accepted as aliases."""
    match = MATERIAL_SOURCE_LINK.fullmatch(ref)
    if match is None:
        return None
    return int(match[1]), int(match[2]) if match[2] else None


class Request(BaseModel):
    model_config = ConfigDict(extra='forbid')
    budget: int = Field(default=12000, ge=512, le=64000)


class Scope(BaseModel):
    model_config = ConfigDict(extra='forbid')
    course: int | str | None = None
    semester: int | str | None = None
    before: str | None = Field(default=None, max_length=40)

    @field_validator('before')
    @classmethod
    def timestamp(cls, value):
        if value is None:
            return None
        parsed = datetime.fromisoformat(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC).isoformat()


class Search(Request):
    query: str = Field(default='', max_length=500)
    scope: Scope = Field(default_factory=Scope)
    types: list[Kind] = Field(default_factory=list, max_length=16)
    top_k: int = Field(default=20, ge=1, le=50)
    cursor: str | None = Field(default=None, max_length=1024)
    mode: Literal['search', 'catalog', 'symbol'] = 'search'
    view: Literal['all', 'current_semester', 'open_work', 'open_questions', 'unread_material', 'recent_changes'] = 'all'
    deduplicate: bool = True
    chunks_per_document: int = Field(default=2, ge=1, le=20)


class Fetch(Request):
    refs: list[str] = Field(min_length=1, max_length=50)
    pages: list[int] = Field(default_factory=list, max_length=50)
    sections: list[str] = Field(default_factory=list, max_length=30)
    after: int = Field(default=-1, ge=-1)

    @model_validator(mode='after')
    def bounded(self):
        if any(len(ref) > 300 for ref in self.refs) or any(p < 1 for p in self.pages):
            raise ValueError('Ungültiger Quellenverweis oder Seitenwert')
        if any(len(section) > 300 for section in self.sections):
            raise ValueError('Abschnittsname zu lang')
        for ref in self.refs:
            source = material_source_ref(ref)
            if ref.startswith('/material/') and source is None:
                raise ValueError('Ungültiger Materialverweis')
            if source and source[1] is not None and self.pages and set(self.pages) != {source[1]}:
                raise ValueError('Seitenfilter widerspricht dem Materialverweis')
        return self


class Outline(Request):
    ref: str = Field(max_length=300)
    after: int = Field(default=-1, ge=-1)
    limit: int = Field(default=50, ge=1, le=100)


class Context(Search):
    goal: Literal['question', 'prepare_exam', 'weekly_study', 'overview'] = 'question'


class Changes(Request):
    cursor: str | None = Field(default=None, max_length=1024)
    limit: int = Field(default=50, ge=1, le=100)


class Graph(Request):
    ref: str = Field(max_length=300)
    depth: int = Field(default=1, ge=1, le=3)
    limit: int = Field(default=30, ge=1, le=100)


class Act(Request):
    kind: Literal['resource', 'assignment', 'course', 'coding_task', 'coding_attempt', 'assessment_task', 'assessment_attempt']
    object_id: str = Field(pattern=r'^[1-9][0-9]{0,15}$')
    action_id: str = Field(max_length=100)
    input: dict = Field(default_factory=dict)
    dry_run: bool = False
