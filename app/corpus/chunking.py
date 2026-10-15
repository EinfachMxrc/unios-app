# SPDX-License-Identifier: AGPL-3.0-or-later
"""Deterministic section/page chunks; primary text is never replaced by summaries."""

import json
import re
from bisect import bisect_left
from dataclasses import dataclass
from hashlib import sha256

ALGORITHM = 'sections-v1'


def digest(value: str) -> str:
    return sha256(value.encode('utf-8')).hexdigest()


@dataclass(frozen=True)
class Chunk:
    page: int
    heading: str
    body: str
    content_hash: str
    position: int


def _flush(parts, page, heading, result):
    value = '\n'.join(parts).strip()
    for offset in range(0, len(value), 2400):
        body = value[offset:offset + 2400]
        result.append(Chunk(page, heading[:300], body, digest(body), len(result)))
    parts.clear()


def chunks(pages: list[tuple[int, str]], title: str, bookmarks=None, structure=None) -> tuple[list[Chunk], list[dict]]:
    result: list[Chunk] = []
    outline: list[dict] = []
    heading = title
    structures = {entry['page']: entry for entry in structure or []}
    for page, source in pages:
        first_position, first_heading = len(result), len(outline)
        source = source.replace('\r\n', '\n').replace('\r', '\n')
        parts: list[str] = []
        if structure:
            entry = structures[page]
            outline.append({**entry, 'position': len(result)})
            _flush([source], page, entry['title'], result)
            continue

        for line in source.splitlines():
            match = re.match(r'^#{1,6}\s+(.+?)\s*#*$', line)
            if match:
                _flush(parts, page, heading, result)
                heading = match[1].strip()
                outline.append({'title': heading[:300], 'level': len(line) - len(line.lstrip('#')),
                                'page': page, 'position': len(result), 'origin': 'markdown_heading'})
            parts.append(line)
        _flush(parts, page, heading, result)
        if first_heading == len(outline) and first_position < len(result):
            outline.append({'title': f'Seite {page}', 'level': 1, 'page': page,
                            'position': first_position, 'origin': 'page_boundary'})
    if not result:
        result.append(Chunk(1, title[:300], title, digest(title), 0))
        outline.append({'title': title[:300], 'level': 1, 'page': 1, 'position': 0, 'origin': 'metadata_only'})
    if bookmarks:
        # Native PDF bookmarks override synthetic page headings, never invent sections.
        page_numbers = [c.page for c in result]
        outline = [{'title': name[:300], 'level': level, 'page': page,
                    'position': bisect_left(page_numbers, page),
                    'origin': 'pdf_bookmark'} for level, name, page in bookmarks]
    stack: list[int] = []
    ends = [len(result)] * len(outline)
    for index, entry in enumerate(outline):
        while stack and outline[stack[-1]]['level'] >= entry['level']:
            ends[stack.pop()] = entry['position']
        stack.append(index)
    for index, entry in enumerate(outline):
        end = ends[index]
        entry['end_position'] = end
        entry['end_page'] = result[end - 1].page if entry['position'] < end else entry['page']
        entry['summary'] = summary(result[entry['position']:min(end, entry['position'] + 8)])[:360]
        entry['derived'] = True
        entry['model_version'] = 'extractive-v1'
    return result, outline


def content_hash(values: list[Chunk], outline: list[dict]) -> str:
    return digest(json.dumps([ALGORITHM, [(x.page, x.heading, x.content_hash) for x in values], outline],
                             ensure_ascii=False, separators=(',', ':')))


def summary(values: list[Chunk]) -> str:
    # Extractive, labelled as derived. No model call or invented course coverage.
    return '\n'.join(dict.fromkeys(f'{value.heading}: {value.body[:220]}' for value in values[:8]))[:1800]
