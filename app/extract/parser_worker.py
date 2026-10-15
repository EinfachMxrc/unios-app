# SPDX-License-Identifier: AGPL-3.0-or-later
"""Standalone document parser. No settings, database or network client."""
import json
import sys
from dataclasses import asdict
from pathlib import Path
from zipfile import ZipFile

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


def run(source, filename, mime, output, progress, *, mode='background'):
    from app.extract.process_limits import apply_limits
    apply_limits()
    from app.extract.service import ExtractedPage, extract

    suffix = Path(filename).suffix.lower()
    if suffix in {'.docx', '.pptx'}:
        with ZipFile(source) as archive:
            entries = archive.infolist()
            if len(entries) > 10000 or sum(entry.file_size for entry in entries) > 128 * 1024 * 1024:
                raise ValueError('PARSER_ARCHIVE_LIMIT')
    total_bytes = 0
    with Path(output).open('w', encoding='utf-8') as stream:
        def emit(value):
            nonlocal total_bytes
            line = json.dumps(value, ensure_ascii=False) + '\n'
            total_bytes += len(line.encode('utf-8'))
            if total_bytes > 64 * 1024 * 1024:
                raise ValueError('PARSER_TEXT_LIMIT')
            stream.write(line)

        if suffix == '.pdf' or mime == 'application/pdf':
            import pymupdf
            with pymupdf.open(source) as pdf:
                if mode == 'outline':
                    emit({'bookmarks': [(level, title, page) for level, title, page in pdf.get_toc()[:10000]
                                        if 1 <= level <= 6 and 1 <= page <= len(pdf)]})
                    return
                if mode == 'inline' and len(pdf) >= 80:
                    emit({'deferred': True})
                    return
                if len(pdf) > 10000:
                    raise ValueError('PARSER_PAGE_LIMIT')
                for index, page in enumerate(pdf, 1):
                    value = page.get_text('text', sort=True).strip()
                    emit(asdict(ExtractedPage(index, value, f'## Seite {index}\n\n{value}\n', not bool(value))))
                    Path(progress).write_text(f'{index}/{len(pdf)}', encoding='ascii')
        else:
            path = Path(source)
            if path.stat().st_size > 64 * 1024 * 1024:
                raise ValueError('PARSER_INPUT_LIMIT')
            pages = extract(path.read_bytes(), filename, mime)
            if len(pages) > 10000:
                raise ValueError('PARSER_PAGE_LIMIT')
            for index, page in enumerate(pages, 1):
                emit(asdict(page))
                Path(progress).write_text(f'{index}/{len(pages)}', encoding='ascii')


if __name__ == '__main__':
    try:
        run(*sys.argv[1:6], mode=sys.argv[6])
    except Exception:  # noqa: BLE001 -- never print source content, paths or library diagnostics
        sys.exit(1)
