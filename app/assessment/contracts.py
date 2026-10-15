# SPDX-License-Identifier: AGPL-3.0-or-later
from typing import Literal

from pydantic import Field, model_validator

from app.coding.contracts import Input

Kind = Literal['multiple_choice', 'free_recall', 'symbolic_math', 'parsons', 'ordering', 'oral', 'matching', 'numeric']


class Source(Input):
    version_id: int | None = Field(default=None, gt=0)
    note_id: str | None = Field(default=None, max_length=36)
    first_page: int = Field(default=1, ge=1)
    last_page: int = Field(default=1, ge=1)

    @model_validator(mode='after')
    def scope(self):
        if (self.version_id is None) == (self.note_id is None) or self.last_page < self.first_page or self.last_page - self.first_page >= 40:
            raise ValueError('Genau eine Quelle und höchstens 40 Seiten wählen')
        return self


class Create(Input):
    type: Kind
    title: str = Field(min_length=1, max_length=160)
    question: str = Field(min_length=1, max_length=3000)
    topic: str = Field(default='Üben', min_length=1, max_length=120)
    level: int = Field(default=2, ge=1, le=5)
    mode: Literal['training', 'exam'] = 'training'
    choices: list[str] = Field(default_factory=list, max_length=12)
    expected: str = Field(default='', max_length=4000)
    concepts: list[str] = Field(default_factory=list, max_length=12)
    hints: list[str] = Field(default_factory=list, max_length=3)
    math_operation: Literal['equivalent', 'derivative', 'roots'] = 'equivalent'
    expression: str = Field(default='', max_length=128)
    source: Source | None = None
    request_id: int | None = Field(default=None, gt=0)

    @model_validator(mode='after')
    def lengths(self):
        if any(len(item) > 500 for item in self.choices + self.concepts + self.hints):
            raise ValueError('Einträge dürfen höchstens 500 Zeichen lang sein')
        return self


class Answer(Input):
    text: str = Field(default='', max_length=8000)
    steps: list[str] = Field(default_factory=list, max_length=20)
    confidence: int = Field(ge=1, le=5)
    session_id: int | None = Field(default=None, gt=0)

    @model_validator(mode='after')
    def step_size(self):
        if any(len(step) > 128 for step in self.steps):
            raise ValueError('Rechenschritte dürfen höchstens 128 Zeichen lang sein')
        return self


class TutorReview(Input):
    feedback: str = Field(min_length=1, max_length=4000)
    concepts_met: list[str] = Field(default_factory=list, max_length=12)
    error_categories: list[str] = Field(default_factory=list, max_length=8)
    followup: str = Field(default='', max_length=500)

    @model_validator(mode='after')
    def bounded(self):
        if any(len(item) > 120 for item in self.concepts_met + self.error_categories):
            raise ValueError('Tutor-Kategorie ist zu lang')
        return self


class StartExam(Input):
    task_ids: list[int] = Field(min_length=1, max_length=30)
    minutes: int = Field(default=30, ge=1, le=180)
    confirmed: Literal[True]

    @model_validator(mode='after')
    def unique(self):
        if any(identifier <= 0 for identifier in self.task_ids) or len(set(self.task_ids)) != len(self.task_ids):
            raise ValueError('Aufgaben müssen eindeutig sein')
        return self
