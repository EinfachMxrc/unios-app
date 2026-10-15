# SPDX-License-Identifier: AGPL-3.0-or-later

import pytest
from sqlalchemy import text

from app.db.models import (
    Course,
    MaterialAnnotation,
    Note,
    Resource,
    ResourceVersion,
    Semester,
)
from app.search.query import parse
from app.search.repository import structured


def test_search_operators_are_strict():
    query = parse('rekursion course:"Programmieren 1" type:note semester:1 before:2027-02-01')
    assert query.text == "rekursion" and query.course == "Programmieren 1"
    for invalid in ('course:"offen', 'type:secret', 'has:token', 'before:no', 'type:note type:clip', 'foo:bar'):
        with pytest.raises(ValueError):
            parse(invalid)


def test_filters_precede_limit_and_allow_browsing(factory):
    with factory() as session:
        session.execute(text("CREATE VIRTUAL TABLE notes_fts USING fts5(note_id UNINDEXED,title,body)"))
        semester = Semester(name="Semester 1")
        session.add(semester)
        session.flush()
        course = Course(source="fixture", source_id="search", name="Programmieren 1", semester_id=semester.id)
        session.add(course)
        session.flush()
        # Many newer irrelevant hits must not hide an older filtered result.
        for index in range(65):
            note = Note(id=str(index), course_id=course.id, title="Rekursion", current_revision=1)
            session.add(note)
            session.execute(text("INSERT INTO notes_fts VALUES (:id,'Rekursion','rekursion basis')"), {"id": str(index)})
        session.flush()
        session.execute(text("UPDATE notes SET updated_at='2025-01-01' WHERE id='0'"))
        found = structured(session, parse('rekursion type:note course:"Programmieren 1" before:2026-01-01'))
        assert [row['id'] for row in found['note_results']] == ['0']
        assert not found['results']
        browse = structured(session, parse('type:note semester:1'))
        assert len(browse['note_results']) == 50
        assert not structured(session, parse('type:note course:"Unbekannt"'))['note_results']


def test_uuid_annotations_use_the_integer_fts_rowid(factory):
    with factory() as session:
        session.execute(text("CREATE VIRTUAL TABLE IF NOT EXISTS material_annotations_fts USING fts5(quote, comment, content='material_annotations', content_rowid='rowid')"))
        course = Course(source="fixture", source_id="fts-uuid", name="Fach")
        session.add(course); session.flush()
        resource = Resource(course_id=course.id, source="fixture", source_key="fts", name="Skript.pdf", kind="file", url="https://example.invalid/fixture.pdf")
        session.add(resource); session.flush()
        version = ResourceVersion(resource_id=resource.id, version=1, sha256="a" * 64, relative_path="uni/fixture.pdf", size=10, mime_type="application/pdf")
        session.add(version); session.flush()
        session.add(MaterialAnnotation(id="fictional-uuid", resource_id=resource.id, source_version_id=version.id,
                                       kind="question", quote="Schleifen", comment="Nuancenfrage", source_page=1))
        session.flush()
        session.execute(text("INSERT INTO material_annotations_fts(material_annotations_fts) VALUES ('rebuild')"))
        result = structured(session, parse("Nuancenfrage type:annotation"))
        assert result["annotation_results"][0]["id"] == "fictional-uuid"
        assert "Nuancenfrage" in result["annotation_results"][0]["excerpt"]
