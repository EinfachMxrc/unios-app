# SPDX-License-Identifier: AGPL-3.0-or-later

"""The Syncthing REST gate must never grant takeover on uncertain status."""

import httpx
import pytest

from app.host.syncthing import folder_sync_status

API_URL = "http://127.0.0.1:8384"
API_KEY = "fixture-api-key"  # pragma: allowlist secret
FOLDER_ID = "fixture-folder"
COMPLETE = {
    "state": "idle", "ignorePatterns": False, "needBytes": 0, "needDeletes": 0,
    "needDirectories": 0, "needFiles": 0, "needSymlinks": 0, "needTotalItems": 0,
    "pullErrors": 0, "receiveOnlyTotalItems": 0,
}


def test_complete_syncthing_folder_uses_local_read_only_endpoint():
    requests = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=COMPLETE)

    status = folder_sync_status(API_URL, API_KEY, FOLDER_ID,
                                transport=httpx.MockTransport(respond))
    assert status.complete is True
    assert len(requests) == 1
    assert requests[0].method == "GET"
    assert str(requests[0].url) == f"{API_URL}/rest/db/status?folder={FOLDER_ID}"
    assert requests[0].headers["X-API-Key"] == API_KEY


@pytest.mark.parametrize(("change", "reason"), [
    ({"state": "scanning"}, "nicht vollständig geprüft"),
    ({"ignorePatterns": True}, "nicht vollständig geprüft"),
    ({"needBytes": 1}, "noch nicht vollständig synchron"),
    ({"needDeletes": 1}, "noch nicht vollständig synchron"),
    ({"needFiles": 1}, "noch nicht vollständig synchron"),
    ({"pullErrors": 1}, "noch nicht vollständig synchron"),
    ({"receiveOnlyTotalItems": 1}, "noch nicht vollständig synchron"),
    ({"needTotalItems": None}, "unvollständig"),
    ({"needBytes": False}, "unvollständig"),
    ({"needFiles": -1}, "unvollständig"),
])
def test_incomplete_or_malformed_folder_is_never_ready(change, reason):
    response = {**COMPLETE, **change}
    status = folder_sync_status(API_URL, API_KEY, FOLDER_ID,
                                transport=httpx.MockTransport(lambda _request: httpx.Response(200, json=response)))
    assert status.complete is False
    assert reason in status.reason


@pytest.mark.parametrize("response", [
    httpx.Response(401, text="fixture-api-key must never appear"),
    httpx.Response(302, headers={"location": "https://example.invalid/collect"}),
    httpx.Response(200, text="not json"),
    httpx.Response(200, json=[]),
])
def test_http_errors_and_redirects_fail_closed_without_leaking_response(response):
    status = folder_sync_status(API_URL, API_KEY, FOLDER_ID,
                                transport=httpx.MockTransport(lambda _request: response))
    assert status.complete is False
    assert API_KEY not in status.reason
    assert "collect" not in status.reason


@pytest.mark.parametrize("url", [
    "http://localhost:8384", "http://192.168.1.2:8384", "https://example.invalid:8384",
    "http://127.0.0.1.evil.invalid:8384", "http://127.0.0.1:8384/other",
    "http://127.0.0.1:8384@evil.invalid:8384", "http://127.0.0.1:8384/?key=x",
])
def test_api_key_is_never_sent_to_non_loopback_or_redirectable_url(url):
    requests = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=COMPLETE)

    status = folder_sync_status(url, API_KEY, FOLDER_ID,
                                transport=httpx.MockTransport(respond))
    assert status.complete is False
    assert requests == []


def test_missing_api_key_or_folder_id_fails_without_request():
    def forbidden(_request: httpx.Request) -> httpx.Response:
        raise AssertionError("No REST request expected")

    transport = httpx.MockTransport(forbidden)
    assert not folder_sync_status(API_URL, "", FOLDER_ID, transport=transport).complete
    assert not folder_sync_status(API_URL, API_KEY, "", transport=transport).complete
