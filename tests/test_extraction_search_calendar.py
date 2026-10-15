# SPDX-License-Identifier: AGPL-3.0-or-later

from datetime import UTC, datetime

import pymupdf as fitz
from fastapi.testclient import TestClient
from icalendar import Calendar
from sqlalchemy import text

from app.calendar.feed import build_calendar
from app.db.models import (
    CalendarEvent,
    Course,
    CourseScratchpad,
    Deadline,
    Jot,
    MaterialAnnotation,
    Note,
    Resource,
    ResourceText,
    ResourceVersion,
    Semester,
)
from app.extract.search import search_annotations, search_course_notes, search_documents
from app.extract.service import extract, index_version
from app.main import create_app


def test_pdf_pages_are_separate_and_scans_are_marked():
    pdf = fitz.open()
    first = pdf.new_page()
    first.insert_text((72, 72), "Induktion und Beweis")
    pdf.new_page()
    pages = extract(pdf.tobytes(), "Vorlesung.pdf", "application/pdf")
    assert len(pages) == 2
    assert "Induktion" in pages[0].text
    assert pages[0].no_text_layer is False
    assert pages[1].no_text_layer is True
    assert "Seite 2" in pages[1].markdown


def test_index_search_filters_and_quoted_query(factory):
    pdf = fitz.open()
    pdf.new_page().insert_text((72, 72), "Einzigartiges Fachwort Induktion")
    pdf.new_page().insert_text((72, 72), "Rekursionstiefe und Funktionsaufrufe")
    data = pdf.tobytes()
    with factory() as session:
        session.execute(text("CREATE VIRTUAL TABLE resource_texts_fts USING fts5(text, content='resource_texts', content_rowid='id')"))
        session.execute(text("CREATE TRIGGER resource_texts_ai AFTER INSERT ON resource_texts BEGIN INSERT INTO resource_texts_fts(rowid, text) VALUES (new.id, new.text); END"))
        semester = Semester(name="Testsemester", is_current=True)
        session.add(semester)
        session.flush()
        course = Course(source="test", source_id="1", name="Mathe", semester_id=semester.id)
        session.add(course)
        session.flush()
        resource = Resource(source="test", source_key="a", course_id=course.id, kind="file",
                            name="Vorlesung.pdf", url="https://example.invalid/a")
        session.add(resource)
        session.flush()
        version = ResourceVersion(resource_id=resource.id, version=1, sha256="a" * 64,
                                  relative_path="uni/test.pdf", size=len(data), mime_type="application/pdf")
        session.add(version)
        session.flush()
        assert index_version(session, version, data, resource.name) == 2
        session.commit()
        hits = search_documents(session, "Induktion", course_id=course.id, semester_id=semester.id)
        assert len(hits) == 1
        assert hits[0]["page_number"] == 1
        assert "【Induktion】" in hits[0]["excerpt"]
        second_page = search_documents(session, "Rekursionstiefe", course_id=course.id, semester_id=semester.id)
        assert len(second_page) == 1
        assert second_page[0]["page_number"] == 2
        assert "【Rekursionstiefe】" in second_page[0]["excerpt"]
        question = search_documents(session, "Wo steht die Rekursionstiefe bei den Funktionsaufrufen?",
                                    course_id=course.id, semester_id=semester.id)
        assert question and question[0]["page_number"] == 2
        assert search_documents(session, '" OR *', course_id=999) == []
        assert search_documents(session, "Induktion", semester_id=999) == []


def test_material_title_search_handles_umlauts_scans_filters_and_latest_version(factory):
    with factory() as session:
        session.execute(text("CREATE VIRTUAL TABLE resource_texts_fts USING fts5(text, content='resource_texts', content_rowid='id')"))
        session.execute(text("CREATE TRIGGER resource_texts_ai AFTER INSERT ON resource_texts BEGIN INSERT INTO resource_texts_fts(rowid, text) VALUES (new.id, new.text); END"))
        semester = Semester(name="Fictional semester", is_current=True)
        session.add(semester)
        session.flush()
        course = Course(source="test", source_id="title-search", name="Fictional methods", semester_id=semester.id)
        session.add(course)
        session.flush()
        resource = Resource(source="test", source_key="title-search", course_id=course.id, kind="file",
                            name="Methodenkonzept Einfuehrung", url="")
        session.add(resource)
        session.flush()
        first = ResourceVersion(resource_id=resource.id, version=1, sha256="b" * 64,
                                relative_path="uni/scan-v1.pdf", size=1, mime_type="application/pdf")
        current = ResourceVersion(resource_id=resource.id, version=2, sha256="c" * 64,
                                  relative_path="uni/scan-v2.pdf", size=1, mime_type="application/pdf")
        session.add_all([first, current])
        session.commit()
        for query in ["Methodenkonzept Einführung", " methodenkonzept EINFUEHRUNG  ", '"Einführung"']:
            hits = search_documents(session, query, course.id, semester.id)
            assert len(hits) == 1
            assert hits[0]["version_id"] == current.id
            assert hits[0]["page_number"] == 1
        assert search_documents(session, "Methodenkonzept Einführung", course_id=999) == []
        assert search_documents(session, "Methodenkonzept Einführung", semester_id=999) == []
        assert search_documents(session, "Methodenkonzept fehlt") == []
        resource.name = "METHODENKONZEPT EINFÜHRUNG"
        session.add(ResourceText(version_id=current.id, page_number=2, text="Methodenkonzept Einführung",
                                 markdown="Fictional explanation"))
        session.commit()
        hits = search_documents(session, "Methodenkonzept Einführung")
        assert len(hits) == 1 and hits[0]["page_number"] == 2
        assert search_documents(session, "Methodenkonzept Einfuehrung")[0]["version_id"] == current.id
        assert search_documents(session, "OR *", course_id=999) == []


