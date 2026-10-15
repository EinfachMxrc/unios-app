# SPDX-License-Identifier: AGPL-3.0-or-later

"""Read Anki's actual queue from a snapshot, without changing the live scheduler."""

import copy
import threading
import time
from pathlib import Path
from tempfile import TemporaryDirectory

from anki.collection import CardId, Collection

from app.anki.collection import collection_path, snapshot_collection
from app.anki.study_api import _card, _due_ids
from app.config import Settings

_cache: dict[str, tuple[tuple, float, list[dict]]] = {}
_cache_lock = threading.Lock()


def due_cards(settings: Settings) -> list[dict]:
    path = collection_path(settings)
    def stamp():
        return tuple((item.stat().st_mtime_ns, item.stat().st_size) if item.exists() else None
                     for item in (path, Path(str(path) + "-wal")))
    with _cache_lock:
        key = str(path.absolute())
        current = stamp()
        prior = _cache.get(key)
        if prior and prior[0] == current and time.monotonic() - prior[1] < 30:
            return copy.deepcopy(prior[2])
        rows = _read_cards(settings)
        # A concurrent review during the snapshot invalidates it immediately.
        if current == stamp():
            if len(_cache) >= 8:
                _cache.pop(next(iter(_cache)))
            _cache[key] = (current, time.monotonic(), copy.deepcopy(rows))
        return rows


def _read_cards(settings: Settings) -> list[dict]:
    with TemporaryDirectory(prefix="unios-view-cards-") as directory:
        snapshot = Path(directory) / "collection.anki2"
        if not snapshot_collection(settings, snapshot):
            return []
        collection = Collection(str(snapshot))
        try:
            rows = []
            for identifier in _due_ids(collection):
                item = _card(collection, identifier, None)
                note = collection.get_card(CardId(identifier)).note()
                item["course"] = note["Course"] if "Course" in note else None  # noqa: SIM401 - Anki Note is not a dict
                rows.append(item)
            return rows
        finally:
            collection.close()
