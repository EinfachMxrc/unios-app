# SPDX-License-Identifier: AGPL-3.0-or-later

"""Download every piece of personal data as one ZIP archive."""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from app.config import Settings
from app.export.service import build_export

EXPORT_FILENAME = "unios-export.zip"


def export_router(settings: Settings) -> APIRouter:
    router = APIRouter(prefix="/api/export", tags=["export"])

    @router.get("")
    def download(include_files: bool = False) -> FileResponse:
        scratch = Path(tempfile.mkdtemp(prefix="unios-export-"))
        target = scratch / EXPORT_FILENAME
        try:
            build_export(settings, target, include_files=include_files)
        except FileNotFoundError as exc:
            shutil.rmtree(scratch, ignore_errors=True)
            raise HTTPException(409, str(exc)) from exc
        except ValueError as exc:
            shutil.rmtree(scratch, ignore_errors=True)
            raise HTTPException(422, str(exc)) from exc
        except BaseException:
            shutil.rmtree(scratch, ignore_errors=True)
            raise
        return FileResponse(target, media_type="application/zip", filename=target.name,
                            headers={"Cache-Control": "private, no-store"},
                            background=BackgroundTask(shutil.rmtree, scratch, ignore_errors=True))

    return router
