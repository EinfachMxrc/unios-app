# SPDX-License-Identifier: AGPL-3.0-or-later
import sqlite3
from datetime import UTC, datetime

from app.release.repository import ReleaseHealthRepository


class ReleaseHealthService:
    def __init__(self, repository: ReleaseHealthRepository):
        self.repository = repository

    def status(self):
        database = self.repository.health()
        result: dict[str, object] = {'checked_at': datetime.now(UTC).isoformat(), 'database': database,
                  'index': None, 'allowed_entries': None, 'connectors': [], 'metadata_status': 'unavailable'}
        try:
            result.update(self.repository.metadata())
            result['metadata_status'] = 'available'
        except (OSError, sqlite3.Error):
            pass
        return result
