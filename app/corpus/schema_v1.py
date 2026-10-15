# SPDX-License-Identifier: AGPL-3.0-or-later
"""Frozen SQLite index schema; source data remains in its domain stores."""

from sqlalchemy import textSOURCES = {
    'resource': ('resources', 'id'), 'note': ('notes', 'id'),
    'question': ('material_annotations', 'id'), 'assignment': ('assignments', 'id'),
    'deadline': ('deadlines', 'id'), 'event': ('calendar_events', 'id'),
    'mail': ('mail_items', 'id'), 'topic': ('learning_topics', 'id'),
    'exercise': ('exercises', 'id'), 'project': ('projects', 'id'),
    'exam': ('exams', 'id'), 'jot': ('jots', 'id'), 'course': ('courses', 'id'),
    'code': ('repo_snapshots', 'id'), 'card': ('anki_card_queue', 'id'),
    'voice': ('voice_memos', 'id'),
}


def install(connection):
    statements = [
        "CREATE TABLE corpus_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
        "INSERT INTO corpus_state VALUES ('epoch',lower(hex(randomblob(16))))",
        "CREATE TABLE corpus_dirty (entity_ref TEXT PRIMARY KEY, generation INTEGER NOT NULL DEFAULT 1)",
        "CREATE TABLE corpus_failures (entity_ref TEXT PRIMARY KEY, generation INTEGER NOT NULL, code TEXT NOT NULL)",
        ("CREATE TABLE corpus_documents (ref TEXT PRIMARY KEY, entity_ref TEXT NOT NULL, kind TEXT NOT NULL, "
        "object_id TEXT NOT NULL, version TEXT NOT NULL, source_hash TEXT NOT NULL, content_hash TEXT NOT NULL, "
        "course_id INTEGER, semester_id INTEGER, title TEXT NOT NULL, date TEXT NOT NULL, size INTEGER NOT NULL, "
        "mime_type TEXT NOT NULL, latest INTEGER NOT NULL, live INTEGER NOT NULL, outline TEXT NOT NULL, "
        "summary TEXT NOT NULL, generated_at TEXT NOT NULL, extraction_version TEXT NOT NULL, shareable INTEGER NOT NULL)"),
        "CREATE INDEX corpus_entity ON corpus_documents(entity_ref,latest)",
        "CREATE INDEX corpus_scope ON corpus_documents(course_id,semester_id,kind,latest,live)",
        ("CREATE TABLE corpus_chunks (id INTEGER PRIMARY KEY, ref TEXT NOT NULL UNIQUE, "
        "document_ref TEXT NOT NULL REFERENCES corpus_documents(ref), position INTEGER NOT NULL, "
        "page INTEGER NOT NULL, heading TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, content_hash TEXT NOT NULL, "
        "UNIQUE(document_ref,position))"),
        "CREATE INDEX corpus_chunk_doc ON corpus_chunks(document_ref,position)",
        "CREATE INDEX corpus_symbol ON corpus_chunks(heading,document_ref,position)",
        ("CREATE VIRTUAL TABLE corpus_fts USING fts5(title,heading,body,content='corpus_chunks',content_rowid='id', "
        "tokenize='unicode61 remove_diacritics 2')"),
        ("CREATE TRIGGER corpus_chunk_ai AFTER INSERT ON corpus_chunks BEGIN "
        "INSERT INTO corpus_fts(rowid,title,heading,body) VALUES(new.id,new.title,new.heading,new.body); END"),
        ("CREATE TABLE corpus_events (seq INTEGER PRIMARY KEY AUTOINCREMENT, entity_ref TEXT NOT NULL, "
        "ref TEXT, kind TEXT NOT NULL, course_id INTEGER, category TEXT NOT NULL, "
        "event TEXT NOT NULL, hash TEXT NOT NULL, shareable INTEGER NOT NULL)"),
        "CREATE INDEX corpus_events_entity ON corpus_events(entity_ref,seq)",
    ]
    for kind, (table, key) in SOURCES.items():
        for event, row in [('INSERT', 'new'), ('UPDATE', 'new'), ('DELETE', 'old')]:
            statements.append(f"CREATE TRIGGER corpus_{kind}_{event.lower()} AFTER {event} ON {table} BEGIN "
                              f"INSERT INTO corpus_dirty(entity_ref) VALUES('{kind}:'||{row}.{key}) "
                              "ON CONFLICT(entity_ref) DO UPDATE SET generation=generation+1; END")
        statements.append(f"INSERT INTO corpus_dirty(entity_ref) SELECT '{kind}:'||{key} FROM {table}")
    for table, key, prefix in [('resource_versions', 'resource_id', 'resource'),
                                ('note_versions', 'note_id', 'note')]:
        for event, row in [('INSERT', 'new'), ('UPDATE', 'new'), ('DELETE', 'old')]:
            statements.append(f"CREATE TRIGGER corpus_{table}_{event.lower()} AFTER {event} ON {table} BEGIN "
                              f"INSERT INTO corpus_dirty(entity_ref) VALUES('{prefix}:'||{row}.{key}) "
                              "ON CONFLICT(entity_ref) DO UPDATE SET generation=generation+1; END")
    for event, row in [('INSERT', 'new'), ('UPDATE', 'new'), ('DELETE', 'old')]:
        statements.append(f"CREATE TRIGGER corpus_text_{event.lower()} AFTER {event} ON resource_texts BEGIN "
                          "INSERT INTO corpus_dirty(entity_ref) SELECT 'resource:'||resource_id "
                          f"FROM resource_versions WHERE id={row}.version_id "
                          "ON CONFLICT(entity_ref) DO UPDATE SET generation=generation+1; END")
    # Scope moves invalidate all dependent documents, not just the course overview.
    statements.append("CREATE TRIGGER corpus_course_scope AFTER UPDATE OF semester_id ON courses BEGIN "
                      "INSERT INTO corpus_dirty(entity_ref) SELECT entity_ref FROM corpus_documents "
                      "WHERE course_id=new.id GROUP BY entity_ref "
                      "ON CONFLICT(entity_ref) DO UPDATE SET generation=generation+1; END")
    statements.append("CREATE TRIGGER corpus_topic_scope AFTER UPDATE OF course_id ON learning_topics BEGIN "
                      "INSERT INTO corpus_dirty(entity_ref) SELECT 'exercise:'||id FROM exercises WHERE topic_id=new.id "
                      "ON CONFLICT(entity_ref) DO UPDATE SET generation=generation+1; END")
    dependents = [('resources', 'course_id,group_category,removed_upstream', [('question', 'material_annotations', 'resource_id'),
                   ('note', 'notes', 'resource_id'), ('card', 'anki_card_queue', 'resource_id')]),
                  ('projects', 'course_id,archived_at', [('code', 'repo_snapshots', 'project_id')]),
                  ('deadlines', 'course_id', [('mail', 'mail_items', 'deadline_id')])]
    for parent, columns, children in dependents:
        sql = f'CREATE TRIGGER corpus_{parent}_dependents AFTER UPDATE OF {columns} ON {parent} BEGIN '
        for kind, table, key in children:
            sql += (f"INSERT INTO corpus_dirty(entity_ref) SELECT '{kind}:'||id FROM {table} WHERE {key}=new.id "
                    "ON CONFLICT(entity_ref) DO UPDATE SET generation=generation+1; ")
        statements.append(sql + 'END')
    for statement in statements:
        connection.execute(text(statement))


def uninstall(connection):
    # Explicitly drop only derived index objects, never source tables.
    for name in ['corpus_chunk_ai', 'corpus_course_scope', 'corpus_topic_scope',
                 'corpus_resources_dependents', 'corpus_projects_dependents', 'corpus_deadlines_dependents',
                 *[f'corpus_{kind}_{event}' for kind in SOURCES
                                    for event in ('insert', 'update', 'delete')],
                 *[f'corpus_{table}_{event}' for table in ('resource_versions', 'note_versions')
                   for event in ('insert', 'update', 'delete')],
                 *[f'corpus_text_{event}' for event in ('insert', 'update', 'delete')]]:
        connection.execute(text(f'DROP TRIGGER {name}'))
    for table in ['corpus_fts', 'corpus_chunks', 'corpus_events', 'corpus_documents', 'corpus_failures', 'corpus_dirty', 'corpus_state']:
        connection.execute(text(f'DROP TABLE {table}'))
