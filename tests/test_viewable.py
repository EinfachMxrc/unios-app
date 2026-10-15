# SPDX-License-Identifier: AGPL-3.0-or-later

"""Which files UniOS shows itself, and never as a type a browser would run."""

import pytest

from app.material.viewable import TEXT, view_for


@pytest.mark.parametrize(("name", "expected"), [
    ("Aufgabe1.py", ("code", TEXT)), ("Main.JAVA", ("code", TEXT)), ("Makefile", ("code", TEXT)),
    ("notizen.log", ("text", TEXT)), ("messwerte.csv", ("table", TEXT)),
    ("Folie.png", ("image", "image/png")), ("Skizze.svg", ("image", "image/svg+xml")),
    ("Vortrag.mp4", ("video", "video/mp4")), ("Aufnahme.m4a", ("audio", "audio/mp4")),
    ("Bericht.docx", ("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")),
    ("Noten.xlsx", ("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")),
])
def test_known_files_open_in_the_viewer(name, expected):
    assert view_for(name) == expected


@pytest.mark.parametrize("name", ["index.html", "skript.pdf", "folien.pptx", "archiv.zip", "programm.exe", "ohne-endung"])
def test_pages_readers_and_unknown_files_are_not_viewer_files(name):
    assert view_for(name) is None


def test_scripts_are_served_as_plain_text():
    for name in ("app.js", "seite.php", "skript.sh", "daten.xml"):
        assert view_for(name) == ("code", TEXT)
