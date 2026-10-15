# SPDX-License-Identifier: AGPL-3.0-or-later
"""Prepare one source at a time without a writer lock; bounded temporary output."""
import json
from dataclasses import asdict, dataclass, replace
from pathlib import Path
from typing import TYPE_CHECKING

from app.corpus.chunking import chunks, content_hash, summary

if TYPE_CHECKING:
    from app.corpus.repository import Source


@dataclass
class PreparedSource:
    source: 'Source'
    body_hash: str = ''
    outline: str = '[]'
    summary: str = ''
    chunks_path: Path | None = None


def prepare_sources(iterator, folder: Path, guard):
    prepared, total = [], 0
    for index, source in enumerate(iterator):
        guard()
        if source.reuse_ref:
            prepared.append(PreparedSource(source))
            continue
        values, outline = chunks(source.pages, source.title, source.bookmarks, source.structural_outline)
        target = folder / f'{index}.jsonl'
        with target.open('x', encoding='utf-8') as stream:
            for value in values:
                guard()
                line = json.dumps(asdict(value), ensure_ascii=False) + '\n'
                total += len(line.encode('utf-8'))
                if total > 256 * 1024 * 1024:
                    raise ValueError('CORPUS_STAGING_LIMIT')
                stream.write(line)
        prepared.append(PreparedSource(replace(source, pages=[], bookmarks=[], structural_outline=[]),
                                       content_hash(values, outline), json.dumps(outline, ensure_ascii=False), summary(values), target))
    return prepared


def prepared_chunks(item):
    if item.chunks_path is None:
        return
    with item.chunks_path.open(encoding='utf-8') as stream:
        for line in stream:
            yield json.loads(line)
