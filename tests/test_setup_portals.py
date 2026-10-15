# SPDX-License-Identifier: AGPL-3.0-or-later

"""The first-run assistant connects myCampus and PRIMUSS from the app's own login window."""

import json

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.portals.session import PortalSession


def _cookie(name: str, domain: str, value: str = "invented-cookie-value") -> dict:
    return {"name": name, "value": value, "domain": domain, "path": "/", "expires": -1,
            "httpOnly": True, "secure": True, "sameSite": "Lax"}


@pytest.fixture
def portal_app(settings, coordinator, monkeypatch):
    (settings.local_dir / "setup.json").write_text(
        '{"version":1,"institution":"hs-coburg","notifications":null,"completed":false}', encoding="utf-8")
    saved: dict[str, PortalSession] = {}
    monkeypatch.setattr("app.setup.api.keyring_available", lambda: True)
    monkeypatch.setattr("app.setup.api.save_session", lambda base_url, session: saved.__setitem__(session.portal, session))
    monkeypatch.setattr("app.setup.api.load_session", lambda portal, base_url: saved.get(portal))
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        yield client, saved


def test_status_lists_the_portals_of_the_chosen_university(portal_app):
    client, _ = portal_app
    portals = {item["portal"]: item for item in client.get("/api/setup/status").json()["portals"]}
    assert set(portals) == {"mycampus", "primuss"}
    assert portals["mycampus"]["connected"] is False
    assert portals["mycampus"]["login_url"].startswith("https://mycampus.hs-coburg.de")
    assert portals["primuss"]["login_url"].startswith("https://www3.primuss.de/")


def test_neutral_profile_has_no_portals(settings, coordinator):
    settings = settings.model_copy(update={"institution_slug": "generic", "moodle_base_url": "", "moodle_token": ""})
    (settings.local_dir / "setup.json").write_text(
        '{"version":1,"institution":null,"notifications":null,"completed":false}', encoding="utf-8")
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.get("/api/setup/status").json()["portals"] == []


def test_captured_mycampus_login_is_stored_and_never_echoed(portal_app):
    client, saved = portal_app
    response = client.post("/api/setup/portals/mycampus/session", json={
        "entry_url": "https://mycampus.hs-coburg.de/",
        "cookies": [_cookie("sid", "mycampus.hs-coburg.de", "secret-value-1"),
                    _cookie("sso", "sso.hs-coburg.de"),
                    _cookie("tracker", "ads.example.com")],
    })
    assert response.status_code == 200, response.text
    assert "secret-value-1" not in response.text
    portals = {item["portal"]: item for item in response.json()["portals"]}
    assert portals["mycampus"]["connected"] is True and portals["primuss"]["connected"] is False
    stored = {cookie["name"] for cookie in saved["mycampus"].storage_state["cookies"]}
    assert stored == {"sid", "sso"}  # foreign hosts never reach the keyring


@pytest.mark.parametrize(("previous", "expected"), [("login_error", "idle"), ("other_error", "error"), ("running", "running")])
def test_new_portal_login_resets_only_a_previous_login_error(portal_app, previous, expected):
    client, _saved = portal_app
    job = client.app.state.campus_import_job
    if previous == "running":
        job.begin()
    else:
        job.fail("Invented failure", login_required=previous == "login_error")
    response = client.post("/api/setup/portals/mycampus/session", json={
        "entry_url": "https://mycampus.hs-coburg.de/",
        "cookies": [_cookie("sid", "mycampus.hs-coburg.de")],
    })
    assert response.status_code == 200
    assert client.get("/api/mycampus/import/status").json()["state"] == expected


def test_primuss_login_may_carry_its_session_in_the_address(portal_app):
    client, saved = portal_app
    response = client.post("/api/setup/portals/primuss/session", json={
        "entry_url": "https://www3.primuss.de/cgi-bin/index.pl?Session=abc123&FH=fhco", "cookies": [],
    })
    assert response.status_code == 200, response.text
    assert "abc123" not in response.text
    assert "primuss" in saved


def test_login_that_is_not_on_the_portal_is_rejected(portal_app):
    client, saved = portal_app
    wrong_host = client.post("/api/setup/portals/mycampus/session", json={
        "entry_url": "https://evil.example.com/", "cookies": [_cookie("sid", "mycampus.hs-coburg.de")]})
    assert wrong_host.status_code == 400
    not_logged_in = client.post("/api/setup/portals/mycampus/session", json={
        "entry_url": "https://mycampus.hs-coburg.de/", "cookies": []})
    assert not_logged_in.status_code == 400
    assert client.post("/api/setup/portals/mail/session", json={
        "entry_url": "https://mycampus.hs-coburg.de/", "cookies": []}).status_code == 404
    assert saved == {}


