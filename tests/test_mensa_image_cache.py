# SPDX-License-Identifier: AGPL-3.0-or-later
"""Public photos are reused without making private API responses cacheable."""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from time import sleep

import httpx
import pytest
from fastapi.testclient import TestClient

from app.client.api import create_client_app
from app.client.service import ServerConnection
from app.main import create_app
from app.mensa.image_cache import MealImageCache


def test_images_expire_and_respect_versioned_urls_and_memory_bounds():
    now = [0.0]
    calls = []
    def fetch(path):
        calls.append(path)
        return b'fixture', 'image/webp'
    cache = MealImageCache(fetch, clock=lambda: now[0], ttl=10, max_bytes=14, max_entries=2)
    assert cache.get('/meals/1.jpg') == cache.get('/meals/1.jpg')
    assert len(calls) == 1
    cache.get('/meals/1.jpg?m=2')
    cache.get('/meals/1.jpg')
    cache.get('/meals/3.jpg')
    assert cache.total_bytes == 14
    cache.get('/meals/1.jpg?m=2')  # The least recently used version was evicted.
    assert len(calls) == 4
    now[0] = 11
    cache.get('/meals/1.jpg?m=2')
    assert len(calls) == 5
    with pytest.raises(ValueError):
        cache.get('https://other.example.invalid/meals/1.jpg')
    assert len(calls) == 5


def test_concurrent_image_requests_fetch_provider_only_once():
    calls = []
    def fetch(path):
        calls.append(path)
        sleep(.02)
        return b'fixture', 'image/png'
    cache = MealImageCache(fetch)
    with ThreadPoolExecutor(max_workers=4) as pool:
        assert list(pool.map(cache.get, ['/meals/1.png'] * 4)) == [(b'fixture', 'image/png')] * 4
    assert len(calls) == 1


@pytest.mark.parametrize('server_mode', [False, True])
def test_only_successful_public_photos_are_browser_cacheable(settings, factory, coordinator, monkeypatch, server_mode):
    from app.mensa import api
    calls = []
    def image(path):
        calls.append(path)
        return b'fixture-image', 'image/png'
    monkeypatch.setattr(api, 'read_image', image)
    configured = settings.model_copy(update={'server_mode': server_mode})
    with TestClient(create_app(configured, connectors=[], start_scheduler=False, coordinator=coordinator)) as client:
        for _ in range(2):
            response = client.get('/api/mensa/image?path=/meals/1.png')
            assert response.status_code == 200 and response.content == b'fixture-image'
            assert response.headers['cache-control'] == 'private, max-age=86400'
        assert calls == ['/meals/1.png']
        assert client.get('/api/courses').headers['cache-control'] == 'private, no-store'
        assert client.get('/api/mensa/image?path=invalid').headers['cache-control'] == 'private, no-store'


def test_native_companion_preserves_photo_cache_but_not_private_or_failed_responses(tmp_path, monkeypatch):
    monkeypatch.setattr(ServerConnection, 'credentials', lambda self: ('https://example.invalid', 'fictional-token'))
    def respond(request):
        if request.url.path == '/api/mensa/image':
            return httpx.Response(200, content=b'fixture', headers={'content-type': 'image/webp'})
        return httpx.Response(401, json={'detail': 'fictional unauthorized'})
    async def scenario():
        app = create_client_app(tmp_path/'home', tmp_path/'ui', transport=httpx.MockTransport(respond))
        async with app.router.lifespan_context(app), httpx.AsyncClient(
            transport=httpx.ASGITransport(app), base_url='http://127.0.0.1:8000',
        ) as client:
            assert (await client.get('/api/mensa/image?path=/meals/1.webp')).headers['cache-control'] == 'private, max-age=86400'
            assert (await client.get('/api/courses')).headers['cache-control'] == 'private, no-store'
    asyncio.run(scenario())
