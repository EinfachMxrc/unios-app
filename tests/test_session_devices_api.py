# SPDX-License-Identifier: AGPL-3.0-or-later

"""Pairing-code, device-list and iCal-URL endpoints behind the session API.

These back the dashboard's "Gerät koppeln" button, its paired-device list and
its calendar-subscription link (``docs/BAUAUFTRAG.md`` §24.6).
"""

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.main import create_app
from app.sessions import SessionStore


def _app(settings, coordinator, **overrides):
    configured = settings.model_copy(update={"api_auth_required": False, **overrides})
    return configured, create_app(configured, connectors=[], start_scheduler=False, coordinator=coordinator)


# A Tailscale CGNAT address, not a real device; only used so pairing-code tests
# below have a host the code considers reachable from a second device.
_PAIRABLE_TAILSCALE_IP = "100.64.0.5"


def test_create_pairing_code_returns_code_url_and_future_expiry(settings, factory, coordinator):
    _, app = _app(settings, coordinator, tailscale_ip=_PAIRABLE_TAILSCALE_IP)
    with TestClient(app) as client:
        response = client.post("/api/session/pair-code")
        assert response.status_code == 200
        body = response.json()
        assert body["code"]
        assert body["url"].endswith(f"/api/session/pair?code={body['code']}")
        expires_at = datetime.fromisoformat(body["expires_at"])
        assert expires_at > datetime.now(UTC)


def test_create_pairing_code_without_a_reachable_host_returns_a_clear_error(settings, factory, coordinator):
    """Without Tailscale or public_server_url, a pairing link would be dead on arrival."""
    _, app = _app(settings, coordinator)
    with TestClient(app) as client:
        response = client.post("/api/session/pair-code")
        assert response.status_code == 409
        assert "erreichbar" in response.json()["detail"]


def test_created_pairing_code_can_be_redeemed(settings, factory, coordinator):
    _, app = _app(settings, coordinator, tailscale_ip=_PAIRABLE_TAILSCALE_IP)
    with TestClient(app) as client:
        code = client.post("/api/session/pair-code").json()["code"]
        response = client.get(f"/api/session/pair?code={code}", follow_redirects=False)
        assert response.status_code == 303


def test_list_devices_returns_label_and_timestamps(settings, factory, coordinator):
    configured, app = _app(settings, coordinator)
    store = SessionStore(configured.local_dir)
    store.create_session("Zweitgerät")
    with TestClient(app) as client:
        response = client.get("/api/session/devices")
        assert response.status_code == 200
        devices = response.json()
        assert len(devices) == 1
        assert devices[0]["label"] == "Zweitgerät"
        assert devices[0]["created_at"]
        assert devices[0]["last_seen_at"]
        assert "id" in devices[0]


def test_revoke_device_removes_it_and_404s_for_unknown_id(settings, factory, coordinator):
    configured, app = _app(settings, coordinator)
    store = SessionStore(configured.local_dir)
    store.create_session("Zweitgerät")
    device_id = store.list_sessions()[0]["id"]
    with TestClient(app) as client:
        assert client.delete(f"/api/session/devices/{device_id}").status_code == 200
        assert client.get("/api/session/devices").json() == []
        assert client.delete(f"/api/session/devices/{device_id}").status_code == 404


def test_ical_url_contains_the_stored_token(settings, factory, coordinator):
    configured, app = _app(settings, coordinator)
    store = SessionStore(configured.local_dir)
    with TestClient(app) as client:
        response = client.get("/api/session/ical-url")
        assert response.status_code == 200
        url = response.json()["url"]
        assert url.endswith(f"/calendar.ics?token={store.ensure_ical_token()}")


def test_pairing_code_ttl_matches_configured_lifetime(settings, factory, coordinator):
    from app.sessions import PAIRING_CODE_TTL_SECONDS

    _, app = _app(settings, coordinator, tailscale_ip=_PAIRABLE_TAILSCALE_IP)
    with TestClient(app) as client:
        response = client.post("/api/session/pair-code")
        expires_at = datetime.fromisoformat(response.json()["expires_at"])
        expected = datetime.now(UTC) + timedelta(seconds=PAIRING_CODE_TTL_SECONDS)
        assert abs((expires_at - expected).total_seconds()) < 5


def test_rotating_calendar_link_invalidates_only_the_previous_calendar_token(settings, factory, coordinator):
    configured, app = _app(settings, coordinator)
    store = SessionStore(configured.local_dir)
    device = store.create_session("Erfundenes Gerät")
    previous = store.ensure_ical_token()
    with TestClient(app) as client:
        assert client.post("/api/session/ical-url/rotate", json={"confirmed": False}).status_code == 422
        assert store.verify_ical_token(previous)
        rotated = client.post("/api/session/ical-url/rotate", json={"confirmed": True})
        assert rotated.status_code == 200
        assert rotated.json()["url"] == client.get("/api/session/ical-url").json()["url"]
        assert not store.verify_ical_token(previous)
        assert store.verify_ical_token(store.ensure_ical_token())
        assert store.verify_session(device)
