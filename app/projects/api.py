# SPDX-License-Identifier: AGPL-3.0-or-later

"""Local project workspaces linked to a course and its Moodle assignments."""

import re
from datetime import UTC, datetime
from urllib.parse import urlparse
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import delete, select

from app.config import Settings
from app.db.models import (
    Assignment,
    Course,
    Project,
    ProjectAssignment,
    RepoSnapshot,
    utc_now,
)
from app.host.lease import HostCoordinator
from app.projects.github import GitHubActivity, fetch_activity, valid_repository
from app.projects.mirror import MirrorError, mirror_repository
from app.projects.repo_content import (
    RepositorySearchError,
    archive_snapshot,
    search_snapshot,
)
from app.timeutil import as_utc


class MemberInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    github_username: str | None = Field(default=None, max_length=39)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Mitgliedsname fehlt")
        return value

    @field_validator("github_username")
    @classmethod
    def github_name(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        value = value.strip()
        if not re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?", value):
            raise ValueError("Ungültiger GitHub-Benutzername")
        return value


class ProjectLinkInput(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    url: str = Field(min_length=1, max_length=2000)

    @field_validator("label")
    @classmethod
    def clean_label(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Linkname fehlt")
        return value

    @field_validator("url")
    @classmethod
    def web_link(cls, value: str) -> str:
        parsed = urlparse(value.strip())
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password:
            raise ValueError("Nur Weblinks ohne Zugangsdaten sind erlaubt")
        return value.strip()


class TodoInput(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    title: str = Field(min_length=1, max_length=300)
    done: bool = False

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("To-do-Text fehlt")
        return value


class ProjectInput(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    course_id: int = Field(gt=0)
    deadline_at: datetime | None = None
    notes: str = Field(default="", max_length=20000)
    members: list[MemberInput] = Field(default_factory=list, max_length=30)
    links: list[ProjectLinkInput] = Field(default_factory=list, max_length=50)
    todos: list[TodoInput] = Field(default_factory=list, max_length=100)
    assignment_ids: list[int] = Field(default_factory=list, max_length=50)
    github_repo: str | None = Field(default=None, max_length=200)

    @field_validator("deadline_at")
    @classmethod
    def aware_deadline(cls, value: datetime | None) -> datetime | None:
        if value is not None and (value.tzinfo is None or value.utcoffset() is None):
            raise ValueError("Frist benötigt eine Zeitzone")
        return value.astimezone(UTC) if value is not None else None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Projektname fehlt")
        return value

    @field_validator("github_repo")
    @classmethod
    def repo_name(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        value = value.strip()
        if not valid_repository(value):
            raise ValueError("GitHub-Repository als Eigentümer/Name angeben")
        return value

    @model_validator(mode="after")
    def unique_items(self):
        if len(set(self.assignment_ids)) != len(self.assignment_ids):
            raise ValueError("Moodle-Aufgabe mehrfach gewählt")
        if len({item.id for item in self.todos}) != len(self.todos):
            raise ValueError("To-do-Kennung mehrfach verwendet")
        return self


class ProjectUpdate(ProjectInput):
    expected_revision: int = Field(gt=0)


class RevisionInput(BaseModel):
    expected_revision: int = Field(gt=0)


class ProjectAssignmentView(BaseModel):
    id: int
    title: str
    due_at: datetime | None
    url: str | None

    @field_validator("due_at")
    @classmethod
    def stored_due_at(cls, value: datetime | None) -> datetime | None:
        return as_utc(value).astimezone(UTC) if value is not None else None


class ProjectView(ProjectInput):
    id: int
    course_name: str
    assignments: list[ProjectAssignmentView]
    revision: int
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime

    @field_validator("deadline_at", "archived_at", "created_at", "updated_at")
    @classmethod
    def aware_deadline(cls, value: datetime | None) -> datetime | None:
        """Response values come from UTC storage; SQLite drops their tzinfo.

        Override the input-only validator instead of accepting naive client
        deadlines. Offset inputs have already been converted to UTC on write.
        """
        return as_utc(value).astimezone(UTC) if value is not None else None


class ProjectSummary(BaseModel):
    id: int
    name: str
    course_id: int
    course_name: str
    deadline_at: datetime | None
    todo_count: int
    open_todo_count: int
    archived_at: datetime | None

    @field_validator("deadline_at", "archived_at")
    @classmethod
    def stored_timestamps(cls, value: datetime | None) -> datetime | None:
        return as_utc(value).astimezone(UTC) if value is not None else None


class MirrorSnapshotView(BaseModel):
    id: int
    repository: str
    fetched_at: datetime
    refs_count: int
    head: str | None


def _related(session, payload: ProjectInput) -> tuple[Course, list[Assignment]]:
    course = session.get(Course, payload.course_id)
    if course is None:
        raise HTTPException(404, "Kurs nicht gefunden")
    assignments = session.scalars(select(Assignment).where(Assignment.id.in_(payload.assignment_ids))).all()
    if len(assignments) != len(payload.assignment_ids) or any(item.course_id != course.id for item in assignments):
        raise HTTPException(422, "Moodle-Aufgabe gehört nicht zu diesem Kurs")
    return course, assignments


def _values(payload: ProjectInput) -> dict:
    values = payload.model_dump(exclude={"assignment_ids", "expected_revision"}, mode="json")
    values["deadline_at"] = payload.deadline_at
    return values


def _view(session, project: Project) -> ProjectView:
    course = session.get(Course, project.course_id)
    if course is None:
        raise HTTPException(409, "Projektkurs fehlt")
    assignment_ids = session.scalars(select(ProjectAssignment.assignment_id)
                                     .where(ProjectAssignment.project_id == project.id)).all()
    assignments = session.scalars(select(Assignment).where(Assignment.id.in_(assignment_ids))).all()
    return ProjectView(
        id=project.id, name=project.name, course_id=project.course_id, course_name=course.name,
        deadline_at=project.deadline_at, notes=project.notes,
        members=[MemberInput.model_validate(value) for value in project.members],
        links=[ProjectLinkInput.model_validate(value) for value in project.links],
        todos=[TodoInput.model_validate(value) for value in project.todos],
        assignment_ids=list(assignment_ids),
        assignments=[ProjectAssignmentView(id=item.id, title=item.title, due_at=item.due_at, url=item.url)
                     for item in assignments],
        github_repo=project.github_repo, revision=project.revision,
        archived_at=project.archived_at, created_at=project.created_at, updated_at=project.updated_at,
    )


def project_router(settings: Settings, factory, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/projects", tags=["projects"])

    @router.get("", response_model=list[ProjectSummary])
    def list_projects(include_archived: bool = False):
        with factory() as session:
            statement = select(Project, Course).join(Course, Course.id == Project.course_id)
            if not include_archived:
                statement = statement.where(Project.archived_at.is_(None))
            rows = session.execute(statement.order_by(Project.updated_at.desc(), Project.id.desc())).all()
            return [ProjectSummary(
                id=item.id, name=item.name, course_id=item.course_id, course_name=course.name,
                deadline_at=item.deadline_at, todo_count=len(item.todos),
                open_todo_count=sum(not todo["done"] for todo in item.todos), archived_at=item.archived_at,
            ) for item, course in rows]

    @router.get("/{project_id}", response_model=ProjectView)
    def get_project(project_id: int):
        with factory() as session:
            item = session.get(Project, project_id)
            if item is None:
                raise HTTPException(404, "Projekt nicht gefunden")
            return _view(session, item)

    @router.get("/{project_id}/github", response_model=GitHubActivity)
    def github_activity(project_id: int):
        with factory() as session:
            item = session.get(Project, project_id)
            if item is None:
                raise HTTPException(404, "Projekt nicht gefunden")
            if not item.github_repo:
                raise HTTPException(422, "Kein GitHub-Repository verknüpft")
            if not settings.github_token:
                raise HTTPException(503, "GITHUB_TOKEN lokal einrichten")
            return fetch_activity(item.github_repo, item.members, settings.github_token)

    @router.get("/{project_id}/mirror", response_model=MirrorSnapshotView | None)
    def latest_mirror(project_id: int):
        with factory() as session:
            if session.get(Project, project_id) is None:
                raise HTTPException(404, "Projekt nicht gefunden")
            snapshot = session.scalar(select(RepoSnapshot).where(RepoSnapshot.project_id == project_id)
                                      .order_by(RepoSnapshot.id.desc()).limit(1))
            return (MirrorSnapshotView.model_validate(snapshot, from_attributes=True)
                    if snapshot is not None else None)

    @router.get("/{project_id}/mirror/search")
    def search_mirror(project_id: int, q: str = Query(min_length=2, max_length=100)):
        with factory() as session:
            if session.get(Project, project_id) is None:
                raise HTTPException(404, "Projekt nicht gefunden")
            snapshot = session.scalar(select(RepoSnapshot).where(RepoSnapshot.project_id == project_id)
                                      .order_by(RepoSnapshot.id.desc()).limit(1))
            if snapshot is None:
                raise HTTPException(404, "Noch keine Repository-Sicherung vorhanden")
            try:
                matches = search_snapshot(settings, project_id, snapshot.head, q)
            except RepositorySearchError as exc:
                raise HTTPException(422, str(exc)) from exc
            return {"snapshot_id": snapshot.id, "head": snapshot.head, "matches": matches}

    @router.get("/{project_id}/mirror/archive")
    def download_mirror_archive(project_id: int):
        with factory() as session:
            if session.get(Project, project_id) is None:
                raise HTTPException(404, "Projekt nicht gefunden")
            snapshot = session.scalar(select(RepoSnapshot).where(RepoSnapshot.project_id == project_id)
                                      .order_by(RepoSnapshot.id.desc()).limit(1))
            if snapshot is None:
                raise HTTPException(404, "Noch keine Repository-Sicherung vorhanden")
            try:
                content = archive_snapshot(settings, project_id, snapshot.head)
            except RepositorySearchError as exc:
                raise HTTPException(422, str(exc)) from exc
            filename = f"projekt-{project_id}-{snapshot.head[:12]}.zip"
            return Response(content, media_type="application/zip", headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Cache-Control": "private, no-store",
                "X-UniOS-Archive-Head": snapshot.head,
            })

    @router.post("/{project_id}/mirror", response_model=MirrorSnapshotView)
    def update_mirror(project_id: int):
        coordinator.assert_writer()
        with factory() as session:
            item = session.get(Project, project_id)
            if item is None:
                raise HTTPException(404, "Projekt nicht gefunden")
            if not item.github_repo:
                raise HTTPException(422, "Kein GitHub-Repository verknüpft")
            repository = item.github_repo
        try:
            result = mirror_repository(settings, project_id, repository)
        except MirrorError as exc:
            raise HTTPException(409 if "läuft bereits" in str(exc) else 502, str(exc)) from exc
        with factory() as session:
            snapshot = RepoSnapshot(project_id=project_id, repository=result.repository,
                                    fetched_at=result.fetched_at, manifest_path=result.manifest_path,
                                    manifest_sha256=result.manifest_sha256, refs_count=result.refs_count,
                                    head=result.head)
            session.add(snapshot)
            session.commit()
            session.refresh(snapshot)
            return MirrorSnapshotView.model_validate(snapshot, from_attributes=True)

    @router.post("", response_model=ProjectView, status_code=201)
    def create_project(payload: ProjectInput):
        coordinator.assert_writer()
        with factory() as session:
            _related(session, payload)
            item = Project(**_values(payload),
                           revision=1, created_at=utc_now(), updated_at=utc_now())
            session.add(item)
            session.flush()
            for assignment_id in payload.assignment_ids:
                session.add(ProjectAssignment(project_id=item.id, assignment_id=assignment_id))
            session.commit()
            return _view(session, item)

    @router.put("/{project_id}", response_model=ProjectView)
    def update_project(project_id: int, payload: ProjectUpdate):
        coordinator.assert_writer()
        with factory() as session:
            item = session.get(Project, project_id)
            if item is None:
                raise HTTPException(404, "Projekt nicht gefunden")
            if item.revision != payload.expected_revision:
                raise HTTPException(409, "Projekt wurde inzwischen geändert")
            _related(session, payload)
            for key, value in _values(payload).items():
                setattr(item, key, value)
            session.execute(delete(ProjectAssignment).where(ProjectAssignment.project_id == project_id))
            for assignment_id in payload.assignment_ids:
                session.add(ProjectAssignment(project_id=project_id, assignment_id=assignment_id))
            item.revision += 1
            item.updated_at = utc_now()
            session.commit()
            return _view(session, item)

    @router.post("/{project_id}/archive", response_model=ProjectView)
    def archive_project(project_id: int, payload: RevisionInput):
        coordinator.assert_writer()
        with factory() as session:
            item = session.get(Project, project_id)
            if item is None:
                raise HTTPException(404, "Projekt nicht gefunden")
            if item.revision != payload.expected_revision:
                raise HTTPException(409, "Projekt wurde inzwischen geändert")
            item.archived_at = utc_now()
            item.updated_at = utc_now()
            item.revision += 1
            session.commit()
            return _view(session, item)

    @router.post("/{project_id}/restore", response_model=ProjectView)
    def restore_project(project_id: int, payload: RevisionInput):
        coordinator.assert_writer()
        with factory() as session:
            item = session.get(Project, project_id)
            if item is None:
                raise HTTPException(404, "Projekt nicht gefunden")
            if item.revision != payload.expected_revision:
                raise HTTPException(409, "Projekt wurde inzwischen geändert")
            item.archived_at = None
            item.updated_at = utc_now()
            item.revision += 1
            session.commit()
            return _view(session, item)

    return router
