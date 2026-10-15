# SPDX-License-Identifier: AGPL-3.0-or-later

"""Resolve, validate and traverse semantic relationships between study objects."""

from datetime import datetime
from typing import Literal, cast

from fastapi import HTTPException
from pydantic import BaseModel, ValidationError
from sqlalchemy import select

from app.db.models import LinkEdge, ResourceVersion, utc_now
from app.entities import repository as entities
from app.entities.schema import (
    EntityKind,
    EntityRef,
    RelationKind,
    catalog,
    describe,
    relationship,
)
from app.links import repository


class LinkTargetView(EntityRef):
    title: str
    url: str


class LinkItemView(BaseModel):
    id: int
    # Not `RelationKind`: an edge can also carry an internal, non-catalog
    # relation such as "wikilink" (see app/notes/wikilinks.py) that a user can
    # never choose when creating a link (LinkInput.relation stays the strict
    # RelationKind), but that a response listing existing edges must still be
    # able to echo back instead of silently dropping the edge.
    relation: str
    label: str
    direction: Literal["outgoing", "incoming"]
    target: LinkTargetView
    created_at: datetime


def target(session, ref: EntityRef) -> LinkTargetView:
    item = entities.get(session, ref.type, ref.id)
    if item is None:
        raise HTTPException(404, "Verknüpfungsziel nicht gefunden")
    kind = ref.type
    title_field = describe(kind).fields[1].name
    title = str(getattr(item, title_field))[:120]
    if kind == "course":
        url = f"/courses/{item.id}"
    elif kind == "resource":
        version = session.scalar(select(ResourceVersion).where(ResourceVersion.resource_id == item.id)
                                 .order_by(ResourceVersion.version.desc()))
        url = f"/material/{version.id}" if version else f"/courses/{item.course_id}#resource-{item.id}"
    elif kind == "project":
        url = f"/projects/{item.id}"
    elif kind == "topic":
        url = f"/learning?topic={item.id}"
    elif kind == "assignment":
        url = f"/courses/{item.course_id}#assignment-{item.id}"
    elif kind == "exam":
        url = "/grades"
    elif kind == "exercise":
        url = "/learning"
    elif kind == "jot":
        url = f"/jots#jot-{item.id}"
    elif kind == "assessment_task":
        url = f"/assessment?task={item.id}"
    elif kind == "assessment_attempt":
        url = f"/assessment?task={item.task_id}"
    elif kind == "coding_task":
        url = f"/coding?task={item.id}"
    elif kind == "coding_attempt":
        url = f"/coding?task={item.task_id}"
    else:
        url = f"/notes?id={item.id}"
    return LinkTargetView(type=kind, id=str(item.id), title=title, url=url)


def candidates(session, term: str) -> list[LinkTargetView]:
    if len(term.strip()) < 2:
        return []
    found = []
    for schema in catalog().entities:
        for item in entities.search(session, schema.kind, term.strip()):
            found.append(target(session, EntityRef(type=schema.kind, id=str(item.id))))
    return found[:24]


def links(session, ref: EntityRef) -> list[LinkItemView]:
    source = target(session, ref)
    result = []
    for edge in repository.for_ref(session, source.type, source.id):
        outgoing = edge.from_type == source.type and edge.from_id == source.id
        other_type = edge.to_type if outgoing else edge.from_type
        other_id = edge.to_id if outgoing else edge.from_id
        try:
            other = target(session, EntityRef(type=cast(EntityKind, other_type), id=other_id))
        except (HTTPException, ValidationError):
            continue  # Deleted objects leave a historical edge but cannot be opened.
        if edge.relation == "wikilink":
            # Auto-generated from a note's [[Title]] body text (see
            # app/notes/wikilinks.py) — not part of the user-facing relation
            # catalog, so it has no RelationshipDefinition to look up.
            forward_label, reverse_label = "erwähnt", "erwähnt in"
        else:
            try:
                relation = relationship(cast(RelationKind, edge.relation))
            except StopIteration:
                continue  # Unknown relation kind from a future schema version.
            forward_label, reverse_label = relation.forward_label, relation.reverse_label
        result.append(LinkItemView(id=edge.id, relation=edge.relation,
                                   label=forward_label if outgoing else reverse_label,
                                   direction="outgoing" if outgoing else "incoming",
                                   target=other, created_at=edge.created_at))
    return result


def _would_cycle(session, source: EntityRef, destination: EntityRef, relation: RelationKind) -> bool:
    pending = [destination]
    visited: set[tuple[str, str]] = set()
    while pending:
        current = pending.pop()
        key = (current.type, current.id)
        if key == (source.type, source.id):
            return True
        if key in visited:
            continue
        visited.add(key)
        if len(visited) > 10000:
            raise HTTPException(422, "Beziehungsgraph zu groß für sichere Kreisprüfung")
        pending.extend(EntityRef(type=cast(EntityKind, edge.to_type), id=edge.to_id)
                       for edge in repository.outgoing(session, current.type, current.id, relation))
    return False


def create(session, source: EntityRef, destination: EntityRef, relation_kind: RelationKind) -> LinkItemView:
    left, right = target(session, source), target(session, destination)
    if left.type == right.type and left.id == right.id:
        raise HTTPException(422, "Ein Objekt kann nicht mit sich selbst verknüpft werden")
    relation = relationship(relation_kind)
    first, second = (left, right)
    if relation.symmetric and (left.type, left.id) > (right.type, right.id):
        first, second = right, left
    edge = repository.matching(session, first.type, first.id, second.type, second.id, relation.kind)
    if edge is None:
        if relation.kind in {"prerequisite", "part_of"} and _would_cycle(session, source, destination, relation.kind):
            raise HTTPException(422, "Diese Beziehung würde einen Kreis erzeugen")
        edge = repository.add(session, LinkEdge(from_type=first.type, from_id=first.id,
                                                to_type=second.type, to_id=second.id,
                                                relation=relation.kind, created_at=utc_now()))
    return LinkItemView(id=edge.id, relation=relation.kind, label=relation.forward_label,
                        direction="outgoing", target=right, created_at=edge.created_at)


def unlink(session, edge_id: int) -> None:
    edge = repository.get(session, edge_id)
    if edge is None:
        raise HTTPException(404, "Verknüpfung nicht gefunden")
    from app.local_actions.repository import record

    entity = entities.get(session, cast(EntityKind, edge.from_type), edge.from_id)
    course_id = getattr(entity, "course_id", None) if edge.from_type != "course" else int(edge.from_id)
    record(session, "relation", edge_id, {key: getattr(edge, key) for key in
           ("from_type", "from_id", "to_type", "to_id", "relation")}, 0, course_id=course_id)
    repository.remove(session, edge)
