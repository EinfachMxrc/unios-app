# SPDX-License-Identifier: AGPL-3.0-or-later

"""HTTP middleware of the UniOS server, in the order create_app installs it.

Starlette runs the last registered middleware first. The order below is part of
the security contract: host allowlist, then paired session, then the takeover
drain, then the writer/CSRF gate with its action journal.
"""

import logging

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse

from app.ai.mcp_api import mcp_actor, mcp_scopes, verified_mcp_actor
from app.config import Settings
from app.host.actions import ActionJournal
from app.host.lease import HostCoordinator
from app.host.write_gate import WriteGate
from app.security import extract_hostname, is_dashboard_request, private_cache_control
from app.session_api import (
    LEGACY_SESSION_COOKIE_NAME,
    SESSION_COOKIE_NAME,
    is_local_loopback_request,
    is_session_exempt,
    set_session_cookie,
)
from app.sessions import SessionStore
from app.web.spa_routes import is_react_route

log = logging.getLogger("app.main")


def install_http_middleware(app: FastAPI, *, settings: Settings, coordinator: HostCoordinator,
                            write_gate: WriteGate, request_gate: WriteGate, action_journal: ActionJournal) -> None:
    async def journalled_call(request: Request, call_next):
        try:
            action_id = await action_journal.begin(request, coordinator)
        except (OSError, RuntimeError) as exc:
            log.warning("Aktionsprotokoll nicht verfügbar: %s", type(exc).__name__)
            return JSONResponse({"detail": "Änderung konnte nicht sicher protokolliert werden"}, status_code=503)
        try:
            response = await call_next(request)
        except BaseException:
            try:
                action_journal.finish(action_id, 500)
            except OSError:
                log.warning("Aktionsprotokoll konnte Fehler nicht abschließen")
            raise
        try:
            action_journal.finish(action_id, response.status_code)
        except OSError:
            log.warning("Aktionsprotokoll konnte Ergebnis nicht abschließen")
        return response

    @app.middleware("http")
    async def identify_mcp_client(request: Request, call_next):
        if not request.url.path.startswith("/api/ai/mcp/"):
            return await call_next(request)
        actor = verified_mcp_actor(request.headers.get("x-unios-mcp-client", ""),
                                   request.headers.get("x-unios-mcp-client-signature", ""),
                                   settings.mcp_token,
                                   request.client.host if request.client else None,
                                   request.headers.get('x-unios-mcp-scopes'))
        if actor is None:
            return JSONResponse({"detail": "KI-Client nicht autorisiert"}, status_code=403)
        marker = mcp_actor.set(actor)
        scope_marker = mcp_scopes.set(frozenset(request.headers.get('x-unios-mcp-scopes', '').split()))
        try:
            return await call_next(request)
        finally:
            mcp_actor.reset(marker)
            mcp_scopes.reset(scope_marker)

    @app.middleware("http")
    async def private_project_responses(request: Request, call_next):
        response = await call_next(request)
        if request.url.path.startswith(("/api/", "/files/")) or request.url.path == "/calendar.ics":
            response.headers["Cache-Control"] = private_cache_control(
                request.url.path, response.status_code, response.headers.get("content-type", ""),
            )
        return response

    @app.middleware("http")
    async def reject_cross_site_writes(request: Request, call_next):
        # A reload or deep link into the React app gets the app shell, not a 404.
        if settings.serve_react and request.method in {"GET", "HEAD"} and is_react_route(request.url.path):
            return FileResponse(settings.react_dist_dir / "index.html", media_type="text/html",
                                headers={"Cache-Control": "no-store"})
        path = request.url.path
        audited_mcp_read = (request.method == "GET" and path.startswith("/api/ai/mcp/")
                            and path not in {"/api/ai/mcp/state", "/api/ai/mcp/audit"})
        if request.method not in {"GET", "HEAD", "OPTIONS"} or audited_mcp_read:
            if not coordinator.is_writer:
                return JSONResponse({"detail": "Standby: Kein Staffelstab für Schreibzugriff"}, status_code=423)
            if not is_dashboard_request(request):
                return JSONResponse({"detail": "Schreibzugriff nur vom Dashboard"}, status_code=403)
            supplied_generation = request.headers.get("x-unios-lease-generation")
            if (settings.api_auth_required and request.method not in {"GET", "HEAD", "OPTIONS"}
                    and path.startswith("/api/") and not is_session_exempt(path)
                    and path != "/api/setup/moodle/callback" and supplied_generation is None):
                return JSONResponse({"detail": "STALE_HOST: Staffelstab-Generation fehlt"}, status_code=409)
            if supplied_generation is not None:
                lease = coordinator.current()
                if (lease is None or not supplied_generation.isdecimal()
                        or lease.generation != int(supplied_generation)):
                    return JSONResponse({"detail": "STALE_HOST: Staffelstab-Generation hat sich geändert"},
                                        status_code=409)
            # Releasing drains other writers, so its own request cannot enter the gate.
            if request.url.path == "/api/host/release":
                return await journalled_call(request, call_next)
            if not write_gate.enter():
                return JSONResponse({"detail": "Host-Übergabe läuft: Schreibzugriff gesperrt"}, status_code=423)
            try:
                return await journalled_call(request, call_next)
            finally:
                write_gate.leave()
        return await call_next(request)

    @app.middleware("http")
    async def drain_requests_for_takeover(request: Request, call_next):
        if not request_gate.enter():
            return JSONResponse({"detail": "Gerätewechsel läuft; bitte gleich erneut versuchen"}, status_code=503)
        try:
            return await call_next(request)
        finally:
            request_gate.leave()

    session_store = SessionStore(settings.local_dir)

    @app.middleware("http")
    async def require_paired_session(request: Request, call_next):
        # Runs after the Host allowlist and before the write gate: an
        # unpaired device gets a plain 401, never a chance to probe further.
        if not settings.api_auth_required:
            return await call_next(request)
        path = request.url.path
        native_legacy_token = None
        if settings.server_mode and path.startswith("/api/ai/mcp/") and request.headers.get("x-unios-mcp-device") == "1":
            # A native companion authenticates its local stdio bridge and
            # supplies its revocable server device session. The server's MCP
            # credential never leaves the server; normal capability/course
            # checks still run inside the MCP router.
            token = request.cookies.get(SESSION_COOKIE_NAME) or request.cookies.get(LEGACY_SESSION_COOKIE_NAME, "")
            if not session_store.verify_session(token):
                return JSONResponse({"detail": "KI-Gerät nicht gekoppelt"}, status_code=401)
            if not request.cookies.get(SESSION_COOKIE_NAME):
                native_legacy_token = token
            request.scope["headers"] = [(name, value) for name, value in request.scope["headers"]
                                        if name.lower() != b"x-unios-mcp-token"]
            request.scope["headers"].append((b"x-unios-mcp-token", settings.mcp_token.encode()))
            # Recreate Starlette's cached view after replacing scope headers.
            if hasattr(request, "_headers"):
                del request._headers
        protected = path.startswith(("/api/", "/files/")) or path == "/calendar.ics"
        if not protected or is_session_exempt(path):
            response = await call_next(request)
            if native_legacy_token:
                set_session_cookie(response, native_legacy_token, request)
            return response
        cookie_token = request.cookies.get(SESSION_COOKIE_NAME)
        migrating_legacy_cookie = False
        if not cookie_token:
            cookie_token = request.cookies.get(LEGACY_SESSION_COOKIE_NAME)
            migrating_legacy_cookie = bool(cookie_token)
        if cookie_token and session_store.verify_session(cookie_token):
            response = await call_next(request)
            if migrating_legacy_cookie:
                set_session_cookie(response, cookie_token, request)
            return response
        if path == "/calendar.ics":
            ical_token = request.query_params.get("token", "")
            if ical_token and session_store.verify_ical_token(ical_token):
                return await call_next(request)
        if not settings.server_mode and is_local_loopback_request(request):
            raw_token = session_store.create_session("Lokaler Browser")
            response = await call_next(request)
            set_session_cookie(response, raw_token, request)
            return response
        return JSONResponse({"detail": "Gerät nicht gekoppelt"}, status_code=401)

    allowed_host_names = settings.allowed_host_names

    @app.middleware("http")
    async def enforce_allowed_host(request: Request, call_next):
        # Blocks DNS-rebinding: a foreign domain pointed at 127.0.0.1 sends this
        # same Host header the browser bar shows, which cannot be spoofed by JS.
        if extract_hostname(request.headers.get("host", "")).casefold() not in allowed_host_names:
            return JSONResponse({"detail": "Unbekannter Host: Zugriff abgelehnt"}, status_code=400)
        return await call_next(request)

    @app.middleware("http")
    async def add_security_headers(request: Request, call_next):
        response = await call_next(request)
        if settings.server_mode and (request.url.path.startswith(("/api/", "/files/")) or request.url.path == "/calendar.ics"):
            response.headers["Cache-Control"] = private_cache_control(
                request.url.path, response.status_code, response.headers.get("content-type", ""),
            )
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(self), geolocation=()")
        response.headers.setdefault("Content-Security-Policy", (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; "
            "media-src 'self' blob:; "
            "font-src 'self' data:; "
            "worker-src 'self' blob:; "
            "connect-src 'self'; "
            "frame-ancestors 'none'; "
            "object-src 'none'; "
            "base-uri 'self'"
        ))
        return response
