# SPDX-License-Identifier: AGPL-3.0-or-later
"""Bounded, process-local cache of public canteen photos, never user files."""

from collections import OrderedDict
from collections.abc import Callable
from threading import Lock
from time import monotonic

from app.mensa.service import image_path


class MealImageCache:
    def __init__(self, fetch: Callable[[str], tuple[bytes, str]], *,
                 max_bytes: int = 64_000_000, max_entries: int = 128,
                 ttl: float = 86400, clock: Callable[[], float] = monotonic):
        self.fetch = fetch
        self.max_bytes = max_bytes
        self.max_entries = max_entries
        self.ttl = ttl
        self.clock = clock
        self.entries: OrderedDict[str, tuple[bytes, str, float]] = OrderedDict()
        self.total_bytes = 0
        self.lock = Lock()

    def get(self, path: str) -> tuple[bytes, str]:
        if image_path(path) is None:
            raise ValueError("Ungültiges Mensa-Foto")
        # Serialize public-provider reads and coalesce simultaneous requests.
        with self.lock:
            cached = self.entries.get(path)
            if cached and cached[2] > self.clock():
                self.entries.move_to_end(path)
                return cached[0], cached[1]
            if cached:
                self.total_bytes -= len(self.entries.pop(path)[0])
            raw, media_type = self.fetch(path)
            if len(raw) <= self.max_bytes and self.max_entries > 0:
                while self.entries and (self.total_bytes + len(raw) > self.max_bytes
                                        or len(self.entries) >= self.max_entries):
                    self.total_bytes -= len(self.entries.popitem(last=False)[1][0])
                self.entries[path] = (raw, media_type, self.clock() + self.ttl)
                self.total_bytes += len(raw)
            return raw, media_type
