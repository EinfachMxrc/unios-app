# SPDX-License-Identifier: AGPL-3.0-or-later

"""Write anonymised portal pages as a ZIP the user can review and share.

The visible text, URLs, scripts, forms and real CSS names are removed before anything is
written; only the page structure remains. The mapping back to the real CSS names stays in
the device's secure keyring.
"""

import json
from datetime import datetime
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from app.portals.sample import (
    AliasMap,
    PortalSampleError,
    anonymize_html,
    save_alias_map,
)

MAX_SAMPLE_PAGES = 30
PAGE_KINDS = frozenset({
    "start", "exams", "grades", "enrollment", "study_program", "timetable", "events", "news",
    "blog", "menu", "other",
})


def default_sample_directory() -> Path:
    documents = Path.home() / "Documents"
    return (documents if documents.is_dir() else Path.home()) / "UniOS-Beispielseiten"


def write_sample_archive(portal: str, html_pages: list[str], output: Path,
                         page_types: list[str] | None = None,
                         forbidden_root: Path | None = None) -> str:
    destination = output.resolve()
    if forbidden_root is not None and destination.is_relative_to(forbidden_root):
        raise PortalSampleError("Ausgabe muss außerhalb des Projektordners liegen")
    if destination.exists():
        raise PortalSampleError("Ausgabedatei existiert bereits; neuen Namen wählen")
    if not html_pages or len(html_pages) > MAX_SAMPLE_PAGES:
        raise PortalSampleError(f"Ein bis {MAX_SAMPLE_PAGES} HTML-Seiten angeben")
    if page_types is not None and (len(page_types) != len(html_pages)
                                   or any(kind not in PAGE_KINDS for kind in page_types)):
        raise PortalSampleError("Seitenarten sind ungültig")
    mapping = AliasMap(portal=portal)
    pages = [anonymize_html(source, mapping) for source in html_pages]
    save_alias_map(mapping)
    manifest: dict[str, object] = {
        "schema_version": 1, "portal": portal, "selector_alias_map": mapping.map_id,
        "pages": [f"page-{index}.html" for index in range(1, len(pages) + 1)],
    }
    if page_types is not None:
        manifest["page_types"] = page_types
    destination.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(destination, "x", ZIP_DEFLATED) as archive:
        archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        for index, page in enumerate(pages, start=1):
            archive.writestr(f"page-{index}.html", page)
    return mapping.map_id


def new_sample_path(portal: str, directory: Path, now: datetime | None = None) -> Path:
    moment = now or datetime.now().astimezone()
    return directory / f"{portal}-beispiel-{moment:%Y%m%d-%H%M%S}.zip"
