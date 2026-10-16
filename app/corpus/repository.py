# SPDX-License-Identifier: AGPL-3.0-or-later
"""Corpus storage, live ACL predicates and immutable source adapters."""

import json
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from tempfile import TemporaryDirectory

from sqlalchemy import select, text

from app.ai.access import DEFAULT_CATEGORIES
from app.assessment.timing import is_running
from app.calendar.edit_repository import (
    ADJUSTMENT,
    DELETED,
    CalendarEditRepository,
    adjustment_key,
)
from app.calendar.projection import effective_events
from app.corpus.chunking import ALGORITHM, digest
from app.corpus.staging import prepare_sources, prepared_chunks
from app.db.models import (
    AnkiCardQueue,
    AssessmentAttempt,
    AssessmentSession,
    AssessmentTask,
    Assignment,
    CalendarEvent,
    CodingAttempt,
    CodingTask,
    Course,
    Deadline,
    Exam,
    Exercise,
    Jot,
    LearningTopic,
    MailItem,
    MaterialAnnotation,
    Note,
    NoteVersion,
    Project,
    RepoSnapshot,
    Resource,
    ResourceText,
    ResourceVersion,
    VoiceMemo,
)
from app.notes.store import _read_revision

CATEGORIES = {'resource': 'course_material', 'note': 'notes', 'jot': 'notes',
              'question': 'learning_questions', 'topic': 'learning_questions',
              'exercise': 'exercises', 'assignment': 'deadlines', 'deadline': 'deadlines',
              'exam': 'exam_status', 'event': 'timetable', 'mail': 'mail',
              'project': 'projects', 'code': 'project_code', 'card': 'learning_state', 'voice': 'notes', 'course': 'course_material',
              'assessment_task': 'coding_tutor', 'assessment_attempt': 'coding_tutor', 'coding_task': 'coding_tutor', 'coding_attempt': 'coding_tutor'}
MODELS = {'resource': Resource, 'note': Note, 'jot': Jot, 'question': MaterialAnnotation,
          'topic': LearningTopic, 'exercise': Exercise, 'assignment': Assignment,
          'deadline': Deadline, 'exam': Exam, 'event': CalendarEvent, 'mail': MailItem,
          'project': Project, 'code': RepoSnapshot, 'card': AnkiCardQueue, 'voice': VoiceMemo, 'course': Course,
          'assessment_task': AssessmentTask, 'assessment_attempt': AssessmentAttempt, 'coding_task': CodingTask, 'coding_attempt': CodingAttempt}


def category_sql(category: str) -> str:
    default = '1' if category in DEFAULT_CATEGORIES else '0'
    return f"coalesce((SELECT allowed FROM ai_access WHERE key='category:{category}'),{default})=1"


