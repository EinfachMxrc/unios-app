# SPDX-License-Identifier: AGPL-3.0-or-later

"""Safe public projections of local entities."""

from fastapi import HTTPException

from app.entities import repository
from app.entities.schema import EntityKind, describe


def project(kind: EntityKind, item) -> dict:
    fields = describe(kind).fields
    return {field.name: getattr(item, field.name) for field in fields}


def read(session, kind: EntityKind, object_id: str) -> dict:
    item = repository.get(session, kind, object_id)
    if item is None:
        raise HTTPException(404, "Objekt nicht gefunden")
    return project(kind, item)


def list_entities(session, kind: EntityKind, offset: int, limit: int, query: str | None = None) -> list[dict]:
    items = (repository.search(session, kind, query.strip(), limit=limit, offset=offset) if query is not None
             else repository.list_items(session, kind, offset=offset, limit=limit))
    return [project(kind, item) for item in items]


class EntityReadService:
    def __init__(self, factory):
        self.factory = factory

    def read(self, kind, object_id):
        with self.factory() as session:
            return read(session, kind, object_id)

    def list(self, kind, offset, limit, query):
        with self.factory() as session:
            return list_entities(session, kind, offset, limit, query)
