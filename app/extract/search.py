# SPDX-License-Identifier: AGPL-3.0-or-later

import re
import unicodedata

from sqlalchemy import and_, func, or_, select, text

from app.db.models import Announcement, Course, Resource, ResourceVersion, Semester
from app.files.sidecars import safe_external_url

QUESTION_STOPWORDS = {"aber", "alle", "auch", "dass", "eine", "einem", "einen", "einer", "eines",
                      "für", "haben", "hat", "hier", "kann", "man", "mit", "oder", "sind", "über",
                      "und", "unter", "wann", "wird", "wurde", "werden", "welche", "welcher", "wenn"}
GERMAN_EQUIVALENTS: dict[str, str | int | None] = {"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"}
GERMAN_TRANSLATION = str.maketrans(GERMAN_EQUIVALENTS)


def _query_terms(query: str) -> tuple[list[str], bool]:
    terms = re.findall(r"\w+", query, flags=re.UNICODE)[:10]
    if len(terms) > 3:
        meaningful = [term for term in terms if len(term) >= 4 and term.casefold() not in QUESTION_STOPWORDS]
        if meaningful:
            return meaningful[:8], False
    return terms, True


def search_expression(query: str) -> str:
    terms, all_required = _query_terms(query)
    return (" AND " if all_required else " OR ").join(f'"{term}"' for term in terms)


def search_announcements(session, query: str, course_id: int | None = None,
                         semester_id: int | None = None, limit: int = 50) -> list[dict]:
    terms, all_required = _query_terms(query)
    if not terms:
        return []
    conditions = [or_(Announcement.title.contains(term, autoescape=True),
                      Announcement.body.contains(term, autoescape=True)) for term in terms]
    matches = and_(*conditions) if all_required else or_(*conditions)
    statement = (select(Announcement, Course, Semester)
                 .join(Course, Course.id == Announcement.course_id)
                 .outerjoin(Semester, Semester.id == Course.semester_id)
                 .where(matches))
    if course_id is not None:
        statement = statement.where(Course.id == course_id)
    if semester_id is not None:
        statement = statement.where(Course.semester_id == semester_id)
    rows = session.execute(statement.order_by(Announcement.created_at.desc())
                           .limit(min(max(limit, 1), 100))).all()
    found = []
    for item, course, semester in rows:
        body = " ".join(item.body.split())
        first = min((body.casefold().find(term.casefold()) for term in terms
                     if body.casefold().find(term.casefold()) >= 0), default=0)
        excerpt = body[max(0, first - 55):first + 130] if body else item.title
        found.append({"id": item.id, "title": item.title, "course_id": course.id,
                      "course_name": course.name,
                      "semester_name": semester.name if semester else None,
                      "excerpt": excerpt, "url": safe_external_url(item.url)})
    return found


