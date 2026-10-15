# SPDX-License-Identifier: AGPL-3.0-or-later

"""The mycampus import reads events, news and documents with GET only and stays on the portal."""

from datetime import UTC, datetime
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.db.models import CalendarEvent, CampusItem
from app.portals.campus_import import (
    MAX_PAGES,
    CampusImportError,
    ImportReport,
    collect,
    list_programs,
    load_program_choice,
    run_import,
    save_program_choice,
    store,
)
from app.portals.read_client import PortalLoginRequired, PortalReadError

FIXTURES = Path(__file__).parent / "fixtures" / "mycampus"
BASE = "https://mycampus.example.edu"


def html(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


class FakePortal:
    """Serves invented pages by address and remembers every request."""

    def __init__(self, pages: dict[str, str], files: dict[str, bytes] | None = None) -> None:
        self.pages = pages
        self.files = files if files is not None else {}
        self.requested: list[str] = []
        self.downloaded: list[str] = []

    def get_file(self, target: str, max_bytes: int = 0) -> bytes:
        self.downloaded.append(target)
        if target not in self.files:
            raise PortalReadError("nicht gefunden")
        return self.files[target]

    def get_page(self, target: str | None = None) -> tuple[str, str]:
        url = target or BASE + "/"
        self.requested.append(url)
        if url not in self.pages:
            raise PortalReadError("nicht gefunden")
        return self.pages[url], url


def site() -> dict[str, str]:
    subpage = "<html><body><main><h1>Unterseite</h1><p>Text</p></main></body></html>"
    return {
        f"{BASE}/": html("home.html"),
        f"{BASE}/de?page=1": html("home.html"),
        f"{BASE}/de?page=2": html("home.html"),
        f"{BASE}/de/mein-studiengang": html("program.html"),
        f"{BASE}/de/alle-studiengaenge": html("programs.html"),
        f"{BASE}/de/fakultaeten": subpage,
        f"{BASE}/de/service": subpage,
        f"{BASE}/de/studiengang/informatik": html("program.html"),
        f"{BASE}/de/studiengang/informatik/studienverlauf": subpage,
        f"{BASE}/de/studiengang/informatik/pruefungen": subpage,
    }


def kinds(factory) -> dict[str, int]:
    with factory() as session:
        return dict(session.execute(select(CampusItem.kind, func.count()).group_by(CampusItem.kind)).all())


def test_program_choice_is_kept_on_this_device(tmp_path):
    assert load_program_choice(tmp_path) is None
    save_program_choice(tmp_path, "Bachelor Informatik", f"{BASE}/de/studiengang/informatik")
    assert load_program_choice(tmp_path) == {"name": "Bachelor Informatik", "url": f"{BASE}/de/studiengang/informatik"}
    (tmp_path / "campus.json").write_text("kaputt", encoding="utf-8")
    assert load_program_choice(tmp_path) is None


def test_programmes_come_from_the_all_programmes_page():
    portal = FakePortal(site())
    programs = list_programs(portal, BASE + "/", sleep=lambda _seconds: None)
    assert "Bachelor Informatik" in [program.name for program in programs]
    assert len(programs) == 9
    assert f"{BASE}/de/alle-studiengaenge" in portal.requested


def test_import_stores_events_news_and_documents_and_puts_events_in_the_calendar(factory, settings, tmp_path):
    save_program_choice(tmp_path, "Bachelor Informatik", f"{BASE}/de/studiengang/informatik")
    report = run_import(factory, FakePortal(site()), BASE + "/", settings.timezone, tmp_path,
                        sleep=lambda _seconds: None)
    assert kinds(factory) == {"event": 2, "news": 1, "document": 4, "page": 3}
    assert (report.events, report.news, report.documents) == (2, 1, 4)
    assert report.new_items == 10 and report.pages >= 8
    with factory() as session:
        events = session.scalars(select(CalendarEvent).where(CalendarEvent.source == "mycampus")).all()
        assert sorted(event.title for event in events) == [
            "AnCommen 2026 am Campus Design", "Erstsemestertage MINT, Gesundheit, Wirtschaft"]
        document = session.scalar(select(CampusItem).where(CampusItem.title == "Stundenplan"))
        assert document.file_label == "PDF | 74.02 KB"
        assert document.category == "Stundenplan"
        assert document.study_program == "Bachelor Informatik"
        assert document.url.endswith("/sites/default/files/stundenplan.pdf")


def test_a_second_import_adds_nothing_new_but_refreshes_what_it_saw(factory, settings, tmp_path):
    portal = FakePortal(site())
    run_import(factory, portal, BASE + "/", settings.timezone, tmp_path, sleep=lambda _seconds: None)
    with factory() as session:
        first_seen = session.scalar(select(CampusItem.last_seen_at).order_by(CampusItem.id).limit(1))
    again = run_import(factory, FakePortal(site()), BASE + "/", settings.timezone, tmp_path, sleep=lambda _seconds: None)
    assert again.new_items == 0
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(CampusItem)) == 7
        assert session.scalar(select(func.count()).select_from(CalendarEvent).where(CalendarEvent.source == "mycampus")) == 2
        assert session.scalar(select(CampusItem.last_seen_at).order_by(CampusItem.id).limit(1)) >= first_seen


def test_the_import_never_opens_sign_out_or_foreign_pages(factory, settings, tmp_path):
    portal = FakePortal(site())
    run_import(factory, portal, BASE + "/", settings.timezone, tmp_path, sleep=lambda _seconds: None)
    assert not [url for url in portal.requested if "logout" in url or "extern.example.com" in url]
    assert all(url.startswith(BASE) for url in portal.requested)


