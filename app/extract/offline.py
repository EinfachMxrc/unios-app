# SPDX-License-Identifier: AGPL-3.0-or-later

"""Read-only study text for the browser's private offline search index."""

from sqlalchemy import text

from app.files.sidecars import safe_external_url


def offline_search_index(session) -> list[dict]:
    items: list[dict] = []
    sources = (
        ("document", """
            SELECT CAST(t.id AS TEXT) AS id, r.name AS title, t.text AS body,
                   c.id AS course_id, c.name AS course_name, s.id AS semester_id,
                   s.name AS semester_name, t.page_number,
                   '/material/' || v.id || '?page=' || t.page_number AS href
            FROM resource_texts AS t
            JOIN resource_versions AS v ON v.id = t.version_id
            JOIN resources AS r ON r.id = v.resource_id
            JOIN courses AS c ON c.id = r.course_id
            LEFT JOIN semesters AS s ON s.id = c.semester_id
            WHERE t.text != ''
        """),
        ("annotation", """
            SELECT a.id, r.name AS title, a.quote || ' ' || a.comment AS body,
                   c.id AS course_id, c.name AS course_name, s.id AS semester_id,
                   s.name AS semester_name, a.source_page AS page_number,
                   '/material/' || a.source_version_id || '#annotation-' || a.id AS href
            FROM material_annotations AS a
            JOIN resources AS r ON r.id = a.resource_id
            JOIN courses AS c ON c.id = r.course_id
            LEFT JOIN semesters AS s ON s.id = c.semester_id
        """),
        ("announcement", """
            SELECT CAST(a.id AS TEXT) AS id, a.title, a.body,
                   c.id AS course_id, c.name AS course_name, s.id AS semester_id,
                   s.name AS semester_name, NULL AS page_number, a.url AS href
            FROM announcements AS a
            JOIN courses AS c ON c.id = a.course_id
            LEFT JOIN semesters AS s ON s.id = c.semester_id
        """),
        ("course_note", """
            SELECT CAST(n.course_id AS TEXT) AS id, c.name AS title, n.body,
                   c.id AS course_id, c.name AS course_name, s.id AS semester_id,
                   s.name AS semester_name, NULL AS page_number,
                   '/courses/' || c.id AS href
            FROM course_scratchpads AS n
            JOIN courses AS c ON c.id = n.course_id
            LEFT JOIN semesters AS s ON s.id = c.semester_id
            WHERE n.body != ''
        """),
        ("note", """
            SELECT n.id, n.title, f.body,
                   c.id AS course_id, c.name AS course_name, s.id AS semester_id,
                   s.name AS semester_name, NULL AS page_number,
                   '/notes?id=' || n.id AS href
            FROM notes_fts AS f
            JOIN notes AS n ON n.id = f.note_id
            JOIN courses AS c ON c.id = n.course_id
            LEFT JOIN semesters AS s ON s.id = c.semester_id
        """),
        ("jot", """
            SELECT j.id, 'Schnellerfassung' AS title, j.body,
                   c.id AS course_id, c.name AS course_name, s.id AS semester_id,
                   s.name AS semester_name, NULL AS page_number,
                   '/jots#jot-' || j.id AS href
            FROM jots AS j
            LEFT JOIN courses AS c ON c.id = j.course_id
            LEFT JOIN semesters AS s ON s.id = c.semester_id
        """),
        ("clip", """
            SELECT i.id, i.title, i.body || ' ' || COALESCE(i.url, '') AS body,
                   c.id AS course_id, c.name AS course_name, s.id AS semester_id,
                   s.name AS semester_name, NULL AS page_number,
                   '/inbox#clip-' || i.id AS href
            FROM inbox_clips AS i
            LEFT JOIN courses AS c ON c.id = i.course_id
            LEFT JOIN semesters AS s ON s.id = c.semester_id
        """),
    )
    for kind, statement in sources:
        for row in session.execute(text(statement)).mappings():
            item = dict(row)
            if kind == "announcement":
                item["href"] = safe_external_url(item["href"]) or f"/courses/{item['course_id']}"
            items.append({"kind": kind, **item})
    return items
