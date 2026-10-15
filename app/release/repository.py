# SPDX-License-Identifier: AGPL-3.0-or-later
import re
from contextlib import closing

from app.recovery.repository import RecoveryRepository


class ReleaseHealthRepository(RecoveryRepository):
    def metadata(self):
        with closing(self.connection()) as connection:
            index = connection.execute('SELECT count(*) AS pending FROM corpus_dirty').fetchone()['pending']
            failed = connection.execute('SELECT count(*) FROM corpus_failures f JOIN corpus_dirty q '
                                        'ON q.entity_ref=f.entity_ref AND q.generation=f.generation').fetchone()[0]
            documents = connection.execute('SELECT count(*) FROM corpus_documents WHERE latest=1 AND live=1').fetchone()[0]
            permissions = connection.execute('SELECT count(*) FROM ai_access WHERE allowed=1').fetchone()[0]
            connectors = []
            for row in connection.execute('SELECT connector,status,last_success_at FROM connector_health ORDER BY connector LIMIT 100'):
                if re.fullmatch(r'[a-zA-Z0-9_.-]{1,64}', row['connector']):
                    connectors.append({'id': row['connector'], 'status': row['status'] if row['status'] in
                                       {'ok', 'success', 'warning', 'error', 'disabled'} else 'unknown',
                                       'last_success_at': row['last_success_at']})
            return {'index': {'pending': index, 'failed': failed, 'documents': documents},
                    'allowed_entries': permissions, 'connectors': connectors}
