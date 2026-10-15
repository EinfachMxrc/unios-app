# SPDX-License-Identifier: AGPL-3.0-or-later

"""Stored files keep a path Windows can open, without losing what makes a version unique."""

from datetime import UTC, datetime

from app.files.store import FileStore

NOW = datetime(2026, 9, 29, tzinfo=UTC)


def save(store: FileStore, data: bytes, filename: str, version: int = 1, course: str = "Kurs", section: str = "Teil"):
    return store.save(data, "Semester_1", course, section, filename, version, FileStore.digest(data), NOW,
                      "moodle", "key-1")


def test_short_names_keep_their_usual_form(tmp_path):
    relative = save(FileStore(tmp_path), b"a", "Blatt 1.pdf")
    assert relative.as_posix() == "uni/Semester_1/Kurs/Teil/2026-09-29_Blatt_1_v1_" + relative.name.split("_v1_")[1]
    assert relative.name.endswith(".pdf") and "_v1_" in relative.name


def test_long_names_are_shortened_to_fit_the_path_limit_and_stay_distinct(tmp_path):
    store = FileStore(tmp_path, max_path=250)
    title = "Anleitung zum Anmelden der Bachelorarbeit in PRIMUSS mit sehr vielen zusätzlichen Erläuterungen.pdf"
    course, section = "Grundlagen der Informatik und Programmierung " * 2, "Informationen zu Prüfungsangelegenheiten " * 2
    first = save(store, b"a", title, 1, course, section)
    second = save(store, b"b", title, 2, course, section)
    for relative in (first, second):
        absolute = tmp_path / relative
        assert absolute.is_file() and len(str(absolute)) + 22 <= 250  # room for the temporary file too
        assert relative.name.endswith(".pdf")
    assert first != second and "_v1_" in first.name and "_v2_" in second.name


def test_the_same_long_name_is_found_again_for_the_same_content(tmp_path):
    store = FileStore(tmp_path, max_path=250)
    title = "Ein sehr langer Dateiname " * 6 + ".pdf"
    assert save(store, b"a", title) == save(store, b"a", title)
