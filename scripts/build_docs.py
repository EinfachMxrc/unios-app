"""Build the static UniOS handbook from small Markdown topics and OpenAPI."""

# SPDX-License-Identifier: AGPL-3.0-or-later

from __future__ import annotations

import argparse
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "handbook"
SITE = ROOT / "docs" / "site"
REPO_URL = "https://github.com/EinfachMxrc/unios-app/blob/main/"


def escape(value: str) -> str:
    return html.escape(value, quote=True)


def inline(value: str) -> str:
    value = escape(value)
    value = re.sub(r"\[([^\]]+)\]\((https://[^)]+)\)", r'<a href="\2">\1</a>', value)
    value = re.sub(r"`([^`]+)`", r"<code>\1</code>", value)
    return re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", value)


def slug(value: str) -> str:
    value = value.casefold().translate(str.maketrans("äöüß", "aous"))
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-")


def render_markdown(raw: str) -> tuple[str, list[tuple[str, str]], str]:
    """Render the intentionally small handbook Markdown subset without a build dependency."""
    lines = raw.splitlines()
    out: list[str] = []
    headings: list[tuple[str, str]] = []
    plain: list[str] = []
    paragraph: list[str] = []
    list_kind: str | None = None
    code: list[str] | None = None

    def flush_paragraph() -> None:
        if paragraph:
            out.append(f"<p>{inline(' '.join(paragraph))}</p>")
            paragraph.clear()

    def close_list() -> None:
        nonlocal list_kind
        if list_kind:
            out.append(f"</{list_kind}>")
            list_kind = None

    for line in lines:
        if line.startswith("<!-- SPDX-"):
            continue
        if line.startswith("```"):
            flush_paragraph()
            close_list()
            if code is None:
                code = []
            else:
                out.append(f"<pre><code>{escape(chr(10).join(code))}</code></pre>")
                plain.extend(code)
                code = None
            continue
        if code is not None:
            code.append(line)
            continue
        if not line.strip():
            flush_paragraph()
            close_list()
            continue
        if line.startswith("# "):
            continue
        heading = re.match(r"^(#{2,3}) (.+)$", line)
        if heading:
            flush_paragraph()
            close_list()
            level, label = len(heading.group(1)), heading.group(2)
            anchor = slug(label)
            out.append(f'<h{level} id="{anchor}">{inline(label)}</h{level}>')
            if level == 2:
                headings.append((anchor, label))
            plain.append(label)
            continue
        item = re.match(r"^(-|[0-9]+\.) (.+)$", line)
        if item:
            flush_paragraph()
            kind = "ul" if item.group(1) == "-" else "ol"
            if list_kind != kind:
                close_list()
                out.append(f"<{kind}>")
                list_kind = kind
            out.append(f"<li>{inline(item.group(2))}</li>")
            plain.append(item.group(2))
            continue
        close_list()
        paragraph.append(line.strip())
        plain.append(line.strip())
    flush_paragraph()
    close_list()
    if code is not None:
        raise ValueError("Unclosed code fence")
    return "\n".join(out), headings, " ".join(plain)


def api_groups(schema: dict) -> dict[str, list[tuple[str, str, dict]]]:
    groups: dict[str, list[tuple[str, str, dict]]] = {}
    for path, methods in schema["paths"].items():
        stem = path.split("/")[2] if path.startswith("/api/") else "system"
        group = {
            "courses": "courses", "material": "courses", "notes": "notes", "links": "notes",
            "peek": "notes", "inbox": "intake", "intake": "intake", "jots": "intake",
            "learning": "learning", "analytics": "learning", "anki": "flashcards",
            "ai": "ai", "projects": "organization", "grades": "organization",
            "primuss": "portals", "mycampus": "portals", "connectors": "connectors",
            "host": "operations", "setup": "operations", "session": "operations",
        }.get(stem, "other")
        for method, operation in methods.items():
            if method.lower() in {"get", "post", "put", "patch", "delete"}:
                groups.setdefault(group, []).append((method.upper(), path, operation))
    return groups


