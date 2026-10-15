# SPDX-License-Identifier: AGPL-3.0-or-later

"""Export saved HTML without visible text, URLs, scripts, or real CSS tokens."""

import argparse
from pathlib import Path

from app.portals.sample import PortalSampleError
from app.portals.sample_export import write_sample_archive


def write_sample(portal: str, html_pages: list[str], output: Path,
                 page_types: list[str] | None = None) -> str:
    repository = Path(__file__).resolve().parents[2]
    return write_sample_archive(portal, html_pages, output, page_types, forbidden_root=repository)


def export_sample(portal: str, sources: list[Path], output: Path) -> str:
    repository = Path(__file__).resolve().parents[2]
    if not sources or len(sources) > 5:
        raise PortalSampleError("Ein bis fünf HTML-Seiten angeben")
    html_pages: list[str] = []
    for source in sources:
        resolved = source.resolve(strict=True)
        if resolved.is_relative_to(repository):
            raise PortalSampleError("Private Eingabeseiten nicht im Projektordner ablegen")
        if not resolved.is_file() or resolved.suffix.lower() not in {".html", ".htm"}:
            raise PortalSampleError("Nur gespeicherte HTML-Dateien verwenden")
        if resolved.stat().st_size > 2_000_000:
            raise PortalSampleError("HTML-Datei ist zu groß")
        html_pages.append(resolved.read_text(encoding="utf-8", errors="replace"))
    return write_sample(portal, html_pages, output)


def main() -> int:
    parser = argparse.ArgumentParser(description="Gespeicherte Portalseiten lokal anonymisieren")
    parser.add_argument("portal", choices=("primuss", "mycampus"))
    parser.add_argument("--input", dest="sources", action="append", required=True, type=Path,
                        help="Selbst gespeicherte HTML-Seite; bis zu fünfmal")
    parser.add_argument("--output", required=True, type=Path,
                        help="Neue ZIP-Datei außerhalb des Projekts")
    args = parser.parse_args()
    try:
        identifier = export_sample(args.portal, args.sources, args.output)
    except OSError:
        print("Export nicht abgeschlossen: Datei konnte nicht gelesen oder geschrieben werden.")
        return 1
    except PortalSampleError as exc:
        print(f"Export nicht abgeschlossen: {exc}")
        return 1
    print(f"Anonymisiertes ZIP erstellt. Alias-ID: {identifier}")
    print("ZIP vor dem Teilen selbst prüfen. CSS-Zuordnung bleibt im System-Schlüsselbund dieses Geräts.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
