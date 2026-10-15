# SPDX-License-Identifier: AGPL-3.0-or-later
"""Bounded index reads; SQL predicates precede ranking, grouping and limits."""

import json

from sqlalchemy import text

from app.corpus.chunking import digest
from app.corpus.contracts import material_source_ref
from app.corpus.query import expression
from app.corpus.repository import CATEGORIES, category_sql, readable_sql

METADATA = ','.join('d.' + name for name in ('ref', 'entity_ref', 'kind', 'object_id', 'version',
                    'source_hash', 'content_hash', 'course_id', 'semester_id', 'title', 'date', 'size', 'mime_type'))


class RetrievalRepository:
    def __init__(self, session):
        self.session = session

    def cursor_identity(self, actor):
        permissions = list(self.session.execute(text('SELECT key,allowed FROM ai_access ORDER BY key')))
        epoch = self.session.scalar(text("SELECT value FROM corpus_state WHERE key='epoch'"))
        return {'epoch': epoch, 'actor': actor, 'acl': digest(json.dumps([list(row) for row in permissions]))}

    def sequence(self):
        return self.session.scalar(text('SELECT coalesce(max(seq),0) FROM corpus_events'))

    def temporal_scope(self):
        semesters = list(self.session.execute(text('SELECT id,is_current,starts_at FROM semesters')).mappings())
        current = [row for row in semesters if row['is_current']]
        current_id = current[0]['id'] if len(current) == 1 else None
        starts = current[0]['starts_at'] if len(current) == 1 else None
        earlier = sorted((row for row in semesters if starts and row['starts_at'] and row['starts_at'] < starts),
                         key=lambda row: row['starts_at'], reverse=True)
        warm = {row['id'] for row in earlier[:2]}
        tiers = {row['id']: ('hot' if row['id'] == current_id else 'warm' if row['id'] in warm
                            else 'cold' if starts and row['starts_at'] and row['starts_at'] < starts else 'unclassified')
                 for row in semesters}
        return {'current': current_id, 'tiers': tiers}

    def cache_ready(self):
        # A source update immediately hides its old index entry, before the
        # worker publishes the next sequence. Never reuse ranking in that gap.
        return not self.session.scalar(text('SELECT EXISTS(SELECT 1 FROM corpus_dirty)'))

    def pending_revision(self):
        rows = self.session.execute(text('SELECT entity_ref,generation FROM corpus_dirty ORDER BY entity_ref'))
        return digest(json.dumps([list(row) for row in rows]))

    def workflow_revision(self):
        rows = self.session.execute(text('SELECT object_type,object_id,revision,workflow_status '
                                         'FROM object_metadata ORDER BY object_type,object_id'))
        return digest(json.dumps([list(row) for row in rows]))

    def reading_revision(self):
        rows = self.session.execute(text('SELECT id,first_opened_at FROM resource_versions ORDER BY id'))
        return digest(json.dumps([list(row) for row in rows]))

    def validate_rows(self, rows):
        refs = list(dict.fromkeys(row['ref'] for row in rows))
        if not refs:
            return True
        parameters = {f'ref{i}': ref for i, ref in enumerate(refs)}
        clause = ','.join(':' + key for key in parameters)
        count = self.session.scalar(text(f'SELECT count(*) FROM corpus_documents d WHERE d.ref IN ({clause}) '
                                    f'AND d.latest=1 AND d.live=1 AND {readable_sql()} '
                                    'AND NOT EXISTS(SELECT 1 FROM corpus_dirty q WHERE q.entity_ref=d.entity_ref) '
                                    "AND (d.kind!='code' OR cast(d.object_id AS INTEGER)=(SELECT id FROM repo_snapshots "
                                    "WHERE project_id=(SELECT project_id FROM repo_snapshots WHERE id=cast(d.object_id AS INTEGER)) "
                                    'ORDER BY fetched_at DESC,id DESC LIMIT 1))'), parameters)
        return count == len(refs)

    def scope(self, scope):
        values = {}
        for name, table in [('course', 'courses'), ('semester', 'semesters')]:
            value = getattr(scope, name)
            if value is None:
                values[name] = None
                continue
            if isinstance(value, int) or str(value).isdigit():
                values[name] = int(value)
                continue
            ids = list(self.session.execute(text(f'SELECT id FROM {table} WHERE lower(name)=lower(:name)'),
                                            {'name': value}).scalars())
            values[name] = ids[0] if len(ids) == 1 else -1
        return values

    def search(self, request, offset=0):
        scope = self.scope(request.scope)
        terms = expression(request.query)
        parameters = {**scope, 'before': request.scope.before, 'n': request.top_k + 1, 'offset': offset,
                      'current': self.temporal_scope()['current']}
        predicate = ("d.latest=1 AND d.live=1 AND " + readable_sql() +
                     " AND NOT EXISTS(SELECT 1 FROM corpus_dirty q WHERE q.entity_ref=d.entity_ref) "
                     "AND (:course IS NULL OR d.course_id=:course) AND (:semester IS NULL OR d.semester_id=:semester) "
                     "AND (:before IS NULL OR d.date<:before)")
        predicate += (" AND (d.kind!='code' OR cast(d.object_id AS INTEGER)=(SELECT id FROM repo_snapshots "
                      "WHERE project_id=(SELECT project_id FROM repo_snapshots WHERE id=cast(d.object_id AS INTEGER)) "
                      "ORDER BY fetched_at DESC,id DESC LIMIT 1))")
        if request.types:
            types = {f'type{i}': value for i, value in enumerate(request.types)}
            parameters.update(types)
            predicate += ' AND d.kind IN (' + ','.join(':' + key for key in types) + ')'
        if request.view == 'current_semester':
            predicate += ' AND d.semester_id=:current'
        elif request.view == 'open_questions':
            predicate += (" AND d.kind='question' AND EXISTS(SELECT 1 FROM material_annotations a "
                          'WHERE a.id=d.object_id AND a.resolved=0)')
        elif request.view == 'open_work':
            # Only an explicitly recorded workflow state counts as open work.
            predicate += (" AND d.kind IN ('assignment','deadline','project') AND EXISTS(SELECT 1 FROM object_metadata m "
                          'WHERE m.object_type=d.kind AND m.object_id=d.object_id '
                          "AND m.workflow_status IN ('open','working'))")
        elif request.view == 'unread_material':
            predicate += (" AND d.kind='resource' AND EXISTS(SELECT 1 FROM resource_versions v "
                          'WHERE v.resource_id=cast(d.object_id AS INTEGER) AND v.version=cast(d.version AS INTEGER) '
                          'AND v.first_opened_at IS NULL)')
        fields = METADATA + ',c.ref AS chunk_ref,c.page,c.heading,c.position,c.content_hash AS chunk_hash'
        fields += (",CASE WHEN d.kind='code' THEN (SELECT value FROM json_each(d.outline) "
                   "WHERE json_extract(value,'$.page')=c.page LIMIT 1) ELSE NULL END AS code_location")
        if request.mode == 'symbol':
            parameters['symbol'] = request.query.strip()
            fields += ',substr(c.body,1,450) AS excerpt,0 AS lexical_score'
            source = 'corpus_chunks c JOIN corpus_documents d ON d.ref=c.document_ref'
            predicate += (" AND d.kind='code' AND (c.heading=:symbol OR json_extract("
                   "(SELECT value FROM json_each(d.outline) WHERE json_extract(value,'$.page')=c.page LIMIT 1),"
                   "'$.qualified_name')=:symbol)")
            order = 'd.ref,c.position'
        elif request.mode == 'catalog' or not terms:
            fields = (f"{METADATA},NULL AS chunk_ref,NULL AS page,'' AS heading,-1 AS position,"
                   "'' AS chunk_hash,'' AS excerpt,0 AS lexical_score,d.extraction_version,"
                   "d.outline!='[]' AS outline_available,d.summary!='' AS summary_available,"
                   "CASE WHEN json_extract(d.outline,'$[0].origin')='metadata_only' THEN 0 ELSE "
                   '(SELECT count(DISTINCT page) FROM corpus_chunks c WHERE c.document_ref=d.ref) END AS indexed_pages,'
                   "CASE WHEN json_extract(d.outline,'$[0].origin')='metadata_only' THEN NULL ELSE "
                   '(SELECT max(page) FROM corpus_chunks c WHERE c.document_ref=d.ref) END AS last_indexed_page,'
                   "CASE WHEN d.kind='mail' THEN (SELECT json_object('sender',m.sender,'subject',m.subject,"
                   "'received_at',m.received_at,'status',m.status) FROM mail_items m WHERE m.id=cast(d.object_id AS INTEGER)) "
                   'ELSE NULL END AS mail_metadata')
            source = 'corpus_documents d'
            order = 'CASE WHEN d.semester_id=:current THEN 0 ELSE 1 END,d.ref'
        else:
            parameters['terms'] = terms
            parameters['chunks_per_document'] = request.chunks_per_document
            return self._text_search(request, predicate, parameters, fields)
        if request.view == 'recent_changes':
            order = '(SELECT max(seq) FROM corpus_events e WHERE e.entity_ref=d.entity_ref) DESC,d.ref'
            if request.mode == 'symbol' or (request.mode != 'catalog' and terms):
                order += ',c.position'
        prefix = ''
        if request.deduplicate:
            # Group matching DOCUMENT metadata, not every chunk/excerpt.
            # Only permitted, live matches can represent a duplicate group.
            # Metadata-only title placeholders are not content evidence.
            duplicate_key = 'CASE WHEN metadata_only THEN ref ELSE content_hash END'
            prefix = (f'WITH eligible AS MATERIALIZED (SELECT DISTINCT {METADATA},'
                      "json_extract(d.outline,'$[0].origin')='metadata_only' AS metadata_only "
                      f'FROM {source} WHERE {predicate}), '
                      'representatives AS MATERIALIZED (SELECT min(ref) AS ref,count(*) AS duplicate_count FROM eligible '
                      f'GROUP BY kind,course_id,semester_id,{duplicate_key}) ')
            source += ' JOIN representatives r ON r.ref=d.ref'
            fields += ',r.duplicate_count'
        sql = prefix + f'SELECT {fields} FROM {source} WHERE {predicate} ORDER BY {order} LIMIT :n OFFSET :offset'
        return [dict(row) for row in self.session.execute(text(sql), parameters).mappings()]

    def _text_search(self, request, predicate, parameters, fields):
        # Rank only scalar IDs/scores. Large outlines, snippets and highlights
        # are resolved AFTER the final limit, including on very broad queries.
        sql = ('WITH matches AS MATERIALIZED (SELECT c.id,c.position,d.rowid AS document_key,'
               'd.semester_id,bm25(corpus_fts,4,3,1) AS score '
               'FROM corpus_fts JOIN corpus_chunks c ON c.id=corpus_fts.rowid '
               f'JOIN corpus_documents d ON d.ref=c.document_ref WHERE corpus_fts MATCH :terms AND {predicate}), '
               'ranked AS (SELECT *,row_number() OVER(PARTITION BY document_key ORDER BY score,position) AS doc_rank FROM matches), ')
        join, duplicate_field = '', ''
        if request.deduplicate:
            sql += ('eligible AS MATERIALIZED (SELECT DISTINCT document_key FROM matches), '
                    'duplicate_groups AS MATERIALIZED (SELECT min(d.ref) AS ref,count(*) AS duplicate_count '
                    'FROM eligible e JOIN corpus_documents d ON d.rowid=e.document_key '
                    "GROUP BY d.kind,d.course_id,d.semester_id,CASE WHEN "
                    "json_extract(d.outline,'$[0].origin')='metadata_only' THEN d.ref ELSE d.content_hash END), "
                    'representatives AS MATERIALIZED (SELECT d.rowid AS document_key,g.duplicate_count '
                    'FROM duplicate_groups g JOIN corpus_documents d ON d.ref=g.ref), ')
            join = ' JOIN representatives r ON r.document_key=ranked.document_key'
            duplicate_field = ',r.duplicate_count'
        order = 'score,CASE WHEN semester_id=:current THEN 0 ELSE 1 END,id'
        if request.view == 'recent_changes':
            order = ('(SELECT max(e.seq) FROM corpus_events e JOIN corpus_documents d ON e.entity_ref=d.entity_ref '
                     'WHERE d.rowid=ranked.document_key) DESC,id')
        sql += (f'selected AS MATERIALIZED (SELECT ranked.id,ranked.score{duplicate_field} FROM ranked{join} '
                f'WHERE doc_rank<=:chunks_per_document ORDER BY {order} LIMIT :n OFFSET :offset) ')
        fields += (",snippet(corpus_fts,2,'','', ' … ',35) AS excerpt,s.score AS lexical_score,"
                   "CASE WHEN instr(highlight(corpus_fts,0,char(1),char(2)),char(1))>0 THEN 1 ELSE 0 END + "
                   "CASE WHEN instr(highlight(corpus_fts,1,char(1),char(2)),char(1))>0 THEN 2 ELSE 0 END + "
                   'CASE WHEN instr(highlight(corpus_fts,2,char(1),char(2)),char(1))>0 THEN 4 ELSE 0 END AS matched_fields')
        if request.deduplicate:
            fields += ',s.duplicate_count'
        # The selected table is bounded to top_k+1. Sort those scalar scores
        # in the same order without scoring the postings a second time.
        sql += (f'SELECT {fields} FROM selected s CROSS JOIN corpus_chunks c ON c.id=s.id '
                'CROSS JOIN corpus_documents d ON d.ref=c.document_ref '
                'CROSS JOIN corpus_fts ON corpus_fts.rowid=c.id WHERE corpus_fts MATCH :terms '
                'ORDER BY s.score,CASE WHEN d.semester_id=:current THEN 0 ELSE 1 END,s.id')
        if request.view == 'recent_changes':
            sql = sql.rsplit('ORDER BY s.score', 1)[0] + ('ORDER BY (SELECT max(seq) FROM corpus_events e '
                    'WHERE e.entity_ref=d.entity_ref) DESC,s.id')
        return [dict(row) for row in self.session.execute(text(sql), parameters).mappings()]

    def index_status(self):
        predicate = readable_sql()
        indexed = self.session.scalar(text(f'SELECT count(*) FROM corpus_documents d WHERE d.latest=1 AND d.live=1 AND {predicate}'))
        pending = self.session.scalar(text(f'SELECT count(DISTINCT q.entity_ref) FROM corpus_dirty q '
                                          f'JOIN corpus_documents d ON d.entity_ref=q.entity_ref WHERE d.latest=1 AND d.live=1 AND {predicate}'))
        failed = self.session.scalar(text(f'SELECT count(DISTINCT f.entity_ref) FROM corpus_failures f '
                                         'JOIN corpus_dirty q ON q.entity_ref=f.entity_ref AND q.generation=f.generation '
                                         f'JOIN corpus_documents d ON d.entity_ref=f.entity_ref WHERE d.latest=1 AND d.live=1 AND {predicate}'))
        return {'indexed_released_documents': indexed, 'pending_released_documents': pending,
                'failed_released_documents': failed, 'scope': 'previously_indexed_released_sources',
                'sequence': self.sequence()}

    def document(self, ref):
        # Exact refs are immutable. Unversioned entity refs explicitly resolve current.
        parameters = {'ref': ref}
        query = ('d.ref=:ref' if '@' in ref else 'd.entity_ref=:ref AND d.latest=1 AND '
                 'NOT EXISTS(SELECT 1 FROM corpus_dirty q WHERE q.entity_ref=d.entity_ref)')
        source = material_source_ref(ref)
        if source:
            parameters['version_id'] = source[0]
            # A reader link names ResourceVersion.id, never the resource's current
            # version. Resolve only the already published extraction for that ID.
            query = ("EXISTS(SELECT 1 FROM resource_versions v JOIN corpus_source_revisions r "
                     "ON r.entity_ref='resource:'||v.resource_id AND r.version=cast(v.version AS TEXT) "
                     "WHERE v.id=:version_id AND r.published_ref=d.ref "
                     "AND r.generation=r.published_generation "
                     "AND d.kind='resource' AND d.object_id=cast(v.resource_id AS TEXT))")
        if ref.startswith('chunk:'):
            query = 'EXISTS(SELECT 1 FROM corpus_chunks c WHERE c.ref=:ref AND c.document_ref=d.ref)'
        return self.session.execute(text(f'SELECT d.*,CASE WHEN d.latest=0 OR '
                                         "(d.kind='code' AND cast(d.object_id AS INTEGER)!=(SELECT id FROM repo_snapshots "
                                         "WHERE project_id=(SELECT project_id FROM repo_snapshots WHERE id=cast(d.object_id AS INTEGER)) "
                                         "ORDER BY fetched_at DESC,id DESC LIMIT 1)) OR EXISTS(SELECT 1 FROM "
                                         f'corpus_dirty q WHERE q.entity_ref=d.entity_ref) THEN 1 ELSE 0 END '
                                         f'AS stale FROM corpus_documents d WHERE {query} '
                                         f'AND d.live=1 AND {readable_sql()} LIMIT 1'), parameters).mappings().first()

    def chunks(self, ref, document_ref, request):
        parameters = {'doc': document_ref, 'after': request.after, 'ref': ref}
        clause = 'document_ref=:doc AND position>:after'
        if ref.startswith('chunk:'):
            clause += ' AND ref=:ref'
        if request.pages:
            parameters.update({f'p{i}': page for i, page in enumerate(request.pages)})
            clause += ' AND page IN (' + ','.join(f':p{i}' for i in range(len(request.pages))) + ')'
        if request.sections:
            outline = json.loads(self.session.scalar(text('SELECT outline FROM corpus_documents WHERE ref=:doc'), parameters))
            ranges = [entry for entry in outline if entry['title'] in request.sections]
            if not ranges:
                return []
            for i, entry in enumerate(ranges):
                parameters.update({f's{i}': entry['position'], f'e{i}': entry['end_position']})
            clause += ' AND (' + ' OR '.join(f'(position>=:s{i} AND position<:e{i})' for i in range(len(ranges))) + ')'
        return [dict(row) for row in self.session.execute(text(f'SELECT * FROM corpus_chunks WHERE {clause} '
                                                              'ORDER BY position LIMIT 51'), parameters).mappings()]

    def events(self, after, limit):
        return [dict(row) for row in self.session.execute(text(
            'SELECT * FROM corpus_events WHERE seq>:after ORDER BY seq LIMIT :limit'),
            {'after': after, 'limit': limit}).mappings()]

    def event_allowed(self, row):
        if not row['shareable']:
            return False
        # Current live source policy for updates; deleted events expose only handles.
        if row['event'].endswith('.deleted'):
            cat = CATEGORIES.get(row['kind'])
            if not cat:
                return False
            return bool(self.session.scalar(text(f'SELECT {category_sql(cat)} AND '
                             "coalesce((SELECT allowed FROM ai_access WHERE key='course:'||:course),1)=1"),
                             {'course': row['course_id']}))
        return self.document(row['ref']) is not None

    def hierarchy(self, scope, limit=30):
        parameters = {**self.scope(scope), 'before': scope.before, 'n': limit}
        sql = ('SELECT d.course_id,d.semester_id,c.name AS course,s.name AS semester,count(*) AS documents,'
               'max(d.generated_at) AS generated_at FROM corpus_documents d '
               'LEFT JOIN courses c ON c.id=d.course_id LEFT JOIN semesters s ON s.id=d.semester_id '
               f'WHERE d.latest=1 AND d.live=1 AND {readable_sql()} '
               'AND NOT EXISTS(SELECT 1 FROM corpus_dirty q WHERE q.entity_ref=d.entity_ref) '
               'AND (:course IS NULL OR d.course_id=:course) AND (:semester IS NULL OR d.semester_id=:semester) '
               'AND (:before IS NULL OR d.date<:before) '
               'GROUP BY d.course_id,d.semester_id ORDER BY d.semester_id,d.course_id LIMIT :n')
        return [dict(row) for row in self.session.execute(text(sql), parameters).mappings()]

    def open_questions(self, entity_refs):
        ids = [ref.split(':', 1)[1] for ref in entity_refs if ref.startswith('question:')]
        if not ids:
            return set()
        parameters = {f'q{i}': value for i, value in enumerate(ids)}
        sql = ("SELECT id FROM material_annotations WHERE kind='question' AND resolved=0 AND id IN (" +
               ','.join(':' + key for key in parameters) + ')')
        return {'question:' + value for value in self.session.execute(text(sql), parameters).scalars()}

    def summaries(self, scope, limit=30):
        parameters = {**self.scope(scope), 'before': scope.before, 'n': limit}
        sql = (f'SELECT d.ref,d.course_id,d.semester_id,d.content_hash,d.summary,d.generated_at FROM corpus_documents d '
               f'WHERE d.latest=1 AND d.live=1 AND {readable_sql()} '
               'AND NOT EXISTS(SELECT 1 FROM corpus_dirty q WHERE q.entity_ref=d.entity_ref) '
               'AND (:course IS NULL OR d.course_id=:course) AND (:semester IS NULL OR d.semester_id=:semester) '
               'AND (:before IS NULL OR d.date<:before) '
               'ORDER BY d.course_id,d.ref LIMIT :n')
        return [dict(row) for row in self.session.execute(text(sql), parameters).mappings()]

    def released_topics(self, scope, limit=30):
        from sqlalchemy import select

        from app.db.models import LearningTopic
        parameters = {**self.scope(scope), 'before': scope.before, 'n': limit}
        ids = list(self.session.execute(text(f"SELECT cast(d.object_id AS INTEGER) FROM corpus_documents d "
                        f"WHERE d.kind='topic' AND d.latest=1 AND d.live=1 AND {readable_sql()} "
                        'AND NOT EXISTS(SELECT 1 FROM corpus_dirty q WHERE q.entity_ref=d.entity_ref) '
                        'AND (:course IS NULL OR d.course_id=:course) AND (:semester IS NULL OR d.semester_id=:semester) '
                        'AND (:before IS NULL OR d.date<:before) ORDER BY d.ref LIMIT :n'), parameters).scalars())
        return list(self.session.scalars(select(LearningTopic).where(LearningTopic.id.in_(ids)).order_by(LearningTopic.id)))

    def released_progress(self, topic_ids):
        if not topic_ids:
            return {}
        parameters = {f'topic{i}': value for i, value in enumerate(topic_ids)}
        clause = ','.join(':' + key for key in parameters)
        values = {topic: {'reviews': 0, 'retained': 0, 'attempts': 0, 'correct': 0} for topic in topic_ids}
        for kind, topic, joins, score, count_key, correct_key in [
            ('card', 'q.topic_id', ('JOIN anki_card_queue q ON q.id=cast(d.object_id AS INTEGER) '
             'JOIN anki_cards c ON c.queue_id=q.id JOIN anki_reviews r ON r.card_id=c.id'),
             'r.rating>1', 'reviews', 'retained'),
            ('exercise', 'e.topic_id', ('JOIN exercises e ON e.id=cast(d.object_id AS INTEGER) '
             'JOIN exercise_attempts r ON r.exercise_id=e.id'), 'r.correct=1', 'attempts', 'correct'),
        ]:
            query = (f'SELECT {topic} AS topic_id,count(*) AS total,sum(CASE WHEN {score} THEN 1 ELSE 0 END) AS positive '
                     f"FROM corpus_documents d {joins} WHERE d.kind='{kind}' AND d.latest=1 AND d.live=1 "
                     f'AND {readable_sql()} AND {topic} IN ({clause}) '
                     'AND NOT EXISTS(SELECT 1 FROM corpus_dirty qd WHERE qd.entity_ref=d.entity_ref) '
                     f'GROUP BY {topic}')
            for row in self.session.execute(text(query), parameters).mappings():
                values[row['topic_id']][count_key] = row['total']
                values[row['topic_id']][correct_key] = row['positive']
        return values

    def links(self, entity_ref, limit):
        kind, object_id = entity_ref.split(':', 1)
        return [dict(row) for row in self.session.execute(text(
            'SELECT from_type,from_id,to_type,to_id,relation FROM links WHERE '
            '(from_type=:kind AND from_id=:id) OR (to_type=:kind AND to_id=:id) '
            'ORDER BY id LIMIT :n'), {'kind': kind, 'id': object_id, 'n': limit}).mappings()]
