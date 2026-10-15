# SPDX-License-Identifier: AGPL-3.0-or-later

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Language = Literal['python', 'java', 'javascript']
TemplateId = Literal['sum', 'maximum', 'reverse', 'sort', 'unique', 'count_zero', 'factorial']


class Input(BaseModel):
    model_config = ConfigDict(extra='forbid')


class CreatePractice(Input):
    template: TemplateId
    language: Language
    title: str = Field(default='', max_length=160)
    story: str = Field(default='', max_length=2000)
    learning_goal: str = Field(default='', max_length=300)
    rubric: list[str] = Field(default_factory=list, max_length=8)
    difficulty: Literal['easy', 'medium', 'hard'] = 'easy'
    topic_id: int | None = Field(default=None, gt=0)

    @model_validator(mode='after')
    def rubric_size(self):
        if any(len(item) > 300 for item in self.rubric):
            raise ValueError('Bewertungskriterium ist zu lang')
        return self


class Files(Input):
    files: dict[str, str] = Field(min_length=1, max_length=8)

    @model_validator(mode='after')
    def safe_files(self):
        for name, content in self.files.items():
            if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,63}\.(py|js|java)', name):
                raise ValueError('Nur einfache Python-, Java- oder JavaScript-Dateinamen erlaubt')
            if name in {'Main.java', 'main.py', 'main.js', 'compile', 'run'}:
                raise ValueError('Der Dateiname ist für den Runner reserviert')
            if '\x00' in content:
                raise ValueError('Quelltext enthält ein Nullzeichen')
        if sum(len(body.encode('utf-8')) for body in self.files.values()) > 128 * 1024:
            raise ValueError('Quelltext darf insgesamt höchstens 128 KiB groß sein')
        return self


class Draft(Files):
    expected_revision: int = Field(ge=0)


class Run(Files):
    confirmed: Literal[True]


class Hint(Input):
    level: int = Field(ge=1, le=4)
    reveal_solution: bool = False

    @model_validator(mode='after')
    def explicit_solution(self):
        if self.level == 4 and not self.reveal_solution:
            raise ValueError('Die Lösung muss ausdrücklich angefordert werden')
        return self


class Review(Input):
    level: int = Field(ge=1, le=3)
    feedback: str = Field(min_length=1, max_length=4000)
    line: int | None = Field(default=None, ge=1, le=10000)
    file: str | None = Field(default=None, max_length=80)
    next_template: TemplateId | None = None


class Confirm(Input):
    confirmed: Literal[True]
