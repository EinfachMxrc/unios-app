# SPDX-License-Identifier: AGPL-3.0-or-later

from datetime import UTC, date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utc_now() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class Semester(Base):
    __tablename__ = "semesters"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_current: Mapped[bool] = mapped_column(Boolean, default=False)


class Course(Base):
    __tablename__ = "courses"
    __table_args__ = (UniqueConstraint("source", "source_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(40))
    source_id: Mapped[str] = mapped_column(String(120))
    name: Mapped[str] = mapped_column(String(500))
    display_name: Mapped[str | None] = mapped_column(String(80))
    short_name: Mapped[str | None] = mapped_column(String(200))
    semester_id: Mapped[int | None] = mapped_column(ForeignKey("semesters.id"))
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    download_other_groups: Mapped[bool] = mapped_column(Boolean, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class CourseSection(Base):
    __tablename__ = "course_sections"
    __table_args__ = (UniqueConstraint("course_id", "source_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), index=True)
    source_id: Mapped[str] = mapped_column(String(120))
    name: Mapped[str] = mapped_column(String(500))
    position: Mapped[int] = mapped_column(Integer, default=0)


class SectionGroupAssignment(Base):
    __tablename__ = "section_group_assignments"
    id: Mapped[int] = mapped_column(primary_key=True)
    section_id: Mapped[int] = mapped_column(ForeignKey("course_sections.id"), unique=True)
    status: Mapped[str] = mapped_column(String(20), default="general")
    suggested_status: Mapped[str | None] = mapped_column(String(20))
    needs_confirmation: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Resource(Base):
    __tablename__ = "resources"
    __table_args__ = (UniqueConstraint("source", "source_key"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(40))
    source_key: Mapped[str] = mapped_column(String(1000))
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), index=True)
    section_id: Mapped[int | None] = mapped_column(ForeignKey("course_sections.id"))
    kind: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(500))
    url: Mapped[str] = mapped_column(Text)
    upstream_modified: Mapped[int | None] = mapped_column(Integer)
    upstream_size: Mapped[int | None] = mapped_column(Integer)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    removed_upstream: Mapped[bool] = mapped_column(Boolean, default=False)
    group_category: Mapped[str] = mapped_column(String(20), default="general")


class ResourceVersion(Base):
    __tablename__ = "resource_versions"
    __table_args__ = (UniqueConstraint("resource_id", "version"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    resource_id: Mapped[int] = mapped_column(ForeignKey("resources.id"))
    version: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    relative_path: Mapped[str] = mapped_column(Text)
    size: Mapped[int] = mapped_column(Integer)
    mime_type: Mapped[str] = mapped_column(String(200))
    downloaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    first_opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ResourceText(Base):
    __tablename__ = "resource_texts"
    __table_args__ = (UniqueConstraint("version_id", "page_number"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    version_id: Mapped[int] = mapped_column(ForeignKey("resource_versions.id"))
    page_number: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    markdown: Mapped[str | None] = mapped_column(Text)
    no_text_layer: Mapped[bool] = mapped_column(Boolean, default=False)
    ocr_attempted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AiAccess(Base):
    __tablename__ = "ai_access"
    key: Mapped[str] = mapped_column(String(120), primary_key=True)
    allowed: Mapped[bool] = mapped_column(Boolean, default=True)


class AiOutboxReceipt(Base):
    __tablename__ = "ai_outbox_receipts"
    sha256: Mapped[str] = mapped_column(String(64), primary_key=True)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    card_count: Mapped[int] = mapped_column(Integer)
    exercise_count: Mapped[int] = mapped_column(Integer, default=0)
    explanation_count: Mapped[int] = mapped_column(Integer, default=0)


class QuestionExplanationQueue(Base):
    __tablename__ = "question_explanation_queue"
    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[str] = mapped_column(String(36), index=True)
    status: Mapped[str] = mapped_column(String(30), default="proposed")
    answer: Mapped[str] = mapped_column(Text)
    generated_by: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AiToolAccess(Base):
    __tablename__ = "ai_tool_access"
    id: Mapped[int] = mapped_column(primary_key=True)
    accessed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    tool: Mapped[str] = mapped_column(String(80))
    resource_id: Mapped[int | None] = mapped_column(Integer)
    permitted: Mapped[bool] = mapped_column(Boolean)
    actor: Mapped[str] = mapped_column(String(128), default="local")


class MaterialAnnotation(Base):
    """Rebuildable listing/search index; full anchors live in DATA_DIR JSONL."""

    __tablename__ = "material_annotations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    resource_id: Mapped[int] = mapped_column(ForeignKey("resources.id"), index=True)
    source_version_id: Mapped[int] = mapped_column(ForeignKey("resource_versions.id"))
    kind: Mapped[str] = mapped_column(String(20))
    quote: Mapped[str] = mapped_column(Text)
    comment: Mapped[str] = mapped_column(Text, default="")
    source_page: Mapped[int] = mapped_column(Integer)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class CourseScratchpad(Base):
    __tablename__ = "course_scratchpads"
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), primary_key=True)
    body: Mapped[str] = mapped_column(Text, default="")
    revision: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Note(Base):
    __tablename__ = "notes"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"))
    resource_id: Mapped[int | None] = mapped_column(ForeignKey("resources.id"))
    title: Mapped[str] = mapped_column(String(200))
    current_revision: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    # Set while the note sits in the trash; queries hide it (app.db.trash).
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)


class NoteVersion(Base):
    __tablename__ = "note_versions"
    __table_args__ = (UniqueConstraint("note_id", "revision"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    note_id: Mapped[str] = mapped_column(ForeignKey("notes.id"))
    revision: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    relative_path: Mapped[str] = mapped_column(Text)
    sha256: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Jot(Base):
    __tablename__ = "jots"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    kind: Mapped[str] = mapped_column(String(20))
    body: Mapped[str] = mapped_column(Text)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"))
    note_id: Mapped[str | None] = mapped_column(ForeignKey("notes.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    # Set while the capture sits in the trash; queries hide it (app.db.trash).
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)


class StudyJournalDay(Base):
    __tablename__ = "study_journal_days"
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    reflection: Mapped[str] = mapped_column(Text, default="")
    revision: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class StudyJournalCourse(Base):
    __tablename__ = "study_journal_courses"
    __table_args__ = (UniqueConstraint("day", "course_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"))
    covered: Mapped[str] = mapped_column(Text)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class InboxClip(Base):
    __tablename__ = "inbox_clips"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    kind: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(300))
    url: Mapped[str | None] = mapped_column(Text)
    body: Mapped[str] = mapped_column(Text, default="")
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"), index=True)
    filed: Mapped[bool] = mapped_column(Boolean, default=False)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class IntakeDecision(Base):
    __tablename__ = "intake_decisions"
    __table_args__ = (UniqueConstraint("source_kind", "source_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    source_kind: Mapped[str] = mapped_column(String(30), index=True)
    source_id: Mapped[str] = mapped_column(String(300))
    state: Mapped[str] = mapped_column(String(20), default="new", index=True)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"))
    target_kind: Mapped[str | None] = mapped_column(String(30))
    target_id: Mapped[str | None] = mapped_column(String(80))
    duplicate_of: Mapped[str | None] = mapped_column(String(350))
    snoozed_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revision: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class SmartCollection(Base):
    __tablename__ = "smart_collections"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str] = mapped_column(String(20))
    view: Mapped[str] = mapped_column(String(20), default="list")
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"))
    days: Mapped[int | None] = mapped_column(Integer)
    max_percent: Mapped[int | None] = mapped_column(Integer)
    own_group_only: Mapped[bool] = mapped_column(Boolean, default=False)
    include_unmeasured: Mapped[bool] = mapped_column(Boolean, default=True)
    sort: Mapped[str] = mapped_column(String(20), default="date")
    group_by: Mapped[str] = mapped_column(String(20), default="status")
    any_groups: Mapped[list[dict]] = mapped_column(JSON, default=list)
    options: Mapped[dict] = mapped_column(JSON, default=dict)
    tag: Mapped[str | None] = mapped_column(String(40))
    priority: Mapped[str | None] = mapped_column(String(20))
    exam_relevant: Mapped[bool | None] = mapped_column(Boolean)
    difficulty: Mapped[str | None] = mapped_column(String(20))
    workflow_status: Mapped[str | None] = mapped_column(String(30))
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class ObjectMetadata(Base):
    __tablename__ = "object_metadata"
    __table_args__ = (UniqueConstraint("object_type", "object_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    object_type: Mapped[str] = mapped_column(String(30))
    object_id: Mapped[str] = mapped_column(String(80))
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    priority: Mapped[str | None] = mapped_column(String(20))
    exam_relevant: Mapped[bool | None] = mapped_column(Boolean)
    difficulty: Mapped[str | None] = mapped_column(String(20))
    workflow_status: Mapped[str | None] = mapped_column(String(30))
    revision: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class VoiceMemo(Base):
    __tablename__ = "voice_memos"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    transcript: Mapped[str] = mapped_column(Text, default="")
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"))
    topic_id: Mapped[int | None] = mapped_column(ForeignKey("learning_topics.id"))
    jot_id: Mapped[str | None] = mapped_column(ForeignKey("jots.id"), unique=True)
    relative_path: Mapped[str] = mapped_column(Text)
    mime_type: Mapped[str] = mapped_column(String(50))
    size: Mapped[int] = mapped_column(Integer)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class StudyRule(Base):
    __tablename__ = "study_rules"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    trigger: Mapped[str] = mapped_column(String(30))
    action: Mapped[str] = mapped_column(String(30))
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"))
    days: Mapped[int | None] = mapped_column(Integer)
    max_percent: Mapped[int | None] = mapped_column(Integer)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    generation: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class RuleExecution(Base):
    __tablename__ = "rule_executions"
    __table_args__ = (UniqueConstraint("rule_id", "generation", "object_type", "object_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    rule_id: Mapped[int] = mapped_column(ForeignKey("study_rules.id"), index=True)
    generation: Mapped[int] = mapped_column(Integer, default=1)
    object_type: Mapped[str] = mapped_column(String(30))
    object_id: Mapped[str] = mapped_column(String(80))
    title: Mapped[str] = mapped_column(String(300))
    url: Mapped[str] = mapped_column(String(500))
    action: Mapped[str] = mapped_column(String(30))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    undone_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class LinkEdge(Base):
    __tablename__ = "links"
    __table_args__ = (UniqueConstraint("from_type", "from_id", "to_type", "to_id", "relation"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    from_type: Mapped[str] = mapped_column(String(40), index=True)
    from_id: Mapped[str] = mapped_column(String(36), index=True)
    to_type: Mapped[str] = mapped_column(String(40), index=True)
    to_id: Mapped[str] = mapped_column(String(36), index=True)
    relation: Mapped[str] = mapped_column(String(40), default="related")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Assignment(Base):
    __tablename__ = "assignments"
    __table_args__ = (UniqueConstraint("source", "source_key"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(40))
    source_key: Mapped[str] = mapped_column(String(200))
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), index=True)
    title: Mapped[str] = mapped_column(String(500))
    url: Mapped[str | None] = mapped_column(Text)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    description: Mapped[str] = mapped_column(Text, default="")
    due_note: Mapped[str] = mapped_column(Text, default="")
    delivery: Mapped[str] = mapped_column(String(20), default="unknown")
    due_origin: Mapped[str] = mapped_column(String(20), default="unknown")
    due_override: Mapped[bool] = mapped_column(Boolean, default=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    removed_upstream: Mapped[bool] = mapped_column(Boolean, default=False)


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), index=True)
    deadline_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str] = mapped_column(Text, default="")
    members: Mapped[list[dict[str, str | None]]] = mapped_column(JSON, default=list)
    links: Mapped[list[dict[str, str]]] = mapped_column(JSON, default=list)
    todos: Mapped[list[dict[str, str | bool]]] = mapped_column(JSON, default=list)
    github_repo: Mapped[str | None] = mapped_column(String(200))
    revision: Mapped[int] = mapped_column(Integer, default=1)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class ProjectAssignment(Base):
    __tablename__ = "project_assignments"
    __table_args__ = (UniqueConstraint("project_id", "assignment_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    assignment_id: Mapped[int] = mapped_column(ForeignKey("assignments.id"))


class RepoSnapshot(Base):
    __tablename__ = "repo_snapshots"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    repository: Mapped[str] = mapped_column(String(200))
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    manifest_path: Mapped[str] = mapped_column(Text, unique=True)
    manifest_sha256: Mapped[str] = mapped_column(String(64))
    refs_count: Mapped[int] = mapped_column(Integer)
    head: Mapped[str | None] = mapped_column(String(64))


class SubmissionControl(Base):
    __tablename__ = "submission_controls"
    id: Mapped[int] = mapped_column(primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)


class SubmissionAttempt(Base):
    __tablename__ = "submission_attempts"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    assignment_id: Mapped[int] = mapped_column(ForeignKey("assignments.id"), index=True)
    state: Mapped[str] = mapped_column(String(30))
    files: Mapped[list[dict[str, str | int]]] = mapped_column(JSON)
    existing_status: Mapped[str] = mapped_column(String(30))
    existing_revision: Mapped[str] = mapped_column(String(100))
    final_submit: Mapped[bool] = mapped_column(Boolean)
    requires_final_submit: Mapped[bool] = mapped_column(Boolean)
    statement_required: Mapped[bool] = mapped_column(Boolean)
    statement_text: Mapped[str | None] = mapped_column(Text)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cutoff_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    result_status: Mapped[str | None] = mapped_column(String(30))
    warning: Mapped[str | None] = mapped_column(Text)


class Deadline(Base):
    __tablename__ = "deadlines"
    __table_args__ = (UniqueConstraint("source", "source_key"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(40))
    source_key: Mapped[str] = mapped_column(String(200))
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"))
    assignment_id: Mapped[int | None] = mapped_column(ForeignKey("assignments.id"))
    title: Mapped[str] = mapped_column(String(500))
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    url: Mapped[str | None] = mapped_column(Text)
    removed_upstream: Mapped[bool] = mapped_column(Boolean, default=False)


class DeadlineProposal(Base):
    __tablename__ = "deadline_proposals"
    __table_args__ = (UniqueConstraint("version_id", name="uq_deadline_proposal_version"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    resource_id: Mapped[int] = mapped_column(ForeignKey("resources.id"))
    version_id: Mapped[int] = mapped_column(ForeignKey("resource_versions.id"))
    page_number: Mapped[int] = mapped_column(Integer)
    quote: Mapped[str] = mapped_column(String(300))
    candidate_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="proposed")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PublicSemesterPeriod(Base):
    __tablename__ = "public_semester_periods"
    __table_args__ = (UniqueConstraint("source_url", "semester", "kind"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    source_url: Mapped[str] = mapped_column(Text)
    semester: Mapped[str] = mapped_column(String(80))
    kind: Mapped[str] = mapped_column(String(40))
    starts_on: Mapped[date] = mapped_column(Date)
    ends_on: Mapped[date] = mapped_column(Date)
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Announcement(Base):
    __tablename__ = "announcements"
    __table_args__ = (UniqueConstraint("source", "source_key"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(40))
    source_key: Mapped[str] = mapped_column(String(200))
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), index=True)
    title: Mapped[str] = mapped_column(String(500))
    body: Mapped[str] = mapped_column(Text, default="")
    url: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CalendarEvent(Base):
    __tablename__ = "calendar_events"
    __table_args__ = (UniqueConstraint("source", "source_key"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(40))
    source_key: Mapped[str] = mapped_column(String(200))
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"))
    title: Mapped[str] = mapped_column(String(500))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    url: Mapped[str | None] = mapped_column(Text)


class CalendarSeriesRule(Base):
    __tablename__ = "calendar_series_rules"
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(40), index=True)
    slot_id: Mapped[str] = mapped_column(String(64), index=True)
    from_day: Mapped[date | None] = mapped_column(Date)
    payload: Mapped[dict] = mapped_column(JSON)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class CampusNews(Base):
    __tablename__ = "campus_news"
    id: Mapped[int] = mapped_column(primary_key=True)
    source_key: Mapped[str] = mapped_column(String(200), unique=True)
    title: Mapped[str] = mapped_column(String(500))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class CampusItem(Base):
    """One event, news post, document or programme page read from myCampus."""

    __tablename__ = "campus_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    source_key: Mapped[str] = mapped_column(String(64), unique=True)
    kind: Mapped[str] = mapped_column(String(20), index=True)
    title: Mapped[str] = mapped_column(String(500))
    summary: Mapped[str] = mapped_column(Text, default="")
    url: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(300), default="")
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    file_label: Mapped[str | None] = mapped_column(String(60))
    study_program: Mapped[str | None] = mapped_column(String(300))
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class MailItem(Base):
    __tablename__ = "mail_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    source_hash: Mapped[str] = mapped_column(String(64), unique=True)
    sender: Mapped[str] = mapped_column(String(320))
    subject: Mapped[str] = mapped_column(String(500))
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    candidate_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="info")
    deadline_id: Mapped[int | None] = mapped_column(ForeignKey("deadlines.id"))
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Exam(Base):
    __tablename__ = "exams"
    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"))
    source_key: Mapped[str] = mapped_column(String(200), unique=True)
    title: Mapped[str] = mapped_column(String(500))
    exam_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ExamRegistration(Base):
    __tablename__ = "exam_registrations"
    id: Mapped[int] = mapped_column(primary_key=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id"))
    status: Mapped[str] = mapped_column(String(40))
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    screenshot_path: Mapped[str | None] = mapped_column(Text)


class EnrollmentCheck(Base):
    __tablename__ = "enrollment_checks"
    id: Mapped[int] = mapped_column(primary_key=True)
    source_key: Mapped[str] = mapped_column(String(200), index=True)
    title: Mapped[str] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(20))
    deadline_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Grade(Base):
    __tablename__ = "grades"
    id: Mapped[int] = mapped_column(primary_key=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id"))
    value: Mapped[str] = mapped_column(String(50))
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AcademicModule(Base):
    __tablename__ = "academic_modules"
    __table_args__ = (UniqueConstraint("source", "source_key"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(30), default="manual")
    source_key: Mapped[str] = mapped_column(String(200))
    title: Mapped[str] = mapped_column(String(300))
    semester_id: Mapped[int | None] = mapped_column(ForeignKey("semesters.id"), index=True)
    ects_hundredths: Mapped[int] = mapped_column(Integer)
    grade_hundredths: Mapped[int | None] = mapped_column(Integer)
    weight_hundredths: Mapped[int | None] = mapped_column(Integer)
    attempt: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20))
    revision: Mapped[int] = mapped_column(Integer, default=1)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AcademicModuleRevision(Base):
    __tablename__ = "academic_module_revisions"
    __table_args__ = (UniqueConstraint("module_id", "revision"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    module_id: Mapped[int] = mapped_column(ForeignKey("academic_modules.id"), index=True)
    revision: Mapped[int] = mapped_column(Integer)
    snapshot: Mapped[dict] = mapped_column(JSON)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class SyncRun(Base):
    __tablename__ = "sync_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(30), default="running")
    course_count: Mapped[int] = mapped_column(Integer, default=0)
    resource_count: Mapped[int] = mapped_column(Integer, default=0)
    change_count: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text)


class Change(Base):
    __tablename__ = "changes"
    id: Mapped[int] = mapped_column(primary_key=True)
    sync_run_id: Mapped[int | None] = mapped_column(ForeignKey("sync_runs.id"))
    resource_id: Mapped[int | None] = mapped_column(ForeignKey("resources.id"))
    assignment_id: Mapped[int | None] = mapped_column(ForeignKey("assignments.id"))
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"), index=True)
    kind: Mapped[str] = mapped_column(String(40), index=True)
    summary: Mapped[str] = mapped_column(String(1000))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    event_key: Mapped[str] = mapped_column(String(300), unique=True)
    title: Mapped[str] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    ntfy_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    discord_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error: Mapped[str | None] = mapped_column(Text)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    muted: Mapped[bool] = mapped_column(Boolean, default=False)
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"), index=True)


class NotificationMute(Base):
    __tablename__ = "notification_mutes"
    scope: Mapped[str] = mapped_column(String(80), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class LocalAction(Base):
    __tablename__ = "local_actions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    kind: Mapped[str] = mapped_column(String(30), index=True)
    entity_id: Mapped[str] = mapped_column(String(350))
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"), index=True)
    before: Mapped[dict] = mapped_column(JSON)
    expected_revision: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    undone_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DigestPreference(Base):
    __tablename__ = "digest_preferences"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class RuntimePreference(Base):
    __tablename__ = "runtime_preferences"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    values: Mapped[dict] = mapped_column(JSON)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class WeeklyDigest(Base):
    __tablename__ = "weekly_digests"
    id: Mapped[int] = mapped_column(primary_key=True)
    week_start: Mapped[date] = mapped_column(Date, unique=True)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    summary_json: Mapped[str] = mapped_column(Text)


class AnkiCardQueue(Base):
    __tablename__ = "anki_card_queue"
    id: Mapped[int] = mapped_column(primary_key=True)
    resource_id: Mapped[int | None] = mapped_column(ForeignKey("resources.id"))
    status: Mapped[str] = mapped_column(String(30), default="proposed")
    payload: Mapped[str] = mapped_column(Text)
    topic_id: Mapped[int | None] = mapped_column(ForeignKey("learning_topics.id"))
    origin: Mapped[str] = mapped_column(String(16), default="ai", server_default="ai")
    mutation_id: Mapped[str | None] = mapped_column(String(36), unique=True, index=True)
    source_version_id: Mapped[int | None] = mapped_column(ForeignKey("resource_versions.id"))
    source_snapshot: Mapped[dict | None] = mapped_column(JSON)


class ExerciseProposalQueue(Base):
    __tablename__ = "exercise_proposal_queue"
    id: Mapped[int] = mapped_column(primary_key=True)
    resource_id: Mapped[int] = mapped_column(ForeignKey("resources.id"), index=True)
    status: Mapped[str] = mapped_column(String(30), default="proposed")
    payload: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AnkiCard(Base):
    __tablename__ = "anki_cards"
    id: Mapped[int] = mapped_column(primary_key=True)
    queue_id: Mapped[int] = mapped_column(ForeignKey("anki_card_queue.id"), index=True)
    note_id: Mapped[str] = mapped_column(String(100), unique=True)


class AnkiReview(Base):
    __tablename__ = "anki_reviews"
    id: Mapped[int] = mapped_column(primary_key=True)
    card_id: Mapped[int] = mapped_column(ForeignKey("anki_cards.id"), index=True)
    review_id: Mapped[str | None] = mapped_column(String(100), unique=True, index=True)
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    rating: Mapped[int] = mapped_column(Integer)


class StudyModule(Base):
    __tablename__ = "study_modules"
    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    revision: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class LearningTopic(Base):
    __tablename__ = "learning_topics"
    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"))
    module_id: Mapped[int | None] = mapped_column(ForeignKey("study_modules.id"), index=True)
    slug: Mapped[str] = mapped_column(String(200))
    name: Mapped[str] = mapped_column(String(300))


class LearningProgress(Base):
    __tablename__ = "learning_progress"
    id: Mapped[int] = mapped_column(primary_key=True)
    topic_id: Mapped[int] = mapped_column(ForeignKey("learning_topics.id"))
    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    review_count: Mapped[int] = mapped_column(Integer, default=0)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)


class Exercise(Base):
    __tablename__ = "exercises"
    id: Mapped[int] = mapped_column(primary_key=True)
    topic_id: Mapped[int] = mapped_column(ForeignKey("learning_topics.id"))
    question: Mapped[str] = mapped_column(Text)
    solution: Mapped[str] = mapped_column(Text)
    proposal_id: Mapped[int | None] = mapped_column(ForeignKey("exercise_proposal_queue.id"), unique=True)
    difficulty: Mapped[str | None] = mapped_column(String(20))
    solution_steps: Mapped[str | None] = mapped_column(Text)


class ExerciseAttempt(Base):
    __tablename__ = "exercise_attempts"
    id: Mapped[int] = mapped_column(primary_key=True)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id"), index=True)
    attempted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    answer: Mapped[str] = mapped_column(Text)
    correct: Mapped[bool] = mapped_column(Boolean)
    error_kind: Mapped[str | None] = mapped_column(String(100))
    topic_name: Mapped[str | None] = mapped_column(String(300))
    difficulty: Mapped[str | None] = mapped_column(String(20))
    solution_steps: Mapped[str | None] = mapped_column(Text)
    duration_seconds: Mapped[int | None] = mapped_column(Integer)


class StudyBlockSuggestion(Base):
    __tablename__ = "study_block_suggestions"
    __table_args__ = (UniqueConstraint("exam_id", "topic_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id"))
    topic_id: Mapped[int] = mapped_column(ForeignKey("learning_topics.id"))
    duration_minutes: Mapped[int] = mapped_column(Integer)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="proposed")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class StudyCycle(Base):
    __tablename__ = "study_cycles"
    __table_args__ = (UniqueConstraint("exam_id", "phase"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id"), index=True)
    phase: Mapped[str] = mapped_column(String(20))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    exam_at_snapshot: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    topic_ids: Mapped[list[int]] = mapped_column(JSON, default=list)
    review_goal: Mapped[int] = mapped_column(Integer, default=0)
    attempt_goal: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="proposed")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AiUsage(Base):
    __tablename__ = "ai_usage"
    __table_args__ = (UniqueConstraint("month", "model"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    month: Mapped[str] = mapped_column(String(7))  # "YYYY-MM"
    model: Mapped[str] = mapped_column(String(100))
    tokens_used: Mapped[int] = mapped_column(Integer, default=0)


class AiBudgetReservation(Base):
    __tablename__ = "ai_budget_reservations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    month: Mapped[str] = mapped_column(String(7), index=True)
    model: Mapped[str] = mapped_column(String(100))
    tokens: Mapped[int] = mapped_column(Integer)
    state: Mapped[str] = mapped_column(String(16), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class WorkExport(Base):
    __tablename__ = "work_exports"
    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    path: Mapped[str] = mapped_column(Text)


class WorkImport(Base):
    __tablename__ = "work_imports"
    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    path: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30))


class ConnectorHealth(Base):
    __tablename__ = "connector_health"
    id: Mapped[int] = mapped_column(primary_key=True)
    connector: Mapped[str] = mapped_column(String(50), unique=True)
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    course_count: Mapped[int | None] = mapped_column(Integer)
    resource_count: Mapped[int | None] = mapped_column(Integer)
    consecutive_failures: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(30), default="unknown")
    message: Mapped[str | None] = mapped_column(Text)


class BackgroundJob(Base):
    __tablename__ = "background_jobs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    kind: Mapped[str] = mapped_column(String(16))
    target_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mode: Mapped[str] = mapped_column(String(16), default="cards")
    generation: Mapped[int] = mapped_column(Integer)
    state: Mapped[str] = mapped_column(String(16), default="queued")
    completed: Mapped[int] = mapped_column(Integer, default=0)
    total: Mapped[int] = mapped_column(Integer, default=0)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    retry_of: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class CodingTask(Base):
    __tablename__ = 'coding_tasks'
    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey('courses.id'), index=True)
    topic_id: Mapped[int | None] = mapped_column(ForeignKey('learning_topics.id'))
    title: Mapped[str] = mapped_column(String(160))
    template: Mapped[str] = mapped_column(String(40))
    template_version: Mapped[str] = mapped_column(String(40))
    language: Mapped[str] = mapped_column(String(16))
    difficulty: Mapped[str] = mapped_column(String(16))
    story: Mapped[str] = mapped_column(Text, default='')
    learning_goal: Mapped[str] = mapped_column(String(300))
    rubric: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(16), default='active')
    highest_hint: Mapped[int] = mapped_column(Integer, default=0)
    draft_revision: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class CodingDraft(Base):
    __tablename__ = 'coding_drafts'
    __table_args__ = (UniqueConstraint('task_id', 'revision'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey('coding_tasks.id'), index=True)
    revision: Mapped[int] = mapped_column(Integer)
    files: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class CodingAttempt(Base):
    __tablename__ = 'coding_attempts'
    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey('coding_tasks.id'), index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey('courses.id'), index=True)
    title: Mapped[str] = mapped_column(String(160))
    files: Mapped[dict] = mapped_column(JSON)
    hint_level: Mapped[int] = mapped_column(Integer, default=0)
    state: Mapped[str] = mapped_column(String(16), default='queued')
    report: Mapped[dict] = mapped_column(JSON, default=dict)
    feedback_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    feedback_level: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class CodingReview(Base):
    __tablename__ = 'coding_reviews'
    id: Mapped[int] = mapped_column(primary_key=True)
    attempt_id: Mapped[int] = mapped_column(ForeignKey('coding_attempts.id'), index=True)
    level: Mapped[int] = mapped_column(Integer)
    feedback: Mapped[str] = mapped_column(Text)
    file: Mapped[str | None] = mapped_column(String(80))
    line: Mapped[int | None] = mapped_column(Integer)
    next_template: Mapped[str | None] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(16), default='proposed')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AssessmentTask(Base):
    __tablename__ = 'assessment_tasks'
    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey('courses.id'), index=True)
    topic_id: Mapped[int | None] = mapped_column(ForeignKey('learning_topics.id'))
    title: Mapped[str] = mapped_column(String(160))
    type: Mapped[str] = mapped_column(String(40))
    level: Mapped[int] = mapped_column(Integer)
    payload: Mapped[dict] = mapped_column(JSON)
    provenance: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(16), default='proposed')
    highest_hint: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AssessmentSession(Base):
    __tablename__ = 'assessment_sessions'
    id: Mapped[int] = mapped_column(primary_key=True)
    task_ids: Mapped[list[int]] = mapped_column(JSON)
    state: Mapped[str] = mapped_column(String(16), default='running')
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AssessmentAttempt(Base):
    __tablename__ = 'assessment_attempts'
    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey('assessment_tasks.id'), index=True)
    title: Mapped[str] = mapped_column(String(160))
    course_id: Mapped[int] = mapped_column(ForeignKey('courses.id'), index=True)
    session_id: Mapped[int | None] = mapped_column(ForeignKey('assessment_sessions.id'), index=True)
    answer: Mapped[dict] = mapped_column(JSON)
    report: Mapped[dict] = mapped_column(JSON)
    hint_level: Mapped[int] = mapped_column(Integer, default=0)
    feedback_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AssessmentReview(Base):
    __tablename__ = 'assessment_reviews'
    id: Mapped[int] = mapped_column(primary_key=True)
    attempt_id: Mapped[int] = mapped_column(ForeignKey('assessment_attempts.id'), index=True)
    feedback: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(16), default='proposed')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AssessmentRequest(Base):
    __tablename__ = 'assessment_requests'
    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey('courses.id'), index=True)
    source: Mapped[dict] = mapped_column(JSON)
    source_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), default='requested')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


# Registers the trash filter once the models it covers exist.
import app.db.trash  # noqa: F401
