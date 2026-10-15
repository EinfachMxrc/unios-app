# SPDX-License-Identifier: AGPL-3.0-or-later
"""Public assessment projections; solutions remain in the confirmed definition route."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.assessment.contracts import Kind


class AssessmentView(BaseModel):
    model_config = ConfigDict(extra='allow')


class AssessmentTypeView(AssessmentView):
    id: str
    renderer: str
    grader: str
    objective: bool
    capabilities: list[str]


class AssessmentCatalogView(AssessmentView):
    version: str
    types: list[AssessmentTypeView]


class AssessmentReportView(AssessmentView):
    correct: bool | None = None
    errors: list[str] = Field(default_factory=list)
    misconception: bool = False
    steps: list[dict[str, Any]] = Field(default_factory=list)
    rules_checked: bool = False
    needs_tutor: bool = False


class AssessmentAttemptView(AssessmentView):
    id: int
    task_id: int
    session_id: int | None
    confidence: int
    hint_level: int
    report: AssessmentReportView
    feedback_requested: bool
    created_at: datetime


class AssessmentReviewView(AssessmentView):
    id: int
    attempt_id: int
    feedback: str
    followup: str
    concepts_met: list[str]
    error_categories: list[str]
    status: str


class AssessmentSourceReferenceView(AssessmentView):
    url: str


class AssessmentProvenanceView(AssessmentView):
    source: AssessmentSourceReferenceView | None = None
    hash: str | None = None
    authored_content_verified: bool = False


class AssessmentTaskView(AssessmentView):
    id: int
    course_id: int
    topic_id: int | None
    title: str
    type: Kind
    status: str
    level: int
    highest_hint: int
    created_at: datetime
    question: str
    choices: list[str]
    options: list[str] = Field(default_factory=list)
    expression: str
    math_operation: str
    topic: str | None = None
    mode: str
    objective: bool
    provenance: AssessmentProvenanceView


class AssessmentDetailView(AssessmentTaskView):
    attempts: list[AssessmentAttemptView]
    reviews: list[AssessmentReviewView]


class AssessmentTasksView(AssessmentView):
    tasks: list[AssessmentTaskView]
    limit: int


class AssessmentSourceView(AssessmentView):
    source: dict[str, Any] | None = None
    hash: str | None = None
    text: str = ''


class AssessmentRequestView(AssessmentView):
    id: int
    status: str
    source: dict[str, Any]
    plan: list[str]
    automatic_agent: bool


class AssessmentRequestedSourceView(AssessmentView):
    id: int
    course_id: int
    status: str
    source: dict[str, Any]
    source_unchanged: bool
    tasks: list[AssessmentTaskView]


class AssessmentHintView(AssessmentView):
    level: int
    text: str
    solution: bool
    available: bool = False


class AssessmentStatusView(AssessmentView):
    status: str
    automatic_agent: bool = False


class AssessmentProgressView(AssessmentView):
    topics: list[dict[str, Any]]
    window: int
    bounded: bool
    subjective_grades_included: bool


class AssessmentExamReportView(AssessmentView):
    points: float
    maximum: float
    pending_points: float
    unanswered: int
    grade: str | None
    basis: str
    results: list[AssessmentAttemptView]


class AssessmentExamView(AssessmentView):
    id: int
    state: str
    ends_at: datetime
    task_ids: list[int]
    answered: list[int]
    remaining_seconds: int
    report: AssessmentExamReportView | None = None


class AssessmentExamsView(AssessmentView):
    exams: list[AssessmentExamView]
    limit: int
