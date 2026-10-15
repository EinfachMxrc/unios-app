# SPDX-License-Identifier: AGPL-3.0-or-later

"""Every /api and /calendar.ics request needs a paired-device session.

The owner's own browser on 127.0.0.1/localhost auto-pairs without any UI;
every other device needs a one-time pairing code from ``unios pair``. Agent
and MCP routes keep their own token checks and are exempt from this gate.
"""

import json
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.main import create_app
from app.session_api import is_local_loopback_request, is_session_exempt
from app.sessions import SessionStore


def _auth_app(settings, coordinator, **overrides):
    configured = settings.model_copy(update={"api_auth_required": True, **overrides})
    return configured, create_app(configured, connectors=[], start_scheduler=False, coordinator=coordinator)


def test_missing_cookie_is_rejected_on_get_and_post(settings, factory, coordinator):
    _, app = _auth_app(settings, coordinator)
    with TestClient(app) as client:
        response = client.get("/api/overview")
        assert response.status_code == 401
        assert response.json()["detail"] == "Gerät nicht gekoppelt"
        assert client.post("/api/jots").status_code == 401


def test_native_mcp_bridge_migrates_legacy_device_cookie(settings, factory, coordinator):
    configured, app = _auth_app(settings, coordinator, server_mode=True, mcp_enabled=True, mcp_token="fixture-mcp-token")
    token = SessionStore(configured.local_dir).create_session("Erfundenes Altgerät")
    with TestClient(app, cookies={"keystone_session": token}) as client:
        response = client.get("/api/ai/mcp/ping", headers={"X-UniOS-MCP-Device": "1"})
        assert response.status_code == 200
        assert "unios_session=" in response.headers.get("set-cookie", "")


def test_local_browser_auto_pairs_and_receives_a_session_cookie(settings, factory, coordinator):
    _, app = _auth_app(settings, coordinator)
    with TestClient(app, base_url="http://127.0.0.1", client=("127.0.0.1", 50000)) as client:
        response = client.get("/api/overview")
        assert response.status_code == 200
        cookie_header = response.headers.get("set-cookie", "")
        assert "unios_session=" in cookie_header
        assert "httponly" in cookie_header.lower()
        assert "samesite=strict" in cookie_header.lower()
        assert "path=/" in cookie_header.lower()
        # The cookie the client now holds must work without pairing again.
        assert client.get("/api/overview").status_code == 200


def test_paired_mutation_requires_current_host_generation(settings, factory, coordinator):
    _, app = _auth_app(settings, coordinator)
    with TestClient(app, base_url="http://127.0.0.1", client=("127.0.0.1", 50000)) as client:
        generation = client.get("/api/host").json()["generation"]
        missing = client.post("/api/jots", json={})
        assert missing.status_code == 409
        assert missing.json()["detail"].startswith("STALE_HOST")
        stale = client.post("/api/jots", json={}, headers={"X-UniOS-Lease-Generation": str(generation - 1)})
        assert stale.status_code == 409
        current = client.post("/api/jots", json={}, headers={"X-UniOS-Lease-Generation": str(generation)})
        assert current.status_code == 422


def test_forwarded_headers_or_tailnet_host_do_not_auto_pair(settings, factory, coordinator):
    _, app = _auth_app(settings, coordinator,
                       allowed_hosts=settings.allowed_hosts + ",geraet.tailnet.ts.net")
    with TestClient(app, base_url="http://127.0.0.1", client=("127.0.0.1", 50000)) as client:
        assert client.get("/api/overview", headers={"X-Forwarded-For": "100.1.2.3"}).status_code == 401
    with TestClient(app, base_url="http://127.0.0.1", client=("127.0.0.1", 50000)) as client:
        assert client.get("/api/overview", headers={"Tailscale-User-Login": "marc@example.ts.net"}).status_code == 401
    with TestClient(app, base_url="http://geraet.tailnet.ts.net", client=("127.0.0.1", 50000)) as client:
        assert client.get("/api/overview").status_code == 401


def test_auto_pair_predicate_directly():
    class FakeClient:
        def __init__(self, host):
            self.host = host

    class FakeRequest:
        def __init__(self, host_header, client_host, headers=None):
            self.headers = {"host": host_header, **(headers or {})}
            self.client = FakeClient(client_host) if client_host else None

    assert is_local_loopback_request(FakeRequest("127.0.0.1:8000", "127.0.0.1"))
    assert is_local_loopback_request(FakeRequest("localhost", "::1"))
    assert not is_local_loopback_request(FakeRequest("geraet.tailnet.ts.net", "127.0.0.1"))
    assert not is_local_loopback_request(FakeRequest("127.0.0.1", "100.1.2.3"))
    assert not is_local_loopback_request(FakeRequest("127.0.0.1", "127.0.0.1", {"forwarded": "for=1.2.3.4"}))
    assert not is_local_loopback_request(FakeRequest("127.0.0.1", None))