def api_content(label: str, operations: list[tuple[str, str, dict]]) -> tuple[str, list[tuple[str, str]], str]:
    rows = []
    terms = []
    for method, path, operation in sorted(operations, key=lambda row: (row[1], row[0])):
        summary = operation.get("summary") or operation.get("operationId", "")
        rows.append(f'<li><span class="http-method method-{method.lower()}">{escape(method)}</span> '
                    f'<code>{escape(path)}</code><span>{escape(summary)}</span></li>')
        terms.append(f"{method} {path} {summary}")
    body = ("<p>Diese Liste wird bei jedem Dokumentations-Build aus "
            '<a href="https://github.com/EinfachMxrc/unios-app/blob/main/frontend/openapi.json">frontend/openapi.json</a> '
            "erzeugt. Das Schema ist der technische Vertrag für Parameter, Antworten und Fehler. "
            "Schreibende Aufrufe benötigen die jeweils dokumentierten Berechtigungen und den aktiven Host.</p>"
            f'<h2 id="operationen">Operationen ({len(rows)})</h2><ul class="api-operations">'
            + "\n".join(rows) + "</ul>")
    return body, [("operationen", "Operationen")], " ".join(terms)


def main(check: bool = False) -> None:
    manifest = json.loads((SOURCE / "navigation.json").read_text(encoding="utf-8"))
    schema = json.loads((ROOT / "frontend" / "openapi.json").read_text(encoding="utf-8"))
    groups = api_groups(schema)
    api_labels = {
        "courses": "Kurse und Material", "notes": "Notizen und Links", "intake": "Eingang",
        "learning": "Lernen", "flashcards": "Karteikarten und Anki", "ai": "KI",
        "organization": "Organisation", "portals": "Hochschulportale",
        "connectors": "Connectoren", "operations": "Host und Einrichtung", "other": "Weitere Endpunkte",
    }
    manifest["developer"].insert(3, {"section": "API-Referenz", "pages": [
        [f"api-{key}", api_labels[key]] for key in api_labels if key in groups
    ]})
    entries: list[dict] = []
    for area, sections in (("user", manifest["user"]), ("developer", manifest["developer"])):
        for section in sections:
            for name, title in section["pages"]:
                source = SOURCE / area / f"{name}.md"
                if name in {f"api-{key}" for key in api_labels}:
                    body, headings, search_text = api_content(title, groups[name[4:]])
                    summary = f"{len(groups[name[4:]])} Endpunkte aus dem aktuellen OpenAPI-Schema."
                else:
                    raw = source.read_text(encoding="utf-8")
                    body, headings, search_text = render_markdown(raw)
                    summary = next((line for line in raw.splitlines() if line and not line.startswith(("#", "<!--"))), "")
                    summary = re.sub(r"\[([^\]]+)\]\(https://[^)]+\)", r"\1", summary)
                    body = re.sub(r"^<p>.*?</p>", "", body, count=1, flags=re.DOTALL)
                entries.append({"area": area, "section": section["section"], "name": name, "title": title,
                                "url": f"{area}/{name}.html", "summary": summary, "body": body,
                                "headings": headings, "search_text": search_text})

    stale: list[Path] = []

    def output(target: Path, content: str) -> None:
        if check:
            if not target.exists() or target.read_text(encoding="utf-8") != content:
                stale.append(target)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")

    for area, overview in (("user", "docs.html"), ("developer", "developers.html")):
        area_entries = [entry for entry in entries if entry["area"] == area]
        for index, entry in enumerate(area_entries):
            previous = area_entries[index - 1] if index else None
            following = area_entries[index + 1] if index + 1 < len(area_entries) else None
            page = render_page(entry, entries, overview, previous, following)
            target = SITE / entry["url"]
            output(target, page)
        output(SITE / overview, render_overview(area, entries, overview))

    search = [{"title": e["title"], "section": e["section"], "area": e["area"],
               "url": e["url"], "summary": e["summary"], "text": e["search_text"]} for e in entries]
    output(SITE / "docs-index.js", "// SPDX-License-Identifier: AGPL-3.0-or-later\n"
           + "window.UNIOS_DOCS_INDEX = " + json.dumps(search, ensure_ascii=False) + ";\n")
    if stale:
        raise SystemExit("Handbook output is stale: " + ", ".join(str(path.relative_to(ROOT)) for path in stale))
    print(f"{'Checked' if check else 'Built'} {len(entries)} handbook topics ({len(groups)} API groups)")


