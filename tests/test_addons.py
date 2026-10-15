# SPDX-License-Identifier: AGPL-3.0-or-later

"""Declarative add-ons cannot read data or render until explicitly granted."""

from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.addons.manifest import ExtensionManifestV1
from app.db.models import Course
from app.main import create_app


def _community(version: str = "1.0.0", body: str = "Ein Satz zum Lernen.") -> dict:
    return {
        "schema_version": 1, "id": "org.example.study-help", "name": "Study Help", "author": "Example",
        "version": version, "description": "Ein Beispiel mit festem Ansichtstyp und ohne Code.",
        "kind": "ui", "permissions": ["courses.read"], "network_domains": [],
        "runtime": "declarative",
        "widgets": [{"slot": "today.secondary", "view": "courses", "title": "Kurse", "body": body}],
    }


def test_manifest_rejects_unapproved_code_network_and_permissions():
    valid = _community()
    for change in (
        {"network_domains": ["example.invalid"]},
        {"permissions": ["notes.read"]},
        {"script": "alert(1)"},
        {"widgets": [{"slot": "today.secondary", "view": "courses", "title": "Kurse", "html": "<script>"}]},
        {"permissions": []},
        {"widgets": [{"slot": "today.primary", "view": "text", "title": "Alles ersetzen"}]},
    ):
        try:
            ExtensionManifestV1.model_validate({**valid, **change})
        except ValidationError:
            pass
        else:
            raise AssertionError(f"unsafe manifest accepted: {change}")


def test_addon_install_approve_enable_and_revoke_gate_course_data(settings, factory, coordinator):
    with factory() as session:
        session.add(Course(source="fake", source_id="course-1", name="Erfundene Informatik"))
        session.commit()
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        catalog = client.get("/api/addons/catalog").json()
        addon = next(item for item in catalog if item["id"] == "org.unios.course-glance")
        assert addon["permissions"] == ["courses.read"]
        assert not addon["installed"] and not addon["approved"] and not addon["enabled"]
        assert client.get("/api/addons/slots/today.secondary").json() == []
        url = "/api/addons/org.unios.course-glance"
        body = {"fingerprint": addon["fingerprint"]}
        assert client.post(url + "/approve", json=body).status_code == 409
        assert client.post(url + "/install", json={"fingerprint": "old"}).status_code == 409
        assert client.post(url + "/install", json=body).status_code == 200
        assert client.post(url + "/approve", json=body).status_code == 200
        assert client.get("/api/addons/slots/today.secondary").json() == []
        assert client.post(url + "/enable", json=body).status_code == 200
        widgets = client.get("/api/addons/slots/today.secondary").json()
        assert widgets[0]["items"] == [{"label": "Erfundene Informatik", "href": "/courses/1"}]
        assert widgets[0]["addon_id"] == addon["id"]
        assert client.post(url + "/revoke", json=body).status_code == 200
        assert client.get("/api/addons/slots/today.secondary").json() == []
        assert not client.get("/api/addons/catalog").json()[0].get("secret")


def test_import_upgrade_invalidates_old_grant_and_never_runs_code(settings, factory, coordinator):
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        imported = client.post("/api/addons/import", json=_community())
        assert imported.status_code == 200
        addon_id = "org.example.study-help"
        url = f"/api/addons/{addon_id}"
        old = {"fingerprint": imported.json()["fingerprint"]}
        for action in ("install", "approve", "enable"):
            assert client.post(f"{url}/{action}", json=old).status_code == 200
        assert len(client.get("/api/addons/slots/today.secondary").json()) == 1
        assert client.post("/api/addons/import", json=_community(body="Geänderter Text")).status_code == 409
        updated = client.post("/api/addons/import", json=_community("1.1.0", "Geänderter Text"))
        assert updated.status_code == 200
        assert client.get("/api/addons/slots/today.secondary").json() == []
        assert client.post(f"{url}/enable", json=old).status_code == 409
        new = {"fingerprint": updated.json()["fingerprint"]}
        assert client.post(f"{url}/approve", json=new).status_code == 409
        for action in ("install", "approve", "enable"):
            assert client.post(f"{url}/{action}", json=new).status_code == 200
        assert len(client.get("/api/addons/slots/today.secondary").json()) == 1


def test_feature_page_requires_activation(settings, coordinator):
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        addon = next(item for item in client.get("/api/addons/catalog").json()
                     if item["id"] == "org.unios.focus-timer")
        url = "/api/addons/org.unios.focus-timer"
        body = {"fingerprint": addon["fingerprint"]}
        assert client.get("/api/addons/pages/org.unios.focus-timer").status_code == 403
        for action in ("install", "approve", "enable"):
            assert client.post(f"{url}/{action}", json=body).status_code == 200
        page = client.get("/api/addons/pages/org.unios.focus-timer").json()
        assert page["view"] == "focus_timer" and page["duration_minutes"] == 25
        assert client.get("/api/addons/navigation").json()[0]["url"] == "/addons/org.unios.focus-timer"
        assert client.post(f"{url}/uninstall", json=body).status_code == 200
        assert client.get("/api/addons/pages/org.unios.focus-timer").status_code == 403


def test_import_rejects_reserved_ids_and_keeps_grants_after_restart(settings, factory, coordinator):
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.post("/api/addons/import", json={**_community(), "id": "org.unios.imposter"}).status_code == 400
        imported = client.post("/api/addons/import", json=_community())
        assert imported.status_code == 200
        fingerprint = imported.json()["fingerprint"]
        for action in ("install", "approve", "enable"):
            assert client.post(f"/api/addons/org.example.study-help/{action}",
                               json={"fingerprint": fingerprint}).status_code == 200
    restarted = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(restarted) as client:
        entry = next(item for item in client.get("/api/addons/catalog").json()
                     if item["id"] == "org.example.study-help")
        assert entry["installed"] and entry["approved"] and entry["enabled"]
        assert len(client.get("/api/addons/slots/today.secondary").json()) == 1


def test_standby_cannot_install_addon(settings, factory, coordinator, monkeypatch):
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        addon = client.get("/api/addons/catalog").json()[0]
        monkeypatch.setattr(type(coordinator), "is_writer", property(lambda _self: False))
        assert client.post(f"/api/addons/{addon['id']}/install",
                           json={"fingerprint": addon["fingerprint"]}).status_code == 423
