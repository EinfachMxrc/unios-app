# SPDX-License-Identifier: AGPL-3.0-or-later

"""An exported alpha diagnosis exposes only the documented allowlisted fields."""

import json

from fastapi.testclient import TestClient
from sqlalchemy import text

from app.main import create_app


def test_diagnostics_exclude_private_content(settings, factory, coordinator):
    with factory() as session:
        # The `factory` fixture already stamps a real Alembic head (see
        # tests/conftest.py's `_stamp_current_schema`) so schema-version
        # checks elsewhere see a valid, current version; overwrite it here to
        # exercise this endpoint with a distinct, recognizable value instead.
        session.execute(text("CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL)"))
        session.execute(text("DELETE FROM alembic_version"))
        session.execute(text("INSERT INTO alembic_version VALUES ('fake-schema')"))
        session.commit()
    app = create_app(settings, connectors=[], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        response = client.get("/api/feedback/diagnostics")
    assert response.status_code == 200
    report = response.json()
    assert set(report) == {"app_version", "schema_version", "os", "os_version", "connectors",
                           "host", "sync", "error_codes"}
    assert report["schema_version"] == "fake-schema"
    assert report["host"]["mode"] == "host"
    encoded = json.dumps(report)
    assert "fixture-token" not in encoded
    assert str(settings.data_dir) not in encoded
    assert str(settings.local_dir) not in encoded
    assert "moodle.example.invalid" not in encoded
