# SPDX-License-Identifier: AGPL-3.0-or-later

"""Synthetic OAuth browser flow for the optional loopback MCP gateway."""

import base64
import hashlib
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import httpx
from alembic.config import Config
from sqlalchemy import create_engine, text
from starlette.testclient import TestClient

from alembic import command
from app.config import Settings
from clients.uni_mcp.remote import build_remote_app

ORIGIN = "https://example.ts.net"
PIN = "1234567890123456"
VERIFIER = "a" * 48
CHALLENGE = base64.urlsafe_b64encode(hashlib.sha256(VERIFIER.encode()).digest()).rstrip(b"=").decode()
CALLBACK = "http://127.0.0.1:9999/callback"


def test_container_bind_requires_explicit_server_key(monkeypatch):
    import pytest

    from clients.uni_mcp.remote import gateway_bind_host
    monkeypatch.delenv('UNIOS_SERVER_KEY', raising=False)
    monkeypatch.delenv('UNIOS_MCP_BIND_HOST', raising=False)
    assert gateway_bind_host() == '127.0.0.1'
    monkeypatch.setenv('UNIOS_MCP_BIND_HOST', '0.0.0.0')
    with pytest.raises(ValueError):
        gateway_bind_host()
    monkeypatch.setenv('UNIOS_SERVER_KEY', '/invented/unios.key')
    assert gateway_bind_host() == '0.0.0.0'
    monkeypatch.setenv('UNIOS_MCP_BIND_HOST', '192.0.2.1')
    with pytest.raises(ValueError):
        gateway_bind_host()


def _settings(path: Path) -> Settings:
    return Settings(_env_file=None, local_dir=path, mcp_enabled=True,  # type: ignore[call-arg]  # pydantic-settings runtime option
                    mcp_token="synthetic-secret-" + "x" * 40,
                    remote_mcp_approval_pin=PIN, remote_mcp_public_url=ORIGIN)


def test_remote_oauth_pin_pkce_rotation_and_emergency_stop(tmp_path: Path, monkeypatch) -> None:
    class OfflineHostClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def get(self, _path, **_kwargs):
            raise httpx.ConnectError("Invented offline host")

    # Never let this fixture probe a real locally running UniOS service.
    monkeypatch.setattr("clients.uni_mcp.remote.httpx.AsyncClient",
                        lambda **_kwargs: OfflineHostClient())
    app = build_remote_app(_settings(tmp_path))
    with TestClient(app, base_url=ORIGIN) as client:
        registration = client.post("/register", json={
            "client_name": "Test-Client", "redirect_uris": [CALLBACK],
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"], "token_endpoint_auth_method": "none",
        })
        assert registration.status_code in {200, 201}, registration.text
        client_id = registration.json()["client_id"]

        def start_authorization() -> str:
            response = client.get("/authorize", params={
                "response_type": "code", "client_id": client_id,
                "redirect_uri": CALLBACK, "code_challenge": CHALLENGE,
                "code_challenge_method": "S256", "scope": "mcp",
                "resource": f"{ORIGIN}/mcp", "state": "synthetic-state",
            }, follow_redirects=False)
            assert response.status_code in {302, 303}, response.text
            assert response.headers["location"].startswith(f"{ORIGIN}/approval?ticket=")
            return parse_qs(urlsplit(response.headers["location"]).query)["ticket"][0]

        expired_ticket = start_authorization()
        assert client.get("/approval", params={"ticket": expired_ticket}).status_code == 200
        for _ in range(5):
            denied = client.post("/approval", data={"ticket": expired_ticket, "pin": "0" * 16},
                                 headers={"origin": ORIGIN}, follow_redirects=False)
            assert denied.status_code == 403
        assert client.get("/approval", params={"ticket": expired_ticket}).status_code == 404

        ticket = start_authorization()
        assert client.post("/approval", data={"ticket": ticket, "pin": PIN},
                           follow_redirects=False).status_code == 403  # browser Origin required
        approved = client.post("/approval", data={"ticket": ticket, "pin": PIN},
                               headers={"origin": ORIGIN}, follow_redirects=False)
        assert approved.status_code == 303
        callback = urlsplit(approved.headers["location"])
        assert f"{callback.scheme}://{callback.netloc}{callback.path}" == CALLBACK
        code = parse_qs(callback.query)["code"][0]
        assert parse_qs(callback.query)["state"] == ["synthetic-state"]

        token = client.post("/token", data={
            "grant_type": "authorization_code", "client_id": client_id, "code": code,
            "redirect_uri": CALLBACK, "code_verifier": VERIFIER, "resource": f"{ORIGIN}/mcp",
        })
        assert token.status_code == 200, token.text
        first = token.json()
        assert first["access_token"] and first["refresh_token"]
        assert client.post("/token", data={
            "grant_type": "authorization_code", "client_id": client_id, "code": code,
            "redirect_uri": CALLBACK, "code_verifier": VERIFIER,
        }).status_code == 400

        rotated = client.post("/token", data={
            "grant_type": "refresh_token", "client_id": client_id,
            "refresh_token": first["refresh_token"], "scope": "mcp",
            "resource": f"{ORIGIN}/mcp",
        })
        assert rotated.status_code == 200, rotated.text
        assert rotated.json()["refresh_token"] != first["refresh_token"]
        assert client.post("/token", data={
            "grant_type": "refresh_token", "client_id": client_id,
            "refresh_token": first["refresh_token"],
        }).status_code == 400

        # The private host is intentionally absent: the remote MCP endpoint stays shut.
        assert client.post("/mcp", json={}).status_code == 503

        class FakeHostClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def get(self, _path, **_kwargs):
                class State:
                    def json(self):
                        return {"enabled": True}
                return State()

        monkeypatch.setattr("clients.uni_mcp.remote.httpx.AsyncClient",
                            lambda **_kwargs: FakeHostClient())
        initialize = {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
            "protocolVersion": "2025-03-26", "capabilities": {},
            "clientInfo": {"name": "synthetic-test", "version": "1"},
        }}
        media_headers = {"Accept": "application/json, text/event-stream"}
        unauthenticated = client.post("/mcp", json=initialize, headers=media_headers)
        assert unauthenticated.status_code == 401
        authenticated = client.post("/mcp", json=initialize,
                                    headers={**media_headers,
                                             "Authorization": f"Bearer {rotated.json()['access_token']}"})
        assert authenticated.status_code == 200, authenticated.text
        assert authenticated.json()["result"]["serverInfo"]["name"] == "UniOS"

    raw_db = (tmp_path / "remote-mcp-oauth.sqlite3").read_bytes()
    assert PIN.encode() not in raw_db
    assert first["access_token"].encode() not in raw_db
    assert first["refresh_token"].encode() not in raw_db


def test_mcp_actor_migration_preserves_prior_audit_rows(settings, coordinator) -> None:
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.attributes["settings"] = settings
    config.attributes["host_coordinator"] = coordinator
    command.upgrade(config, "a583f6e2b941")  # pragma: allowlist secret
    engine = create_engine(settings.database_url)
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO ai_tool_access(accessed_at,tool,resource_id,permitted) "
                                "VALUES ('2026-01-01','list_courses',NULL,1)"))
    engine.dispose()
    command.upgrade(config, "head")
    engine = create_engine(settings.database_url)
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT actor FROM ai_tool_access")) == "local"
    engine.dispose()