def readable_sql(alias='d') -> str:
    """Apply current source/course permissions in SQL BEFORE any rank/limit.

    Historical snapshot scope alone is never enough to authorize a moved/deleted source.
    """
    clauses = []
    for kind, model in MODELS.items():
        table = model.__tablename__
        course = 's.id' if kind == 'course' else ('t.course_id' if kind == 'exercise' else 's.course_id')
        join = ' JOIN learning_topics t ON t.id=s.topic_id' if kind == 'exercise' else ''
        if kind == 'mail':
            join = ' LEFT JOIN deadlines t ON t.id=s.deadline_id'
            course = 't.course_id'
        if kind == 'code':
            join = ' JOIN projects p ON p.id=s.project_id'
            course = 'p.course_id'
        if kind == 'card':
            join = ' LEFT JOIN resources r ON r.id=s.resource_id LEFT JOIN learning_topics t ON t.id=s.topic_id'
            course = 'coalesce(r.course_id,t.course_id)'
        extra = ''
        if kind == 'resource':
            extra = " AND s.group_category!='other_group' AND s.removed_upstream=0"
        if kind == 'question':
            join = ' JOIN resources r ON r.id=s.resource_id'
            course = 'r.course_id'
            extra = " AND s.kind='question' AND r.group_category!='other_group' AND r.removed_upstream=0"
        if kind in {'deadline', 'assignment'}:
            extra = ' AND s.removed_upstream=0'
        if kind == 'event':
            extra = " AND s.source NOT IN ('calendar-adjustment','calendar-deleted')"
        if kind == 'note':
            extra = (" AND (s.resource_id IS NULL OR EXISTS(SELECT 1 FROM resources r WHERE "
                     "r.id=s.resource_id AND r.group_category!='other_group' AND r.removed_upstream=0 "
                     "AND coalesce((SELECT allowed FROM ai_access WHERE key='course:'||r.course_id),1)=1))")
        if kind == 'project':
            extra = ' AND s.archived_at IS NULL'
        if kind == 'code':
            extra = ' AND p.archived_at IS NULL AND ' + category_sql('projects')
        if kind == 'card':
            extra = (" AND s.status IN ('approved','imported','pushed') AND "
                     "(s.resource_id IS NULL OR (r.group_category!='other_group' AND r.removed_upstream=0))")
        if kind == 'assessment_task':
            extra = " AND s.status='active'"
        if kind == 'assessment_attempt':
            extra = " AND (s.session_id IS NULL OR EXISTS(SELECT 1 FROM assessment_sessions e WHERE e.id=s.session_id AND (e.state!='running' OR e.ends_at<=datetime('now')))) AND EXISTS(SELECT 1 FROM assessment_tasks t WHERE t.id=s.task_id AND t.status='active' AND t.course_id=s.course_id)"
        if kind == 'coding_task':
            extra = " AND s.status='active'"
        if kind == 'coding_attempt':
            extra = " AND EXISTS(SELECT 1 FROM coding_tasks t WHERE t.id=s.task_id AND t.status='active' AND t.course_id=s.course_id)"
        key = f's.id={alias}.object_id' if kind in {'note', 'jot', 'question', 'voice'} else f's.id=cast({alias}.object_id AS INTEGER)'
        clauses.append(f"({alias}.kind='{kind}' AND {category_sql(CATEGORIES[kind])} AND EXISTS("
                       f"SELECT 1 FROM {table} s{join} WHERE {key} "
                       f"AND coalesce((SELECT allowed FROM ai_access WHERE key='course:'||{course}),1)=1 "
                       f"AND ({alias}.course_id IS {course}){extra}))")
    return f'{alias}.shareable=1 AND (' + ' OR '.join(clauses) + ')'


@dataclass
class Source:
    entity_ref: str
    version: str
    title: str
    course_id: int | None
    date: str
    source_hash: str
    mime_type: str
    size: int
    pages: list[tuple[int, str]]
    bookmarks: list = field(default_factory=list)
    shareable: bool = True
    structural_outline: list = field(default_factory=list)
    reuse_ref: str | None = None
    source_generation: int | None = None


def reusable_source(session, entity_ref, version, source_hash, title, course_id, shareable):
    """Metadata-only check, including exact extraction/OCR generation and scope."""
    semester = session.scalar(select(Course.semester_id).where(Course.id == course_id))
    row = session.execute(text('SELECT d.ref,r.generation FROM corpus_source_revisions r '
                               'JOIN corpus_documents d ON d.ref=r.published_ref '
                               'WHERE r.entity_ref=:entity AND r.version=:version AND r.generation=r.published_generation '
                               'AND d.source_hash=:hash AND d.title=:title AND d.course_id IS :course '
                               'AND d.semester_id IS :semester AND d.shareable=:share AND d.extraction_version=:algorithm'),
                          {'entity': entity_ref, 'version': str(version), 'hash': source_hash, 'title': title[:500],
                           'course': course_id, 'semester': semester, 'share': int(shareable), 'algorithm': ALGORITHM}).first()
    return row[0] if row else None


