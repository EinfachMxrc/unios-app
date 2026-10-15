# SPDX-License-Identifier: AGPL-3.0-or-later

"""Documents found on mycampus become versioned files in a course of their own."""

import pytest
from sqlalchemy import func, select

from app.db.models import Course, CourseSection, Resource, ResourceVersion
from app.notify.service import Notifier
from app.portals.campus_import import run_import, save_program_choice
from app.sync.engine import SyncEngine
from tests.test_campus_import import BASE, FakePortal, site

FILES = {
    f"{BASE}/sites/default/files/stundenplan.pdf": b"%PDF-1.7 stundenplan",
    f"{BASE}/sites/default/files/infos-erstsemester.pdf": b"%PDF-1.7 infos",
    f"{BASE}/sites/default/files/anleitung-bachelorarbeit.pdf": b"%PDF-1.7 anleitung",
    f"{BASE}/sites/default/files/modulhandbuch-2025.pdf": b"%PDF-1.7 modulhandbuch",
}


@pytest.fixture
def importer(settings, factory, coordinator, tmp_path):
    engine = SyncEngine(factory, settings, [], Notifier(settings, coordinator), coordinator)
    save_program_choice(tmp_path, "Bachelor Informatik", f"{BASE}/de/studiengang/informatik")

    def run(portal):
        return run_import(factory, portal, BASE + "/", settings.timezone, tmp_path, engine=engine,
                          sleep=lambda _seconds: None)

    return run


def resources(factory):
    with factory() as session:
        return session.scalars(select(Resource).where(Resource.source == "mycampus")).all()


def test_documents_are_stored_as_versioned_files_grouped_by_category(importer, factory, settings):
    portal = FakePortal(site(), FILES)
    report = importer(portal)
    assert report.documents == 4 and report.files_stored == 7
    with factory() as session:
        course = session.scalar(select(Course).where(Course.source == "mycampus"))
        assert course.name == "Bachelor Informatik"
        sections = {section.name for section in session.scalars(select(CourseSection).where(CourseSection.course_id == course.id))}
        assert sections == {"Stundenplan", "Informationen zu Prüfungsangelegenheiten", "Modulhandbuch", "Studiengang"}
        versions = session.scalars(select(ResourceVersion)).all()
        assert len(versions) == 7
        pdf_versions = [version for version in versions if version.relative_path.endswith('.pdf')]
        assert len(pdf_versions) == 4
        for version in pdf_versions:
            assert (settings.data_dir / version.relative_path).read_bytes().startswith(b"%PDF")
    assert {resource.name for resource in resources(factory)} >= {"Stundenplan.pdf", "Modulhandbuch für Studienanfänger ab 01.10.2025.pdf"}


def test_a_second_import_does_not_download_unchanged_documents_again(importer, factory):
    importer(FakePortal(site(), FILES))
    again = FakePortal(site(), FILES)
    report = importer(again)
    assert again.downloaded == [] and report.files_stored == 0
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(ResourceVersion)) == 7


def test_a_document_that_cannot_be_downloaded_does_not_stop_the_others(importer, factory):
    files = dict(FILES)
    del files[f"{BASE}/sites/default/files/modulhandbuch-2025.pdf"]
    report = importer(FakePortal(site(), files))
    assert report.files_stored == 6 and report.warnings
    retried = importer(FakePortal(site(), FILES))
    assert retried.files_stored == 1
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(ResourceVersion)) == 7


def test_documents_without_a_chosen_programme_go_into_a_general_course(settings, factory, coordinator, tmp_path):
    engine = SyncEngine(factory, settings, [], Notifier(settings, coordinator), coordinator)
    run_import(factory, FakePortal(site(), FILES), BASE + "/", settings.timezone, tmp_path, engine=engine,
               sleep=lambda _seconds: None)
    with factory() as session:
        names = {course.name for course in session.scalars(select(Course).where(Course.source == "mycampus"))}
    assert names == {"myCampus – Dokumente"}
