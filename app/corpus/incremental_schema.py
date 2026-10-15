# SPDX-License-Identifier: AGPL-3.0-or-later
"""Per-version invalidation checkpoints. Source text and historical citations stay immutable."""
from sqlalchemy import text


def install(connection):
    connection.execute(text('CREATE TABLE corpus_source_revisions (entity_ref TEXT NOT NULL, version TEXT NOT NULL, '
                            'generation INTEGER NOT NULL DEFAULT 1, published_generation INTEGER, published_ref TEXT, '
                            'PRIMARY KEY(entity_ref,version))'))
    for table, foreign_key, version_column, kind in [('resource_versions', 'resource_id', 'version', 'resource'),
                                                      ('note_versions', 'note_id', 'revision', 'note')]:
        connection.execute(text(f"INSERT INTO corpus_source_revisions(entity_ref,version) "
                                f"SELECT '{kind}:'||{foreign_key},cast({version_column} AS TEXT) FROM {table}"))
        for event, row in [('INSERT', 'new'), ('UPDATE', 'new'), ('DELETE', 'old')]:
            connection.execute(text(f'CREATE TRIGGER corpus_checkpoint_{table}_{event.lower()} AFTER {event} ON {table} BEGIN '
                                    f"INSERT INTO corpus_source_revisions(entity_ref,version) VALUES('{kind}:'||{row}.{foreign_key},cast({row}.{version_column} AS TEXT)) "
                                    'ON CONFLICT(entity_ref,version) DO UPDATE SET generation=generation+1; END'))
    for event, row in [('INSERT', 'new'), ('UPDATE', 'new'), ('DELETE', 'old')]:
        connection.execute(text(f'CREATE TRIGGER corpus_checkpoint_text_{event.lower()} AFTER {event} ON resource_texts BEGIN '
                                "INSERT INTO corpus_source_revisions(entity_ref,version) SELECT 'resource:'||resource_id,cast(version AS TEXT) "
                                f'FROM resource_versions WHERE id={row}.version_id '
                                'ON CONFLICT(entity_ref,version) DO UPDATE SET generation=generation+1; END'))
    # Existing installations need one background backfill to establish checkpoints.
    connection.execute(text('INSERT INTO corpus_dirty(entity_ref) SELECT DISTINCT entity_ref FROM corpus_source_revisions WHERE 1 '
                            'ON CONFLICT(entity_ref) DO UPDATE SET generation=generation+1'))


def uninstall(connection):
    for table in ['resource_versions', 'note_versions', 'text']:
        for event in ['insert', 'update', 'delete']:
            connection.execute(text(f'DROP TRIGGER corpus_checkpoint_{table}_{event}'))
    connection.execute(text('DROP TABLE corpus_source_revisions'))
