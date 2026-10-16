# SPDX-License-Identifier: AGPL-3.0-or-later
"""Server/device boundary with fictional credentials and no university traffic."""

import asyncio
import json
import threading

import httpx
import keyring
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from keyring.errors import KeyringError

from app.client.api import create_client_app
from app.client.service import ServerConnection
from app.integrations.storage import ConnectionError
from app.main import create_app
from app.server.keyring import ServerKeyring
from app.sessions import SessionStore


def test_chunked_upload_stops_at_limit_before_forwarding(tmp_path, monkeypatch):
    from app.client import api

    monkeypatch.setattr(api, "MAX_REQUEST_BYTES", 5, raising=False)
    monkeypatch.setattr(ServerConnection, "credentials", lambda self: ("https://example.invalid", "fixture-token"))
    consumed, forwarded = [], []

    async def chunks():
        for index in range(4):
            consumed.append(index)
            yield b"abcd"

    def respond(request):
        forwarded.append(request)
        return httpx.Response(200, json={})

    async def scenario():
        app = create_client_app(tmp_path / "client", tmp_path / "ui", transport=httpx.MockTransport(respond))
        async with app.router.lifespan_context(app), httpx.AsyncClient(
            transport=httpx.ASGITransport(app), base_url="http://127.0.0.1:8000",
        ) as client:
            response = await client.post("/api/drop", content=chunks())
            assert response.status_code == 413
        assert consumed == [0, 1]
        assert forwarded == []

    asyncio.run(scenario())


def test_native_vault_wait_does_not_block_window_or_cache_credentials(tmp_path, monkeypatch):
    """A held fictional vault read must leave health and static files responsive."""
    async def scenario():
        loop_thread = threading.get_ident()
        entered = threading.Event()
        released = threading.Event()
        calls = []

        def credentials():
            assert threading.get_ident() != loop_thread
            calls.append(len(calls) + 1)
            entered.set()
            assert released.wait(timeout=3)
            return "https://example.invalid", "fictional-device-token-" + str(calls[-1])

        monkeypatch.setattr(ServerConnection, "credentials", lambda self: credentials())
        ui = tmp_path / "ui"
        ui.mkdir()
        (ui / "index.html").write_text("fictional-window", encoding="utf-8")
        remote_cookies = []

        def respond(request):
            remote_cookies.append(request.headers["cookie"])
            return httpx.Response(200, json={"items": []})

        app = create_client_app(tmp_path / "client", ui, transport=httpx.MockTransport(respond))
        async with (
            app.router.lifespan_context(app),
            httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://127.0.0.1:8000") as client,
        ):
            pending = asyncio.create_task(client.get("/api/courses"))
            try:
                assert await asyncio.to_thread(entered.wait, 1)
                assert (await asyncio.wait_for(client.get("/health"), timeout=1)).status_code == 200
                assert (await asyncio.wait_for(client.get("/study"), timeout=1)).text == "fictional-window"
            finally:
                released.set()
                await pending
            assert (await client.get("/api/courses")).status_code == 200
        assert calls == [1, 2]
        assert remote_cookies == ["unios_session=fictional-device-token-1", "unios_session=fictional-device-token-2"]

    asyncio.run(scenario())


@pytest.fixture
def secure_keyring(tmp_path, monkeypatch):
    key = tmp_path / "master.key"
    key.write_bytes(Fernet.generate_key())
    key.chmod(0o600)
    vault = ServerKeyring(tmp_path / "vault", key)
    # Public keyring helpers delegate to core, whose backend must also be
    # fictional. Restore its previous value when the fixture ends.
    monkeypatch.setattr(keyring.core, "_keyring_backend", vault)
    return vault


def test_encrypted_keyring_roundtrip_and_tamper_fails_closed(secure_keyring):
    vault = secure_keyring
    vault.set_password("fictional", "user", "sensitive-fixture")
    assert vault.get_password("fictional", "user") == "sensitive-fixture"
    assert b"sensitive-fixture" not in vault.path.read_bytes()
    vault.path.write_bytes(b"corrupted")
    with pytest.raises(KeyringError):
        vault.set_password("fictional", "user", "replacement")
    assert vault.path.read_bytes() == b"corrupted"


def test_wrong_master_key_cannot_read_or_replace_credentials(tmp_path, secure_keyring):
    secure_keyring.set_password("test", "name", "secret-fixture")
    other = tmp_path / "other.key"
    other.write_bytes(Fernet.generate_key())
    other.chmod(0o600)
    vault = ServerKeyring(secure_keyring.path.parent, other)
    with pytest.raises(KeyringError):
        vault.get_password("test", "name")


