# SPDX-License-Identifier: AGPL-3.0-or-later

"""Persistence queries for the semantic relationship graph."""

from sqlalchemy import and_, or_, select

from app.db.models import LinkEdge


def for_ref(session, kind: str, object_id: str) -> list[LinkEdge]:
    return list(session.scalars(select(LinkEdge).where(or_(
        and_(LinkEdge.from_type == kind, LinkEdge.from_id == object_id),
        and_(LinkEdge.to_type == kind, LinkEdge.to_id == object_id),
    )).order_by(LinkEdge.created_at.desc(), LinkEdge.id.desc())).all())


def outgoing(session, kind: str, object_id: str, relation: str) -> list[LinkEdge]:
    return list(session.scalars(select(LinkEdge).where(
        LinkEdge.from_type == kind, LinkEdge.from_id == object_id,
        LinkEdge.relation == relation,
    )).all())


def matching(session, from_type: str, from_id: str, to_type: str, to_id: str, relation: str) -> LinkEdge | None:
    return session.scalar(select(LinkEdge).where(
        LinkEdge.from_type == from_type, LinkEdge.from_id == from_id,
        LinkEdge.to_type == to_type, LinkEdge.to_id == to_id,
        LinkEdge.relation == relation,
    ))


def get(session, edge_id: int) -> LinkEdge | None:
    return session.get(LinkEdge, edge_id)


def add(session, edge: LinkEdge) -> LinkEdge:
    session.add(edge)
    session.commit()
    session.refresh(edge)
    return edge


def remove(session, edge: LinkEdge) -> None:
    session.delete(edge)
    session.commit()