def navigation(area: str, entries: list[dict], overview: str, active: str | None, prefix: str) -> str:
    label = "Hilfe" if area == "user" else "Entwickler"
    sections: list[str] = [f'<a class="sidebar-home{" active" if active is None else ""}" href="{prefix}{overview}"'
                           + (' aria-current="page"' if active is None else '') + f'>◫ Übersicht {label}</a>']
    last = ""
    for entry in entries:
        if entry["area"] != area:
            continue
        if entry["section"] != last:
            last = entry["section"]
            sections.append(f'<p class="sidebar-label">{escape(last)}</p>')
        selected = entry["name"] == active
        sections.append(f'<a href="{prefix}{entry["url"]}"{" class=\"active\" aria-current=\"page\"" if selected else ""}>'
                        f'{escape(entry["title"])}</a>')
    sections.append('<div class="sidebar-bottom"><span class="status-dot" aria-hidden="true"></span> Alpha · lokal betrieben</div>')
    return "\n".join(sections)


def shell(area: str, title: str, content: str, nav: str, prefix: str) -> str:
    current_user = ' class="current"' if area == "user" else ""
    current_dev = ' class="current"' if area == "developer" else ""
    section = "Dokumentation" if area == "user" else "Entwickler"
    return f'''<!doctype html>
<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<html lang="de"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="description" content="{escape(title)} · UniOS Handbuch" /><title>{escape(title)} · UniOS</title>
<link rel="stylesheet" href="{prefix}docs.css" /><script src="{prefix}docs-index.js" defer></script><script src="{prefix}docs.js" defer></script></head>
<body data-docs-root="{prefix}"><a class="skip-link" href="#main">Zum Inhalt springen</a>
<header class="site-header"><div class="header-inner"><a class="brand" href="{prefix}index.html" aria-label="UniOS Projektseite"><span class="brand-mark">U</span><span>UniOS</span></a><span class="brand-divider" aria-hidden="true"></span><span class="brand-section">{section}</span>
<nav class="header-links" aria-label="Bereiche"><a{current_user} href="{prefix}docs.html">Hilfe</a><a{current_dev} href="{prefix}developers.html">Entwickler</a><a href="https://github.com/EinfachMxrc/unios-app">GitHub ↗</a></nav>
<button class="menu-toggle" type="button" aria-controls="docs-nav" aria-expanded="false">Menü</button></div></header>
<div class="docs-layout"><aside class="docs-sidebar" id="docs-nav" aria-label="Dokumentationsnavigation">{nav}</aside>
<main id="main" class="docs-main">{content}</main></div></body></html>'''


def search_box() -> str:
    return '''<div class="search-wrap"><label class="search-box" for="docs-search"><span aria-hidden="true">⌕</span><input id="docs-search" type="search" placeholder="Alle Themen und API-Pfade durchsuchen …" autocomplete="off" aria-controls="search-results" aria-expanded="false" /><kbd>/</kbd></label><div id="search-results" class="search-results" role="region" aria-label="Suchergebnisse" hidden></div></div>'''


