# SPDX-License-Identifier: AGPL-3.0-or-later

"""Typed module and topic assignment endpoints."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.host.lease import HostCoordinator
from app.modules.service import ModuleService, ModuleView


class ModuleInput(BaseModel):
    course_id: int = Field(ge=1)
    name: str = Field(min_length=1, max_length=120)


class ModuleRename(BaseModel):
    expected_revision: int = Field(ge=1)
    name: str = Field(min_length=1, max_length=120)


class TopicAssignment(BaseModel):
    expected_module_id: int | None = Field(default=None, ge=1)
    module_id: int | None = Field(default=None, ge=1)


def modules_router(service: ModuleService, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/learning/modules")

    @router.get("", response_model=list[ModuleView])
    def list_modules():
        return service.list()

    @router.post("", response_model=list[ModuleView])
    def create_module(payload: ModuleInput):
        coordinator.assert_writer()
        try:
            service.create(payload.course_id, payload.name)
        except LookupError as exc:
            raise HTTPException(404, str(exc)) from None
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from None
        return service.list()

    @router.patch("/{module_id}", response_model=list[ModuleView])
    def rename_module(module_id: int, payload: ModuleRename):
        coordinator.assert_writer()
        try:
            service.rename(module_id, payload.name, payload.expected_revision)
        except LookupError as exc:
            raise HTTPException(404, str(exc)) from None
        except RuntimeError as exc:
            raise HTTPException(409, str(exc)) from None
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from None
        return service.list()

    @router.patch("/topics/{topic_id}", response_model=list[ModuleView])
    def assign_topic(topic_id: int, payload: TopicAssignment):
        coordinator.assert_writer()
        try:
            service.assign(topic_id, payload.module_id, payload.expected_module_id)
        except LookupError as exc:
            raise HTTPException(404, str(exc)) from None
        except RuntimeError as exc:
            raise HTTPException(409, str(exc)) from None
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from None
        return service.list()

    return router
