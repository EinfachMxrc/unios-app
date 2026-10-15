# SPDX-License-Identifier: AGPL-3.0-or-later

"""HTTP validation for the universal semantic relationship graph."""

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.entities.schema import EntityKind, EntityRef, RelationKind
from app.host.lease import HostCoordinator
from app.links import service
from app.links.service import LinkItemView, LinkTargetView


class LinkInput(BaseModel):
    from_type: EntityKind
    from_id: str = Field(min_length=1, max_length=36)
    to_type: EntityKind
    to_id: str = Field(min_length=1, max_length=36)
    relation: RelationKind = "related"


def links_router(factory, coordinator: HostCoordinator) -> APIRouter:
    router = APIRouter(prefix="/api/links")

    @router.get("/candidates", response_model=list[LinkTargetView])
    def candidates(q: str = Query(min_length=2, max_length=100)):
        with factory() as session:
            return service.candidates(session, q)

    @router.get("/targets/{kind}/{object_id}", response_model=LinkTargetView)
    def get_target(kind: EntityKind, object_id: str):
        with factory() as session:
            return service.target(session, EntityRef(type=kind, id=object_id))

    @router.get("/{kind}/{object_id}", response_model=list[LinkItemView])
    def get_links(kind: EntityKind, object_id: str):
        with factory() as session:
            return service.links(session, EntityRef(type=kind, id=object_id))

    @router.post("", response_model=LinkItemView)
    def create_link(payload: LinkInput):
        coordinator.assert_writer()
        with factory() as session:
            return service.create(session, EntityRef(type=payload.from_type, id=payload.from_id),
                                  EntityRef(type=payload.to_type, id=payload.to_id), payload.relation)

    @router.delete("/{edge_id}", status_code=204)
    def delete_link(edge_id: int):
        coordinator.assert_writer()
        with factory() as session:
            service.unlink(session, edge_id)

    return router
