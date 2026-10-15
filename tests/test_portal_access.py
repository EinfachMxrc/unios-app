# SPDX-License-Identifier: AGPL-3.0-or-later

"""Portal sessions never leave the secure store; transport only reads its host."""

from datetime import UTC, datetime

import httpx
import pytest

from app.portals.read_client import (
    PortalLoginRequired,
    PortalReadClient,
    PortalReadError,
)
from app.portals.session import (
    PortalSession,
    PortalSessionError,
    clear_session,
    load_session,
    save_session,
    validate_session,
)

BASE = "https://portal.example.invalid/"
ENTRY = "https://portal.example.invalid/start?Session=fictional-secret&User=fictional"


def _state():
    return {"cookies": [
        {"name": "portal_session", "value": "fictional-cookie", "domain": ".example.invalid", "path": "/"},
        {"name": "sso_token", "value": "do-not-keep", "domain": "sso.other.invalid", "path": "/"},
    ], "origins": [
        {"origin": "https://portal.example.invalid", "localStorage": [{"name": "mode", "value": "fake"}]},
        {"origin": "https://sso.other.invalid", "localStorage": [{"name": "token", "value": "do-not-keep"}]},
    ]}


def test_portal_session_filters_other_origins_and_requires_secure_keyring(monkeypatch):
    saved = {}
    monkeypatch.setattr("app.portals.session._secure_backend", lambda: True)
    monkeypatch.setattr("app.portals.session.keyring.set_password", lambda _service, key, value: saved.__setitem__(key, value))
    monkeypatch.setattr("app.portals.session.keyring.get_password", lambda _service, key: saved.get(key))
    session = validate_session("primuss", BASE, ENTRY, _state())
    save_session(BASE, session)
    assert "do-not-keep" not in next(iter(saved.values()))
    restored = load_session("primuss", BASE)
    assert restored is not None and restored.entry_url == ENTRY
    assert len(restored.storage_state["cookies"]) == 1
    assert len(restored.storage_state["origins"]) == 1
    monkeypatch.setattr("app.portals.session._secure_backend", lambda: False)
    with pytest.raises(PortalSessionError, match="Schlüsselbund"):
        save_session(BASE, session)
    assert load_session("primuss", BASE) is None


def test_large_portal_session_fits_windows_credential_chunks(monkeypatch):
    saved: dict[str, str] = {}
    monkeypatch.setattr("app.portals.session._secure_backend", lambda: True)

    def store(_service: str, account: str, value: str) -> None:
        if len(value) > 700:
            raise OSError(1783, "Credential exceeds test store limit")
        saved[account] = value

    monkeypatch.setattr("app.portals.session.keyring.set_password", store)
    monkeypatch.setattr("app.portals.session.keyring.get_password",
                        lambda _service, account: saved.get(account))
    monkeypatch.setattr("app.portals.session.keyring.delete_password",
                        lambda _service, account: saved.pop(account))
    state = _state()
    state["origins"][0]["localStorage"] = [
        {"name": f"item-{index}", "value": f"fake-{index:04d}-" + f"{index * 7919:08x}" * 18}
        for index in range(45)
    ]
    session = validate_session("mycampus", BASE, BASE + "home", state)
    save_session(BASE, session)
    assert len(saved) > 2
    assert all(len(value) <= 700 for value in saved.values())
    restored = load_session("mycampus", BASE)
    assert restored is not None and restored.storage_state == session.storage_state
    clear_session("mycampus", BASE)
    assert saved == {}


def test_portal_transport_is_get_only_and_refuses_foreign_redirect_without_leaking_url():
    observed = []

    def reply(request: httpx.Request) -> httpx.Response:
        observed.append(request)
        if request.url.path == "/start":
            return httpx.Response(200, headers={"content-type": "text/html"}, text="<p>Fiktive Seite</p>")
        return httpx.Response(302, headers={"location": "https://evil.invalid/steal"})

    session = PortalSession("primuss", ENTRY,
                            validate_session("primuss", BASE, ENTRY, _state()).storage_state,
                            datetime.now(UTC))
    with (httpx.Client(transport=httpx.MockTransport(reply)) as http,
          PortalReadClient(BASE, session, client=http) as reader):
        assert "Fiktive Seite" in reader.get_html()
        assert observed[0].method == "GET"
        assert "fictional-cookie" in observed[0].headers["cookie"]
        with pytest.raises(PortalReadError) as error:
            reader.get_html("/redirect")
        assert "fictional-secret" not in str(error.value)
        assert len(observed) == 2 and all(item.method == "GET" for item in observed)
        with pytest.raises(PortalReadError):
            reader.get_html("https://evil.invalid/steal")
        assert len(observed) == 2


def test_mycampus_needs_own_cookie_and_rejects_unrelated_browser_state():
    with pytest.raises(PortalSessionError, match="keine Portal-Session"):
        validate_session("mycampus", BASE, "https://portal.example.invalid/home",
                         {"cookies": [_state()["cookies"][1]], "origins": []})


def test_explicit_university_sso_cookie_is_kept_only_for_browser_reuse(monkeypatch):
    state = _state()
    state["cookies"].append({"name": "sso", "value": "synthetic-sso",
                             "domain": "sso.example.invalid", "path": "/"})
    session = validate_session("mycampus", BASE, BASE + "home", state,
                               ("sso.example.invalid",))
    assert {cookie["name"] for cookie in session.storage_state["cookies"]} == {
        "portal_session", "sso"}
    assert session.auth_cookie_hosts == ("sso.example.invalid",)
    stored: dict[str, str] = {}
    monkeypatch.setattr("app.portals.session._secure_backend", lambda: True)
    monkeypatch.setattr("app.portals.session.keyring.set_password",
                        lambda _service, account, value: stored.__setitem__(account, value))
    monkeypatch.setattr("app.portals.session.keyring.get_password",
                        lambda _service, account: stored.get(account))
    save_session(BASE, session)
    restored = load_session("mycampus", BASE)
    assert restored is not None and restored.auth_cookie_hosts == ("sso.example.invalid",)
    assert {cookie["name"] for cookie in restored.storage_state["cookies"]} == {
        "portal_session", "sso"}
    with pytest.raises(PortalSessionError, match="SSO-Cookie-Domain"):
        validate_session("mycampus", BASE, BASE + "home", state, ("sso.other.invalid",))


