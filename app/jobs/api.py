# SPDX-License-Identifier: AGPL-3.0-or-later

from typing import Literal

from fastapi import APIRouter, Query

from app.jobs.schema import JobRequest
from app.web.contracts import BackgroundJobView, JobTargetView


def jobs_router(service):
    router = APIRouter(prefix="/api/jobs", tags=["jobs"])

    @router.get("/targets", response_model=list[JobTargetView], response_model_exclude_unset=True)
    def targets(kind: Literal["index", "ocr", "ai"], q: str = Query(default="", max_length=100)):
        return service.targets(kind, q)

    @router.get("", response_model=list[BackgroundJobView], response_model_exclude_unset=True)
    def list_jobs():
        return service.list()

    @router.post("", status_code=202, response_model=BackgroundJobView, response_model_exclude_unset=True)
    def submit(payload: JobRequest):
        return service.submit(payload)

    @router.post("/{identifier}/{action}", response_model=BackgroundJobView, response_model_exclude_unset=True)
    def change(identifier: str, action: Literal["cancel", "retry"], payload: dict):
        if payload.get("confirmed") is not True:
            from fastapi import HTTPException
            raise HTTPException(422, "Bitte Aktion bestätigen")
        return service.change(identifier, action)

    return router
