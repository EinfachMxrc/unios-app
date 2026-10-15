# SPDX-License-Identifier: AGPL-3.0-or-later

from datetime import timedelta

from sqlalchemy import func, select

from app.db.models import (
    Course,
    Deadline,
    LearningTopic,
    MaterialAnnotation,
    Note,
    ObjectMetadata,
    Resource,
    ResourceVersion,
    SmartCollection,
)


def list_saved(session):
    return session.scalars(select(SmartCollection).where(SmartCollection.archived.is_(False))
                           .order_by(SmartCollection.updated_at.desc())).all()


def get_saved(session, identifier: int):
    return session.get(SmartCollection, identifier)


def get_course(session, identifier: int):
    return session.get(Course, identifier)


def add(session, item):
    session.add(item)


def commit(session):
    session.commit()


def courses(session):
    return session.scalars(select(Course)).all()

def metadata(session, kind):
    return session.scalars(select(ObjectMetadata).where(ObjectMetadata.object_type == kind)).all()

def view_rows(session, config, now):
    if config.kind == "topics":
        topic_query = select(LearningTopic, Course).join(Course, Course.id == LearningTopic.course_id)
        if config.course_id is not None:
            topic_query = topic_query.where(Course.id == config.course_id)
        return session.execute(topic_query.order_by(Course.name, LearningTopic.name)).all()
    elif config.kind == "notes":
        note_query = select(Note, Course).outerjoin(Course, Note.course_id == Course.id)
        if config.course_id is not None:
            note_query = note_query.where(Note.course_id == config.course_id)
        if config.days is not None:
            note_query = note_query.where(Note.updated_at >= now - timedelta(days=config.days))
        return session.execute(note_query.order_by(Note.updated_at.desc())).all()
    elif config.kind == "materials":
        latest = select(func.max(ResourceVersion.version)).where(
            ResourceVersion.resource_id == Resource.id).correlate(Resource).scalar_subquery()
        material_query = (select(ResourceVersion, Resource, Course)
                 .join(Resource, ResourceVersion.resource_id == Resource.id)
                 .join(Course, Resource.course_id == Course.id)
                 .where(ResourceVersion.version == latest, Resource.group_category != "other_group",
                        Resource.removed_upstream.is_(False)))
        if config.course_id is not None:
            material_query = material_query.where(Course.id == config.course_id)
        if config.unread_only:
            material_query = material_query.where(ResourceVersion.first_opened_at.is_(None))
        if config.has_questions:
            material_query = material_query.where(select(MaterialAnnotation.id).where(
                MaterialAnnotation.resource_id == Resource.id, MaterialAnnotation.kind == "question",
                MaterialAnnotation.resolved.is_(False)).exists())
        if config.own_group_only:
            material_query = material_query.where(Resource.group_category == "own_group")
        if config.days is not None:
            material_query = material_query.where(ResourceVersion.downloaded_at >= now - timedelta(days=config.days))
        return session.execute(material_query.order_by(ResourceVersion.downloaded_at.desc())).all()
    elif config.kind == "deadlines":
        deadline_query = select(Deadline, Course).outerjoin(Course, Deadline.course_id == Course.id).where(
            Deadline.removed_upstream.is_(False))
        if config.course_id is not None:
            deadline_query = deadline_query.where(Deadline.course_id == config.course_id)
        if config.time_filter == "upcoming":
            deadline_query = deadline_query.where(Deadline.due_at >= now)
        elif config.time_filter == "overdue":
            deadline_query = deadline_query.where(Deadline.due_at < now)
        if config.days is not None:
            deadline_query = deadline_query.where(Deadline.due_at <= now + timedelta(days=config.days))
        return session.execute(deadline_query.order_by(Deadline.due_at)).all()
    elif config.kind == "questions":
        question_query = (select(MaterialAnnotation, Resource, Course)
                 .join(Resource, MaterialAnnotation.resource_id == Resource.id)
                 .join(Course, Resource.course_id == Course.id)
                 .where(MaterialAnnotation.kind == "question", MaterialAnnotation.resolved.is_(False),
                        Resource.group_category != "other_group"))
        if config.course_id is not None:
            question_query = question_query.where(Course.id == config.course_id)
        if config.days is not None:
            question_query = question_query.where(MaterialAnnotation.created_at >= now - timedelta(days=config.days))
        return session.execute(question_query.order_by(MaterialAnnotation.created_at.desc())).all()
    return []
