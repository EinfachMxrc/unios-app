# SPDX-License-Identifier: AGPL-3.0-or-later

"""Snapshot only the graph participating in a topic merge."""

import hashlib
import json
from datetime import datetime

from sqlalchemy import DateTime, delete, or_, select

from app.db.models import (
    AnkiCard,
    AnkiCardQueue,
    AnkiReview,
    Exercise,
    ExerciseAttempt,
    LearningProgress,
    LearningTopic,
    LinkEdge,
    ObjectMetadata,
    StudyBlockSuggestion,
    StudyCycle,
    VoiceMemo,
    utc_now,
)

MODELS = (LearningTopic, Exercise, AnkiCardQueue, VoiceMemo, LearningProgress,
          StudyBlockSuggestion, ObjectMetadata, StudyCycle, LinkEdge)


def rows(session, model, ids):
    keys = [str(value) for value in ids]
    if model is LearningTopic:
        query = select(model).where(model.id.in_(ids))
    elif model is ObjectMetadata:
        query = select(model).where(model.object_type == "topic", model.object_id.in_(keys))
    elif model is LinkEdge:
        query = select(model).where(or_(
            (model.from_type == "topic") & model.from_id.in_(keys),
            (model.to_type == "topic") & model.to_id.in_(keys)))
    elif model is StudyCycle:
        return [row for row in session.scalars(select(model).order_by(model.id)) if set(ids) & set(row.topic_ids)]
    else:
        query = select(model).where(model.topic_id.in_(ids))
    return list(session.scalars(query.order_by(model.id)))


def snapshot(session, ids):
    result = {model.__tablename__: [
        {column.name: value.replace(tzinfo=None).isoformat() if isinstance(value, datetime) else value
         for column in model.__table__.columns for value in [getattr(row, column.name)]}
        for row in rows(session, model, ids)] for model in MODELS}
    digest = hashlib.sha256()
    work = (
        select(ExerciseAttempt).join(Exercise).where(Exercise.topic_id.in_(ids)).order_by(ExerciseAttempt.id),
        select(AnkiReview).join(AnkiCard).join(AnkiCardQueue).where(AnkiCardQueue.topic_id.in_(ids)).order_by(AnkiReview.id),
    )
    for query in work:
        for row in session.scalars(query):
            values = {column.name: str(getattr(row, column.name)) for column in row.__table__.columns}
            digest.update(json.dumps(values, sort_keys=True).encode())
    result["_work"] = digest.hexdigest()
    return result


def restore(session, ids, prior):
    # Keep referenced exercises/cards/memos intact. Only conflicting blocks,
    # metadata and edges were deleted by merge and need fresh insertion.
    source = prior[LearningTopic.__tablename__]
    for record in source:
        topic = session.get(LearningTopic, record["id"])
        if topic is None:
            session.add(LearningTopic(**record))
        else:
            for key, value in record.items():
                setattr(topic, key, value)
    session.flush()
    for model in MODELS[1:]:
        prior_rows = prior[model.__tablename__]
        revisions = {}
        if model in {StudyBlockSuggestion, ObjectMetadata, LinkEdge}:
            current_rows = rows(session, model, ids)
            if model is ObjectMetadata:
                revisions = {row.id: row.revision for row in current_rows}
            current_ids = [row.id for row in current_rows]
            session.execute(delete(model).where(model.id.in_(current_ids)))
            session.flush()
        for record in prior_rows:
            values = {column.name: datetime.fromisoformat(record[column.name])
                      if isinstance(column.type, DateTime) and record[column.name] else record[column.name]
                      for column in model.__table__.columns}
            if model is ObjectMetadata:
                values["revision"] = max(values["revision"], revisions.get(record["id"], 0)) + 1
                values["updated_at"] = utc_now()
            current = session.get(model, record["id"])
            if current is None:
                session.add(model(**values))
            else:
                for key, value in values.items():
                    setattr(current, key, value)
        session.flush()
