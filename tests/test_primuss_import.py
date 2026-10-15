# SPDX-License-Identifier: AGPL-3.0-or-later
import pytest

from app.portals.primuss_import import RenderedPage, collect_primuss, read_link
from app.portals.read_client import PortalReadError

BASE = "https://portal.example.edu"


def test_failed_entry_is_not_reported_as_successful_import():
    class Reader:
        entry_url = BASE

        def get_page(self, _address):
            raise PortalReadError("Portal ist nicht erreichbar")

    with pytest.raises(PortalReadError, match="nicht erreichbar"):
        collect_primuss(Reader(), BASE, sleep=lambda _: None)


def test_read_links_reject_actions_and_other_hosts():
    assert read_link("Notenübersicht", BASE + "/results?mode=view", BASE)
    assert not read_link("Prüfungsanmeldung", BASE + "/registration", BASE)
    assert not read_link("Noten anzeigen", BASE + "/results?action=submit", BASE)
    assert not read_link("Dokument", "https://other.example.edu/a.pdf", BASE)
    assert not read_link("Rückmeldung", BASE + "/payment", BASE)
    assert not read_link("Dokument löschen", BASE + "/a.pdf", BASE)


def test_nested_pages_and_files_without_forms_or_session_links():
    class Reader:
        entry_url = BASE + "/"
        def __init__(self):
            self.visited = []
        def get_page(self, address):
            self.visited.append(address)
            pages = {
                BASE + "/": '<main><h1>Studium</h1><a href="/grades?session=secret">Notenübersicht</a><a href="/register">Prüfungsanmeldung</a></main>',
                BASE + "/grades?session=secret": '<main><h1>Leistungen</h1><p>Modul Alpha: 2,0</p><form><input value="hidden-secret"></form><a href="/record.pdf">Bescheinigung</a></main>',
            }
            return pages[address], address
        def get_file(self, target, max_bytes):
            assert target == BASE + "/record.pdf"
            return b"%PDF-fixture"
    reader = Reader()
    report, resources, payloads = collect_primuss(reader, BASE, sleep=lambda _: None)
    assert report.pages == 2 and report.documents == 1
    assert not any("register" in item for item in reader.visited)
    assert all("secret" not in item.url for item in resources)
    assert b"hidden-secret" not in b"".join(payloads.values())
    assert b"Modul Alpha: 2,0" in b"".join(payloads.values())


def test_embedded_navigation_and_rendered_same_url_sections():
    class Reader:
        entry_url = BASE + "/index?Session=secret"

        def get_page(self, address):
            assert address == BASE + "/menu"
            return '<main><h1>Nachrichten</h1><a href="/letter.pdf">Bescheid</a></main>', address

        def get_file(self, target, max_bytes):
            assert target == BASE + "/letter.pdf"
            return b"%PDF-fixture"

    pages = [
        RenderedPage(Reader.entry_url, '<body>Studium<iframe src="/menu"></iframe></body>', "Übersicht"),
        RenderedPage(Reader.entry_url, '<main>Leistungsübersicht Modul Alpha</main>', "Meine Prüfungen"),
    ]
    report, resources, payloads = collect_primuss(Reader(), BASE, sleep=lambda _: None, rendered=pages)
    assert report.pages == 3 and report.documents == 1
    assert len({resource.key for resource in resources}) == len(resources)
    assert all("secret" not in resource.url for resource in resources)
    assert b"Leistungs" in b"".join(payloads.values())


def test_dynamic_menu_is_reported_as_partial_without_rendered_pages():
    class Reader:
        entry_url = BASE + "/"

        def get_page(self, address):
            return '<body>Studium<a href="javascript:menu(1)">Meine Prüfungen</a></body>', address

    report, _, _ = collect_primuss(Reader(), BASE, sleep=lambda _: None)
    assert report.partial and report.pages == 1