def test_without_a_secure_keyring_nothing_is_kept(portal_app, monkeypatch):
    client, saved = portal_app
    monkeypatch.setattr("app.setup.api.keyring_available", lambda: False)
    response = client.post("/api/setup/portals/mycampus/session", json={
        "entry_url": "https://mycampus.hs-coburg.de/", "cookies": [_cookie("sid", "mycampus.hs-coburg.de")]})
    assert response.status_code == 503
    assert saved == {}
    assert json.loads(response.text)["detail"]


def test_setup_page_survives_a_reload_of_its_address(settings, coordinator, tmp_path):
    """The desktop app links to /setup from the connections page; a reload must not 404."""
    built = tmp_path / "react"
    built.mkdir()
    (built / "index.html").write_text("<html>UniOS</html>", encoding="utf-8")
    web_settings = settings.model_copy(update={"serve_react": True, "react_dist_dir": built})
    app = create_app(web_settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        response = client.get("/setup")
        assert response.status_code == 200 and "UniOS" in response.text


SECRET_PAGE = (
    "<html><head><title>Geheimer Titel</title><script>var token='geheim-token'</script></head>"
    "<body><div class='meinKurs' id='real-id'><h1>Anna Muster Notenspiegel</h1>"
    "<a href='https://www3.primuss.de/cgi-bin/x?Session=abc'>Algorithmen 1,3</a>"
    "<form action='/post'><input name='pw' value='hunter2'></form></div></body></html>"
)


@pytest.fixture
def sample_app(portal_app, tmp_path, monkeypatch):
    client, _ = portal_app
    kept = []
    monkeypatch.setattr("app.setup.api.default_sample_directory", lambda: tmp_path / "samples")
    monkeypatch.setattr("app.portals.sample_export.save_alias_map", kept.append)
    return client, tmp_path / "samples", kept


def test_captured_pages_become_an_anonymised_zip_without_visible_text(sample_app):
    import zipfile

    client, folder, kept = sample_app
    response = client.post("/api/setup/portals/primuss/samples", json={"pages": [
        {"kind": "grades", "html": SECRET_PAGE}, {"kind": "blog", "html": SECRET_PAGE}]})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["pages"] == 2 and body["file"].endswith(".zip") and len(kept) == 1
    archive = next(folder.glob("primuss-beispiel-*.zip"))
    assert archive.name == body["file"]
    with zipfile.ZipFile(archive) as opened:
        manifest = json.loads(opened.read("manifest.json"))
        assert manifest["page_types"] == ["grades", "blog"]
        content = "".join(opened.read(name).decode("utf-8") for name in opened.namelist())
    for secret in ("Anna", "Muster", "Algorithmen", "hunter2", "geheim", "Session=abc", "meinKurs", "real-id"):
        assert secret not in content
    assert secret not in response.text and str(folder) not in response.text


def test_sample_limits_and_unknown_inputs_are_rejected(sample_app):
    client, folder, _ = sample_app
    page = {"kind": "start", "html": "<html><body>x</body></html>"}
    assert client.post("/api/setup/portals/primuss/samples", json={"pages": []}).status_code == 422
    assert client.post("/api/setup/portals/primuss/samples", json={"pages": [page] * 31}).status_code == 422
    assert client.post("/api/setup/portals/primuss/samples",
                       json={"pages": [{"kind": "bank", "html": "<p>x</p>"}]}).status_code == 422
    assert client.post("/api/setup/portals/mail/samples", json={"pages": [page]}).status_code == 404
    assert not folder.exists() or not list(folder.iterdir())


def test_sample_needs_a_secure_keyring_for_the_alias_map(sample_app, monkeypatch):
    client, folder, _ = sample_app
    monkeypatch.setattr("app.setup.api.keyring_available", lambda: False)
    response = client.post("/api/setup/portals/mycampus/samples", json={"pages": [
        {"kind": "news", "html": "<html><body><p>x</p></body></html>"}]})
    assert response.status_code == 503
    assert not folder.exists() or not list(folder.iterdir())