def render_page(entry: dict, entries: list[dict], overview: str, previous: dict | None, following: dict | None) -> str:
    area, title = entry["area"], entry["title"]
    nav = navigation(area, entries, overview, entry["name"], "../")
    toc = "".join(f'<a href="#{escape(anchor)}">{escape(label)}</a>' for anchor, label in entry["headings"])
    side = f'<aside class="page-toc" aria-label="Auf dieser Seite"><strong>Auf dieser Seite</strong>{toc}</aside>' if toc else ""
    mobile_toc = f'<nav class="inline-toc" aria-label="Auf dieser Seite"><strong>Auf dieser Seite</strong>{toc}</nav>' if toc else ""
    prevnext = '<nav class="page-pagination" aria-label="Weitere Themen">'
    if previous:
        prevnext += f'<a href="{escape(previous["name"])}.html"><small>← Vorheriges Thema</small><strong>{escape(previous["title"])}</strong></a>'
    if following:
        prevnext += f'<a href="{escape(following["name"])}.html"><small>Nächstes Thema →</small><strong>{escape(following["title"])}</strong></a>'
    prevnext += "</nav>"
    source_path = f"docs/handbook/{area}/{entry['name']}.md"
    source = (f'<a class="source-link" href="{REPO_URL}{source_path}">Quelltext bearbeiten ↗</a>'
              if entry["name"] == "api-referenz" or not entry["name"].startswith("api-") else
              f'<a class="source-link" href="{REPO_URL}frontend/openapi.json">OpenAPI-Schema ↗</a>')
    label = "Hilfe" if area == "user" else "Entwickler"
    content = (f'<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="../{overview}">{label}</a><span>/</span>'
               f'<span>{escape(entry["section"])}</span><span>/</span><span aria-current="page">{escape(title)}</span></nav>'
               + search_box()
               + f'<div class="article-layout"><article class="docs-article"><p class="article-kicker">{escape(entry["section"])}</p>'
               + f'<h1>{escape(title)}</h1><p class="article-lead">{inline(entry["summary"])}</p>'
               + mobile_toc + entry["body"] + f'<div class="article-source">{source}</div>{prevnext}</article>{side}</div>'
               + f'<footer class="docs-footer"><span>UniOS · Alpha-Dokumentation</span><a href="../{"developers.html" if area == "user" else "docs.html"}">{"Entwickler" if area == "user" else "Hilfe"} →</a></footer>')
    return shell(area, title, content, nav, "../")


def render_overview(area: str, entries: list[dict], overview: str) -> str:
    nav = navigation(area, entries, overview, None, "")
    title = "Hilfe für Studierende" if area == "user" else "Für Entwickler"
    intro = ("Vom ersten Start bis zu Kursen, Material, Lernen und sicherem Betrieb. "
             "Diese Seiten beschreiben den aktuellen Alpha-Stand und nennen offene manuelle Prüfungen."
             if area == "user" else
             "Entwicklungsumgebung, Architektur, Schnittstellen und Betrieb mit konkreten Verträgen aus dem Repository.")
    cards = []
    current = ""
    for entry in entries:
        if entry["area"] != area:
            continue
        if entry["section"] != current:
            if current:
                cards.append("</div></section>")
            current = entry["section"]
            cards.append(f'<section class="topic-section"><h2>{escape(current)}</h2><div class="topic-grid">')
        cards.append(f'<a class="topic-card" href="{escape(entry["url"])}"><strong>{escape(entry["title"])}</strong>'
                     f'<span>{inline(entry["summary"])}</span><em>Weiterlesen →</em></a>')
    cards.append("</div></section>")
    content = (f'<div class="eyebrow">UniOS / {"Hilfe" if area == "user" else "Entwickler"}</div>'
               f'<section class="docs-hero"><div><span class="hero-pill">UniOS Handbuch</span><h1>{title}</h1><p>{intro}</p>'
               f'<div class="hero-actions"><a class="primary-link" href="{entries[0]["url"] if area == "user" else "developer/entwicklungsumgebung.html"}">Jetzt beginnen →</a></div></div>'
               '<div class="hero-steps"><div><span>01</span><strong>Thema wählen</strong><small>Schritt für Schritt</small></div><div><span>02</span><strong>Details lesen</strong><small>Mit Quellen aus dem Repo</small></div><div><span>03</span><strong>Weitergehen</strong><small>Verwandte Themen</small></div></div></section>'
               + search_box() + "".join(cards)
               + f'<footer class="docs-footer"><span>UniOS · Alpha-Dokumentation</span><a href="{"developers.html" if area == "user" else "docs.html"}">{"Entwickler" if area == "user" else "Hilfe"} →</a></footer>')
    return shell(area, title, content, nav, "")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail when checked-in HTML differs from sources")
    main(parser.parse_args().check)
