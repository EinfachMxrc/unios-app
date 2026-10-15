# SPDX-License-Identifier: AGPL-3.0-or-later
"""Short lived, bounded process cache. Authorization is checked by the caller."""

import json
from collections import OrderedDict
from copy import deepcopy
from threading import Lock
from time import monotonic


class RetrievalCache:
    def __init__(self, ttl=15.0, entries=128, max_bytes=8 * 1024 * 1024):
        self.ttl, self.entries, self.max_bytes = ttl, entries, max_bytes
        self._values = OrderedDict()
        self._bytes = 0
        self._lock = Lock()

    def get(self, key):
        with self._lock:
            item = self._values.get(key)
            if item is None:
                return None
            expires, size, rows = item
            if expires <= monotonic():
                del self._values[key]
                self._bytes -= size
                return None
            self._values.move_to_end(key)
            return deepcopy(rows)

    def put(self, key, rows):
        size = len(json.dumps(rows, ensure_ascii=False).encode())
        if size > min(self.max_bytes, 256 * 1024):
            return
        with self._lock:
            previous = self._values.pop(key, None)
            if previous:
                self._bytes -= previous[1]
            self._values[key] = (monotonic() + self.ttl, size, deepcopy(rows))
            self._bytes += size
            while len(self._values) > self.entries or self._bytes > self.max_bytes:
                _, item = self._values.popitem(last=False)
                self._bytes -= item[1]

    def clear(self):
        with self._lock:
            self._values.clear()
            self._bytes = 0
