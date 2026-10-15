# SPDX-License-Identifier: AGPL-3.0-or-later
"""Typed public coding responses; grader metadata stays extensible."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.coding.contracts import Language, TemplateId


class CodingView(BaseModel):
    model_config = ConfigDict(extra='allow')


class CodingTemplateView(CodingView):
    id: TemplateId
    title: str
    topic: str
    contract: str


class CodingCatalogView(CodingView):
    version: str
    languages: list[Language]
    templates: list[CodingTemplateView]


class CodingRunnerView(CodingView):
    ready: bool
    backend: str | None = None
    languages: list[Any]
    code: str | None = None


class CodingCheckView(CodingView):
    name: str
    category: str
    public: bool
    passed: bool
    status: int
    input: list[int] = Field(default_factory=list)
    expected: list[int] = Field(default_factory=list)
    actual: list[int] | None = None
    console: str = ''
    compiler: str = ''
    runtime_ms: float | None = None
    memory_kib: int | None = None


class CodingReportView(CodingView):
    passed: int = 0
    total: int = 0
    solved: bool = False
    checks: list[CodingCheckView] = Field(default_factory=list)
    runtime_ms: float | None = None
    failed_categories: list[str] = Field(default_factory=list)


class CodingAttemptView(CodingView):
    id: int
    task_id: int
    state: str
    hint_level: int
    job_id: str | None = None
    feedback_requested: bool
    feedback_level: int
    report: CodingReportView
    created_at: datetime
    files: dict[str, str] = Field(default_factory=dict)


class CodingPublicTestView(CodingView):
    name: str
    input: list[int]
    expected: list[int]


class CodingReviewView(CodingView):
    id: int
    attempt_id: int
    level: int
    feedback: str
    file: str | None
    line: int | None
    next_template: TemplateId | None
    status: str


class CodingTaskView(CodingView):
    id: int
    course_id: int
    title: str
    template: TemplateId
    template_version: str
    language: Language
    topic_id: int | None
    difficulty: str
    learning_goal: str
    story: str
    contract: str
    rubric: list[str]
    status: str
    draft_revision: int
    highest_hint: int
    created_at: datetime
    starter_files: dict[str, str]
    public_tests: list[CodingPublicTestView]
    validation: dict[str, Any]


class CodingDetailView(CodingTaskView):
    files: dict[str, str]
    attempts: list[CodingAttemptView]
    reviews: list[CodingReviewView]


class CodingTasksView(CodingView):
    tasks: list[CodingTaskView]
    next_after: int | None


class CodingStatusView(CodingView):
    status: str
    agent_runs_automatically: bool = False


class CodingDraftView(CodingView):
    revision: int


class CodingRunView(CodingView):
    attempt_id: int
    job_id: str


class CodingHintView(CodingView):
    level: int
    text: str
    solution: bool


class CodingProgressView(CodingView):
    topics: list[dict[str, Any]]
