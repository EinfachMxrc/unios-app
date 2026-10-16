# SPDX-License-Identifier: AGPL-3.0-or-later
"""Loopback-only native companion with authenticated, streaming HTTPS proxy."""

import json
import re
from contextlib import asynccontextmanager
from hmac import compare_digest
from pathlib import Path
from tempfile import SpooledTemporaryFile
from urllib.parse import urlsplit

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask
from starlette.concurrency import run_in_threadpool

from app.ai.connection import McpConnection
from app.client.citations import legacy_citations
from app.client.service import ServerConnection, use_local, validate_server_url
from app.config import Settings
from app.integrations.storage import ConnectionError
from app.rooms.service import config_for_server_profile
from app.security import is_dashboard_request, private_cache_control

_REQUEST_HEADERS = {"accept", "accept-language", "content-type", "content-length", "range", "if-range",
                    "if-none-match", "if-modified-since", "x-unios-lease-generation", "x-unios-mcp-token",
                    "x-unios-mcp-client", "x-unios-mcp-client-signature", "x-unios-anki-token"}
_RESPONSE_HEADERS = {"content-type", "content-length", "content-disposition", "content-range", "accept-ranges",
                     "etag", "last-modified", "retry-after"}
MAX_REQUEST_BYTES = 100 * 1024 * 1024


class PairInput(BaseModel):
    server_url: str = Field(min_length=1, max_length=300)
    pairing_secret: str = Field(min_length=1, max_length=200, repr=False)
    label: str = Field(default="UniOS App", min_length=1, max_length=80)


