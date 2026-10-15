# SPDX-License-Identifier: AGPL-3.0-or-later

"""Course projects keep their links and reject stale or cross-course edits."""

import subprocess
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

import httpx
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import inspect

from alembic import command
from app.db.models import Assignment, Course, RepoSnapshot, Semester
from app.db.session import make_engine
from app.main import create_app
from app.projects import api as project_api
from app.projects import github
from app.projects.mirror import MirrorResult


def test_project_lifecycle_and_course_boundary(settings, factory, coordinator):
    with factory() as session:
        semester = Semester(name="Testsemester", is_current=True)
        session.add(semester)
        session.flush()
        first = Course(source="moodle", source_id="one", name="Entwurf", semester_id=semester.id)
        second = Course(source="moodle", source_id="two", name="Anderer Kurs", semester_id=semester.id)
        session.add_all([first, second])
        session.flush()
        task = Assignment(source="moodle", source_key="task", course_id=first.id,
                          title="Abgabe", url="https://moodle.example.invalid/assign", due_at=None)
        session.add(task)
        session.commit()
        course_id, other_id, assignment_id = first.id, second.id, task.id

    payload = {
        "name": " Projektarbeit ", "course_id": course_id, "assignment_ids": [assignment_id],
        "members": [{"name": "Alex", "github_username": "alex-dev"}],
        "links": [{"label": "Dokument", "url": "https://example.invalid/project"}],
        "todos": [{"title": "Gliederung", "done": False}],
        "notes": "Erster Entwurf", "github_repo": "team/repo",
    }
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        created = client.post("/api/projects", json=payload)
        assert created.status_code == 201, created.text
        project = created.json()
        assert project["name"] == "Projektarbeit" and project["revision"] == 1
        assert project["assignments"][0]["title"] == "Abgabe"
        assert project["todos"][0]["id"]
        project_id = project["id"]
        assert client.get(f"/api/projects/{project_id}/github").status_code == 503
        listing = client.get("/api/projects")
        assert listing.headers["Cache-Control"] == "private, no-store"
        assert listing.json()[0]["open_todo_count"] == 1

        wrong_course = client.put(f"/api/projects/{project_id}", json={
            **payload, "course_id": other_id, "expected_revision": 1,
        })
        assert wrong_course.status_code == 422
        stale = client.put(f"/api/projects/{project_id}", json={
            **payload, "expected_revision": 2,
        })
        assert stale.status_code == 409
        changed = client.put(f"/api/projects/{project_id}", json={
            **payload, "todos": [{**project["todos"][0], "done": True}], "expected_revision": 1,
        })
        assert changed.status_code == 200, changed.text
        assert changed.json()["revision"] == 2
        assert client.get("/api/projects").json()[0]["open_todo_count"] == 0

        archived = client.post(f"/api/projects/{project_id}/archive", json={"expected_revision": 2})
        assert archived.status_code == 200 and archived.json()["archived_at"]
        assert client.get("/api/projects").json() == []
        assert len(client.get("/api/projects?include_archived=true").json()) == 1
        restored = client.post(f"/api/projects/{project_id}/restore", json={"expected_revision": 3})
        assert restored.status_code == 200 and restored.json()["archived_at"] is None


def test_project_migration_on_empty_fixture_database(settings, coordinator):
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.attributes["settings"] = settings
    config.attributes["host_coordinator"] = coordinator
    command.upgrade(config, "head")
    engine = make_engine(settings, coordinator)
    try:
        inspector = inspect(engine)
        assert {"projects", "project_assignments", "repo_snapshots"} <= set(inspector.get_table_names())
        assert "revision" in {column["name"] for column in inspector.get_columns("projects")}
    finally:
        engine.dispose()