def source_generation(session, entity_ref, version):
    return session.scalar(text('SELECT generation FROM corpus_source_revisions WHERE entity_ref=:entity AND version=:version'),
                          {'entity': entity_ref, 'version': str(version)})


def pdf_bookmarks(settings, version, guard=lambda: None):
    """Background-only, bounded metadata extraction from the immutable PDF."""
    if version.mime_type != 'application/pdf' or version.size > 350 * 1024 * 1024:
        return []
    from app.material.errors import MaterialError
    from app.material.preview import source_path
    try:
        path = source_path(settings.data_dir, version)
    except MaterialError:
        return []  # Imported extracted text can legitimately lack the original.
    from app.extract.isolated import parse_bookmarks
    return parse_bookmarks(path, guard)


def sources(session, settings, entity_ref: str, guard=lambda: None) -> list[Source] | Iterator[Source]:
    kind, object_id = entity_ref.split(':', 1)
    model = MODELS.get(kind)
    if model is None:
        return []
    key = object_id if kind in {'note', 'jot', 'question', 'voice'} else int(object_id)
    row = session.get(model, key)
    if row is None or kind == 'resource' and row.removed_upstream:
        return []
    if kind == 'event':
        if row.source in {ADJUSTMENT, DELETED}:
            return []
        adjustment = CalendarEditRepository.adjustment(session, adjustment_key(row))
        row = effective_events([row, adjustment] if adjustment else [row], CalendarEditRepository.rules(session), settings.timezone)[0]
    if kind in {'coding_task', 'assessment_task'} and row.status != 'active':
        return []
    if kind == 'assessment_attempt' and row.session_id:
        exam = session.get(AssessmentSession, row.session_id)
        if exam is None or is_running(exam):
            return []
    course_id = row.id if kind == 'course' else getattr(row, 'course_id', None)
    if kind == 'code':
        from app.corpus.code_index import code_pages
        project = session.get(Project, row.project_id)
        if project is None:
            return []
        pages, structure = code_pages(settings, row, guard)
        return [Source(entity_ref, row.head or str(row.id), project.name, project.course_id,
                       row.fetched_at.isoformat(), row.manifest_sha256, 'text/x-code',
                       sum(len(body.encode()) for _, body in pages), pages, structural_outline=structure)]
    if kind == 'card':
        if row.status not in {'approved', 'imported', 'pushed'}:
            return []
        resource = session.get(Resource, row.resource_id) if row.resource_id else None
        topic = session.get(LearningTopic, row.topic_id) if row.topic_id else None
        course_id = resource.course_id if resource else topic.course_id if topic else None
    if kind == 'question':
        if row.kind != 'question':
            return []
        resource = session.get(Resource, row.resource_id)
        course_id = resource.course_id if resource else None
    if kind == 'exercise':
        topic = session.get(LearningTopic, row.topic_id)
        course_id = topic.course_id if topic else None
    if kind == 'mail' and row.deadline_id:
        deadline = session.get(Deadline, row.deadline_id)
        course_id = deadline.course_id if deadline else None
    date_value = next((getattr(row, key) for key in ('updated_at', 'created_at', 'received_at',
                      'starts_at', 'due_at', 'exam_at') if getattr(row, key, None)), None)
    stamp = date_value.isoformat() if date_value else ''
    title = str(getattr(row, 'title', getattr(row, 'name', '')))
    if kind == 'resource':
        return resource_sources(session, settings, row, course_id, entity_ref, guard)
    if kind == 'note':
        return note_sources(session, settings, row, course_id, entity_ref, guard)
    # Whitelisted domain fields only: no source URLs, session keys, paths or mail bodies.
    fields = {
        'question': ('quote', 'comment', 'resolved', 'source_page', 'source_version_id'), 'assignment': ('description', 'due_at', 'delivery'),
        'deadline': ('title', 'due_at'), 'event': ('title', 'starts_at', 'ends_at'),
        'mail': ('subject', 'sender', 'received_at', 'status'), 'exercise': ('question', 'solution', 'difficulty'),
        'topic': ('name',), 'project': ('name', 'notes'), 'exam': ('title', 'exam_at'),
        'jot': ('body',), 'course': ('name', 'short_name'),
        'card': ('payload',),
        'voice': ('title', 'transcript'),
        'assessment_task': ('title', 'type', 'level'),
        'assessment_attempt': ('title', 'task_id', 'answer', 'report', 'hint_level'),
        'coding_task': ('title', 'template', 'template_version', 'language', 'story', 'learning_goal', 'rubric'),
        'coding_attempt': ('title', 'task_id', 'files', 'state', 'report', 'hint_level'),
    }
    body = '\n'.join(f'{field}: {getattr(row, field)}' for field in fields[kind]
                     if getattr(row, field, None) is not None)
    if kind == 'assessment_task':
        body += '\n' + row.payload['question'] + '\n' + row.payload['topic']
    title = title or (row.subject if kind == 'mail' else body[:160])
    hash_value = digest(body)
    shareable = not (kind in {'question', 'card'} and resource is not None and resource.group_category == 'other_group')
    return [Source(entity_ref, str(getattr(row, 'revision', hash_value[:16])), title, course_id, stamp, hash_value,
                   'text/plain', len(body.encode()), [(1, body)], shareable=shareable)]