def test_portal_transport_rejects_external_meta_refresh_as_login_page():
    session = validate_session("primuss", BASE, ENTRY, _state())
    response = httpx.Response(200, headers={"content-type": "text/html"},
                              text='<meta http-equiv="refresh" content="0;URL=https://login.example.invalid/">')
    with (httpx.Client(transport=httpx.MockTransport(lambda _request: response)) as http,
          PortalReadClient(BASE, session, client=http) as reader,
          pytest.raises(PortalLoginRequired, match="Hochschul-Login")):
        reader.get_html()


@pytest.mark.parametrize("refresh", [
    '<meta http-equiv="refresh" content="900;url=/home">',
    '<noscript><meta http-equiv="refresh" content="0;url=/home"></noscript>',
])
def test_portal_transport_keeps_readable_page_with_fallback_refresh(refresh):
    session = validate_session("mycampus", BASE, BASE + "home", _state())
    seen = []

    def reply(request):
        seen.append(request)
        return httpx.Response(200, headers={"content-type": "text/html"}, text=
            refresh + '<main>Studiengänge</main>')

    with (httpx.Client(transport=httpx.MockTransport(reply)) as http,
          PortalReadClient(BASE, session, client=http) as reader):
        assert "Studiengänge" in reader.get_html()
    assert len(seen) == 1


def test_portal_transport_does_not_accept_password_form_as_saved_session():
    session = validate_session("mycampus", BASE, "https://portal.example.invalid/home", _state())
    response = httpx.Response(200, headers={"content-type": "text/html"},
                              text='<h1>Login</h1><input type="password" name="password">')
    with (httpx.Client(transport=httpx.MockTransport(lambda _request: response)) as http,
          PortalReadClient(BASE, session, client=http) as reader,
          pytest.raises(PortalLoginRequired, match="Hochschul-Login")):
        reader.get_html()


def test_streamed_portal_content_is_read_without_executing_commands():
    import json

    session = validate_session("mycampus", BASE, BASE + "home", _state())
    commands = json.dumps([
        {"command": "add_js", "data": "never execute"},
        {"command": "insert", "method": "replaceWith", "data":
            '<nav aria-label="Main"><a href="/courses">Alle Studiengänge</a></nav>'},
    ])
    html = ('<main><span data-big-pipe-placeholder-id="fictional"></span></main>'
            '<script type="application/vnd.drupal-ajax" '
            'data-big-pipe-replacement-for-placeholder-with-id="fictional">' + commands + '</script>')
    seen = []

    def reply(request):
        seen.append(request)
        return httpx.Response(200, headers={"content-type": "text/html"}, text=html)

    with (httpx.Client(transport=httpx.MockTransport(reply)) as http,
          PortalReadClient(BASE, session, client=http) as reader):
        from bs4 import BeautifulSoup

        page = BeautifulSoup(reader.get_html(), "html.parser")
        assert page.select_one('nav a').get_text() == 'Alle Studiengänge'
        assert not page.select('[data-big-pipe-placeholder-id]')
    assert len(seen) == 1


def _file_client(handler):
    session = PortalSession("mycampus", BASE, _state(), datetime.now(UTC))
    return PortalReadClient(BASE, session, httpx.Client(transport=httpx.MockTransport(handler)))


def test_a_document_is_downloaded_with_get_from_the_portal_host_only():
    seen = []

    def handler(request):
        seen.append((request.method, str(request.url)))
        return httpx.Response(200, content=b"%PDF-1.7 fictional", headers={"content-type": "application/pdf"})

    with _file_client(handler) as reader:
        content = reader.get_file("https://portal.example.invalid/files/plan.pdf", max_bytes=1000)
    assert content == b"%PDF-1.7 fictional"
    assert seen == [("GET", "https://portal.example.invalid/files/plan.pdf")]


@pytest.mark.parametrize(("status", "headers", "body", "message"), [
    (200, {"content-type": "text/html"}, b"<html>Anmeldung</html>", "keine Datei"),
    (200, {"content-type": "application/pdf"}, b"x" * 2001, "zu groß"),
    (403, {}, b"", "Login"),
    (404, {}, b"", "fehlgeschlagen"),
])
def test_downloads_refuse_login_pages_oversized_files_and_errors(status, headers, body, message):
    client = _file_client(lambda _request: httpx.Response(status, content=body, headers=headers))
    with client as reader, pytest.raises(PortalReadError, match=message):
        reader.get_file("https://portal.example.invalid/files/plan.pdf", max_bytes=2000)


def test_downloads_do_not_follow_links_to_other_hosts():
    def handler(request):
        if request.url.host == "portal.example.invalid":
            return httpx.Response(302, headers={"location": "https://evil.example.com/steal.pdf"})
        raise AssertionError("the foreign host must never be contacted")

    for target in ("https://portal.example.invalid/files/plan.pdf", "https://evil.example.com/x.pdf"):
        with _file_client(handler) as reader, pytest.raises(PortalReadError, match="verlässt"):
            reader.get_file(target, max_bytes=2000)
