# SPDX-License-Identifier: AGPL-3.0-or-later
"""Metadata queries only: no file reads or full version histories."""
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import aliased

from app.courses.classification import teaching_courses
from app.db.models import (
    Announcement,
    Assignment,
    Course,
    CourseSection,
    Jot,
    Note,
    Resource,
    ResourceVersion,
    SectionGroupAssignment,
    Semester,
)


def page(query, session, offset, limit):
    total = session.scalar(select(func.count()).select_from(query.order_by(None).subquery()))
    rows = session.execute(query.offset(offset).limit(limit)).all()
    return rows, {'total': total, 'offset': offset, 'limit': limit, 'has_more': offset + len(rows) < total}


class CatalogRepository:
    def __init__(self, factory):
        self.factory = factory

    def course(self, course_id, offset, limit, query, resource_id):
        with self.factory() as session:
            course = session.get(Course, course_id)
            if course is None:
                raise LookupError('Kurs nicht gefunden')
            resources, versions, info = self.materials(session, course_id, offset, limit, query, resource_id)
            return {'course': course, 'resources': resources, 'current_versions': versions, 'page': info,
                    'sections': list(session.scalars(select(CourseSection).where(CourseSection.course_id == course_id)
                                                    .order_by(CourseSection.position))),
                    'group_assignments': list(session.scalars(select(SectionGroupAssignment).join(CourseSection)
                                                              .where(CourseSection.course_id == course_id))),
                    'assignments': list(session.scalars(select(Assignment).where(Assignment.course_id == course_id)
                                                        .order_by(Assignment.removed_upstream, Assignment.due_at))),
                    'announcements': list(session.scalars(select(Announcement).where(Announcement.course_id == course_id)
                                                          .order_by(Announcement.created_at.desc()))),
                    'semesters': list(session.scalars(select(Semester).order_by(Semester.id.desc())))}

    def note_page(self, course_id, offset, limit, query):
        with self.factory() as session:
            rows, info = self.notes(session, course_id, offset, limit, query)
            courses = list(session.scalars(select(Course).where(teaching_courses()).order_by(Course.name)))
            return rows, courses, info

    def jot_page(self, course_id, offset, limit, jot_id):
        with self.factory() as session:
            statement = select(Jot).order_by(Jot.created_at.desc(), Jot.id)
            if course_id is not None:
                statement = statement.where(Jot.course_id == course_id)
            if jot_id is not None:
                statement = statement.where(Jot.id == jot_id)
            selected, info = page(statement, session, offset, limit)
            rows = [row[0] for row in selected]
            tasks = {item.source_key: (item.id, item.course_id) for item in session.scalars(select(Assignment).where(
                Assignment.source == 'smart_capture', Assignment.source_key.in_([row.id for row in rows])))}
            courses = list(session.scalars(select(Course).where(teaching_courses()).order_by(Course.name)))
            notes = session.execute(select(Note, Course.name).join(Course)
                                    .order_by(Note.updated_at.desc(), Note.id)).all()
            return rows, tasks, courses, notes, info

    def materials(self, session, course_id, offset, limit, query='', resource_id=None):
        statement = select(Resource).outerjoin(CourseSection).where(Resource.course_id == course_id)
        if resource_id is not None:
            # A deep link locates the normal page around the item, not a
            # single-item filter that hides its course context.
            query = ''
            target = session.scalar(select(Resource).where(Resource.course_id == course_id, Resource.id == resource_id))
            if target is not None:
                before = session.scalar(select(func.count()).select_from(Resource).where(
                    Resource.course_id == course_id,
                    or_(Resource.name < target.name, and_(Resource.name == target.name, Resource.id < target.id)),
                )) or 0
                offset = before // limit * limit
        if query:
            pattern = '%' + query.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
            statement = statement.where(or_(Resource.name.ilike(pattern, escape='\\'),
                                            CourseSection.name.ilike(pattern, escape='\\'),
                                            select(ResourceVersion.id).where(
                                                ResourceVersion.resource_id == Resource.id,
                                                ResourceVersion.relative_path.ilike(pattern, escape='\\')).exists()))
        rows, info = page(statement.order_by(Resource.name, Resource.id), session, offset, limit)
        resources = [row[0] for row in rows]
        newer = aliased(ResourceVersion)
        versions = session.scalars(select(ResourceVersion).where(
            ResourceVersion.resource_id.in_([row.id for row in resources]),
            ~select(newer.id).where(newer.resource_id == ResourceVersion.resource_id,
                                    newer.version > ResourceVersion.version).exists()))
        return resources, list(versions), info

    def notes(self, session, course_id, offset, limit, query=''):
        statement = select(Note, Course.name).join(Course).order_by(Note.updated_at.desc(), Note.id)
        if course_id is not None:
            statement = statement.where(Note.course_id == course_id)
        if query:
            pattern = '%' + query.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
            statement = statement.where(Note.title.ilike(pattern, escape='\\'))
        return page(statement, session, offset, limit)

    def versions(self, resource_id, offset, limit):
        with self.factory() as session:
            if session.get(Resource, resource_id) is None:
                raise LookupError('Material nicht gefunden')
            rows, info = page(select(ResourceVersion).where(ResourceVersion.resource_id == resource_id)
                              .order_by(ResourceVersion.version.desc()), session, offset, limit)
            return [row[0] for row in rows], info
