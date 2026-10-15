# SPDX-License-Identifier: AGPL-3.0-or-later
"""Bounded cache eviction, expiration and independence from returned values."""

from app.corpus.cache import RetrievalCache


def test_cache_limits_expiry_and_copy(monkeypatch):
    clock = [10.0]
    monkeypatch.setattr('app.corpus.cache.monotonic', lambda: clock[0])
    cache = RetrievalCache(ttl=5, entries=2, max_bytes=100)
    cache.put('first', [{'text': 'one'}])
    cache.put('second', [{'text': 'two'}])
    cache.get('first')[0]['text'] = 'altered by caller'
    assert cache.get('first') == [{'text': 'one'}]
    cache.put('third', [{'text': 'three'}])
    assert cache.get('second') is None
    cache.put('oversized', [{'text': 'x' * 101}])
    assert cache.get('oversized') is None
    clock[0] = 16
    assert cache.get('first') is None
    assert cache.get('third') is None
