# SPDX-License-Identifier: AGPL-3.0-or-later

"""DNS-rebinding needs a foreign Host header to work; reject it everywhere.

Also verifies the baseline security headers land on every response, since a
self-hosted single-page app has no other line of defence against a hostile
page that got a browser to reach the loopback API.
"""

from fastapi.testclient import TestClient

from app.main import create_app


def test_new_spa_pages_and_study_sessions_support_direct_reload(settings, factory, coordinator, tmp_path):
    built = tmp_path / "react"
    built.mkdir()
    (built / "index.html").write_text("<html>Fictional SPA shell</html>", encoding="utf-8")
    web_settings = settings.model_copy(update={"serve_react": True, "react_dist_dir": built,
                                                "api_auth_required": True})
    app = create_app(web_settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        for path in ["/learning", "/study", "/assessment", "/coding", "/rooms", "/notifications",
                     "/jobs", "/marketplace", "/welcome", "/import", "/study/cards", "/study/session/Fictional%20deck"]:
            response = client.get(path)
            assert response.status_code == 200 and "Fictional SPA shell" in response.text
            assert response.headers["cache-control"] == "no-store"
            assert client.head(path).status_code == 200
        assert client.get("/api/courses").status_code == 401
        assert client.get("/assessment", headers={"Host": "evil.example"}).status_code == 400


def test_foreign_host_header_is_rejected_on_every_kind_of_route(settings, factory, coordinator):
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app, headers={"Host": "evil.example"}) as client:
        assert client.get("/api/host").status_code == 400
        assert client.post("/api/sync").status_code == 400
        assert client.get("/calendar.ics").status_code == 400
        assert client.get("/api/host").json()["detail"]


def test_allowed_host_headers_pass_and_extra_names_are_honoured(settings, factory, coordinator):
    configured = settings.model_copy(update={
        "allowed_hosts": "127.0.0.1,localhost,[::1],testserver,geraet.tailnet.ts.net",
    })
    app = create_app(configured, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.get("/api/host", headers={"Host": "127.0.0.1:8000"}).status_code == 200
        assert client.get("/api/host", headers={"Host": "localhost"}).status_code == 200
        assert client.get("/api/host", headers={"Host": "[::1]:8000"}).status_code == 200
        assert client.get("/api/host", headers={"Host": "geraet.tailnet.ts.net"}).status_code == 200


def test_host_health_url_hostname_is_always_allowed(settings, factory, coordinator):
    configured = settings.model_copy(update={"host_health_url": "https://mein-geraet.example.ts.net/health"})
    app = create_app(configured, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        assert client.get("/api/host", headers={"Host": "mein-geraet.example.ts.net"}).status_code == 200


def test_security_headers_present_on_api_and_served_react_index(settings, factory, coordinator, tmp_path):
    built = tmp_path / "react"
    built.mkdir()
    (built / "index.html").write_text("<html>Dashboard</html>", encoding="utf-8")
    web_settings = settings.model_copy(update={"serve_react": True, "react_dist_dir": built})
    app = create_app(web_settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        api_response = client.get("/api/host")
        page_response = client.get("/")
        assert api_response.status_code == 200 and page_response.status_code == 200
        for response in (api_response, page_response):
            assert response.headers["x-content-type-options"] == "nosniff"
            assert response.headers["x-frame-options"] == "DENY"
            assert response.headers["referrer-policy"] == "same-origin"
            assert "camera=()" in response.headers["permissions-policy"]
            assert "microphone=(self)" in response.headers["permissions-policy"]
            csp = response.headers["content-security-policy"]
            assert "default-src 'self'" in csp
            assert "media-src 'self' blob:;" in csp
            assert "connect-src 'self';" in csp
            assert "frame-ancestors 'none'" in csp
            assert "object-src 'none'" in csp