def resource_sources(session, settings, row, course_id, entity_ref, guard):
    for version in session.scalars(select(ResourceVersion).where(ResourceVersion.resource_id == row.id)
                                   .order_by(ResourceVersion.version)):
        guard()
        reuse = reusable_source(session, entity_ref, version.version, version.sha256, row.name, course_id,
                                row.group_category != 'other_group')
        generation = source_generation(session, entity_ref, version.version)
        if reuse:
            yield Source(entity_ref, str(version.version), row.name, course_id, '', version.sha256,
                         version.mime_type, version.size, [], shareable=row.group_category != 'other_group',
                         reuse_ref=reuse, source_generation=generation)
            continue
        pages, total = [], 0
        for page in session.scalars(select(ResourceText).where(ResourceText.version_id == version.id)
                                    .order_by(ResourceText.page_number)):
            guard()
            body = page.markdown or page.text
            total += len(body.encode('utf-8'))
            if total > 64 * 1024 * 1024 or len(pages) >= 10000:
                raise ValueError('CORPUS_TEXT_LIMIT')
            pages.append((page.page_number, body))
        yield Source(entity_ref, str(version.version), row.name, course_id,
                             version.downloaded_at.isoformat(), version.sha256, version.mime_type,
                             version.size, pages, pdf_bookmarks(settings, version, guard), row.group_category != 'other_group',
                             source_generation=generation)


def note_sources(session, settings, row, course_id, entity_ref, guard):
    linked = session.get(Resource, row.resource_id) if row.resource_id else None
    for v in session.scalars(select(NoteVersion).where(NoteVersion.note_id == row.id).order_by(NoteVersion.revision)):
        guard()
        shareable = linked is None or linked.group_category != 'other_group'
        reuse = reusable_source(session, entity_ref, v.revision, v.sha256, v.title, course_id, shareable)
        generation = source_generation(session, entity_ref, v.revision)
        if reuse:
            yield Source(entity_ref, str(v.revision), v.title, course_id, '', v.sha256, 'text/markdown', 0, [],
                         shareable=shareable, reuse_ref=reuse, source_generation=generation)
            continue
        body = _read_revision(settings, v)
        yield Source(entity_ref, str(v.revision), v.title, course_id, v.created_at.isoformat(),
                             v.sha256, 'text/markdown', len(body.encode()), [(1, body)],
                             shareable=shareable, source_generation=generation)


