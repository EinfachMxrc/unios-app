# SPDX-License-Identifier: AGPL-3.0-or-later
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel, Field, SecretStr

from app.connectors.moodle.client import MoodleError, MoodleTokenError
from app.courses.enrolment_service import EnrolmentService


class CourseSearchHit(BaseModel):
    id: int
    name: str
    description: str
    category: str
    enrolled: bool
    url: str


class CourseSearchResult(BaseModel):
    available: bool
    courses: list[CourseSearchHit]
    total: int
    page: int
    search_url: str


class EnrolmentMethod(BaseModel):
    id: int
    name: str
    available: bool
    key_required: bool


class EnrolmentOptions(BaseModel):
    available: bool
    methods: list[EnrolmentMethod]
    url: str


class EnrolmentInput(BaseModel):
    instance_id: int = Field(gt=0)
    key: SecretStr = Field(default=SecretStr(""), max_length=256)
    confirmed: Literal[True]


class EnrolmentResult(BaseModel):
    enrolled: bool
    sync_status: str


def enrolment_router(connectors, coordinator, sync_engine):
    router = APIRouter(prefix="/api/moodle/courses")
    service = EnrolmentService(connectors, coordinator)

    def failed(exc):
        return HTTPException(409 if isinstance(exc, MoodleTokenError) else 502, str(exc))

    @router.get("/search", response_model=CourseSearchResult)
    def search(response: Response, q: str = Query(min_length=2, max_length=120), page: int = Query(default=0, ge=0, le=1000)):
        response.headers["Cache-Control"] = "no-store"
        try:
            return service.search(q.strip(), page)
        except MoodleError as exc:
            raise failed(exc) from None

    @router.get("/{course_id}/enrolment", response_model=EnrolmentOptions)
    def methods(response: Response, course_id: int):
        response.headers["Cache-Control"] = "no-store"
        if course_id < 1:
            raise HTTPException(422, "Ungültiger Kurs")
        try:
            return service.methods(course_id)
        except MoodleError as exc:
            raise failed(exc) from None

    @router.post("/{course_id}/enrolment", response_model=EnrolmentResult)
    def enrol(course_id: int, payload: EnrolmentInput):
        if course_id < 1:
            raise HTTPException(422, "Ungültiger Kurs")
        try:
            service.enrol(course_id, payload.instance_id, payload.key.get_secret_value())
        except MoodleError as exc:
            raise failed(exc) from None
        # Enrolment succeeded upstream even if the subsequent local refresh fails.
        try:
            result = sync_engine.run(record_action=False)
            status = result.status if result else "running"
        except Exception:  # noqa: BLE001 - never report a confirmed remote enrolment as a failed write
            status = "error"
        return {"enrolled": True, "sync_status": status}

    return router
