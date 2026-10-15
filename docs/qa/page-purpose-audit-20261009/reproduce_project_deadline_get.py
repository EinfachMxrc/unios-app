# SPDX-License-Identifier: AGPL-3.0-or-later
"""Reproduce the real project router against invented, in-memory SQLite rows.

No app.main, Settings instance, profile, lease, keychain, network listener or
on-disk study database is opened. The only output file is the QA JSON receipt.
"""

from __future__ import annotations

import json
import sys
import traceback
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app.db.models import Base, Course, Project
from app.db.session import make_session_factory
from app.projects.api import project_router


class FixtureWriter:
    """Only the router's writer gate is stubbed; persistence/DTOs remain real."""

    def assert_writer(self) -> None:
        return None


def run() -> dict:
    engine = create_engine(
        "sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)
    factory = make_session_factory(engine)
    with factory() as session:
        course = Course(source="manual", source_id="qa-project-deadline", name="Erfundener QA-Kurs")
        session.add(course)
        session.commit()
        course_id = course.id

    app = FastAPI()
    # These router endpoints do not access settings; avoid constructing a
    # BaseSettings object that could inspect environment/profile information.
    app.include_router(project_router(SimpleNamespace(), factory, FixtureWriter()))
    records = []
    payload = {"name": "Erfundenes QA-Projekt", "course_id": course_id}
    deadline = "2026-10-26T08:15:00.000Z"
    with TestClient(app, raise_server_exceptions=False) as client:
        control = client.post("/api/projects", json=payload)
        assert control.status_code == 201, control.text
        control_id = control.json()["id"]
        control_get = client.get(f"/api/projects/{control_id}")
        assert control_get.status_code == 200, control_get.text
        records.append({
            "case": "control-without-deadline", "post_status": control.status_code,
            "get_status": control_get.status_code, "deadline_at": control_get.json()["deadline_at"],
        })

        naive = client.post("/api/projects", json={**payload, "deadline_at": "2026-10-26T08:15:00"})
        assert naive.status_code == 422, naive.text
        records.append({"case": "naive-input-rejected", "post_status": naive.status_code})

        created = client.post("/api/projects", json={**payload, "deadline_at": deadline})
        assert created.status_code == 201, created.text
        project_id = created.json()["id"]
        fresh_get = client.get(f"/api/projects/{project_id}")
        listing = client.get("/api/projects")
        with factory() as session:
            persisted = session.get(Project, project_id)
            assert persisted is not None
            fresh_deadline = persisted.deadline_at
            assert fresh_deadline == datetime(2026, 10, 26, 8, 15, tzinfo=UTC).replace(tzinfo=None)
            assert fresh_deadline.tzinfo is None

        assert fresh_get.status_code == 500, fresh_get.text
        assert listing.status_code == 200, listing.text
        assert created.json()["deadline_at"] == "2026-10-26T08:15:00Z"
        records.append({
            "case": "aware-utc-deadline-post-then-fresh-get",
            "submitted_deadline": deadline, "project_id": project_id,
            "post_status": created.status_code, "post_deadline": created.json()["deadline_at"],
            "get_status": fresh_get.status_code, "get_body": fresh_get.text,
            "list_status": listing.status_code,
            "list_deadline": next(row["deadline_at"] for row in listing.json() if row["id"] == project_id),
            "fresh_sqlalchemy_deadline": fresh_deadline.isoformat(),
            "fresh_sqlalchemy_tzinfo": None,
        })

        # The same inherited response validation runs after archive/restore
        # commits. A 500 response therefore does not prove mutation rollback.
        archived = client.post(f"/api/projects/{project_id}/archive", json={"expected_revision": 1})
        with factory() as session:
            item = session.get(Project, project_id)
            archive_committed = item.archived_at is not None and item.revision == 2
        assert archived.status_code == 500 and archive_committed
        restored = client.post(f"/api/projects/{project_id}/restore", json={"expected_revision": 2})
        with factory() as session:
            item = session.get(Project, project_id)
            restore_committed = item.archived_at is None and item.revision == 3
        assert restored.status_code == 500 and restore_committed
        records.append({
            "case": "archive-restore-commit-before-response-validation",
            "archive_status": archived.status_code, "archive_committed": archive_committed,
            "restore_status": restored.status_code, "restore_committed": restore_committed,
        })

    try:
        with TestClient(app, raise_server_exceptions=True) as client:
            client.get(f"/api/projects/{project_id}")
    except ValidationError as error:
        details = error.errors()
        assert error.title == "ProjectView"
        assert any(value["loc"] == ("deadline_at",) and "Frist benötigt eine Zeitzone" in value["msg"]
                   for value in details)
        records.append({
            "case": "underlying-exception", "exception_type": type(error).__name__,
            "model": error.title,
            "validation": [{"loc": list(value["loc"]), "type": value["type"], "message": value["msg"]}
                           for value in details],
            "traceback": traceback.format_exc(),
        })
    else:
        raise AssertionError("Expected ProjectView deadline validation to fail")
    finally:
        engine.dispose()

    return {
        "_license": "SPDX-License-Identifier: AGPL-3.0-or-later",
        "source_revision": "05e56cfad86b110e2d1be505adad2b58e3ab6d2a",
        "recorded_at": datetime.now(UTC).isoformat(),
        "synthetic_only": True, "database": "in-memory SQLite", "network_listener": False,
        "scope": "Actual project_router, ORM persistence and DTO validation; writer gate is a fixture stub",
        "bug_reproduced": True, "records": records,
        "root_cause": {
            "response_inherits_input_validator": "app/projects/api.py:103–108/152",
            "fresh_get_passes_naive_persisted_deadline_to_view": "app/projects/api.py:197–206/234–241",
            "sqlite_datetime_timezone_true_loses_tzinfo": "app/db/models.py:382",
            "post_retains_aware_datetime_in_session": "app/db/session.py:53 (expire_on_commit=False)",
        },
        "coverage_gap": "tests/test_projects.py lifecycle payload has no deadline_at and does not GET a dated project detail",
        "production_changes": False,
    }


if __name__ == "__main__":
    output = run()
    receipt = Path(__file__).with_name("project-deadline-get-repro.json")
    receipt.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"bug_reproduced": output["bug_reproduced"], "cases": len(output["records"]),
                      "receipt": receipt.name}, ensure_ascii=False))
