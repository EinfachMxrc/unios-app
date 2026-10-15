# SPDX-License-Identifier: AGPL-3.0-or-later
"""Persist connection health changes without declaring a data sync successful."""

from sqlalchemy import select

from app.db.models import ConnectorHealth


class ConnectionHealthRepository:
    def __init__(self, factory):
        self.factory = factory

    def clear_login_failure(self, connector: str, message: str) -> None:
        with self.factory() as session:
            health = session.scalar(select(ConnectorHealth).where(
                ConnectorHealth.connector == connector, ConnectorHealth.status == "error",
                ConnectorHealth.message == message))
            if health is not None:
                health.status = "ok"
                health.message = None
                health.consecutive_failures = 0
                session.commit()
