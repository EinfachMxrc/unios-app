# SPDX-License-Identifier: AGPL-3.0-or-later

"""Isolated loopback-only OAuth/MCP gateway for an explicit HTTPS tunnel."""

from __future__ import annotations

import os
from html import escape
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import httpx
import uvicorn
from mcp.server.auth.settings import AuthSettings, ClientRegistrationOptions
from mcp.server.transport_security import TransportSecuritySettings
from pydantic import AnyHttpUrl
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import (
    HTMLResponse,
    PlainTextResponse,
    RedirectResponse,
    Response,
)

from app.config import Settings
from app.secrets import require_private_env
from clients.uni_mcp.__main__ import build_server
from clients.uni_mcp.oauth_provider import READ_SCOPES, SCOPE, PrivateOAuthProvider

HOST_URL = "http://127.0.0.1:8000"
GATEWAY_HOST = "127.0.0.1"
GATEWAY_PORT = 8001


def gateway_bind_host() -> str:
    """An explicit server container may listen on its private network interface.

    Host port publication remains loopback-only in the Compose overlay.
    """
    value = os.environ.get('UNIOS_MCP_BIND_HOST', GATEWAY_HOST)
    if value == GATEWAY_HOST:
        return value
    if value == '0.0.0.0' and os.environ.get('UNIOS_SERVER_KEY'):
        return value
    raise ValueError('MCP-Bind-Adresse nur lokal oder im ausdrücklichen Server-Container')


def _public_origin(value: str) -> tuple[str, str]:
    parsed = urlsplit(value)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
            or parsed.port not in {None, 443} or parsed.path not in {"", "/"}
            or parsed.query or parsed.fragment or "." not in parsed.hostname
            or parsed.hostname.endswith(".localhost")):
        raise ValueError("REMOTE_MCP_PUBLIC_URL muss ein reiner öffentlicher HTTPS-Ursprung sein")
    return f"https://{parsed.hostname}", parsed.hostname