def test_pages_that_cannot_be_read_are_reported_but_do_not_stop_the_import(factory, settings, tmp_path):
    pages = site()
    del pages[f"{BASE}/de/service"]
    report = run_import(factory, FakePortal(pages), BASE + "/", settings.timezone, tmp_path, sleep=lambda _seconds: None)
    assert report.skipped >= 1 and report.warnings
    assert kinds(factory)["event"] == 2


def test_an_expired_sign_in_stops_with_a_clear_message(factory, settings, tmp_path):
    class Expired:
        def get_page(self, target=None):
            raise PortalLoginRequired("Hochschul-Login erforderlich")

    with pytest.raises(CampusImportError, match="abgelaufen"):
        run_import(factory, Expired(), BASE + "/", settings.timezone, tmp_path, sleep=lambda _seconds: None)


def test_a_restricted_link_does_not_claim_the_whole_login_expired(factory, settings, tmp_path):
    class RestrictedPortal(FakePortal):
        def get_page(self, target=None):
            if target == BASE + "/de/service":
                raise PortalLoginRequired("Hochschul-Login erforderlich")
            return super().get_page(target)

    portal = RestrictedPortal(site())
    report = run_import(factory, portal, BASE + "/", settings.timezone, tmp_path, sleep=lambda _seconds: None)
    assert report.skipped >= 1 and report.warnings
    assert kinds(factory)["event"] == 2
    assert portal.requested.count(BASE + "/") >= 2


def test_login_expiring_mid_import_still_stops_the_import(factory, settings, tmp_path):
    class ExpiringPortal(FakePortal):
        expired = False

        def get_page(self, target=None):
            if target == BASE + "/de/service":
                self.expired = True
            if self.expired:
                raise PortalLoginRequired("Hochschul-Login erforderlich")
            return super().get_page(target)

    with pytest.raises(CampusImportError, match="abgelaufen"):
        run_import(factory, ExpiringPortal(site()), BASE + "/", settings.timezone, tmp_path, sleep=lambda _seconds: None)


def test_the_number_of_pages_is_limited(factory, settings, tmp_path):
    many = "<html><body><nav aria-label='Hauptnavigation'><ul>" + "".join(
        f"<li><a href='/de/bereich-{index}'>Bereich {index}</a></li>" for index in range(200)) + "</ul></nav><main><h1>x</h1></main></body></html>"
    pages = {f"{BASE}/": many, **{f"{BASE}/de/bereich-{index}": "<html><body><main><h1>y</h1></main></body></html>" for index in range(200)}}
    portal = FakePortal(pages)
    report = run_import(factory, portal, BASE + "/", settings.timezone, tmp_path, sleep=lambda _seconds: None)
    assert report.pages <= MAX_PAGES and len(portal.requested) <= MAX_PAGES + 1


def test_programme_import_reaches_nested_pages_and_later_pager_links(settings):
    root = f"{BASE}/de/studiengang/informatik"
    pages = {
        f"{BASE}/": f'<main><a href="{root}">Mein Studiengang</a></main>',
        root: '<main><h1>Informatik</h1><a href="/de/studiengang/informatik/module">Module</a></main>',
        root + "/module": '<main><h1>Module</h1><a href="/de/studiengang/informatik/module/semester-1">Semester 1</a></main>',
        root + "/module/semester-1": '''<main><h1>Semester 1</h1><h2>Dokumente</h2><article>
            <h3><a href="/files/modulhandbuch.pdf">Modulhandbuch</a></h3>
            <span>PDF | 1 MB</span></article></main>''',
        f"{BASE}/news": '<main><div class="pager"><a href="?page=1">2</a></div></main>',
        f"{BASE}/news?page=1": '<main><div class="pager"><a href="?page=2">3</a></div></main>',
        f"{BASE}/news?page=2": '<main><h2>News</h2><article><h3>Semesterstart</h3></article></main>',
    }
    pages[f"{BASE}/"] = '<nav><a href="/news">News</a></nav>' + pages[f"{BASE}/"]
    portal = FakePortal(pages)
    report = ImportReport()
    cards = collect(portal, BASE + "/", settings.timezone,
                    {"name": "Bachelor Informatik", "url": root}, report, sleep=lambda _seconds: None)
    assert root + "/module/semester-1" in portal.requested
    assert f"{BASE}/news?page=2" in portal.requested
    assert {(card.kind, card.title) for card, _ in cards if card.kind != "page"} == {
        ("document", "Modulhandbuch"), ("news", "Semesterstart")}
    assert {card.title for card, _ in cards if card.kind == "page"} == {"Informatik", "Module", "Semester 1"}


def test_store_removes_comment_form_entries_an_older_import_mistook_for_events(factory):
    when = datetime(2026, 10, 2, 6, 30, tzinfo=UTC)
    with factory() as session:
        session.add_all([
            CalendarEvent(source="mycampus", source_key="junk", title="Neuen Kommentar hinzufügen", starts_at=when),
            CampusItem(source_key="junk", kind="event", title="Neuen Kommentar hinzufügen", first_seen_at=when),
            CalendarEvent(source="mycampus", source_key="real", title="Ersti-Stadtrallye", starts_at=when),
            CalendarEvent(source="moodle", source_key="own", title="Neuen Kommentar hinzufügen", starts_at=when),
        ])
        session.commit()
    store(factory, [], ImportReport())
    with factory() as session:
        events = {(item.source, item.title) for item in session.scalars(select(CalendarEvent)).all()}
        items = session.scalars(select(CampusItem)).all()
    assert events == {("mycampus", "Ersti-Stadtrallye"), ("moodle", "Neuen Kommentar hinzufügen")}
    assert items == []