def create_client_app(home: Path, dist: Path, *, transport: httpx.AsyncBaseTransport | None = None) -> FastAPI:
    connection = ServerConnection(home)
    local_settings = Settings(local_dir=home / "local", data_dir=home / "data", _env_file=None)  # type: ignore[call-arg]
    mcp = McpConnection(local_settings)
    remote = httpx.AsyncClient(transport=transport, trust_env=False, follow_redirects=False,
                              timeout=httpx.Timeout(180, connect=5, pool=5))

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield
        await remote.aclose()

    app = FastAPI(title="UniOS Client", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.connection = connection

    @app.middleware("http")
    async def guard(request: Request, call_next):
        # The server token cannot be reached through DNS rebinding or a
        # foreign site's form, even before device pairing is completed.
        if request.headers.get("host") not in {"127.0.0.1:8000", "localhost:8000"}:
            return JSONResponse({"detail": "Unbekannter App-Zugang"}, status_code=400)
        if request.client is None or request.client.host not in {"127.0.0.1", "::1", "testclient"}:
            return JSONResponse({"detail": "App-Zugang nur auf diesem Gerät"}, status_code=403)
        if not is_dashboard_request(request):
            return JSONResponse({"detail": "Zugriff nur aus UniOS"}, status_code=403)
        response = await call_next(request)
        response.headers["Cache-Control"] = private_cache_control(
                request.url.path, response.status_code, response.headers.get("content-type", ""),
            )
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(self), geolocation=()"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; "
            "worker-src 'self' blob:; connect-src 'self'; object-src 'none'; "
            "base-uri 'self'; frame-ancestors 'none'"
        )
        return response

    @app.get("/health")
    def health():
        # Native window must open while the server is offline too.
        return {"status": "ok", "mode": "client"}

    @app.get('/api/recovery/status')
    def recovery_status():
        return {'mode': 'client', 'background_work': False}

    @app.get("/api/client/status")
    def status():
        try:
            return connection.state()
        except (ConnectionError, OSError):
            return {"mode": "client", "configured": False, "server_url": "", "keyring_available": False}

    @app.post("/api/client/use-local")
    def choose_local():
        # Only records the choice; the desktop shell then restarts the service into local mode.
        try:
            use_local(home)
        except ConnectionError:
            raise HTTPException(409, "Dieses Gerät ist bereits mit einem Server gekoppelt") from None
        except OSError:
            raise HTTPException(503, "Auswahl konnte nicht gespeichert werden") from None
        return {"mode": "local"}

    @app.post("/api/client/pair")
    async def pair(payload: PairInput):
        try:
            url = validate_server_url(payload.server_url)
            connection.assert_identity(url)
            if not connection.vault.available():
                raise ConnectionError("Sicherer System-Schlüsselbund ist nicht verfügbar")
            response = await remote.post(url + "/api/session/pair-token",
                                         headers={"Origin": f"https://{urlsplit(url).netloc}"},
                                         json={"pairing_secret": payload.pairing_secret, "label": payload.label})
            if response.status_code != 200:
                raise HTTPException(401 if response.status_code == 401 else 502,
                                    "Kopplungscode ungültig oder Server nicht verfügbar")
            token = response.json().get("device_token")
            if not isinstance(token, str):
                raise ConnectionError("Ungültige Serverantwort")
            connection.save(url, token)
            return connection.state()
        except (ConnectionError, OSError):
            raise HTTPException(409, "Gerätekopplung konnte nicht sicher gespeichert werden oder Serveridentität stimmt nicht") from None
        except ValueError:
            raise HTTPException(400, "Gültige HTTPS-Serveradresse und Gerätekopplung prüfen") from None
        except httpx.HTTPError:
            raise HTTPException(503, "Server nicht erreichbar; Verbindung prüfen") from None

    @app.api_route("/{path:path}", methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
    async def dispatch(path: str, request: Request):
        if not (path.startswith(("api/", "files/")) or path == "calendar.ics"):
            if request.method not in {"GET", "HEAD"}:
                raise HTTPException(405)
            asset = (dist / path).resolve()
            if asset.is_relative_to(dist.resolve()) and asset.is_file():
                return FileResponse(asset)
            if path.startswith("assets/") or "." in Path(path).name:
                raise HTTPException(404)
            return FileResponse(dist / "index.html", media_type="text/html")
        if path.startswith(("api/client/", "api/session/pair")) and path != "api/session/pair-code":
            raise HTTPException(404)
        if any(part in {".", ".."} for part in path.split("/")) or "\\" in path:
            raise HTTPException(400)
        try:
            # OS vault IPC can wait for the keychain. It must not stall the
            # event loop serving the window, assets and other HTTPS requests.
            # Keep checking the binding per request; do not cache credentials.
            url, token = await run_in_threadpool(connection.credentials)
            headers = {name: value for name, value in request.headers.items() if name.lower() in _REQUEST_HEADERS}
            # Never forward local cookies, Host, credentials or spoofed proxy
            # headers. Preserve mutation generation and byte-range semantics.
            headers["Cookie"] = f"unios_session={token}"
            headers["Origin"] = f"https://{urlsplit(url).netloc}"
            headers["Accept-Encoding"] = "identity"
            if path.startswith("api/ai/mcp/") and path not in {"api/ai/mcp/state", "api/ai/mcp/audit"}:
                mcp.load()
                presented = request.headers.get("x-unios-mcp-token", "")
                if not local_settings.mcp_enabled or not presented or not compare_digest(presented, local_settings.mcp_token):
                    raise HTTPException(401, "KI-Verbindung nicht freigegeben")
                headers.pop("x-unios-mcp-token", None)
                headers.pop("x-unios-mcp-client", None)
                headers.pop("x-unios-mcp-client-signature", None)
                headers["X-UniOS-MCP-Device"] = "1"
            size = request.headers.get("content-length", "0")
            if not size.isdecimal() or int(size) > MAX_REQUEST_BYTES:
                raise HTTPException(413, "Datei ist zu groß")
            target = url + "/" + path
            if request.url.query:
                target += "?" + request.url.query
            # Validate the entire bounded upload before a remote mutation starts.
            # Large bodies spill to a private temporary file instead of RAM.
            with SpooledTemporaryFile(max_size=1024 * 1024) as body:
                received = 0
                async for chunk in request.stream():
                    received += len(chunk)
                    if received > MAX_REQUEST_BYTES:
                        raise HTTPException(413, "Datei ist zu groß")
                    await run_in_threadpool(body.write, chunk)
                await run_in_threadpool(body.seek, 0)
                headers["content-length"] = str(received)

                async def upload_chunks():
                    while chunk := await run_in_threadpool(body.read, 64 * 1024):
                        yield chunk

                outgoing = remote.build_request(request.method, target, headers=headers, content=upload_chunks())
                response = await remote.send(outgoing, stream=True)
            if response.is_redirect:
                await response.aclose()
                raise HTTPException(502, "Server antwortet mit einer unerwarteten Weiterleitung")
            citation_route = re.fullmatch(r"api/material/(\d+)/citations", path)
            if citation_route and request.method == "GET" and response.status_code == 404:
                await response.aclose()
                return JSONResponse(await legacy_citations(remote, url, headers, int(citation_route[1])))
            if path == "api/rooms/config" and request.method == "GET" and response.status_code == 404:
                # Booking runs on the device, so its verified profile metadata can be
                # supplied without migrating an older server's study database.
                await response.aclose()
                metadata = await remote.get(url + "/api/setup/status", headers=headers)
                if metadata.status_code != 200:
                    raise HTTPException(metadata.status_code if metadata.status_code in {401, 403} else 502,
                                        "Hochschulprofil konnte nicht geprüft werden")
                try:
                    selected = metadata.json().get("institution")
                except (ValueError, AttributeError):
                    raise HTTPException(502, "Hochschulprofil konnte nicht geprüft werden") from None
                return JSONResponse(config_for_server_profile(selected).model_dump())
            if path == "api/ai/connection" and request.method in {"GET", "POST"} and response.status_code == 200:
                value = json.loads(await response.aread())
                await response.aclose()
                if request.method == "POST":
                    mcp.setup()
                else:
                    value["client_config"] = mcp.client_config()
                    value["keyring_available"] = mcp.vault.available()
                return JSONResponse(value)
            forwarded = {name: value for name, value in response.headers.items() if name.lower() in _RESPONSE_HEADERS}
            async def chunks():
                try:
                    if response.is_stream_consumed:
                        yield response.content
                    else:
                        async for chunk in response.aiter_raw():
                            yield chunk
                finally:
                    await response.aclose()

            return StreamingResponse(chunks(), status_code=response.status_code, headers=forwarded,
                                     background=BackgroundTask(response.aclose))
        except ConnectionError:
            raise HTTPException(401, "Dieses Gerät mit dem UniOS-Server koppeln") from None
        except httpx.HTTPError:
            raise HTTPException(503, "Server vorübergehend nicht erreichbar; lokale Entwürfe bleiben erhalten") from None

    return app
