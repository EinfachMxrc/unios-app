# SPDX-License-Identifier: AGPL-3.0-or-later

from uuid import uuid4

from sqlalchemy import select

from app.db.models import InboxClip, IntakeDecision, LinkEdge, LocalAction, Note


def record(session, kind, entity_id, before, expected_revision, course_id=None):
    row = LocalAction(id=str(uuid4()), kind=kind, entity_id=str(entity_id), before=before,
                      expected_revision=expected_revision, course_id=course_id)
    session.add(row)
    return row


def recent(session, course_id=None, kind=None, entity_id=None, limit=50):
    query = select(LocalAction)
    if course_id is not None:
        query = query.where(LocalAction.course_id == course_id)
    if kind is not None:
        query = query.where(LocalAction.kind == kind)
    if entity_id is not None:
        query = query.where(LocalAction.entity_id == entity_id)
    return session.scalars(query.order_by(LocalAction.created_at.desc()).limit(limit)).all()


def get(session, identifier):
    return session.get(LocalAction, identifier)


def note(session, identifier):
    return session.get(Note, identifier)


def decision(session, source, identifier):
    return session.scalar(select(IntakeDecision).where(IntakeDecision.source_kind == source, IntakeDecision.source_id == identifier))


def clip(session, identifier):
    return session.get(InboxClip, identifier)


def matching_edge(session, prior):
    return session.scalar(select(LinkEdge.id).where(LinkEdge.from_type == prior["from_type"], LinkEdge.from_id == prior["from_id"],
        LinkEdge.to_type == prior["to_type"], LinkEdge.to_id == prior["to_id"], LinkEdge.relation == prior["relation"]))


def commit(session):
    session.commit()
