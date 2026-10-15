# SPDX-License-Identifier: AGPL-3.0-or-later

"""Capture a browser page or text and show sources awaiting classification."""

import os
from datetime import datetime
from pathlib import Path
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select, text

from app.db.models import (
    Course,
    InboxClip,
    Jot,
    MailItem,
    Project,
    RepoSnapshot,
    Resource,
    utc_now,
)
from app.drop.api import _drop_dir, _filename
from app.files.sidecars import safe_external_url
from app.host.lease import HostCoordinator

MAX_UPLOAD_SIZE = 50 * 1024 * 1024


class ClipInput(BaseModel):
    kind: Literal["web", "text"]
    title: str = Field(min_length=1, max_length=300)
    url: str | None = Field(default=None, max_length=2048)
    body: str = Field(default="", max_length=50_000)
    course_id: int | None = None


class ClipUpdate(BaseModel):
    expected_revision: int = Field(ge=1)
    course_id: int | None = None
    filed: bool = False


class ClipView(BaseModel):
    id: str
    kind: str
    title: str
    url: str | None
    body: str
    course_id: int | None
    filed: bool
    revision: int
    created_at: datetime


class InboxJot(BaseModel):
    id: str
    kind: str
    body: str
    created_at: datetime


class InboxFile(BaseModel):
    name: str
    size: int
    course_id: int | None
    imported: bool


class InboxSource(BaseModel):
    id: str
    kind: Literal["mail", "github"]
    title: str
    detail: str
    url: str
    created_at: datetime


class InboxView(BaseModel):
    clips: list[ClipView]
    jots: list[InboxJot]
    files: list[InboxFile]
    sources: list[InboxSource]


def _course_exists(session, course_id: int | None) -> None:
    if course_id is not None and session.get(Course, course_id) is None:
        raise HTTPException(404, "Kurs nicht gefunden")


def inbox_router(settings, factory, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/inbox")

    @router.get("", response_model=InboxView)
    def read_inbox():
        with factory() as session:
            clips = session.scalars(select(InboxClip).order_by(InboxClip.created_at.desc()).limit(200)).all()
            jots = session.scalars(select(Jot).where(Jot.course_id.is_(None))
                                   .order_by(Jot.created_at.desc()).limit(100)).all()
            mail = session.scalars(select(MailItem).order_by(MailItem.imported_at.desc()).limit(30)).all()
            mirrors = session.execute(select(RepoSnapshot, Project)
                                      .join(Project, RepoSnapshot.project_id == Project.id)
                                      .order_by(RepoSnapshot.fetched_at.desc()).limit(30)).all()
            folder = _drop_dir(settings)
            files: list[InboxFile] = []
            if folder.exists():
                for path in sorted(folder.iterdir(), key=lambda item: item.name.casefold()):
                    if path.name.startswith(".") or path.is_symlink() or not path.is_file():
                        continue
                    try:
                        details = path.stat()
                    except FileNotFoundError:
                        continue
                    resource = session.scalar(select(Resource).where(Resource.source == "manual",
                                                                      Resource.source_key == path.name))
                    imported = bool(resource and resource.upstream_modified == details.st_mtime_ns
                                    and resource.upstream_size == details.st_size)
                    files.append(InboxFile(name=path.name, size=details.st_size,
                                           course_id=resource.course_id if resource else None,
                                           imported=imported))
            return InboxView(clips=[ClipView.model_validate(item, from_attributes=True) for item in clips],
                             jots=[InboxJot.model_validate(item, from_attributes=True) for item in jots],
                             files=files, sources=[
                                 *[InboxSource(id=f"mail-{item.id}", kind="mail", title=item.subject,
                                               detail=item.sender, url="/mail", created_at=item.imported_at)
                                   for item in mail],
                                 *[InboxSource(id=f"github-{item.id}", kind="github", title=project.name,
                                               detail=item.repository, url=f"/projects/{project.id}",
                                               created_at=item.fetched_at) for item, project in mirrors],
                             ])

    @router.post("/clips", response_model=ClipView)
    def capture_clip(payload: ClipInput):
        coordinator.assert_writer()
        if not payload.title.strip():
            raise HTTPException(400, "Titel fehlt")
        url = safe_external_url(payload.url, allow_http=True) if payload.url else None
        if payload.kind == "web" and url is None:
            raise HTTPException(400, "Gültige Webadresse erforderlich")
        if payload.url and url is None:
            raise HTTPException(400, "Ungültige Webadresse")
        if payload.kind == "text" and not payload.body.strip():
            raise HTTPException(400, "Text fehlt")
        with factory() as session:
            _course_exists(session, payload.course_id)
            clip = InboxClip(id=str(uuid4()), kind=payload.kind, title=payload.title.strip(),
                             url=url, body=payload.body.strip(), course_id=payload.course_id,
                             filed=False, revision=1, created_at=utc_now(), updated_at=utc_now())
            session.add(clip)
            session.execute(text("INSERT INTO inbox_clips_fts(clip_id, title, body) VALUES (:id, :title, :body)"),
                            {"id": clip.id, "title": clip.title, "body": clip.body})
            session.commit()
            return ClipView.model_validate(clip, from_attributes=True)

    @router.patch("/clips/{clip_id}", response_model=ClipView)
    def update_clip(clip_id: str, payload: ClipUpdate):
        coordinator.assert_writer()
        with factory() as session:
            clip = session.get(InboxClip, clip_id)
            if clip is None:
                raise HTTPException(404, "Eintrag nicht gefunden")
            if clip.revision != payload.expected_revision:
                raise HTTPException(409, "Eintrag wurde inzwischen geändert")
            _course_exists(session, payload.course_id)
            clip.course_id = payload.course_id
            clip.filed = payload.filed
            clip.revision += 1
            clip.updated_at = utc_now()
            session.commit()
            return ClipView.model_validate(clip, from_attributes=True)

    @router.post("/upload", response_model=InboxFile)
    def upload_file(file: UploadFile):
        coordinator.assert_writer()
        original = _filename(file.filename or "")
        suffix = Path(original).suffix[:20]
        stem = Path(original).stem[:140]
        name = f"{stem}-{uuid4().hex[:10]}{suffix}"
        folder = _drop_dir(settings)
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / name
        size = 0
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
        descriptor = os.open(path, flags, 0o600)
        try:
            with os.fdopen(descriptor, "wb") as target:
                while chunk := file.file.read(1024 * 1024):
                    size += len(chunk)
                    if size > MAX_UPLOAD_SIZE:
                        raise HTTPException(413, "Datei ist größer als 50 MB")
                    target.write(chunk)
                target.flush()
                os.fsync(target.fileno())
        except Exception:
            # Only remove the incomplete file created by this request.
            path.unlink(missing_ok=True)
            raise
        return InboxFile(name=name, size=size, course_id=None, imported=False)

    return router