def build_remote_app(settings: Settings):
    """Build only MCP, OAuth metadata/registration/token routes and PIN approval."""
    if not settings.mcp_enabled:
        raise ValueError("MCP_ENABLED muss für den Fernzugriff aktiviert sein")
    origin, public_host = _public_origin(settings.remote_mcp_public_url)
    provider = PrivateOAuthProvider(
        settings.local_dir / "remote-mcp-oauth.sqlite3", settings.mcp_token,
        settings.remote_mcp_approval_pin, origin, f"{origin}/mcp",
    )
    auth = AuthSettings(
        issuer_url=AnyHttpUrl(origin),
        resource_server_url=AnyHttpUrl(f"{origin}/mcp"),
        required_scopes=[SCOPE],
        client_registration_options=ClientRegistrationOptions(
            enabled=True, valid_scopes=[SCOPE, *READ_SCOPES, 'coding:propose'], default_scopes=[SCOPE, *READ_SCOPES],
        ),
        validate_token_resource=True,
    )
    server = build_server(HOST_URL, settings.mcp_token, auth=auth, auth_provider=provider)

    @server.custom_route("/approval", methods=["GET"])
    async def approval_page(request: Request) -> Response:
        ticket = request.query_params.get("ticket", "")
        details = provider.pending_details(ticket) if len(ticket) <= 128 else None
        if details is None:
            return PlainTextResponse("Freigabe abgelaufen oder ungültig.", status_code=404)
        name, callback = details
        requested_scopes = ', '.join(provider.pending_scopes(ticket))
        target = urlsplit(callback)
        target_label = f"{target.scheme}://{target.netloc}{target.path}"
        html = ("<!doctype html><html lang='de'><meta charset='utf-8'>"
                "<meta name='viewport' content='width=device-width, initial-scale=1'>"
                "<title>KI-Verbindung freigeben</title>"
                "<style>body{font:16px system-ui;background:#101722;color:#eef3fa;"
                "max-width:34rem;margin:4rem auto;padding:1.5rem}input,button{font:inherit;"
                "padding:.7rem;border-radius:.5rem}input{width:100%;box-sizing:border-box}"
                "button{margin-top:1rem;background:#8bc5ff;color:#0d1826;border:0}"
                "small{color:#b9c6d4;overflow-wrap:anywhere}</style>"
                "<h1>KI-Verbindung freigeben</h1>"
                "<p>Nur freigegebene Kurse und Bereiche werden geteilt."
                " Vorschläge bleiben zur Prüfung offen.</p>"
                f"<p>Programm: <strong>{escape(name)}</strong><br>"
                f"Rückkehr zu: <small>{escape(target_label)}</small></p>"
                f"<p>Berechtigungen: <small>{escape(requested_scopes)}</small></p>"
                "<form action='/approval' method='post'>"
                f"<input type='hidden' name='ticket' value='{escape(ticket, quote=True)}'>"
                "<label>PIN vom Host<input type='password' name='pin' inputmode='numeric'"
                " autocomplete='off' required minlength='12' maxlength='20'></label>"
                "<button type='submit'>Verbindung erlauben</button></form></html>")
        return HTMLResponse(html, headers={"Cache-Control": "no-store",
                                           "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
                                           "Referrer-Policy": "no-referrer",
                                           "X-Content-Type-Options": "nosniff"})

    @server.custom_route("/approval", methods=["POST"])
    async def approve(request: Request) -> Response:
        if (request.headers.get("origin") != origin
                or request.headers.get("content-type", "").split(";", 1)[0] != "application/x-www-form-urlencoded"):
            return PlainTextResponse("Freigabe verweigert.", status_code=403)
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 4096:
                return PlainTextResponse("Freigabe verweigert.", status_code=403)
        try:
            fields = parse_qs(body.decode("ascii"), strict_parsing=True, max_num_fields=2)
            tickets, pins = fields["ticket"], fields["pin"]
        except (UnicodeError, ValueError, KeyError):
            return PlainTextResponse("Freigabe verweigert.", status_code=403)
        if len(tickets) != 1 or len(pins) != 1:
            return PlainTextResponse("Freigabe verweigert.", status_code=403)
        ticket, pin = tickets[0], pins[0]
        if len(ticket) > 128 or len(pin) > 20:
            return PlainTextResponse("Freigabe verweigert.", status_code=403)
        try:
            destination = provider.approve(ticket, pin)
        except ValueError:
            return PlainTextResponse("PIN ungültig oder Freigabe abgelaufen.", status_code=403)
        return RedirectResponse(destination, status_code=303,
                                headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"})

    app = server.streamable_http_app(
        streamable_http_path="/mcp", stateless_http=True, json_response=True,
        max_request_body_size=262_144, max_sessions=32, host=GATEWAY_HOST,
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=[public_host, f"{public_host}:443", f"{GATEWAY_HOST}:{GATEWAY_PORT}"],
            allowed_origins=[origin],
        ),
    )

    async def emergency_stop(request: Request, call_next):
        if request.url.path == "/mcp":
            try:
                async with httpx.AsyncClient(base_url=HOST_URL, timeout=2, trust_env=False) as client:
                    state = (await client.get('/api/ai/mcp/ping',
                             headers={'X-UniOS-MCP-Token': settings.mcp_token})).json()
                if state.get("enabled") is not True:
                    raise ValueError("MCP aus")
            except (httpx.HTTPError, ValueError, KeyError):
                return PlainTextResponse("KI-Verbindung ist ausgeschaltet.", status_code=503)
        return await call_next(request)

    app.add_middleware(BaseHTTPMiddleware, dispatch=emergency_stop)

    return app


def main() -> None:
    require_private_env(Path(".env"))
    if os.environ.get('UNIOS_SERVER_KEY'):
        from app.server.keyring import configure_server_keyring
        home = Path(os.environ.get('UNIOS_HOME', '/var/lib/unios'))
        if not home.is_absolute():
            raise ValueError('UNIOS_HOME muss absolut sein')
        os.environ['DATA_DIR'] = str(home / 'data')
        os.environ['LOCAL_DIR'] = str(home / 'local')
        configure_server_keyring(home)
    settings = Settings()
    from app.ai.connection import load_mcp_connection
    load_mcp_connection(settings)
    app = build_remote_app(settings)
    uvicorn.run(app, host=gateway_bind_host(), port=GATEWAY_PORT, access_log=False,
                proxy_headers=False, server_header=False)


if __name__ == "__main__":
    main()
