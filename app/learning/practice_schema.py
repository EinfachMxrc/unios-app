# SPDX-License-Identifier: AGPL-3.0-or-later

"""Stable proposal identity and recorded practice results."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class PracticeItem(BaseModel):
    id: int
    exercise_id: int | None
    course_id: int
    course_name: str
    resource_id: int
    resource_name: str
    question: str
    topic: str
    difficulty: Literal["easy", "medium", "hard"]
    sample_solution: str
    solution_steps: str
    source_page: int | None
    choices: list[str] | None
    correct_choice: int | None
    attempt_count: int
    last_correct: bool | None


class PracticeAttemptView(BaseModel):
    id: int
    exercise_id: int
    proposal_id: int
    course_id: int
    course_name: str
    topic: str
    question: str
    answer: str
    correct: bool
    error_kind: str | None
    difficulty: str | None
    solution_steps: str | None
    duration_seconds: int | None
    attempted_at: datetime
