# SPDX-License-Identifier: AGPL-3.0-or-later
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.courses.repository import CourseRepository
from app.courses.service import CourseService


class CourseActivityInput(BaseModel):
    is_active: bool
    expected_is_active: bool


class CourseActivityView(BaseModel):
    is_active: bool


class CourseNameInput(BaseModel):
    display_name: str | None = Field(max_length=80)
    expected_display_name: str | None = Field(max_length=80)


class CourseNameView(BaseModel):
    display_name: str | None


def course_router(factory, coordinator) -> APIRouter:
    router = APIRouter(prefix="/api/courses")
    service = CourseService(CourseRepository(factory), coordinator)

    @router.patch("/{course_id}/display-name", response_model=CourseNameView)
    def set_display_name(course_id: int, payload: CourseNameInput):
        try:
            return {"display_name": service.set_display_name(
                course_id, payload.display_name, payload.expected_display_name,
            )}
        except LookupError as exc:
            raise HTTPException(404, str(exc)) from None
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from None

    @router.patch("/{course_id}/activity", response_model=CourseActivityView)
    def set_activity(course_id: int, payload: CourseActivityInput):
        try:
            return {"is_active": service.set_activity(course_id, payload.is_active, payload.expected_is_active)}
        except LookupError as exc:
            raise HTTPException(404, str(exc)) from None
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from None

    return router
