# SPDX-License-Identifier: AGPL-3.0-or-later
"""Browser harness: a native client talking to an older fictional server."""

import os
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

os.environ["UNIOS_FACTORY_ONLY"] = "true"
os.environ["PYTHON_KEYRING_BACKEND"] = "keyring.backends.null.Keyring"

import httpx
from fastapi.testclient import TestClient

from app.config import Settings

Settings.model_config["env_file"] = None

from app.client.api import create_client_app
from app.client.service import ServerConnection
from tests.fake_servers.phase1_app import app as upstream

_home = TemporaryDirectory(prefix="unios-citation-client-e2e-")
_server = TestClient(upstream)
_server.__enter__()
_credentials = patch.object(ServerConnection, "credentials",
                            return_value=("https://example.invalid", "fictional-citation-device"))
_state = patch.object(ServerConnection, "state", return_value={"mode": "client", "configured": True,
                      "server_url": "https://example.invalid", "keyring_available": True})
_credentials.start()
_state.start()


def respond(request):
    if request.url.path.endswith("/citations"):
        return httpx.Response(404)
    headers = dict(request.headers)
    headers["host"] = "testserver"
    headers["origin"] = "http://testserver"
    response = _server.request(request.method, request.url.path,
                               params=request.url.params, headers=headers, content=request.content)
    return httpx.Response(response.status_code, headers=dict(response.headers), content=response.content)


_client = create_client_app(Path(_home.name), Path(__file__).resolve().parents[2] / "frontend/dist",
                            transport=httpx.MockTransport(respond))


async def app(scope, receive, send):
    # Only the test harness uses 8173; the real native service requires 8000.
    if scope["type"] == "http":
        scope = {**scope, "headers": [(key, b"127.0.0.1:8000" if key == b"host" else value)
                                      for key, value in scope["headers"]]}
    await _client(scope, receive, send)
