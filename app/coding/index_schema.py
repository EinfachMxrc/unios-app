# SPDX-License-Identifier: AGPL-3.0-or-later
"""Frozen coding-source dirty queue extension for migration ff93."""
from sqlalchemy import text

SOURCES = {'coding_task': ('coding_tasks', 'id'), 'coding_attempt': ('coding_attempts', 'id')}


def install(connection):
    for kind, (table, key) in SOURCES.items():
        for event, row in [('insert', 'new'), ('update', 'new'), ('delete', 'old')]:
            connection.execute(text(f"CREATE TRIGGER corpus_{kind}_{event} AFTER {event.upper()} ON {table} BEGIN "
                                    f"INSERT INTO corpus_dirty(entity_ref) VALUES('{kind}:'||{row}.{key}) "
                                    "ON CONFLICT(entity_ref) DO UPDATE SET generation=generation+1; END"))
    connection.execute(text("CREATE TRIGGER corpus_coding_course AFTER UPDATE OF semester_id ON courses BEGIN "
                            "INSERT INTO corpus_dirty(entity_ref) SELECT 'coding_task:'||id FROM coding_tasks WHERE course_id=new.id "
                            "ON CONFLICT(entity_ref) DO UPDATE SET generation=generation+1; "
                            "INSERT INTO corpus_dirty(entity_ref) SELECT 'coding_attempt:'||id FROM coding_attempts WHERE course_id=new.id "
                            "ON CONFLICT(entity_ref) DO UPDATE SET generation=generation+1; END"))


def uninstall(connection):
    for kind in SOURCES:
        for event in ('insert', 'update', 'delete'):
            connection.execute(text(f'DROP TRIGGER corpus_{kind}_{event}'))
    connection.execute(text('DROP TRIGGER corpus_coding_course'))
