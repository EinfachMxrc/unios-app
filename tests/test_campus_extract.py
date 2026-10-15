# SPDX-License-Identifier: AGPL-3.0-or-later

"""Recognise events, news, documents and study programmes on mycampus-style pages."""

from datetime import UTC, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from app.portals.campus_extract import (
    extract_cards,
    find_navigation,
    find_pagination,
    find_program_links,
    parse_german_datetime,
    section_kind,
)

FIXTURES = Path(__file__).parent / "fixtures" / "mycampus"
BASE = "https://mycampus.example.edu/de"
BERLIN = ZoneInfo("Europe/Berlin")


def page(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def test_german_dates_are_read_in_the_local_timezone():
    assert parse_german_datetime("29. September 2026 - 10:00 Uhr", BERLIN) == datetime(2026, 9, 29, 8, 0, tzinfo=UTC)
    assert parse_german_datetime("02. Oktober 2025 - 15:22 Uhr", BERLIN) == datetime(2025, 10, 2, 13, 22, tzinfo=UTC)
    assert parse_german_datetime("12. März 2026", BERLIN) == datetime(2026, 3, 11, 23, 0, tzinfo=UTC)
    assert parse_german_datetime("kein Datum", BERLIN) is None
    assert parse_german_datetime("31. Februar 2026", BERLIN) is None


@pytest.mark.parametrize(("heading", "kind"), [
    ("Veranstaltungen", "event"), ("Termine", "event"), ("Neuigkeiten", "news"), ("News", "news"),
    ("Aktuelle Meldungen", "news"), ("Dokumente", "document"), ("Downloads", "document"),
    ("Stundenplan", None), ("", None),
])
def test_headings_tell_what_kind_of_cards_follow(heading, kind):
    assert section_kind(heading) == kind


def test_start_page_cards_become_events_and_news_with_dates_and_links():
    cards = extract_cards(page("home.html"), f"{BASE}/", BERLIN)
    events = [card for card in cards if card.kind == "event"]
    news = [card for card in cards if card.kind == "news"]
    assert [card.title for card in events] == [
        "Erstsemestertage MINT, Gesundheit, Wirtschaft", "AnCommen 2026 am Campus Design"]
    assert events[0].starts_at == datetime(2026, 9, 29, 8, 0, tzinfo=UTC)
    assert events[0].url == "https://mycampus.example.edu/de/veranstaltung/erstsemestertage"
    assert events[0].category == "Projekt:ING & Gesunde Hochschule"
    assert events[0].summary == "Ein erfolgreiches Studium beginnt mit einem guten Start."
    assert [card.title for card in news] == ["Interaktive Vortragsreihe: Mein Garten wird KLIMAFIT!"]
    assert news[0].published_at == datetime(2026, 7, 17, 13, 0, tzinfo=UTC)
    assert len({card.key for card in cards}) == len(cards)


def test_document_cards_carry_category_date_size_and_a_download_address():
    documents = [card for card in extract_cards(page("program.html"), f"{BASE}/studiengang/informatik", BERLIN)
                 if card.kind == "document"]
    assert [card.title for card in documents] == [
        "Stundenplan", "Infos für Erstsemester",
        "Anleitung zum Anmelden der Bachelorarbeit in PRIMUSS",
        "Modulhandbuch für Studienanfänger ab 01.10.2025",
    ]
    assert [card.category for card in documents] == [
        "Stundenplan", "Informationen zu Prüfungsangelegenheiten",
        "Informationen zu Prüfungsangelegenheiten", "Modulhandbuch"]
    first = documents[0]
    assert first.url == "https://mycampus.example.edu/sites/default/files/stundenplan.pdf"
    assert first.file_label == "PDF | 74.02 KB"
    assert first.published_at == datetime(2026, 9, 28, 14, 17, tzinfo=UTC)
    assert first.summary == "Stundenplan V 1.0, 28. September 2026"


def test_documents_from_other_hosts_are_not_taken():
    urls = [card.url for card in extract_cards(page("program.html"), f"{BASE}/x", BERLIN)]
    assert not any("extern.example.com" in url for url in urls)


def test_stable_keys_do_not_depend_on_order_or_text_changes():
    first = extract_cards(page("home.html"), f"{BASE}/", BERLIN)
    second = extract_cards(page("home.html").replace("guten Start", "sehr guten Start"), f"{BASE}/", BERLIN)
    assert [card.key for card in first] == [card.key for card in second]


def test_study_programmes_are_listed_by_faculty_and_degree_on_the_same_host_only():
    programs = find_program_links(page("programs.html"), f"{BASE}/alle-studiengaenge")
    names = [program.name for program in programs]
    assert "Bachelor Informatik" in names and "Master Data Science" in names
    assert "Bachelor Externer Kurs" not in names and "Service" not in names
    informatik = next(program for program in programs if program.name == "Bachelor Informatik")
    assert informatik.faculty == "Fakultät Elektrotechnik und Informatik"
    assert informatik.degree == "Bachelor"
    assert informatik.url == "https://mycampus.example.edu/de/studiengang/informatik"
    assert len(programs) == 9


def test_navigation_lists_the_main_entries_of_the_portal_only():
    entries = find_navigation(page("home.html"), f"{BASE}/")
    assert [entry.text for entry in entries] == [
        "Mein Studiengang", "Fakultäten", "Alle Studiengänge", "Interdisziplinäre Angebote", "Service",
        "Studentische Initiativen", "Studierendenvertretung", "Meine Dienste"]
    assert all(entry.url.startswith("https://mycampus.example.edu/") for entry in entries)


def test_pagination_offers_the_further_pages_once():
    pages = find_pagination(page("home.html"), f"{BASE}/")
    assert pages == ["https://mycampus.example.edu/de?page=1", "https://mycampus.example.edu/de?page=2"]


def test_drupal_document_fields_are_individual_cards_inside_a_full_degree_page():
    html = '''<main><article class="node--view-mode-full"><h1>Bachelor Beispiel</h1>
    <h3>Modulhandbuch</h3><div class="field__item"><div class="c-date">28. September 2026 - 16:17 Uhr</div>
    <a href="/media/fictional/download"><div class="document-content">
    <div class="title">Modulhandbuch Beispiel</div><div class="description">Wintersemester</div>
    <div class="filesize">pdf | 74.02 KB</div></div></a></div></article></main>'''
    cards = extract_cards(html, BASE, BERLIN)
    assert len(cards) == 1
    card = cards[0]
    assert card.kind == 'document' and card.title == 'Modulhandbuch Beispiel'
    assert card.category == 'Modulhandbuch' and card.summary == 'Wintersemester'
    assert card.published_at == datetime(2026, 9, 28, 14, 17, tzinfo=UTC)
    from app.portals.campus_import import _file_name

    assert _file_name(card.title, card.url, card.file_label) == 'Modulhandbuch Beispiel.pdf'


def test_main_navigation_is_preferred_over_drupal_account_menu():
    html = '''<nav class="menu--user-menu"><a href="/account">Mein Konto</a></nav>
    <nav class="menu--main"><a href="/courses">Alle Studiengänge</a></nav>'''
    assert [item.text for item in find_navigation(html, BASE)] == ['Alle Studiengänge']


def test_all_drupal_pagers_and_empty_component_indexes_are_followed():
    html = '''<nav class="pager"><a href="?page=,1">2</a><a href="?page=,0">1</a></nav>
    <nav class="pager"><a href="?page=1,0">2</a><a href="?page=,1">2</a></nav>'''
    assert find_pagination(html, BASE) == [BASE + '?page=,1', BASE + '?page=1,0']


def test_comment_form_heading_never_becomes_an_event_title():
    # A Drupal event detail page keeps its real title outside the article; the only
    # heading inside is the comment form's. It must not turn into a second "event".
    detail = """<main><h1>Infoveranstaltung</h1><article class="node node--type-event">
      <time datetime="2026-10-02T06:30:00Z">02.10.2026 08:30</time>
      <section class="comment-section"><form class="comment-form">
        <h2 class="comment-form__title">Neuen Kommentar hinzufügen</h2><textarea></textarea>
      </form></section></article></main>"""
    assert extract_cards(detail, f"{BASE}/termine/infoveranstaltung", BERLIN) == []


def test_real_title_wins_over_a_comment_heading_in_the_same_article():
    listing = """<main><article><h3><a href="/termine/stadtrallye">Ersti-Stadtrallye</a></h3>
      <time datetime="2026-10-02T14:00:00Z">02.10.2026 16:00</time>
      <div class="comments"><h4>Neuen Kommentar hinzufügen</h4></div></article></main>"""
    titles = [card.title for card in extract_cards(listing, f"{BASE}/termine", BERLIN)]
    assert titles == ["Ersti-Stadtrallye"]
