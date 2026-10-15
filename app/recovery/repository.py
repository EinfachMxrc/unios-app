# SPDX-License-Identifier: AGPL-3.0-or-later
"""Bounded read-only queries compatible with historical core schemas."""

import sqlite3
import time
from contextlib import closing
from pathlib import Path


class RecoveryRepository:
    def __init__(self, database: Path):
        self.database = database

    def connection(self):
        if self.database.is_symlink():
            raise sqlite3.OperationalError('RECOVERY_UNSAFE_DATABASE')
        connection = sqlite3.connect(f'{self.database.resolve().as_uri()}?mode=ro', uri=True, timeout=1)
        connection.row_factory = sqlite3.Row
        deadline = time.monotonic() + 3
        connection.set_progress_handler(lambda: int(time.monotonic() > deadline), 10000)
        return connection

    def health(self):
        try:
            with closing(self.connection()) as connection:
                okay = connection.execute('PRAGMA quick_check(1)').fetchone()[0] == 'ok'
                schema = connection.execute('SELECT substr(version_num,1,64) FROM alembic_version LIMIT 1').fetchone()
                return {'status': 'ok' if okay else 'error', 'schema': schema[0] if schema else None}
        except (OSError, sqlite3.Error):
            return {'status': 'error', 'schema': None}

    def notes(self, after: str = ''):
        with closing(self.connection()) as connection:
            return [dict(row) for row in connection.execute(
                'SELECT id,substr(title,1,500) AS title,current_revision FROM notes WHERE id>? ORDER BY id LIMIT 51', (after,))]

    def note(self, identifier: str):
        with closing(self.connection()) as connection:
            row = connection.execute('SELECT v.relative_path,v.sha256 FROM note_versions v JOIN notes n '
                                     'ON n.id=v.note_id AND n.current_revision=v.revision WHERE n.id=?',
                                     (identifier,)).fetchone()
            return dict(row) if row else None

    def files(self, after: int = 0):
        with closing(self.connection()) as connection:
            return [dict(row) for row in connection.execute(
                'SELECT v.id,substr(r.name,1,500) AS name,v.version FROM resource_versions v JOIN resources r ON r.id=v.resource_id '
                'WHERE v.id>? ORDER BY v.id LIMIT 51', (after,))]

    def file(self, identifier: int):
        with closing(self.connection()) as connection:
            row = connection.execute('SELECT relative_path,sha256 FROM resource_versions WHERE id=?',
                                     (identifier,)).fetchone()
            return dict(row) if row else None
