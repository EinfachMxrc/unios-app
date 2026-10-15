# SPDX-License-Identifier: AGPL-3.0-or-later

"""Merge two free-text learning topics that turned out to name the same thing.

Topics come from free-text ``topic`` strings on cards/exercises
(:func:`app.learning.topics.resolve_topic` slugs them with ``casefold()``
per course), so near-duplicates such as "Schleifen" and "While-Schleifen"
end up as separate :class:`~app.db.models.LearningTopic` rows and fragment
the learning status for what the user experiences as one topic. Merging
reassigns every reference from the source topic to the target and deletes
the now-empty source, all in one transaction.
"""

from fastapi import HTTPException
from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from app.db.models import (
    AnkiCardQueue,
    Exercise,
    LearningProgress,
    LearningTopic,
    LinkEdge,
    ObjectMetadata,
    StudyBlockSuggestion,
    StudyCycle,
    VoiceMemo,
    utc_now,
)
from app.local_actions import repository as actions
from app.local_actions.topic_repository import snapshot

# accepted beats a still-open proposal, which beats a rejected suggestion.
_STATUS_RANK = {"rejected": 0, "proposed": 1, "accepted": 2}


def _merge_links(session: Session, source_id: int, target_id: int) -> None:
    source, target = str(source_id), str(target_id)
    edges = list(session.scalars(select(LinkEdge).where(or_(
        (LinkEdge.from_type == "topic") & (LinkEdge.from_id == source),
        (LinkEdge.to_type == "topic") & (LinkEdge.to_id == source)))))
    for edge in edges:
        from_id = target if edge.from_type == "topic" and edge.from_id == source else edge.from_id
        to_id = target if edge.to_type == "topic" and edge.to_id == source else edge.to_id
        duplicate = session.scalar(select(LinkEdge).where(
            LinkEdge.id != edge.id, LinkEdge.from_type == edge.from_type, LinkEdge.from_id == from_id,
            LinkEdge.to_type == edge.to_type, LinkEdge.to_id == to_id, LinkEdge.relation == edge.relation))
        if duplicate or (edge.from_type == edge.to_type and from_id == to_id):
            session.delete(edge)
        else:
            edge.from_id, edge.to_id = from_id, to_id
        session.flush()


def _merge_study_blocks(session: Session, source_id: int, into_topic_id: int) -> None:
    """Move ``StudyBlockSuggestion`` rows, resolving the ``(exam_id, topic_id)`` conflicts a merge creates."""
    blocks = session.scalars(select(StudyBlockSuggestion)
                             .where(StudyBlockSuggestion.topic_id == source_id)).all()
    for block in blocks:
        conflict = session.scalar(select(StudyBlockSuggestion).where(
            StudyBlockSuggestion.exam_id == block.exam_id,
            StudyBlockSuggestion.topic_id == into_topic_id))
        if conflict is None:
            block.topic_id = into_topic_id
            session.flush()
            continue
        if _STATUS_RANK[block.status] > _STATUS_RANK[conflict.status]:
            session.delete(conflict)
            session.flush()
            block.topic_id = into_topic_id
        else:
            session.delete(block)
        session.flush()


def _merge_metadata(session: Session, source_id: int, into_topic_id: int) -> None:
    """Move a ``topic`` metadata tag row, unioning tags when both topics already have one."""
    source_key, target_key = str(source_id), str(into_topic_id)
    source_meta = session.scalar(select(ObjectMetadata).where(
        ObjectMetadata.object_type == "topic", ObjectMetadata.object_id == source_key))
    if source_meta is None:
        return
    target_meta = session.scalar(select(ObjectMetadata).where(
        ObjectMetadata.object_type == "topic", ObjectMetadata.object_id == target_key))
    if target_meta is None:
        source_meta.object_id = target_key
        session.flush()
        return
    merged_tags = sorted(set(target_meta.tags) | set(source_meta.tags))
    if merged_tags != sorted(target_meta.tags):
        target_meta.tags = merged_tags
        target_meta.revision += 1
        target_meta.updated_at = utc_now()
    session.delete(source_meta)
    session.flush()


def merge_topics(session: Session, source_id: int, into_topic_id: int, before_commit=None) -> LearningTopic:
    """Fold ``source_id`` into ``into_topic_id`` and return the surviving topic.

    Raises ``HTTPException`` (404/422, German messages) for a missing topic,
    a self-merge, or topics from different courses -- callers are FastAPI
    routes and pass these straight through.
    """
    if source_id == into_topic_id:
        raise HTTPException(422, "Ein Thema kann nicht mit sich selbst zusammengeführt werden")
    source = session.get(LearningTopic, source_id)
    target = session.get(LearningTopic, into_topic_id)
    if source is None or target is None:
        raise HTTPException(404, "Thema nicht gefunden")
    if source.course_id != target.course_id:
        raise HTTPException(422, "Themen gehören zu unterschiedlichen Kursen")

    identifiers = [source_id, into_topic_id]
    prior = snapshot(session, identifiers)

    if target.module_id is None:
        target.module_id = source.module_id
    for cycle in session.scalars(select(StudyCycle)).all():
        if source_id in cycle.topic_ids:
            cycle.topic_ids = list(dict.fromkeys(
                into_topic_id if topic_id == source_id else topic_id for topic_id in cycle.topic_ids))

    session.execute(update(Exercise).where(Exercise.topic_id == source_id).values(topic_id=into_topic_id))
    session.execute(update(AnkiCardQueue).where(AnkiCardQueue.topic_id == source_id).values(topic_id=into_topic_id))
    session.execute(update(VoiceMemo).where(VoiceMemo.topic_id == source_id).values(topic_id=into_topic_id))
    session.execute(update(LearningProgress).where(LearningProgress.topic_id == source_id).values(topic_id=into_topic_id))
    session.flush()

    _merge_study_blocks(session, source_id, into_topic_id)
    _merge_metadata(session, source_id, into_topic_id)
    _merge_links(session, source_id, into_topic_id)

    session.delete(source)
    session.flush()
    actions.record(session, "topic_merge", into_topic_id,
                   {"ids": identifiers, "prior": prior, "after": snapshot(session, identifiers)},
                   0, target.course_id)
    if before_commit is not None:
        before_commit()
    session.commit()
    session.refresh(target)
    return target