def search_documents(session, query: str, course_id: int | None = None,
                     semester_id: int | None = None, limit: int = 50) -> list[dict]:
    expression = search_expression(query)
    if not expression:
        return []
    maximum = min(max(limit, 1), 100)
    rows = session.execute(text("""
        SELECT r.id AS resource_id, r.name AS filename, r.removed_upstream,
               v.id AS version_id, v.version, t.page_number, c.id AS course_id,
               c.name AS course_name, s.name AS semester_name,
               snippet(resource_texts_fts, 0, '【', '】', '…', 18) AS excerpt
        FROM resource_texts_fts
        JOIN resource_texts AS t ON t.id = resource_texts_fts.rowid
        JOIN resource_versions AS v ON v.id = t.version_id
        JOIN resources AS r ON r.id = v.resource_id
        JOIN courses AS c ON c.id = r.course_id
        LEFT JOIN semesters AS s ON s.id = c.semester_id
        WHERE resource_texts_fts MATCH :expression
          AND (:course_id IS NULL OR c.id = :course_id)
          AND (:semester_id IS NULL OR s.id = :semester_id)
        ORDER BY bm25(resource_texts_fts), v.downloaded_at DESC
        LIMIT :limit
    """), {"expression": expression, "course_id": course_id,
           "semester_id": semester_id, "limit": maximum}).mappings().all()
    content_hits = [dict(row) for row in rows]

    # Moodle display titles need not occur inside the file. Title lookup also
    # works before extraction/OCR, without modifying files or the FTS index.
    title = func.lower(Resource.name)
    for original, replacement in (("ä", "ae"), ("Ä", "ae"), ("ö", "oe"), ("Ö", "oe"),
                                  ("ü", "ue"), ("Ü", "ue"), ("ß", "ss"), ("ẞ", "ss")):
        title = func.replace(title, original, replacement)
    terms, all_required = _query_terms(query)
    folded = [unicodedata.normalize("NFC", term).casefold().translate(GERMAN_TRANSLATION) for term in terms]
    conditions = [title.contains(term, autoescape=True) for term in folded]
    latest = (select(func.max(ResourceVersion.version)).where(ResourceVersion.resource_id == Resource.id)
              .correlate(Resource).scalar_subquery())
    statement = (select(Resource, ResourceVersion, Course, Semester)
                 .join(ResourceVersion, and_(ResourceVersion.resource_id == Resource.id, ResourceVersion.version == latest))
                 .join(Course, Course.id == Resource.course_id)
                 .outerjoin(Semester, Semester.id == Course.semester_id)
                 .where(and_(*conditions) if all_required else or_(*conditions)))
    if course_id is not None:
        statement = statement.where(Course.id == course_id)
    if semester_id is not None:
        statement = statement.where(Course.semester_id == semester_id)
    matches = session.execute(statement.order_by(ResourceVersion.downloaded_at.desc(), Resource.id)
                              .limit(maximum)).all()
    title_hits = []
    for resource, version, course, semester in matches:
        matching_pages = [hit for hit in content_hits if hit["version_id"] == version.id]
        if matching_pages:
            title_hits.extend(matching_pages)
        else:
            title_hits.append({"resource_id": resource.id, "filename": resource.name,
                               "removed_upstream": resource.removed_upstream,
                               "version_id": version.id, "version": version.version, "page_number": 1,
                               "course_id": course.id, "course_name": course.name,
                               "semester_name": semester.name if semester else None, "excerpt": resource.name})
    promoted_versions = {hit["version_id"] for hit in title_hits}
    return (title_hits + [hit for hit in content_hits if hit["version_id"] not in promoted_versions])[:maximum]


def search_annotations(session, query: str, course_id: int | None = None,
                       semester_id: int | None = None, limit: int = 50) -> list[dict]:
    expression = search_expression(query)
    if not expression:
        return []
    rows = session.execute(text("""
        SELECT a.id, a.kind, a.resolved, a.resource_id, r.name AS resource_name,
               a.source_version_id AS version_id, a.source_page AS page_number,
               c.id AS course_id, c.name AS course_name, s.name AS semester_name,
               snippet(material_annotations_fts, -1, '【', '】', '…', 18) AS excerpt
        FROM material_annotations_fts
        JOIN material_annotations AS a ON a.rowid = material_annotations_fts.rowid
        JOIN resources AS r ON r.id = a.resource_id
        JOIN courses AS c ON c.id = r.course_id
        LEFT JOIN semesters AS s ON s.id = c.semester_id
        WHERE material_annotations_fts MATCH :expression
          AND (:course_id IS NULL OR c.id = :course_id)
          AND (:semester_id IS NULL OR s.id = :semester_id)
        ORDER BY bm25(material_annotations_fts), a.updated_at DESC
        LIMIT :limit
    """), {"expression": expression, "course_id": course_id,
           "semester_id": semester_id, "limit": min(max(limit, 1), 100)}).mappings().all()
    return [dict(row) for row in rows]


def search_course_notes(session, query: str, course_id: int | None = None,
                        semester_id: int | None = None, limit: int = 50) -> list[dict]:
    expression = search_expression(query)
    if not expression:
        return []
    rows = session.execute(text("""
        SELECT c.id AS course_id, c.name AS course_name, s.name AS semester_name,
               snippet(course_scratchpads_fts, 0, '【', '】', '…', 18) AS excerpt
        FROM course_scratchpads_fts
        JOIN course_scratchpads AS n ON n.course_id = course_scratchpads_fts.rowid
        JOIN courses AS c ON c.id = n.course_id
        LEFT JOIN semesters AS s ON s.id = c.semester_id
        WHERE course_scratchpads_fts MATCH :expression
          AND (:course_id IS NULL OR c.id = :course_id)
          AND (:semester_id IS NULL OR s.id = :semester_id)
        ORDER BY bm25(course_scratchpads_fts), n.updated_at DESC
        LIMIT :limit
    """), {"expression": expression, "course_id": course_id,
           "semester_id": semester_id, "limit": min(max(limit, 1), 100)}).mappings().all()
    return [dict(row) for row in rows]
