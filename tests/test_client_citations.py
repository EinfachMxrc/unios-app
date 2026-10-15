# SPDX-License-Identifier: AGPL-3.0-or-later
"""Old-server citation reads use only authenticated APIs and invented notes."""

import asyncio
from uuid import UUID

import httpx
import pytest
from fastapi.testclient import TestClient

from app.client.api import create_client_app
from app.client.service import ServerConnection


def client_for(tmp_path, monkeypatch, respond):
    monkeypatch.setattr(ServerConnection, "credentials",
                        lambda self: ("https://example.invalid/unios", "fictional-token"))
    app = create_client_app(tmp_path, tmp_path / "ui", transport=httpx.MockTransport(respond))
    return TestClient(app, base_url="http://127.0.0.1:8000")


def summary(index):
    return {"id": str(UUID(int=index)), "title": f"Synthetic note {index}",
            "course_name": "Synthetic course", "current_revision": 1}


def detail(index, body):
    return {"note": summary(index), "selected_revision": 2, "body": body}


@pytest.mark.parametrize("status", [200, 401, 403, 500])
def test_existing_route_is_forwarded_without_compatibility_reads(tmp_path, monkeypatch, status):
    seen = []

    def respond(request):
        seen.append(request.url.path)
        return httpx.Response(status, json={"citations": []})

    with client_for(tmp_path, monkeypatch, respond) as client:
        assert client.get("/api/material/7/citations").status_code == status
    assert seen == ["/unios/api/material/7/citations"]


def test_missing_route_reads_current_and_old_sources_and_not_title_matches(tmp_path, monkeypatch):
    seen = []

    def respond(request):
        assert request.method == "GET"
        assert request.headers["cookie"] == "unios_session=fictional-token"
        seen.append(request.url.path)
        if request.url.path.endswith("/citations"):
            return httpx.Response(404)
        if request.url.path.endswith("/material/7"):
            return httpx.Response(200, json={"versions": [{"id": 7}, {"id": 6}]})
        if request.url.path.endswith("/notes"):
            assert "q" not in request.url.params
            return httpx.Response(200, json={"notes": [summary(i) for i in [1, 2, 3]],
                                           "page": {"has_more": False}})
        index = UUID(request.url.path.rsplit("/", 1)[1]).int
        bodies = {1: "[p](/material/7?page=4) [p](/material/7?page=2) [p](/material/7?page=4)",
                  2: "[old](/material/6?page=9)", 3: "[plain](/material/7) [invalid](/material/7?page=0)"}
        return httpx.Response(200, json=detail(index, bodies[index]))

    with client_for(tmp_path, monkeypatch, respond) as client:
        response = client.get("/api/material/7/citations")
    assert response.status_code == 200
    rows = response.json()["citations"]
    assert [row["note_id"] for row in rows] == [summary(1)["id"], summary(2)["id"]]
    assert rows[0]["pages"] == [2, 4] and rows[0]["revision"] == 2
    assert rows[0]["current_version"] is True and rows[1]["current_version"] is False
    assert rows[1]["pages"] == [9]
    assert len(seen) == 6


@pytest.mark.parametrize("status", [401, 403, 404, 500])
def test_material_errors_are_not_reported_as_empty_citations(tmp_path, monkeypatch, status):
    def respond(request):
        return httpx.Response(404 if request.url.path.endswith("/citations") else status)

    with client_for(tmp_path, monkeypatch, respond) as client:
        assert client.get("/api/material/7/citations").status_code == status


@pytest.mark.parametrize("malformed", [[], {"versions": []}, {"versions": [{"id": "7"}]}])
def test_invalid_material_data_fails_visibly(tmp_path, monkeypatch, malformed):
    def respond(request):
        return httpx.Response(404) if request.url.path.endswith("/citations") else httpx.Response(200, json=malformed)

    with client_for(tmp_path, monkeypatch, respond) as client:
        assert client.get("/api/material/7/citations").status_code == 502


@pytest.mark.parametrize("all_full", [False, True])
def test_paginated_scan_skips_deleted_notes_and_never_hides_a_truncated_scan(tmp_path, monkeypatch, all_full):
    offsets = []

    def respond(request):
        path = request.url.path
        if path.endswith("/citations"):
            return httpx.Response(404)
        if path.endswith("/material/7"):
            return httpx.Response(200, json={"versions": [{"id": 7}]})
        if path.endswith("/notes"):
            offset = int(request.url.params["offset"])
            offsets.append(offset)
            indices = range(offset + 1, offset + 101) if offset == 0 or all_full else [101]
            return httpx.Response(200, json={"notes": [summary(i) for i in indices],
                                           "page": {"has_more": offset == 0 or all_full}})
        index = UUID(path.rsplit("/", 1)[1]).int
        if index == 1:
            return httpx.Response(404)
        quote = "[p](/material/7?page=3)" if index == 101 and not all_full else "No quote"
        return httpx.Response(200, json=detail(index, quote))

    with client_for(tmp_path, monkeypatch, respond) as client:
        response = client.get("/api/material/7/citations")
    assert offsets == [0, 100]
    assert response.status_code == (503 if all_full else 200)
    if not all_full:
        assert response.json()["citations"][0]["note_id"] == summary(101)["id"]


def test_timeout_stays_retryable(tmp_path, monkeypatch):
    monkeypatch.setattr("app.client.citations.TIMEOUT_SECONDS", .01)

    async def respond(request):
        if request.url.path.endswith("/citations"):
            return httpx.Response(404)
        await asyncio.sleep(.05)
        return httpx.Response(200, json={"versions": [{"id": 7}]})

    with client_for(tmp_path, monkeypatch, respond) as client:
        assert client.get("/api/material/7/citations").status_code == 503
