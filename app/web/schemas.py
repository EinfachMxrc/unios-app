# SPDX-License-Identifier: AGPL-3.0-or-later

"""Public JSON contracts for the React dashboard and generated OpenAPI types."""

from datetime import datetime
from typing import Literal
from urllib.parse import unquote, urlsplit

from pydantic import BaseModel, computed_field


class SemesterView(BaseModel):
    id: int
    name: str
    is_current: bool
    starts_at: datetime | None
    ends_at: datetime | None


class CourseView(BaseModel):
    id: int
    name: str
    display_name: str | None = None
    short_name: str | None
    semester_id: int | None
    source: str
    source_id: str
    download_other_groups: bool
    is_active: bool = True


class SectionView(BaseModel):
    id: int
    name: str
    position: int


class GroupAssignmentView(BaseModel):
    id: int
    section_id: int
    status: str
    suggested_status: str | None
    needs_confirmation: bool


class ResourceView(BaseModel):
    id: int
    name: str
    kind: str
    url: str
    section_id: int | None
    removed_upstream: bool
    group_category: str

    @computed_field  # type: ignore[prop-decorator]
    @property
    def filename(self) -> str | None:
        leaf = unquote(urlsplit(self.url).path.rsplit("/", 1)[-1])
        return leaf if self.kind == "file" and "." in leaf else None


class ResourceVersionView(BaseModel):
    id: int
    resource_id: int
    version: int
    size: int
    mime_type: str
    downloaded_at: datetime


class AssignmentView(BaseModel):
    id: int
    title: str
    due_at: datetime | None
    url: str | None
    course_id: int
    removed_upstream: bool
    description: str = ""
    due_note: str = ""
    delivery: str = "unknown"
    due_origin: str = "unknown"


class AnnouncementView(BaseModel):
    id: int
    title: str
    url: str | None
    created_at: datetime | None


class DeadlineView(BaseModel):
    id: int
    assignment_id: int | None
    title: str
    due_at: datetime
    course_id: int | None
    url: str | None


class CalendarEventView(BaseModel):
    id: int
    title: str
    starts_at: datetime
    ends_at: datetime | None
    course_id: int | None
    url: str | None


class ChangeView(BaseModel):
    id: int
    summary: str
    kind: str
    created_at: datetime
    course_id: int | None
    resource_id: int | None
    assignment_id: int | None
    sync_run_id: int | None


class HealthView(BaseModel):
    id: int
    connector: str
    status: str
    message: str | None
    last_success_at: datetime | None


class SyncRunView(BaseModel):
    id: int
    status: str
    started_at: datetime
    finished_at: datetime | None
    course_count: int
    resource_count: int
    change_count: int
    error: str | None


class SyncStatusView(BaseModel):
    running: bool
    last_run_id: int | None
    last_status: str | None


class SyncContinuityView(BaseModel):
    state: Literal["never", "current", "overdue", "recovered"]
    hours_since: int | None
    recovered_gap_hours: int | None
    last_usable_at: datetime | None


class OverviewView(BaseModel):
    date: str
    moodle_enabled: bool
    moodle_configured: bool
    new_files: int
    new_assignments: int
    changes: list[ChangeView]
    deadlines: list[DeadlineView]
    courses: dict[int, str]
    warnings: list[HealthView]
    pending_group_courses: list[CourseView]
    latest_sync: SyncRunView | None
    sync_continuity: SyncContinuityView


class CoursesView(BaseModel):
    courses: list[CourseView]
    semesters: list[SemesterView]


class ListPageView(BaseModel):
    total: int
    offset: int
    limit: int
    has_more: bool


class ResourceVersionsView(BaseModel):
    versions: list[ResourceVersionView]
    page: ListPageView


class CourseDetailView(BaseModel):
    course: CourseView
    sections: list[SectionView]
    group_assignments: list[GroupAssignmentView]
    resources: list[ResourceView]
    versions: dict[int, list[ResourceVersionView]]
    assignments: list[AssignmentView]
    announcements: list[AnnouncementView]
    semesters: list[SemesterView]
    page: ListPageView | None = None


class MaterialAnchorView(BaseModel):
    status: Literal["matched", "unmatched", "ambiguous"]
    page: int | None
    rects: list[list[float]]


class MaterialAnnotationView(BaseModel):
    id: str
    resource_id: int
    source_version_id: int
    kind: Literal["highlight", "question"]
    quote: str
    comment: str
    resolved: bool
    revision: int
    created_at: datetime
    updated_at: datetime
    anchor: MaterialAnchorView


class MaterialVersionView(BaseModel):
    id: int
    version: int


class MaterialView(BaseModel):
    version_id: int
    resource_id: int
    resource_name: str
    course_id: int
    course_name: str
    version: int
    versions: list[MaterialVersionView]
    annotations: list[MaterialAnnotationView]


class DocumentView(BaseModel):
    """Any stored file as readable text: Moodle pages, HTML, Markdown and other non-PDF material."""

    version_id: int
    resource_name: str
    course_id: int
    course_name: str
    filename: str
    # "page" is the extracted text; the others open the file itself in the viewer.
    view: Literal["page", "image", "audio", "video", "code", "text", "table", "docx", "xlsx"]
    size: int
    markdown: str


class MaterialCitationView(BaseModel):
    note_id: str
    title: str
    course_name: str
    revision: int
    pages: list[int]
    current_version: bool


class MaterialCitationsView(BaseModel):
    citations: list[MaterialCitationView]


class CourseQuestionView(BaseModel):
    id: str
    resource_name: str
    version_id: int
    quote: str
    comment: str
    resolved: bool
    linked_cards: int = 0