def test_exempt_path_predicate_covers_agent_and_mcp_but_not_state_or_audit():
    assert is_session_exempt("/health")
    assert is_session_exempt("/api/session/pair")
    assert is_session_exempt("/api/anki/agent/approved")
    assert is_session_exempt("/api/ai/mcp/courses")
    assert is_session_exempt("/api/ai/mcp/cards")
    assert not is_session_exempt("/api/ai/mcp/state")
    assert not is_session_exempt("/api/ai/mcp/audit")
    assert not is_session_exempt("/api/overview")
    assert not is_session_exempt("/api/session/devices")


def test_pairing_code_grants_a_session_and_cannot_be_reused(settings, factory, coordinator):
    configured, app = _auth_app(settings, coordinator)
    store = SessionStore(configured.local_dir)
    code = store.create_pairing_code()
    with TestClient(app) as client:
        response = client.get(f"/api/session/pair?code={code}", follow_redirects=False)
        assert response.status_code == 303
        assert response.headers["location"] == "/"
        assert "unios_session=" in response.headers.get("set-cookie", "")
        reused = client.get(f"/api/session/pair?code={code}", follow_redirects=False)
        assert reused.status_code == 401


def test_expired_pairing_code_is_rejected(settings, factory, coordinator):
    configured, app = _auth_app(settings, coordinator)
    store = SessionStore(configured.local_dir)
    code = store.create_pairing_code()
    code_id = code.split(".", 1)[0]
    path = configured.local_dir / "sessions.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    data["pairing_codes"][code_id]["expires_at"] = (datetime.now(UTC) - timedelta(seconds=1)).isoformat()
    path.write_text(json.dumps(data), encoding="utf-8")
    with TestClient(app) as client:
        response = client.get(f"/api/session/pair?code={code}", follow_redirects=False)
        assert response.status_code == 401


def test_five_wrong_attempts_lock_the_pairing_code(settings, factory, coordinator):
    configured, app = _auth_app(settings, coordinator)
    store = SessionStore(configured.local_dir)
    code = store.create_pairing_code()
    code_id = code.split(".", 1)[0]
    wrong = f"{code_id}.not-the-real-secret-value"
    with TestClient(app) as client:
        for _ in range(5):
            assert client.get(f"/api/session/pair?code={wrong}", follow_redirects=False).status_code == 401
        # Even the correct code is now locked out.
        response = client.get(f"/api/session/pair?code={code}", follow_redirects=False)
        assert response.status_code == 401


def test_revoked_session_is_rejected(settings, factory, coordinator):
    configured, app = _auth_app(settings, coordinator)
    store = SessionStore(configured.local_dir)
    token = store.create_session("Testgerät")
    with TestClient(app, cookies={"unios_session": token}) as client:
        assert client.get("/api/overview").status_code == 200
        session_id = store.list_sessions()[0]["id"]
        assert store.revoke_session(session_id) is True
        assert client.get("/api/overview").status_code == 401


def test_legacy_keystone_cookie_still_authenticates_and_is_migrated(settings, factory, coordinator):
    """A device paired before the app's rename from Keystone to UniOS keeps working.

    It authenticates via the old cookie name and is silently moved onto the
    new one on its very next request, without needing to pair again.
    """
    configured, app = _auth_app(settings, coordinator)
    store = SessionStore(configured.local_dir)
    token = store.create_session("Altes Gerät")
    with TestClient(app, cookies={"keystone_session": token}) as client:
        response = client.get("/api/overview")
        assert response.status_code == 200
        cookie_header = response.headers.get("set-cookie", "")
        assert "unios_session=" in cookie_header
        assert token in cookie_header
        # The client's cookie jar now also holds the new cookie; a follow-up
        # request works even if the legacy cookie is dropped afterwards.
        client.cookies.delete("keystone_session")
        assert client.get("/api/overview").status_code == 200


def test_calendar_ics_accepts_its_own_token_but_not_a_wrong_one(settings, factory, coordinator):
    configured, app = _auth_app(settings, coordinator)
    store = SessionStore(configured.local_dir)
    token = store.ensure_ical_token()
    with TestClient(app) as client:
        assert client.get(f"/calendar.ics?token={token}").status_code == 200
        assert client.get("/calendar.ics?token=wrong-value").status_code == 401
        assert client.get("/calendar.ics").status_code == 401


def test_exempt_routes_work_without_any_session(settings, factory, coordinator):
    _, app = _auth_app(settings, coordinator, anki_agent_token="fixture-agent-token")
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        response = client.get("/api/anki/agent/approved",
                              headers={"X-Anki-Agent-Token": "fixture-agent-token"})
        assert response.status_code == 200


def test_session_file_stores_only_token_hashes(settings, factory, coordinator):
    configured, _ = _auth_app(settings, coordinator)
    store = SessionStore(configured.local_dir)
    token = store.create_session("Testgerät")
    raw_content = store.path.read_text(encoding="utf-8")
    assert token not in raw_content
    assert "token_hash" in raw_content
