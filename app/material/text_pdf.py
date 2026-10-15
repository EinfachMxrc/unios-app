# SPDX-License-Identifier: AGPL-3.0-or-later

"""Bounded, offline PDF viewing copies of plain text; originals stay untouched."""

from pathlib import Path
from time import monotonic

import pymupdf

from app.material.errors import MaterialError

MAX_TEXT_BYTES = 1024 * 1024
MAX_TEXT_PAGES = 250


def text_pdf(source: Path) -> bytes:
    with source.open("rb") as stream:
        content = stream.read(MAX_TEXT_BYTES + 1)
    if len(content) > MAX_TEXT_BYTES:
        raise MaterialError("TXT-PDF-Ansicht unterstützt Dateien bis 1 MiB. Das Original ist weiterhin verfügbar.")
    encoding = "utf-16" if content.startswith((b"\xff\xfe", b"\xfe\xff")) else "utf-8-sig"
    try:
        text = content.decode(encoding)
    except UnicodeDecodeError:
        try:
            text = content.decode("cp1252")
        except UnicodeDecodeError as exc:
            raise MaterialError("Zeichenkodierung der TXT-Datei nicht lesbar.") from exc
    if any(ord(character) < 32 and character not in "\n\r\t\f" for character in text):
        raise MaterialError("Die Datei enthält Binärdaten statt lesbarem Text.")
    # Built-in Unicode font: no OS font installation or external converter needed.
    font = pymupdf.Font("cjk")
    deadline = monotonic() + 15
    with pymupdf.open() as pdf:
        writer = None
        line_number = 50
        for logical_line in text.expandtabs(4).splitlines() or [""]:
            remaining = logical_line
            while True:
                if monotonic() > deadline:
                    raise MaterialError("TXT-PDF-Ansicht dauert zu lange. Das Original ist weiterhin verfügbar.")
                if line_number == 50:
                    if len(pdf) >= MAX_TEXT_PAGES:
                        raise MaterialError("TXT-PDF-Ansicht unterstützt höchstens 250 Seiten.")
                    if writer is not None:
                        writer.write_text(pdf[-1])
                    page = pdf.new_page(width=595, height=842)
                    writer = pymupdf.TextWriter(page.rect)
                    line_number = 0
                lower, upper = 0, min(512, len(remaining))
                while lower < upper:
                    middle = (lower + upper + 1) // 2
                    if font.text_length(remaining[:middle], fontsize=11) <= 499:
                        lower = middle
                    else:
                        upper = middle - 1
                end = lower
                if end < len(remaining):
                    space = remaining.rfind(" ", 0, end + 1)
                    if space > 0 and remaining[:space].strip():
                        end = space + 1
                if writer is not None and remaining[:end]:
                    writer.append((48, 58 + line_number * 14.5), remaining[:end], font=font, fontsize=11)
                line_number += 1
                remaining = remaining[end:]
                if not remaining:
                    break
        if writer is not None:
            writer.write_text(pdf[-1])
        pdf.subset_fonts()
        return pdf.tobytes(garbage=4, deflate=True)