def test_client_cannot_change_server_identity(tmp_path, secure_keyring):
    binding = ServerConnection(tmp_path / "client")
    binding.save("https://example.invalid/unios", "t" * 48)
    with pytest.raises(ConnectionError):
        binding.save("https://other.invalid", "n" * 48)
    assert binding.credentials() == ("https://example.invalid/unios", "t" * 48)
    assert "token" not in json.dumps(binding.state())


@pytest.mark.parametrize("institution,configured", [("hs-coburg", True), ("generic", False), ("../../private", False)])
def test_room_metadata_compatibility_uses_authenticated_server_profile(tmp_path, secure_keyring, institution, configured):
    binding = ServerConnection(tmp_path / "client")
    binding.save("https://example.invalid/unios", "d" * 48)
    seen = []

    def respond(request):
        seen.append(request.url.path)
        assert request.headers["cookie"] == "unios_session=" + "d" * 48
        if request.url.path == "/unios/api/rooms/config":
            return httpx.Response(404)
        assert request.url.path == "/unios/api/setup/status"
        return httpx.Response(200, json={"institution": institution})

    app = create_client_app(tmp_path / "client", tmp_path / "ui", transport=httpx.MockTransport(respond))
    with TestClient(app, base_url="http://127.0.0.1:8000") as client:
        response = client.get("/api/rooms/config")
        assert response.status_code == 200
        assert bool(response.json()["url"]) == configured
        assert seen == ["/unios/api/rooms/config", "/unios/api/setup/status"]
        assert "token" not in response.text
    assert not list((tmp_path / "client").rglob("*.sqlite3"))


@pytest.mark.parametrize("status", [401, 403, 503])
def test_room_metadata_does_not_guess_profile_when_server_refuses(tmp_path, secure_keyring, status):
    binding = ServerConnection(tmp_path / "client")
    binding.save("https://example.invalid", "d" * 48)

    def respond(request):
        return httpx.Response(404 if request.url.path == "/api/rooms/config" else status)

    app = create_client_app(tmp_path / "client", tmp_path / "ui", transport=httpx.MockTransport(respond))
    with TestClient(app, base_url="http://127.0.0.1:8000") as client:
        assert client.get("/api/rooms/config").status_code == (status if status in {401, 403} else 502)


def test_client_pairing_streams_binary_and_strips_local_credentials(tmp_path, secure_keyring):
    dist = tmp_path / "ui"
    dist.mkdir()
    (dist / "index.html").write_text("<h1>App</h1>")
    requests = []

    def respond(request):
        requests.append(request)
        if request.url.path.endswith("pair-token"):
            return httpx.Response(200, json={"device_token": "fixture-device-token-" * 3})
        assert request.url.path == "/unios/files/7"
        return httpx.Response(206, content=b"pdf", headers={"Content-Range": "bytes 0-2/20",
                                                          "Content-Type": "application/pdf",
                                                          "Set-Cookie": "must-not-reach-browser=1"})

    app = create_client_app(tmp_path / "client", dist, transport=httpx.MockTransport(respond))
    with TestClient(app, base_url="http://127.0.0.1:8000") as client:
        assert client.get("/health").json()["status"] == "ok"
        assert client.get("/notes").status_code == 200
        assert client.get("/api/host").status_code == 401
        paired = client.post("/api/client/pair", json={"server_url": "https://example.invalid/unios",
                                                       "pairing_secret": "one-time-fixture"})  # pragma: allowlist secret
        assert paired.status_code == 200
        assert "fixture-device-token" not in paired.text
        response = client.get("/files/7", headers={"Range": "bytes=0-2", "Cookie": "local-secret=1",
                                                   "Authorization": "Bearer local-secret",
                                                   "X-Forwarded-Host": "attacker.invalid"})
        assert response.content == b"pdf" and response.status_code == 206
        assert response.headers["content-range"] == "bytes 0-2/20"
        assert "set-cookie" not in response.headers
        assert requests[-1].headers["cookie"].startswith("unios_session=fixture-device-token")
        assert "authorization" not in requests[-1].headers
        assert "x-forwarded-host" not in requests[-1].headers
        assert requests[-1].headers["origin"] == "https://example.invalid"
        assert client.post("/api/client/pair", json={"server_url": "https://other.invalid",
                                                     "pairing_secret": "fixture"}).status_code == 409  # pragma: allowlist secret
        assert client.get("/api/client/status", headers={"Host": "attacker.invalid:8000"}).status_code == 400
        assert client.post("/api/client/pair", headers={"Origin": "https://attacker.invalid"}, json={}).status_code == 403
    assert not (tmp_path / "client" / "data").exists()
    assert not list((tmp_path / "client").rglob("*.sqlite3"))