class CorpusRepository:
    def __init__(self, factory, settings):
        self.factory, self.settings = factory, settings

    def dirty(self, limit=1):
        with self.factory() as session:
            return list(session.execute(text('SELECT q.entity_ref,q.generation FROM corpus_dirty q '
                                        'LEFT JOIN corpus_failures f ON f.entity_ref=q.entity_ref '
                                        'WHERE f.generation IS NULL OR f.generation!=q.generation '
                                        'ORDER BY q.entity_ref LIMIT :n'),
                                        {'n': limit}).mappings())

    def failed(self, entity_ref, generation):
        with self.factory() as session:
            session.execute(text('INSERT INTO corpus_failures VALUES(:e,:g,:code) ON CONFLICT(entity_ref) '
                                 'DO UPDATE SET generation=excluded.generation,code=excluded.code'),
                            {'e': entity_ref, 'g': generation, 'code': 'source_index_failed'})
            session.commit()

    def enqueue_all(self, guard):
        from app.assessment.index_schema import SOURCES as ASSESSMENT_SOURCES
        from app.coding.index_schema import SOURCES as CODING_SOURCES
        from app.corpus.schema_v1 import SOURCES
        with self.factory() as session:
            for kind, (table, key) in {**SOURCES, **CODING_SOURCES, **ASSESSMENT_SOURCES}.items():
                session.execute(text(f"INSERT INTO corpus_dirty(entity_ref) SELECT '{kind}:'||{key} FROM {table} WHERE 1 "
                                     "ON CONFLICT(entity_ref) DO UPDATE SET generation=generation+1"))
            guard()
            session.commit()

    def publish(self, entity_ref, generation, guard):
        with TemporaryDirectory(prefix='unios-corpus-stage-') as folder:
            with self.factory() as read_session:
                current = read_session.scalar(text('SELECT generation FROM corpus_dirty WHERE entity_ref=:ref'), {'ref': entity_ref})
                if current != generation:
                    return False
                prepared = prepare_sources(sources(read_session, self.settings, entity_ref, guard), Path(folder), guard)
            with self.factory() as session:
                # Fence again after parsing: discard staging if any source changed.
                session.execute(text('BEGIN IMMEDIATE'))
                current = session.scalar(text('SELECT generation FROM corpus_dirty WHERE entity_ref=:ref'), {'ref': entity_ref})
                if current != generation:
                    return False
                old = list(session.execute(text('SELECT * FROM corpus_documents WHERE entity_ref=:e AND latest=1'),
                                           {'e': entity_ref}).mappings())
                session.execute(text('UPDATE corpus_documents SET latest=0,live=:live WHERE entity_ref=:e'),
                                {'e': entity_ref, 'live': int(bool(prepared))})
                last = None
                for item in prepared:
                    source = item.source
                    guard()
                    if source.reuse_ref:
                        session.execute(text('UPDATE corpus_documents SET live=1,latest=0 WHERE ref=:ref'), {'ref': source.reuse_ref})
                        last = (source.reuse_ref, source.course_id, source.reuse_ref.rsplit(':', 1)[1], source.shareable)
                        continue
                    body_hash = item.body_hash
                    semester = session.scalar(select(Course.semester_id).where(Course.id == source.course_id))
                    metadata_hash = digest(json.dumps([source.title, source.course_id, semester, source.source_hash, body_hash, source.shareable, ALGORITHM]))
                    ref = f'{entity_ref}@v{source.version}:{metadata_hash}'
                    latest = 0
                    exists = session.scalar(text('SELECT ref FROM corpus_documents WHERE ref=:ref'), {'ref': ref})
                    if exists:
                        session.execute(text('UPDATE corpus_documents SET live=1,latest=:latest WHERE ref=:ref'),
                                        {'latest': latest, 'ref': ref})
                    else:
                        session.execute(text('INSERT INTO corpus_documents VALUES '
                                             '(:ref,:entity,:kind,:id,:version,:source_hash,:hash,:course,:semester,'
                                             ':title,:date,:size,:mime,:latest,1,:outline,:summary,:at,:algorithm,:shareable)'),
                                        {'ref': ref, 'entity': entity_ref, 'kind': entity_ref.split(':')[0],
                                         'id': entity_ref.split(':', 1)[1], 'version': source.version,
                                         'source_hash': source.source_hash, 'hash': body_hash, 'course': source.course_id,
                                         'semester': semester, 'title': source.title[:500], 'date': source.date,
                                         'size': source.size, 'mime': source.mime_type, 'latest': latest,
                                         'outline': item.outline, 'summary': item.summary,
                                         'at': datetime.now(UTC).isoformat(), 'algorithm': ALGORITHM,
                                         'shareable': int(source.shareable)})
                        for value in prepared_chunks(item):
                            guard()
                            chunk_ref = 'chunk:' + digest(f"{ref}\0{value['page']}\0{value['heading']}\0{value['position']}\0{value['content_hash']}")
                            session.execute(text('INSERT INTO corpus_chunks(ref,document_ref,position,page,heading,title,body,content_hash) '
                                                 'VALUES(:ref,:doc,:position,:page,:heading,:title,:body,:hash)'),
                                            {'ref': chunk_ref, 'doc': ref, 'position': value['position'], 'page': value['page'],
                                             'heading': value['heading'], 'title': source.title[:500], 'body': value['body'], 'hash': value['content_hash']})
                    last = (ref, source.course_id, metadata_hash, source.shareable)
                    if source.source_generation is not None:
                        session.execute(text('UPDATE corpus_source_revisions SET published_generation=:g,published_ref=:ref '
                                             'WHERE entity_ref=:e AND version=:v AND generation=:g'),
                                        {'g': source.source_generation, 'ref': ref, 'e': entity_ref, 'v': source.version})
                if last is not None:
                    session.execute(text('UPDATE corpus_documents SET latest=1 WHERE ref=:ref'), {'ref': last[0]})
                    if not any(row['ref'] == last[0] for row in old):
                        self._event(session, entity_ref, last[0], last[1], 'updated' if old else 'created', last[2], last[3])
                if not prepared and old:
                    self._event(session, entity_ref, None, old[0]['course_id'], 'deleted', old[0]['content_hash'], old[0]['shareable'])
                guard()
                session.execute(text('DELETE FROM corpus_dirty WHERE entity_ref=:e AND generation=:g'),
                                {'e': entity_ref, 'g': generation})
                session.execute(text('DELETE FROM corpus_failures WHERE entity_ref=:e'), {'e': entity_ref})
                session.commit()
        return True

    @staticmethod
    def _event(session, entity_ref, ref, course_id, event, hash_value, shareable):
        kind = entity_ref.split(':')[0]
        session.execute(text('INSERT INTO corpus_events(entity_ref,ref,kind,course_id,category,event,hash,shareable) '
                             'VALUES(:e,:r,:k,:c,:cat,:event,:h,:shareable)'),
                        {'e': entity_ref, 'r': ref, 'k': kind, 'c': course_id, 'cat': CATEGORIES[kind],
                         'event': f'{kind}.{event}', 'h': hash_value, 'shareable': int(shareable)})

    def status(self):
        with self.factory() as session:
            return {'pending': session.scalar(text('SELECT count(*) FROM corpus_dirty')),
                    'failed': session.scalar(text('SELECT count(*) FROM corpus_failures f JOIN corpus_dirty q '
                                                 'ON q.entity_ref=f.entity_ref AND q.generation=f.generation')),
                    'documents': session.scalar(text('SELECT count(*) FROM corpus_documents WHERE latest=1 AND live=1')),
                    'chunks': session.scalar(text('SELECT count(*) FROM corpus_chunks')),
                    'sequence': session.scalar(text('SELECT coalesce(max(seq),0) FROM corpus_events'))}
