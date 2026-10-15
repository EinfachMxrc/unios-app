# SPDX-License-Identifier: AGPL-3.0-or-later

"""HTTP routes for the built-in backup: settings, running one now, restoring."""

import os
from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as package_version
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.backups import restore, run, store
from app.backups.store import BackupError, BackupSettings
from app.config import Settings
from app.host.lease import HostCoordinator

SUGGESTION_NAME = "UniOS-Backups"


class BackupSettingsInput(BaseModel):
    folder: str | None = Field(default=None, max_length=1000)
    daily: bool = True
    keep: int = Field(default=store.DEFAULT_KEEP, ge=store.MIN_KEEP, le=store.MAX_KEEP)


class RestoreInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    confirmation: str = Field(max_length=100)


class BackupSnapshotView(BaseModel):
    name: str
    created_at: str | None
    app_version: str | None
    schema_revision: str | None
    files: int
    bytes: int


class BackupView(BaseModel):
    folder: str | None
    daily: bool
    keep: int
    status: dict
    snapshots: list[BackupSnapshotView]
    pending_restore: str | None
    last_restore: dict | None
    suggestions: list[str]
    confirmation: str


def _app_version() -> str:
    try:
        return package_version("unios")
    except PackageNotFoundError:
        return "0.0.0-dev"


def _suggestions() -> list[str]:
    """Places people usually keep such things: Documents, and OneDrive when it is set up."""
    places = [Path.home() / "Documents"]
    if os.environ.get("OneDrive"):
        places.insert(0, Path(os.environ["OneDrive"]))
    return [str(place / SUGGESTION_NAME) for place in places if place.is_dir()]


def backup_router(settings: Settings, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/backup")

    def view() -> dict:
        chosen = store.load_settings(settings)
        pending = restore.pending_restore(settings)
        return {"folder": chosen.folder, "daily": chosen.daily, "keep": chosen.keep,
                "status": store.read_status(settings), "snapshots": store.list_snapshots(chosen.folder),
                "pending_restore": pending.get("name") if pending else None,
                "last_restore": restore.last_restore(settings), "suggestions": _suggestions(),
                "confirmation": restore.CONFIRMATION}

    @router.get("", response_model=BackupView)
    def get_backup():
        return view()

    @router.put("/settings", response_model=BackupView)
    def put_settings(payload: BackupSettingsInput):
        coordinator.assert_writer()
        try:
            store.save_settings(settings, BackupSettings(folder=payload.folder or None, daily=payload.daily,
                                                         keep=payload.keep))
        except BackupError as exc:
            raise HTTPException(400, str(exc)) from None
        return view()

    @router.post("/run", response_model=BackupView)
    def run_now():
        try:
            run.run_backup(settings, coordinator, _app_version())
        except BackupError as exc:
            raise HTTPException(409, str(exc)) from None
        return view()

    @router.post("/restore", response_model=BackupView)
    def stage(payload: RestoreInput):
        coordinator.assert_writer()
        try:
            restore.stage_restore(settings, payload.name, payload.confirmation)
        except BackupError as exc:
            raise HTTPException(400, str(exc)) from None
        return view()

    @router.delete("/restore", response_model=BackupView)
    def cancel():
        coordinator.assert_writer()
        restore.cancel_restore(settings)
        return view()

    return router
