# SPDX-License-Identifier: AGPL-3.0-or-later
from sqlalchemy import text

SOURCES = {'assessment_task': ('assessment_tasks', 'id'), 'assessment_attempt': ('assessment_attempts', 'id')}


def install(connection):
    for kind, (table, key) in SOURCES.items():
        for event, row in [('insert', 'new'), ('update', 'new'), ('delete', 'old')]:
            connection.execute(text(f"CREATE TRIGGER corpus_{kind}_{event} AFTER {event.upper()} ON {table} BEGIN "
                                    f"INSERT INTO corpus_dirty(entity_ref) VALUES('{kind}:'||{row}.{key}) "
                                    "ON CONFLICT(entity_ref) DO UPDATE SET generation=generation+1; END"))
    connection.execute(text("CREATE TRIGGER corpus_assessment_exam AFTER UPDATE OF state ON assessment_sessions BEGIN "
                            "INSERT INTO corpus_dirty(entity_ref) SELECT 'assessment_attempt:'||id FROM assessment_attempts WHERE session_id=new.id "
                            "ON CONFLICT(entity_ref) DO UPDATE SET generation=generation+1; END"))
    connection.execute(text("CREATE TRIGGER corpus_assessment_course AFTER UPDATE OF semester_id ON courses BEGIN "
                            "INSERT INTO corpus_dirty(entity_ref) SELECT 'assessment_task:'||id FROM assessment_tasks WHERE course_id=new.id "
                            "ON CONFLICT(entity_ref) DO UPDATE SET generation=generation+1; "
                            "INSERT INTO corpus_dirty(entity_ref) SELECT 'assessment_attempt:'||id FROM assessment_attempts WHERE course_id=new.id "
                            "ON CONFLICT(entity_ref) DO UPDATE SET generation=generation+1; END"))


def uninstall(connection):
    for kind in SOURCES:
        for event in ('insert', 'update', 'delete'):
            connection.execute(text(f'DROP TRIGGER corpus_{kind}_{event}'))
    connection.execute(text('DROP TRIGGER corpus_assessment_exam'))
    connection.execute(text('DROP TRIGGER corpus_assessment_course'))
