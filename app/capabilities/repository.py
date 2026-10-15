# SPDX-License-Identifier: AGPL-3.0-or-later

"""Read last known connector health without probing external services."""

from sqlalchemy import select

from app.db.models import ConnectorHealth


class CapabilityRepository:
    def __init__(self, factory):
        self.factory = factory

    def connector_health(self) -> dict[str, str]:
        with self.factory() as session:
            return {row.connector: row.status for row in session.scalars(select(ConnectorHealth)).all()}