def test_github_activity_reads_only_selected_repository(monkeypatch):
    seen = []
    original_client = httpx.Client

    def respond(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        assert request.method == "GET"
        assert request.url.host == "api.github.com"
        assert request.url.path.startswith("/repos/team/repo/")
        assert request.headers["authorization"] == "Bearer fixture-token"
        kind = request.url.path.rsplit("/", 1)[-1]
        data = {
            "commits": [{"sha": "a" * 40, "author": {"login": "alex-dev"},
                         "commit": {"message": "Plan erstellt\nDetails", "author": {"date": "2026-09-25T12:00:00Z"}}}],
            "issues": [{"number": 3, "title": "Offene Frage", "user": {"login": "alex-dev"},
                        "updated_at": "2026-09-25T13:00:00Z", "state": "open"},
                       {"number": 4, "title": "PR in Issues", "pull_request": {}, "user": {"login": "alex-dev"}}],
            "pulls": [{"number": 4, "title": "Verbesserung", "user": {"login": "alex-dev"},
                       "updated_at": "2026-09-25T14:00:00Z", "state": "open"}],
            "branches": [{"name": "main"}],
        }
        return httpx.Response(200, json=data[kind])

    def client_factory(**kwargs):
        return original_client(base_url=kwargs["base_url"], headers=kwargs["headers"],
                               transport=httpx.MockTransport(respond))

    monkeypatch.setattr(github.httpx, "Client", client_factory)
    activity = github.fetch_activity("team/repo", [{"name": "Alex", "github_username": "alex-dev"}],
                                     "fixture-token")
    assert len(seen) == 4
    assert activity.commits[0].title == "Plan erstellt"
    assert activity.issues[0].url.endswith("/issues/3")
    assert activity.pull_requests[0].url.endswith("/pull/4")
    assert activity.branches == ["main"]
    assert activity.members[0].commits == activity.members[0].issues == activity.members[0].pull_requests == 1


def test_project_links_are_bidirectional_and_archived_projects_are_not_suggested(settings, factory, coordinator):
    with factory() as session:
        course = Course(source="moodle", source_id="links", name="Datenbanken")
        session.add(course)
        session.commit()
        course_id = course.id
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        created = client.post("/api/projects", json={"name": "Semesterprojekt", "course_id": course_id})
        assert created.status_code == 201, created.text
        project_id = created.json()["id"]
        candidates = client.get("/api/links/candidates", params={"q": "Semesterprojekt"}).json()
        assert [(item["type"], item["id"]) for item in candidates] == [("project", str(project_id))]
        link = client.post("/api/links", json={"from_type": "project", "from_id": str(project_id),
                                                 "to_type": "course", "to_id": str(course_id)})
        assert link.status_code == 200, link.text
        assert client.get(f"/api/links/project/{project_id}").json()[0]["target"]["url"] == f"/courses/{course_id}"
        assert client.get(f"/api/links/course/{course_id}").json()[0]["target"]["url"] == f"/projects/{project_id}"
        assert client.post(f"/api/projects/{project_id}/archive", json={"expected_revision": 1}).status_code == 200
        assert client.get("/api/links/candidates", params={"q": "Semesterprojekt"}).json() == []
        assert client.get(f"/api/links/course/{course_id}").json()[0]["target"]["id"] == str(project_id)


def test_project_mirror_api_records_a_snapshot(settings, factory, coordinator, monkeypatch):
    with factory() as session:
        course = Course(source="moodle", source_id="mirror", name="Softwareprojekt")
        session.add(course)
        session.commit()
        course_id = course.id
    calls = []

    def fake_mirror(_settings, project_id, repository):
        calls.append((project_id, repository))
        return MirrorResult(repository=repository, fetched_at=datetime.now(UTC),
                            manifest_path="projects/mirrors/snapshots/fixture.json",
                            manifest_sha256="a" * 64, refs_count=2, head="b" * 40)

    monkeypatch.setattr(project_api, "mirror_repository", fake_mirror)
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        created = client.post("/api/projects", json={"name": "Mirror-Test", "course_id": course_id,
                                                      "github_repo": "team/repo"})
        project_id = created.json()["id"]
        assert client.get(f"/api/projects/{project_id}/mirror").json() is None
        mirrored = client.post(f"/api/projects/{project_id}/mirror")
        assert mirrored.status_code == 200, mirrored.text
        assert mirrored.json()["refs_count"] == 2
        assert calls == [(project_id, "team/repo")]
        assert client.get(f"/api/projects/{project_id}/mirror").json()["head"] == "b" * 40


def test_saved_project_code_can_be_searched_without_network(settings, factory, coordinator, tmp_path):
    settings.mcp_enabled = True
    settings.mcp_token = "fixture-mcp-token"
    with factory() as session:
        course = Course(source="moodle", source_id="code-search", name="Softwareprojekt")
        session.add(course)
        session.commit()
        course_id = course.id
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        created = client.post("/api/projects", json={"name": "Code-Suche", "course_id": course_id,
                                                      "github_repo": "team/repo"})
        project_id = created.json()["id"]
        missing = client.get(f"/api/projects/{project_id}/mirror/search", params={"q": "fixture"})
        assert missing.status_code == 404
        assert client.get(f"/api/projects/{project_id}/mirror/archive").status_code == 404

        source = tmp_path / "source"
        source.mkdir()
        subprocess.run(["git", "init", "-q", str(source)], check=True)
        subprocess.run(["git", "-C", str(source), "config", "user.email", "fixture@example.invalid"], check=True)
        subprocess.run(["git", "-C", str(source), "config", "user.name", "Fixture"], check=True)
        (source / "README.md").write_text("A unique fixture phrase lives here.\n", encoding="utf-8")
        subprocess.run(["git", "-C", str(source), "add", "README.md"], check=True)
        subprocess.run(["git", "-C", str(source), "commit", "-qm", "fixture"], check=True)
        head = subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip()
        mirror = settings.data_dir / "projects" / "mirrors" / "repos" / f"{project_id}.git"
        mirror.parent.mkdir(parents=True)
        subprocess.run(["git", "clone", "--bare", "-q", str(source), str(mirror)], check=True)
        with factory() as session:
            session.add(RepoSnapshot(project_id=project_id, repository="team/repo",
                                     fetched_at=datetime.now(UTC), manifest_path="fixture.json",
                                     manifest_sha256="a" * 64, refs_count=1, head=head))
            session.commit()

        found = client.get(f"/api/projects/{project_id}/mirror/search", params={"q": "FIXTURE"})
        assert found.status_code == 200, found.text
        assert found.json()["head"] == head
        assert found.json()["matches"] == [{"path": "README.md", "line": 1,
                                             "excerpt": "A unique fixture phrase lives here."}]
        assert client.get(f"/api/projects/{project_id}/mirror/search", params={"q": "absent"}).json()["matches"] == []
        assert client.get(f"/api/projects/{project_id}/mirror/search", params={"q": "-e"}).status_code == 200
        archive = client.get(f"/api/projects/{project_id}/mirror/archive")
        assert archive.status_code == 200, archive.text if archive.status_code != 200 else ""
        assert archive.headers["content-type"] == "application/zip"
        assert archive.headers["x-unios-archive-head"] == head
        assert f"projekt-{project_id}-{head[:12]}.zip" in archive.headers["content-disposition"]
        with ZipFile(BytesIO(archive.content)) as bundle:
            assert bundle.namelist() == ["projekt/", "projekt/README.md"]
            assert bundle.read("projekt/README.md") == (source / "README.md").read_bytes()
        headers = {"X-UniOS-MCP-Token": "fixture-mcp-token"}
        mcp_path = f"/api/ai/mcp/projects/{project_id}/search"
        assert client.get("/api/ai/mcp/projects", headers=headers).status_code == 403
        assert client.get(mcp_path, params={"query": "fixture"}, headers=headers).status_code == 404
        assert client.put("/api/ai/access/category/projects", json={"allowed": True}).status_code == 200
        assert client.get("/api/ai/mcp/projects", headers=headers).json() == [
            {"id": project_id, "name": "Code-Suche", "course_id": course_id}]
        assert client.get(mcp_path, params={"query": "fixture"}, headers=headers).json()["matches"] == found.json()["matches"]
        assert client.put(f"/api/ai/access/course/{course_id}", json={"allowed": False}).status_code == 200
        assert client.get("/api/ai/mcp/projects", headers=headers).json() == []
        assert client.get(mcp_path, params={"query": "fixture"}, headers=headers).status_code == 404
