# SPDX-License-Identifier: AGPL-3.0-or-later

"""Reloading any page of the React app returns the app, never a 404."""

import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.web.spa_routes import is_react_route

# Every route of frontend/src/components/sidebarCatalog.ts and App.tsx, with sample ids.
FRONTEND_ROUTES = [
    "/", "/courses", "/courses/12", "/material/34", "/document/34", "/learning", "/learning/focus/source/34", "/notes",
    "/deadlines", "/inbox", "/search", "/jots", "/notifications", "/collections", "/voice", "/drop",
    "/university-documents", "/journal", "/journal/2026-10-11", "/study", "/study/cards", "/study/session/Mathe",
    "/analytics", "/digest", "/projects", "/projects/5", "/grades", "/mail", "/mensa", "/rooms", "/campus",
    "/rules", "/anki", "/exercises", "/explanations", "/ai", "/assessment", "/coding", "/addons",
    "/addons/demo-addon", "/marketplace", "/jobs", "/system", "/activity", "/trash", "/settings", "/more",
    "/welcome", "/import", "/setup", "/workspace/new",
]


@pytest.mark.parametrize("path", FRONTEND_ROUTES)
def test_every_frontend_route_is_served_by_the_app(path):
    assert is_react_route(path)


@pytest.mark.parametrize("path", ["/api/notes", "/files/3", "/courses/abc", "/material/", "/document/", "/learning/focus/source",
                                  "/projects/x", "/unknown", "/calendar.ics", "/health"])
def test_api_files_and_unknown_paths_are_not_swallowed(path):
    assert not is_react_route(path)


def test_reload_returns_index_for_grades_and_focus_workspace(settings, coordinator, tmp_path):
    built = tmp_path / "dist"
    built.mkdir()
    (built / "index.html").write_text("<html>UniOS</html>", encoding="utf-8")
    web = settings.model_copy(update={"serve_react": True, "react_dist_dir": built})
    app = create_app(web, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        for path in ("/grades", "/learning/focus/source/34", "/notes", "/workspace/new"):
            response = client.get(path)
            assert response.status_code == 200, path
            assert "UniOS" in response.text


def test_backend_knows_every_route_declared_in_the_frontend():
    """New pages are declared in the frontend; this fails if the server would 404 on their reload."""
    frontend = Path(__file__).resolve().parents[1] / "frontend" / "src"
    catalog = (frontend / "components" / "sidebarCatalog.ts").read_text(encoding="utf-8")
    shell = (frontend / "App.tsx").read_text(encoding="utf-8")
    declared = set(re.findall(r"(?:to|path): '(/[^']*)'", catalog)) | set(re.findall(r'path="(/[^"]*)"', shell))
    assert len(declared) > 40
    samples = {":id": "7", ":day": "2026-10-11", ":deck": "Mathe", ":kind": "source"}
    for route in sorted(declared):
        concrete = re.sub(r":[a-z]+", lambda match: samples[match.group(0)], route)
        assert is_react_route(concrete), f"{route} is a frontend route but reloads would 404"
