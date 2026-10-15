# SPDX-License-Identifier: AGPL-3.0-or-later
"""List bounds shared by the HTTP-facing workspace."""
from app.catalog.repository import CatalogRepository


class CatalogService:
    def __init__(self, repository: CatalogRepository):
        self.repository = repository

    @staticmethod
    def validate(offset, limit):
        if offset < 0 or not 1 <= limit <= 100:
            raise ValueError('Ungültiger Listenbereich')

    def versions(self, resource_id, offset, limit):
        self.validate(offset, limit)
        return self.repository.versions(resource_id, offset, limit)

    def course(self, course_id, offset, limit, query, resource_id, serialize):
        self.validate(offset, limit)
        data = self.repository.course(course_id, offset, limit, query.strip(), resource_id)
        result = {key: [serialize(row) for row in data[key]] for key in
                  ('resources', 'sections', 'group_assignments', 'assignments', 'announcements', 'semesters')}
        versions = {row.id: [] for row in data['resources']}
        for row in data['current_versions']:
            versions[row.resource_id].append(serialize(row))
        return {**result, 'versions': versions, 'course': serialize(data['course']), 'page': data['page']}

    def notes(self, course_id, offset, limit, query, serialize):
        self.validate(offset, limit)
        rows, courses, info = self.repository.note_page(course_id, offset, limit, query.strip())
        return {'notes': [{**serialize(note), 'course_name': name} for note, name in rows],
                'courses': [serialize(course) for course in courses], 'page': info}

    def jots(self, course_id, offset, limit, jot_id, serialize):
        self.validate(offset, limit)
        rows, tasks, courses, notes, info = self.repository.jot_page(course_id, offset, limit, jot_id)
        return {'jots': [{**serialize(item), 'task_id': tasks[item.id][0] if item.id in tasks else None,
                         'task_course_id': tasks[item.id][1] if item.id in tasks else None} for item in rows],
                'courses': [serialize(course) for course in courses],
                'notes': [{**serialize(note), 'course_name': name} for note, name in notes], 'page': info}
