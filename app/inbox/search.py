# SPDX-License-Identifier: AGPL-3.0-or-later

"""Full-text search over user-captured study clips."""

from sqlalchemy import text

from app.extract.search import search_expression


def search_clips(session, query: str, course_id: int | None = None,
                 semester_id: int | None = None, limit: int = 50) -> list[dict]:
    expression = search_expression(query)
    if not expression:
        return []
    rows = session.execute(text("""
        SELECT i.id, i.kind, i.title, i.url, i.course_id,
               c.name AS course_name, s.name AS semester_name,
               snippet(inbox_clips_fts, 2, '【', '】', '…', 18) AS excerpt
        FROM inbox_clips_fts
        JOIN inbox_clips AS i ON i.id = inbox_clips_fts.clip_id
        LEFT JOIN courses AS c ON c.id = i.course_id
        LEFT JOIN semesters AS s ON s.id = c.semester_id
        WHERE inbox_clips_fts MATCH :expression AND i.filed = 1
          AND (:course_id IS NULL OR c.id = :course_id)
          AND (:semester_id IS NULL OR s.id = :semester_id)
        ORDER BY bm25(inbox_clips_fts), i.created_at DESC
        LIMIT :limit
    """), {"expression": expression, "course_id": course_id,
           "semester_id": semester_id, "limit": min(max(limit, 1), 100)}).mappings().all()
    return [dict(row) for row in rows]
