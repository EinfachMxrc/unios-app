# SPDX-License-Identifier: AGPL-3.0-or-later

"""A demo must be repeatable and unable to adopt an existing personal folder."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.db.models import (
    Change,
    Course,
    Deadline,
    Exam,
    Exercise,
    Note,
    ResourceVersion,
)
from app.demo.service import create_demo, demo_settings
from app.main import create_app


def test_demo_is_isolated_and_idempotent(tmp_path):
    root = tmp_path / "demo"
    first = create_demo(root)
    second = create_demo(root)
    assert first == second
    engine = create_engine(f"sqlite:///{first['database']}")
    with Session(engine) as session:
        assert session.scalar(select(func.count()).select_from(Course)) == 4
        assert session.scalar(select(func.count()).select_from(ResourceVersion)) == 12
        assert session.scalar(select(func.count()).select_from(Deadline)) == 6
        assert session.scalar(select(func.count()).select_from(Exam)) == 1
        assert session.scalar(select(func.count()).select_from(Exercise)) == 4
        assert session.scalar(select(func.count()).select_from(Note)) == 3
        assert session.scalar(select(func.count()).select_from(Change)) == 3
    assert list((root / "data" / "uni" / "demo").rglob("*.pdf"))
    settings = demo_settings(root).model_copy(update={"allowed_hosts": "127.0.0.1,localhost,testserver",
                                                   "api_auth_required": False, "serve_react": False})
    with TestClient(create_app(settings, connectors=[], start_scheduler=False)) as client:
        courses = client.get("/api/courses")
        assert courses.status_code == 200
        assert len(courses.json()["courses"]) == 4
        status = client.get("/api/anki/study/status")
        assert status.status_code == 200
        assert status.json()["cards"] == 15
        assert status.json()["mode"] == "integrated"
        due = client.get("/api/anki/study/due")
        assert due.status_code == 200
        assert len(due.json()["cards"]) > 0
        review = client.post("/api/anki/study/reviews", json={
            "card_id": due.json()["cards"][0]["id"], "rating": 3, "review_id": "demo-first-review",
        })
        assert review.status_code == 200
        assert client.get("/api/anki/study/status").json()["reviews"] == 1
    other = tmp_path / "personal"
    other.mkdir()
    (other / "uni_os.sqlite3").write_bytes(b"important")
    with pytest.raises(ValueError, match="kein UniOS-Demo"):
        create_demo(other)
    assert (other / "uni_os.sqlite3").read_bytes() == b"important"


def test_demo_never_adopts_settings_from_personal_environment(tmp_path, monkeypatch):
    # Invented inputs prove all BaseSettings environment sources are excluded.
    monkeypatch.setenv("CODING_RUNNER_URL", "http://judge0:2358")
    monkeypatch.setenv("CODING_RUNNER_TOKEN", "synthetic-env-only-value")
    monkeypatch.setenv("CONNECTOR_PLUGINS", "unknown_plugin")
    monkeypatch.setenv("AI_ADAPTER_ENABLED", "true")
    result = create_demo(tmp_path / "isolated")
    settings = demo_settings(tmp_path / "isolated")
    assert settings.coding_runner_url == ""
    assert settings.coding_runner_token == ""
    assert settings.connector_plugins == ""
    assert not settings.ai_adapter_enabled
    assert str(settings.local_dir / "uni_os.sqlite3") == result["database"]