def test_proxy_does_not_follow_redirects_or_hide_server_outage(tmp_path, secure_keyring):
    dist = tmp_path / "ui"
    dist.mkdir()
    binding = ServerConnection(tmp_path / "client")
    binding.save("https://example.invalid", "d" * 48)

    def redirect(request):
        return httpx.Response(302, headers={"Location": "https://attacker.invalid"})

    app = create_client_app(tmp_path / "client", dist, transport=httpx.MockTransport(redirect))
    with TestClient(app, base_url="http://127.0.0.1:8000") as client:
        assert client.get("/api/host").status_code == 502

    def offline(request):
        raise httpx.ConnectError("fixture outage")

    app = create_client_app(tmp_path / "client", dist, transport=httpx.MockTransport(offline))
    with TestClient(app, base_url="http://127.0.0.1:8000") as client:
        assert client.get("/health").status_code == 200
        assert client.get("/api/host").status_code == 503
        assert client.get("/api/client/status").json()["configured"]


def test_server_never_auto_pairs_and_pair_code_is_single_use(settings, factory, coordinator):
    configured = settings.model_copy(update={"server_mode": True, "api_auth_required": True})
    app = create_app(configured, connectors=[], start_scheduler=False, coordinator=coordinator)
    store = SessionStore(settings.local_dir)
    with TestClient(app, base_url="https://localhost", client=("127.0.0.1", 50000)) as client:
        assert client.get("/api/host").status_code == 401
        assert client.get("/files/1").status_code == 401
        code = store.create_pairing_code()
        result = client.post("/api/session/pair-token", json={"pairing_secret": code, "label": "Test Desktop"})
        assert result.status_code == 200
        assert client.post("/api/session/pair-token", json={"pairing_secret": code, "label": "Other"}).status_code == 401
        client.cookies.set("unios_session", result.json()["device_token"])
        host = client.get("/api/host").json()
        assert host["topology"] == "server"
        assert client.post("/api/host/release", headers={"X-UniOS-Lease-Generation": str(host["generation"])}).status_code == 409
        assert "private" in client.get("/files/1").headers["cache-control"]


def test_server_pairing_rejects_plain_remote_http(settings, factory, coordinator):
    app = create_app(settings.model_copy(update={"server_mode": True, "api_auth_required": True}),
                     connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app, base_url="http://testserver") as client:
        code = SessionStore(settings.local_dir).create_pairing_code()
        result = client.post("/api/session/pair-token", json={"pairing_secret": code, "label": "Test"})
        assert result.status_code == 403


def test_choose_mode_keeps_existing_installations_and_opens_the_choice_on_first_start(tmp_path):
    from app.client.service import choose_mode, client_enabled
    from app.integrations.storage import ConnectionStore

    fresh = tmp_path / "fresh"
    assert choose_mode(fresh) == "client"  # nothing yet: the screen offers both ways
    assert client_enabled(fresh) is False  # but a source checkout is not a paired client

    legacy = tmp_path / "legacy"
    (legacy / "local").mkdir(parents=True)
    (legacy / "local" / "uni_os.sqlite3").write_bytes(b"")
    assert choose_mode(legacy) == "local"  # database from before the choice existed

    for mode, with_database in (("client", True), ("local", False)):
        home = tmp_path / mode
        (home / "local").mkdir(parents=True)
        if with_database:
            (home / "local" / "uni_os.sqlite3").write_bytes(b"")
        ConnectionStore(home / "local", "server").save({"version": 1, "mode": mode})
        assert choose_mode(home) == mode  # an explicit marker always wins


def test_use_local_endpoint_records_the_choice_without_credentials(tmp_path):
    from app.client.service import choose_mode

    async def scenario():
        home = tmp_path / "client"
        app = create_client_app(home, tmp_path / "ui")
        async with app.router.lifespan_context(app), httpx.AsyncClient(
            transport=httpx.ASGITransport(app), base_url="http://127.0.0.1:8000",
            headers={"Sec-Fetch-Site": "same-origin", "Origin": "http://127.0.0.1:8000"},
        ) as client:
            response = await client.post("/api/client/use-local")
            assert response.status_code == 200, response.text
            assert response.json() == {"mode": "local"}
        assert choose_mode(home) == "local"
        stored = json.loads((home / "local" / "server-connection.json").read_text())
        assert stored == {"version": 1, "mode": "local"}

    asyncio.run(scenario())


def test_use_local_is_refused_on_a_paired_device(tmp_path, monkeypatch):
    from app.client.service import choose_mode

    async def scenario():
        home = tmp_path / "client"
        monkeypatch.setattr(ServerConnection, "state", lambda self: {"configured": True})
        app = create_client_app(home, tmp_path / "ui")
        async with app.router.lifespan_context(app), httpx.AsyncClient(
            transport=httpx.ASGITransport(app), base_url="http://127.0.0.1:8000",
            headers={"Sec-Fetch-Site": "same-origin", "Origin": "http://127.0.0.1:8000"},
        ) as client:
            assert (await client.post("/api/client/use-local")).status_code == 409
        assert choose_mode(home) == "client"

    asyncio.run(scenario())
