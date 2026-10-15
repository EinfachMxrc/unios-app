# SPDX-License-Identifier: AGPL-3.0-or-later

"""REST surface generated from the public entity catalog."""

from fastapi import APIRouter, HTTPException, Query

from app.entities.actions import (
    ActionRequest,
    EntityActionDefinition,
    EntityActions,
    action_definitions,
)
from app.entities.schema import (
    EntityKind,
    EntitySchema,
    SchemaCatalog,
    catalog,
    describe,
)
from app.entities.service import EntityReadService
from app.web.contracts import PublicObject


def entities_router(factory, actions: EntityActions) -> APIRouter:
    router = APIRouter(prefix="/api")
    reader = EntityReadService(factory)

    @router.get("/schema", response_model=SchemaCatalog)
    def get_schema():
        return catalog()

    @router.get("/entities/{kind}/{object_id}/actions", response_model=list[EntityActionDefinition])
    def available_actions(kind: EntityKind, object_id: str):
        reader.read(kind, object_id)
        return action_definitions(kind)

    @router.post("/entities/{kind}/{object_id}/actions/{action_id}", response_model=PublicObject, response_model_exclude_unset=True)
    def run_action(kind: EntityKind, object_id: str, action_id: str, payload: ActionRequest):
        return actions.dispatch(kind, object_id, action_id, payload)

    @router.get("/entities/{kind}/{object_id}/actions/{action_id}", response_model=PublicObject, response_model_exclude_unset=True)
    def read_action(kind: EntityKind, object_id: str, action_id: str):
        definition = next((item for item in action_definitions(kind) if item.id == action_id), None)
        if definition is None:
            raise HTTPException(404, "Aktion nicht gefunden")
        if definition.requires_confirmation:
            raise HTTPException(405, "Diese Aktion benötigt POST und eine Bestätigung")
        return actions.dispatch(kind, object_id, action_id, ActionRequest())

    @router.get("/schema/{kind}", response_model=EntitySchema)
    def get_entity_schema(kind: EntityKind):
        return describe(kind)

    @router.get("/entities/{kind}", response_model=list[PublicObject], response_model_exclude_unset=True)
    def list_entities_route(kind: EntityKind, offset: int = Query(default=0, ge=0),
                            limit: int = Query(default=50, ge=1, le=100),
                            q: str | None = Query(default=None, min_length=2, max_length=100)):
        return reader.list(kind, offset, limit, q)

    @router.get("/entities/{kind}/{object_id}", response_model=PublicObject, response_model_exclude_unset=True)
    def get_entity_route(kind: EntityKind, object_id: str):
        return reader.read(kind, object_id)

    return router
