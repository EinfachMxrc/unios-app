# SPDX-License-Identifier: AGPL-3.0-or-later
"""A verified new token never erases unrelated import failures or sync history."""

from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.db.models import ConnectorHealth
from app.setup.connection_health_repository import ConnectionHealthRepository
from app.setup.connection_health_service import ConnectionHealthService


@pytest.mark.parametrize(("connector", "message", "expected"), [
    ("moodle", "Moodle-Token erneuern", "ok"),
    ("moodle", "Einige Dateien konnten nicht gespeichert werden", "error"),
    ("mycampus", "Moodle-Token erneuern", "error"),
])
def test_only_moodle_auth_failure_is_cleared(factory, connector, message, expected):
    moment = datetime(2026, 10, 1, tzinfo=UTC)
    with factory() as session:
        session.add(ConnectorHealth(connector=connector, status="error", message=message,
                                    last_success_at=moment, last_attempt_at=moment, consecutive_failures=3))
        session.commit()
    ConnectionHealthService(ConnectionHealthRepository(factory)).moodle_token_verified()
    with factory() as session:
        health = session.scalar(select(ConnectorHealth).where(ConnectorHealth.connector == connector))
        assert health is not None and health.status == expected
        assert health.last_success_at.replace(tzinfo=UTC) == moment
        assert health.last_attempt_at.replace(tzinfo=UTC) == moment
        assert health.message == (None if expected == "ok" else message)
