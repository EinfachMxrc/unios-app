# SPDX-License-Identifier: AGPL-3.0-or-later

"""Device-session auth gate for the local API: cookie checks, auto-pairing the
owner's own browser, and the pairing/device-management endpoints.

Used both by the session-auth middleware in ``app.main`` and by ``unios pair``
(``app.cli.main``), so the exempt-path list and the pairing URL cannot drift
apart between the two callers.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Literal
from urllib.parse import quote, urlsplit

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from starlette.responses import Response

from app.config import RemoteAddressNotConfigured, Settings
from app.security import extract_hostname
from app.sessions import PAIRING_CODE_TTL_SECONDS, SESSION_MAX_AGE_SECONDS, SessionStore

SESSION_COOKIE_NAME = "unios_session"
# Read for backward compatibility so devices paired before the app was
# renamed from Keystone to UniOS stay logged in; ``set_session_cookie``
# always writes the new name, so this legacy cookie is migrated away on the
# device's next request (see ``require_paired_session`` in ``app.main``).
LEGACY_SESSION_COOKIE_NAME = "keystone_session"

_MCP_TOKEN_PATH_PREFIX = "/api/ai/mcp/"
_MCP_TOKEN_EXEMPT_EXCLUDED = frozenset({"/api/ai/mcp/state", "/api/ai/mcp/audit"})
_ANKI_AGENT_PREFIX = "/api/anki/agent/"
_EXEMPT_EXACT_PATHS = frozenset({"/health", "/api/session/pair", "/api/session/pair-token"})
_FORWARDING_HEADERS = ("x-forwarded-for", "forwarded", "x-forwarded-host", "tailscale-user-login")
_LOOPBACK_HOSTNAMES = frozenset({"127.0.0.1", "localhost", "::1"})
_LOOPBACK_CLIENT_IPS = frozenset({"127.0.0.1", "::1"})


def is_session_exempt(path: str) -> bool:
    """Routes with their own auth (agent/MCP tokens) or the pairing endpoint itself.

    The MCP dashboard-context reads ``/api/ai/mcp/state`` and ``/api/ai/mcp/audit``
    are deliberately excluded: they are also reachable without a token from the
    browser today, so they must carry a paired-device session like every other
    dashboard route.
    """
    if path in _EXEMPT_EXACT_PATHS:
        return True
    if path.startswith(_ANKI_AGENT_PREFIX):
        return True
    return path.startswith(_MCP_TOKEN_PATH_PREFIX) and path not in _MCP_TOKEN_EXEMPT_EXCLUDED


def is_local_loopback_request(request: Request) -> bool:
    """True only for the owner's own browser talking to 127.0.0.1/localhost directly.

    Tailscale Serve also proxies to 127.0.0.1, but it rewrites the Host header
    to the tailnet name and adds forwarding headers, so a remote device is
    never auto-paired even though the TCP connection still looks local.
    """
    host = extract_hostname(request.headers.get("host", "")).casefold()
    if host not in _LOOPBACK_HOSTNAMES:
        return False
    if request.client is None or request.client.host not in _LOOPBACK_CLIENT_IPS:
        return False
    return not any(request.headers.get(header) for header in _FORWARDING_HEADERS)


def _request_is_https(request: Request) -> bool:
    return request.headers.get("x-forwarded-proto", "").strip().lower() == "https" or request.url.scheme == "https"


def set_session_cookie(response: Response, raw_token: str, request: Request, *, path: str = "/") -> None:
    response.set_cookie(SESSION_COOKIE_NAME, raw_token, max_age=SESSION_MAX_AGE_SECONDS,
                        httponly=True, samesite="strict", secure=_request_is_https(request), path=path)


def pairing_base_url(settings: Settings) -> str:
    if settings.public_server_url:
        return settings.public_server_url.rstrip("/")
    for name in settings.allowed_hosts.split(","):
        name = name.strip()
        if name.endswith(".ts.net"):
            return f"https://{name}"
    return "http://127.0.0.1:8000"


def pairing_url(settings: Settings, code: str) -> str:
    """Raises ``RemoteAddressNotConfigured`` rather than linking to 127.0.0.1.

    A pairing link is read on the *other* device being paired, so a loopback
    fallback here would always be dead on arrival.
    """
    return f"{settings.remote_base_url()}/api/session/pair?code={quote(code)}"


class PairingCodeView(BaseModel):
    """One-time pairing code for the "Gerät koppeln" dashboard button."""

    code: str
    url: str
    expires_at: datetime


class DevicePairingInput(BaseModel):
    pairing_secret: str = Field(min_length=1, max_length=200, repr=False)
    label: str = Field(min_length=1, max_length=80)


class DevicePairingToken(BaseModel):
    device_token: str = Field(repr=False)


class DeviceView(BaseModel):
    """One paired device, as shown in the device list on the dashboard."""

    id: str
    label: str
    created_at: datetime
    last_seen_at: datetime


class IcalUrlView(BaseModel):
    """The private, tokenised iCal subscription URL."""

    url: str


class CalendarTokenRotation(BaseModel):
    confirmed: Literal[True]


def session_router(settings: Settings) -> APIRouter:
    router = APIRouter(prefix="/api/session", tags=["session"])
    store = SessionStore(settings.local_dir)

    @router.post("/pair-token", response_model=DevicePairingToken)
    def pair_token(payload: DevicePairingInput, request: Request):
        # Used only by the native companion over verified TLS. The companion
        # stores this token in its OS keychain, never in frontend storage.
        if not _request_is_https(request) and not is_local_loopback_request(request):
            raise HTTPException(403, "Gerätekopplung benötigt eine verschlüsselte Verbindung")
        token = store.redeem_pairing_code(payload.pairing_secret, payload.label)
        if token is None:
            raise HTTPException(401, "Kopplungscode ungültig oder abgelaufen")
        return DevicePairingToken(device_token=token)

    @router.get("/pair")
    def redeem_pairing(request: Request, code: str = Query(min_length=1, max_length=200)):
        """Consume a one-time pairing code from ``unios pair`` or ``POST /pair-code``."""
        raw_token = store.redeem_pairing_code(code, "Gekoppeltes Gerät")
        if raw_token is None:
            raise HTTPException(401, "Kopplungscode ungültig oder abgelaufen")
        response = RedirectResponse(url=pairing_base_url(settings) + "/" if settings.server_mode else "/", status_code=303)
        cookie_path = urlsplit(settings.public_server_url).path.rstrip("/") + "/" if settings.server_mode else "/"
        set_session_cookie(response, raw_token, request, path=cookie_path)
        return response

    @router.post("/pair-code", response_model=PairingCodeView)
    def create_pairing_code():
        """For the dashboard "Gerät koppeln" button; requires a session already."""
        code = store.create_pairing_code()
        try:
            url = pairing_url(settings, code)
        except RemoteAddressNotConfigured as exc:
            raise HTTPException(409, str(exc)) from exc
        expires_at = datetime.now(UTC) + timedelta(seconds=PAIRING_CODE_TTL_SECONDS)
        return PairingCodeView(code=code, url=url, expires_at=expires_at)

    @router.get("/devices", response_model=list[DeviceView])
    def list_devices():
        return store.list_sessions()

    @router.delete("/devices/{device_id}")
    def revoke_device(device_id: str):
        if not store.revoke_session(device_id):
            raise HTTPException(404, "Gerät nicht gefunden")
        return {"status": "revoked"}

    @router.get("/ical-url", response_model=IcalUrlView)
    def ical_url(request: Request):
        token = store.ensure_ical_token()
        base = settings.public_server_url.rstrip("/") or str(request.base_url).rstrip("/")
        return IcalUrlView(url=f"{base}/calendar.ics?token={token}")

    @router.post("/ical-url/rotate", response_model=IcalUrlView)
    def rotate_ical_url(payload: CalendarTokenRotation, request: Request):
        token = store.rotate_ical_token()
        base = settings.public_server_url.rstrip("/") or str(request.base_url).rstrip("/")
        return IcalUrlView(url=f"{base}/calendar.ics?token={token}")

    return router