class CourseAnnotationView(BaseModel):
    id: str
    resource_id: int
    resource_name: str
    version_id: int
    kind: Literal["highlight", "question"]
    quote: str
    comment: str
    resolved: bool
    page: int | None
    anchor_status: Literal["matched", "unmatched", "ambiguous"]
    linked_cards: int = 0


class CourseMaterialView(BaseModel):
    course_id: int
    scratchpad: str
    scratchpad_revision: int
    questions: list[CourseQuestionView]
    annotations: list[CourseAnnotationView]


class LearningQuestionView(BaseModel):
    id: str
    course_id: int
    course_name: str
    resource_name: str
    version_id: int
    quote: str
    comment: str
    resolved: bool
    revision: int
    source_page: int
    approved_explanation: str | None = None


class LearningQuestionsView(BaseModel):
    questions: list[LearningQuestionView]


class SearchHitView(BaseModel):
    resource_id: int
    filename: str
    removed_upstream: bool
    version_id: int
    version: int
    page_number: int
    course_id: int
    course_name: str
    semester_name: str | None
    excerpt: str


class SearchView(BaseModel):
    results: list[SearchHitView]
    announcement_results: list["AnnouncementSearchHitView"]
    annotation_results: list["AnnotationSearchHitView"]
    course_note_results: list["CourseNoteSearchHitView"]
    note_results: list["NoteSearchHitView"]
    jot_results: list["JotSearchHitView"]
    clip_results: list["ClipSearchHitView"]
    courses: list[CourseView]
    semesters: list[SemesterView]


class AnnouncementSearchHitView(BaseModel):
    id: int
    title: str
    course_id: int
    course_name: str
    semester_name: str | None
    excerpt: str
    url: str | None


class ClipSearchHitView(BaseModel):
    id: str
    kind: Literal["web", "text"]
    title: str
    url: str | None
    course_id: int | None
    course_name: str | None
    semester_name: str | None
    excerpt: str


class AnnotationSearchHitView(BaseModel):
    id: str
    kind: Literal["highlight", "question"]
    resolved: bool
    resource_id: int
    resource_name: str
    version_id: int
    page_number: int
    course_id: int
    course_name: str
    semester_name: str | None
    excerpt: str


class CourseNoteSearchHitView(BaseModel):
    course_id: int
    course_name: str
    semester_name: str | None
    excerpt: str


class OfflineSearchItemView(BaseModel):
    kind: Literal["document", "annotation", "announcement", "course_note", "note", "jot", "clip"]
    id: str
    title: str
    body: str
    course_id: int | None
    course_name: str | None
    semester_id: int | None
    semester_name: str | None
    page_number: int | None
    href: str


class OfflineSearchIndexView(BaseModel):
    items: list[OfflineSearchItemView]


class NoteSummaryView(BaseModel):
    id: str
    course_id: int
    course_name: str
    resource_id: int | None
    title: str
    current_revision: int
    created_at: datetime
    updated_at: datetime


class NoteVersionView(BaseModel):
    revision: int
    title: str
    relative_path: str
    created_at: datetime


class NoteDetailView(BaseModel):
    note: NoteSummaryView
    selected_revision: int
    body: str
    versions: list[NoteVersionView]


class NotesView(BaseModel):
    notes: list[NoteSummaryView]
    courses: list[CourseView]
    page: ListPageView | None = None


class RelatedNoteView(BaseModel):
    id: str
    title: str
    course_name: str
    semester_name: str | None
    shared_terms: list[str]


class NoteSearchHitView(BaseModel):
    id: str
    title: str
    course_id: int
    course_name: str
    semester_name: str | None
    revision: int
    excerpt: str


class JotView(BaseModel):
    id: str
    kind: Literal["thought", "question", "todo"]
    body: str
    course_id: int | None
    note_id: str | None
    created_at: datetime
    updated_at: datetime
    task_id: int | None = None
    task_course_id: int | None = None


class JotsView(BaseModel):
    jots: list[JotView]
    courses: list[CourseView]
    notes: list[NoteSummaryView]
    page: ListPageView | None = None


class JotSearchHitView(BaseModel):
    id: str
    kind: Literal["thought", "question", "todo"]
    course_id: int | None
    course_name: str | None
    semester_name: str | None
    note_id: str | None
    created_at: datetime
    excerpt: str


class DeadlinesView(BaseModel):
    deadlines: list[DeadlineView]
    events: list[CalendarEventView]
    courses: dict[int, str]


class ActivityView(BaseModel):
    changes: list[ChangeView]
    courses: list[CourseView]


class BackupView(BaseModel):
    status: str
    finished_at: str
    message: str


class SystemView(BaseModel):
    moodle_enabled: bool
    moodle_configured: bool
    runs: list[SyncRunView]
    health: list[HealthView]
    semesters: list[SemesterView]
    backup: BackupView | None
    snapshot: "SnapshotHealthView"
    sync_continuity: SyncContinuityView


class SnapshotHealthView(BaseModel):
    status: Literal["ok", "warning", "error"]
    created_at: datetime | None
    generation: int | None
    age_seconds: int | None
    message: str


class DoctorDiagnosticView(BaseModel):
    status: Literal["ok", "warning", "unknown", "not_configured"]
    message: str


class DoctorView(BaseModel):
    checks: dict[str, bool]
    diagnostics: dict[str, DoctorDiagnosticView]
    ready_for_sync: bool
    ready_for_takeover: bool


class HostView(BaseModel):
    mode: Literal["host", "standby", "released"]
    topology: Literal["local", "server"] = "local"
    device_name: str | None
    generation: int | None
    heartbeat_at: datetime | None
    released_at: datetime | None


class OkView(BaseModel):
    ok: Literal[True]
