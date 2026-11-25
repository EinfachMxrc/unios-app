# SPDX-License-Identifier: AGPL-3.0-or-later

"""HTTP routes for the trash: delete, restore, erase and empty."""

import logging
from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import Settings
from app.db.models import Jot, Note, Task
from app.host.lease import HostCoordinator
from app.notes.store import NoteCorrupt, NoteMissing
from app.trash import service
from app.trash.service import TrashMissing

log = logging.getLogger(__name__)


class TrashItemView(BaseModel):
    kind: Literal["note", "jot", "task"]
    id: str
    title: str
    course_id: int | None
    course_name: str | None
    deleted_at: datetime


class TrashView(BaseModel):
    items: list[TrashItemView]


class TrashedView(BaseModel):
    kind: Literal["note", "jot", "task"]
    id: str
    deleted_at: datetime | None


class EmptiedView(BaseModel):
    erased: int


def _uuid(value: str) -> str:
    try:
        return str(UUID(value))
    except ValueError:
        raise HTTPException(404, "Eintrag nicht gefunden") from None


def trash_router(settings: Settings, factory, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.get("/trash", response_model=TrashView)
    def list_trash():
        with factory() as session:
            return {"items": service.trash_items(session)}

    @router.post("/notes/{note_id}/trash", response_model=TrashedView)
    def trash_note(note_id: str):
        coordinator.assert_writer()
        with factory() as session:
            try:
                note = service.trash_note(session, _uuid(note_id))
            except NoteMissing as exc:
                raise HTTPException(404, str(exc)) from None
            return {"kind": "note", "id": note.id, "deleted_at": note.deleted_at}

    @router.post("/jots/{jot_id}/trash", response_model=TrashedView)
    def trash_jot(jot_id: str):
        coordinator.assert_writer()
        with factory() as session:
            try:
                jot = service.trash_jot(session, _uuid(jot_id))
            except TrashMissing as exc:
                raise HTTPException(404, str(exc)) from None
            return {"kind": "jot", "id": jot.id, "deleted_at": jot.deleted_at}

    @router.post("/tasks/{task_id}/trash", response_model=TrashedView)
    def trash_task(task_id: str):
        coordinator.assert_writer()
        with factory() as session:
            try:
                task = service.trash_task(session, _uuid(task_id))
            except TrashMissing as exc:
                raise HTTPException(404, str(exc)) from None
            return {"kind": "task", "id": task.id, "deleted_at": task.deleted_at}

    @router.post("/trash/{kind}/{item_id}/restore", response_model=TrashedView)
    def restore(kind: Literal["note", "jot", "task"], item_id: str):
        coordinator.assert_writer()
        with factory() as session:
            try:
                item: Note | Jot | Task
                if kind == "note":
                    item = service.restore_note(session, settings, _uuid(item_id))
                elif kind == "task":
                    item = service.restore_task(session, _uuid(item_id))
                else:
                    item = service.restore_jot(session, _uuid(item_id))
            except TrashMissing as exc:
                raise HTTPException(404, str(exc)) from None
            except NoteCorrupt as exc:
                raise HTTPException(503, str(exc)) from None
            return {"kind": kind, "id": item.id, "deleted_at": item.deleted_at}

    @router.delete("/trash/{kind}/{item_id}", status_code=204)
    def erase(kind: Literal["note", "jot", "task"], item_id: str):
        coordinator.assert_writer()
        with factory() as session:
            try:
                if kind == "note":
                    service.erase_note(session, settings, _uuid(item_id))
                elif kind == "task":
                    service.erase_task(session, _uuid(item_id))
                else:
                    service.erase_jot(session, _uuid(item_id))
            except TrashMissing as exc:
                raise HTTPException(404, str(exc)) from None

    @router.delete("/trash", response_model=EmptiedView)
    def empty():
        coordinator.assert_writer()
        with factory() as session:
            try:
                return {"erased": service.empty_trash(session, settings)}
            except Exception as exc:  # noqa: BLE001 - never log note contents or local paths
                log.warning("Papierkorb konnte nicht geleert werden: %s", type(exc).__name__)
                raise HTTPException(503, "Papierkorb konnte nicht vollständig geleert werden") from None

    return router