def test_offline_index_contains_study_text_but_no_sensitive_categories(settings, factory, coordinator):
    with factory() as session:
        session.execute(text("CREATE VIRTUAL TABLE notes_fts USING fts5(note_id UNINDEXED, title, body)"))
        semester = Semester(name="Winter", is_current=True)
        session.add(semester)
        session.flush()
        course = Course(source="test", source_id="offline", name="Fiktive Informatik", semester_id=semester.id)
        session.add(course)
        session.flush()
        resource = Resource(source="test", source_key="offline", course_id=course.id,
                            kind="file", name="Skript.pdf", url="")
        session.add(resource)
        session.flush()
        version = ResourceVersion(resource_id=resource.id, version=1, sha256="a" * 64,
                                  relative_path="uni/Skript.pdf", size=1, mime_type="application/pdf")
        session.add(version)
        session.flush()
        session.add(ResourceText(version_id=version.id, page_number=2, text="Rekursionstiefe",
                                 markdown="Rekursionstiefe"))
        session.add(MaterialAnnotation(id="11111111-1111-4111-8111-111111111111", resource_id=resource.id,
                                       source_version_id=version.id, kind="question", quote="Rekursion",
                                       comment="Warum endet sie?", source_page=2))
        session.add(CourseScratchpad(course_id=course.id, body="Tutorium am Freitag"))
        session.add(Note(id="22222222-2222-4222-8222-222222222222", course_id=course.id,
                         title="Frühere Notiz", current_revision=1))
        session.execute(text("INSERT INTO notes_fts(note_id, title, body) VALUES (:id, 'Frühere Notiz', 'Alte Erklärung')"),
                        {"id": "22222222-2222-4222-8222-222222222222"})
        session.add(Jot(id="33333333-3333-4333-8333-333333333333", kind="question",
                        body="Frage zur Induktion", course_id=course.id))
        session.commit()
        course_id = course.id
        version_id = version.id
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        response = client.get("/api/search/offline-index")
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert {item["kind"] for item in items} == {"document", "annotation", "course_note", "note", "jot"}
    assert all(item["course_id"] == course_id and item["semester_name"] == "Winter" for item in items)
    assert next(item for item in items if item["kind"] == "document")["href"] == f"/material/{version_id}?page=2"
    assert {item["kind"]: item["body"] for item in items}["annotation"] == "Rekursion Warum endet sie?"
    assert not any(item["kind"] in {"grade", "mail", "submission"} for item in items)


def test_annotation_and_course_text_search_updates_without_stale_hits(factory):
    with factory() as session:
        semester = Semester(name="Winter", is_current=True)
        session.add(semester)
        session.flush()
        course = Course(source="test", source_id="search-marks", name="Fiktives Fach", semester_id=semester.id)
        session.add(course)
        session.flush()
        resource = Resource(source="test", source_key="search-marks", course_id=course.id,
                            kind="file", name="Skript.pdf", url="")
        session.add(resource)
        session.flush()
        version = ResourceVersion(resource_id=resource.id, version=1, sha256="b" * 64,
                                  relative_path="uni/Skript.pdf", size=1, mime_type="application/pdf")
        session.add(version)
        session.flush()
        annotation = MaterialAnnotation(id="44444444-4444-4444-8444-444444444444", resource_id=resource.id,
                                        source_version_id=version.id, kind="question", quote="Rekursionstiefe",
                                        comment="Warum endet das?", source_page=2)
        session.add(annotation)
        scratchpad = CourseScratchpad(course_id=course.id, body="Tutorium am Freitag")
        session.add(scratchpad)
        session.commit()
        assert search_annotations(session, "Rekursionstiefe")[0]["page_number"] == 2
        assert search_annotations(session, "Warum", course_id=course.id)[0]["id"] == annotation.id
        assert search_annotations(session, "Warum", semester_id=999) == []
        assert search_course_notes(session, "Freitag", semester_id=semester.id)[0]["course_id"] == course.id
        annotation.comment = "Im Tutorium beantwortet"
        scratchpad.body = "Sprechstunde am Montag"
        session.commit()
        assert search_annotations(session, "Warum") == []
        assert search_annotations(session, "beantwortet")[0]["id"] == annotation.id
        assert search_course_notes(session, "Freitag") == []
        assert search_course_notes(session, "Montag")[0]["course_id"] == course.id
        session.delete(annotation)
        session.commit()
        assert search_annotations(session, "beantwortet") == []


def test_ical_feed_contains_deadlines_and_events(factory):
    moment = datetime(2026, 10, 12, 10, tzinfo=UTC)
    with factory() as session:
        session.add(Deadline(source="test", source_key="deadline", title="Abgabe 1", due_at=moment))
        session.add(CalendarEvent(source="test", source_key="event", title="Vorlesung", starts_at=moment))
        session.commit()
        calendar = Calendar.from_ical(build_calendar(session))
    names = [item.get("summary") for item in calendar.walk("VEVENT")]
    assert "Abgabe: Abgabe 1" in names
    assert "Vorlesung" in names
