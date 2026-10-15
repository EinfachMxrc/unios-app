# SPDX-License-Identifier: AGPL-3.0-or-later

"""FTS and structural predicates run before limits, on the same database snapshot."""

from sqlalchemy import select, text

from app.db.models import Course, Semester
from app.extract.search import search_expression
from app.search.query import SearchQuery

# SQL identifiers are fixed here, never taken from a query string.
SPECS = {
    "note": ("note_results", "notes n", "n", "notes_fts", "note_id", "n.updated_at",
             "n.id,n.title,n.current_revision AS revision", "n.title", "1=1"),
    "annotation": ("annotation_results", "material_annotations a JOIN resources r ON r.id=a.resource_id",
                   "a", "material_annotations_fts", "rowid", "a.updated_at",
                   ("a.id,a.kind,a.resolved,a.resource_id,r.name AS resource_name,"
                    "a.source_version_id AS version_id,a.source_page AS page_number"), "a.comment",
                   "r.group_category!='other_group'"),
    "document": ("results", "resources r JOIN resource_versions v ON v.resource_id=r.id", "r",
                 "resource_texts_fts", "rowid", "v.downloaded_at",
                 ("r.id AS resource_id,r.name AS filename,r.removed_upstream,v.id AS version_id,"
                  "v.version,1 AS page_number"), "r.name",
                 "r.group_category!='other_group' AND v.version=(SELECT max(x.version) FROM resource_versions x WHERE x.resource_id=r.id)"),
    "jot": ("jot_results", "jots j", "j", "jots_fts", "jot_id", "j.created_at",
            "j.id,j.kind,j.note_id,j.created_at", "j.body", "1=1"),
    "clip": ("clip_results", "inbox_clips i", "i", "inbox_clips_fts", "clip_id", "i.created_at",
             "i.id,i.kind,i.title,i.url", "i.body", "i.filed=1"),
    "course_note": ("course_note_results", "course_scratchpads n", "n", "course_scratchpads_fts",
                    "rowid", "n.updated_at", "c.id AS course_id", "n.body", "1=1"),
    "announcement": ("announcement_results", "announcements a", "a", "", "", "a.created_at",
                     "a.id,a.title,a.url", "a.body", "1=1"),
}


def structured(session, query: SearchQuery, course_id=None, semester_id=None) -> dict:
    result: dict[str, list[dict]] = {spec[0]: [] for spec in SPECS.values()}
    if query.course is not None:
        courses = session.scalars(select(Course)).all()
        ids = [row.id for row in courses if row.name.casefold() == query.course.casefold()]
        if len(ids) != 1 or course_id is not None and course_id != ids[0]:
            return result
        course_id = ids[0]
    if query.semester is not None:
        semesters = session.scalars(select(Semester)).all()
        ids = [row.id for row in semesters if str(row.id) == query.semester or row.name.casefold() == query.semester.casefold()]
        if len(ids) != 1 or semester_id is not None and semester_id != ids[0]:
            return result
        semester_id = ids[0]
    kind = query.kind
    if kind is not None:
        kind = {"material": "document", "resource": "document", "question": "annotation"}.get(kind, kind)
    expression = search_expression(query.text)
    for name, spec in SPECS.items():
        if kind and kind != name or query.questions and name not in {"document", "annotation"}:
            continue
        output, joins, alias, fts, key, timestamp, fields, excerpt, predicate = spec
        course_alias = "r" if name == "annotation" else alias
        clauses = [predicate, "(:course_id IS NULL OR c.id=:course_id)",
                   "(:semester_id IS NULL OR c.semester_id=:semester_id)"]
        parameters = {"course_id": course_id, "semester_id": semester_id,
                      "expression": expression, "before": query.before.isoformat() if query.before else None}
        if query.before:
            clauses.append(f"{timestamp} < :before")
        if query.questions or query.kind == "question":
            clauses.append("a.kind='question' AND a.resolved=0" if name == "annotation" else
                           "EXISTS(SELECT 1 FROM material_annotations a WHERE a.resource_id=r.id AND a.kind='question' AND a.resolved=0)")
        if expression:
            if name == "document":
                matched = ("FROM resource_texts_fts JOIN resource_texts rt ON rt.id=resource_texts_fts.rowid "
                           "WHERE resource_texts_fts MATCH :expression AND rt.version_id=v.id")
                fields = fields.replace("1 AS page_number", f"coalesce((SELECT min(rt.page_number) {matched}),1) AS page_number")
                excerpt = f"coalesce((SELECT snippet(resource_texts_fts,0,'【','】','…',18) {matched} ORDER BY rt.page_number LIMIT 1),r.name)"
                clauses.append("(v.id IN (SELECT rt.version_id FROM resource_texts_fts "
                               "JOIN resource_texts rt ON rt.id=resource_texts_fts.rowid "
                               "WHERE resource_texts_fts MATCH :expression AND rt.version_id=v.id) "
                               "OR r.name LIKE :title ESCAPE '\\')")
                parameters["title"] = "%" + query.text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            elif fts:
                entity_key = (f"{alias}.course_id" if name == "course_note" else
                              f"{alias}.rowid" if name == "annotation" else f"{alias}.id")
                clauses.append(f"{entity_key} IN (SELECT {key} FROM {fts} WHERE {fts} MATCH :expression)")
                excerpt = f"coalesce((SELECT snippet({fts},-1,'【','】','…',18) FROM {fts} WHERE {fts} MATCH :expression AND {key}={entity_key}),{excerpt})"
            else:
                clauses.append("(a.title LIKE :title ESCAPE '\\' OR a.body LIKE :title ESCAPE '\\')")
                parameters["title"] = "%" + query.text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        sql = f"SELECT {fields},c.id AS course_id,c.name AS course_name,s.name AS semester_name,substr({excerpt},1,350) AS excerpt FROM {joins} LEFT JOIN courses c ON c.id={course_alias}.course_id LEFT JOIN semesters s ON s.id=c.semester_id WHERE {' AND '.join(clauses)} ORDER BY {timestamp} DESC LIMIT 50"
        result[output] = [dict(row) for row in session.execute(text(sql), parameters).mappings()]
    return result
