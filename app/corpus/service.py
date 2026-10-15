# SPDX-License-Identifier: AGPL-3.0-or-later
"""Agent retrieval: immutable citations, bounded context and permission-bound cursors."""

import json
from urllib.parse import quote

from fastapi import HTTPException

from app.corpus.budget import fit
from app.corpus.cache import RetrievalCache
from app.corpus.chunking import digest
from app.corpus.contracts import Search, material_source_ref
from app.corpus.cursors import seal, unseal
from app.corpus.query import normalize
from app.corpus.retrieval_repository import RetrievalRepository


class AgentDataPlane:
    def __init__(self, factory, settings, cache=None):
        self.factory, self.settings = factory, settings
        self.cache = cache if cache is not None else RetrievalCache()

    def citation(self, row):
        ref = row.get('chunk_ref') or row['ref']
        # Unlike a notification or pairing link, this is read back by the agent/MCP
        # client itself, which is usually on this same machine; 127.0.0.1 is the
        # correct answer there, so this one keeps the permissive fallback.
        base = self.settings.public_server_url or 'http://127.0.0.1:8000'
        value = {'id': ref, 'ref': ref, 'document_ref': row['ref'], 'entity_ref': row['entity_ref'],
                'title': row['title'], 'type': row['kind'], 'version': row['version'],
                'source_hash': row['source_hash'], 'content_hash': row.get('chunk_hash') or row['content_hash'],
                'page': row.get('page') if row['kind'] != 'code' else None, 'heading': row.get('heading'),
                'course_id': row['course_id'], 'semester_id': row['semester_id'],
                'url': base + '/api/agent-sources/' + quote(ref, safe='')}
        if row['kind'] == 'code' and row.get('code_location'):
            value['location'] = {key: item for key, item in json.loads(row['code_location']).items()
                                 if key in {'file', 'start_line', 'end_line', 'symbol_kind', 'references', 'origin',
                                            'qualified_name', 'calls', 'caller_candidates', 'is_test', 'imports'}}
        return value

    def _identity(self, repository, actor, operation, query=None):
        return {**repository.cursor_identity(actor), 'operation': operation,
                'query': digest(json.dumps(query or {}, sort_keys=True, default=str))}

    def search(self, request, actor='local'):
        request = normalize(request)
        with self.factory() as session:
            repository = RetrievalRepository(session)
            identity = self._identity(repository, actor, 'search',
                                      request.model_dump(exclude={'cursor', 'budget'}))
            identity['sequence'] = repository.sequence()
            temporal = repository.temporal_scope()
            selection = {'temporal': temporal, 'scope': repository.scope(request.scope),
                         'pending': repository.pending_revision(), 'request': identity['query']}
            if request.view == 'open_work':
                selection['workflow'] = repository.workflow_revision()
            if request.view == 'unread_material':
                selection['reading'] = repository.reading_revision()
            # One hash keeps cursor size bounded even when scope/view state grows.
            identity['query'] = digest(json.dumps(selection, sort_keys=True))
            after = unseal(request.cursor, self.settings.mcp_token, identity)['position'] if request.cursor else 0
            cache_key = digest(json.dumps({**identity, 'position': after}, sort_keys=True))
            ready = repository.cache_ready()
            rows = self.cache.get(cache_key) if ready else None
            if rows is None or not repository.validate_rows(rows):
                rows = repository.search(request, after)
                if ready:
                    self.cache.put(cache_key, rows)
            results = []
            for row in rows[:request.top_k]:
                value = self.citation(row)
                catalog = 'extraction_version' in row
                reasons = ['catalog' if catalog else request.mode if request.mode != 'search' else 'lexical_match']
                if request.scope.course is not None:
                    reasons.append('course_filter')
                if request.scope.semester is not None:
                    reasons.append('semester_filter')
                if request.scope.before:
                    reasons.append('before_filter')
                if request.types:
                    reasons.append('type_filter')
                if request.view != 'all':
                    reasons.append('view:' + request.view)
                for field, mask in [('title', 1), ('heading', 2), ('text', 4)]:
                    if row.get('matched_fields', 0) & mask:
                        reasons.append(field + '_match')
                if not catalog:
                    value.update(excerpt=row['excerpt'], ranking={'method': 'exact_symbol' if request.mode == 'symbol' else 'fts5_bm25',
                                 'score': row['lexical_score'], 'is_probability': False,
                                 'tie_break': 'current_semester_then_index_order_bound_to_revision'})
                value.update(date=row['date'], size=row['size'], mime_type=row['mime_type'])
                value.update(tier=temporal['tiers'].get(row['semester_id'], 'unclassified'), reasons=reasons)
                if request.deduplicate:
                    value['duplicate_count'] = row['duplicate_count']
                if catalog:
                    value['catalog'] = {key: row[key] for key in ('indexed_pages', 'last_indexed_page',
                                      'extraction_version', 'outline_available', 'summary_available')}
                    if row.get('mail_metadata'):
                        value['mail'] = json.loads(row['mail_metadata'])
                results.append(value)
            payload = fit({'results': results, 'next_cursor': None, 'index_sequence': identity['sequence'],
                           'corpus_revision': str(identity['epoch']) + ':' + str(identity['sequence']),
                           'view': request.view, 'deduplicated': request.deduplicate,
                           'untrusted_source_data': True}, request.budget, ('results',))
            count = len(payload['results'])
            if len(rows) > count:
                if not count:
                    raise HTTPException(422, 'Budget zu klein für einen Suchtreffer')
                payload['next_cursor'] = seal({**identity, 'position': after + count}, self.settings.mcp_token)
                # Cursor must also fit; retry with fewer hits if necessary.
                while True:
                    previous = len(payload['results'])
                    payload = fit(payload, request.budget, ('results',))
                    if not payload['results']:
                        raise HTTPException(422, 'Budget zu klein für Treffer und Cursor')
                    if len(payload['results']) == previous:
                        break
                    payload['next_cursor'] = seal({**identity, 'position': after + len(payload['results'])},
                                                  self.settings.mcp_token)
            return payload

    def fetch(self, request):
        with self.factory() as session:
            repository = RetrievalRepository(session)
            results, batches = [], []
            for ref in dict.fromkeys(request.refs):
                document = repository.document(ref)
                if document is None:
                    raise HTTPException(404, 'Quelle nicht verfügbar oder nicht freigegeben')
                source = material_source_ref(ref)
                selection = request.model_copy(update={'pages': [source[1]]}) if source and source[1] else request
                canonical = document['ref'] if source else ref
                rows = repository.chunks(canonical, document['ref'], selection)
                locations = {entry['page']: entry for entry in json.loads(document['outline'])} if document['kind'] == 'code' else {}
                batches.append((canonical, rows, selection))
                for row in rows[:50]:
                    entry = self.citation({**document, 'chunk_ref': row['ref'], 'chunk_hash': row['content_hash'],
                                           'page': row['page'], 'heading': row['heading'],
                                           'code_location': json.dumps(locations.get(row['page'])) if locations else None})
                    entry.update(text=row['body'], position=row['position'],
                                 derived=False, stale=bool(document['stale']))
                    results.append(entry)
            # Every continuation is computed from the chunks actually emitted. Never
            # trim a continuation independently: that would silently lose a source.
            while True:
                emitted = {entry['ref']: entry['position'] for entry in results}
                continuations = []
                for ref, rows, selection in batches:
                    after = selection.after
                    for row in rows:
                        if row['ref'] not in emitted:
                            # Overlapping aliases can emit a later chunk in a
                            # different batch while this batch's prefix is absent.
                            # Never advance its cursor past the first missing row.
                            break
                        after = row['position']
                    else:
                        continue
                    continuations.append({'ref': ref, 'after': after,
                                          'pages': selection.pages, 'sections': selection.sections})
                payload = fit({'results': results, 'continuations': continuations,
                               'untrusted_source_data': True}, request.budget, ('results',))
                if len(payload['results']) == len(results):
                    return payload
                results = payload['results']
                if not results and any(rows for _, rows, _ in batches):
                    raise HTTPException(422, 'Budget zu klein für einen Abschnitt und Fortsetzungsverweise')

    def outline(self, request):
        with self.factory() as session:
            repository = RetrievalRepository(session)
            row = repository.document(request.ref)
            if row is None:
                raise HTTPException(404, 'Quelle nicht verfügbar oder nicht freigegeben')
            all_entries = json.loads(row['outline'])
            entries = [{'index': i, **entry} for i, entry in enumerate(all_entries)
                       if i > request.after][:request.limit]
            while True:
                last = entries[-1]['index'] if entries else request.after
                payload = fit({'source': self.citation(row), 'entries': entries,
                               'summary': {'derived': True, 'source_hash': row['source_hash'], 'extraction_hash': row['content_hash'],
                                           'generated_at': row['generated_at'], 'model_version': 'extractive-v1',
                                           'stale': bool(row['stale']), 'text': row['summary'][:1000]},
                               'next_after': last if last + 1 < len(all_entries) else None},
                              request.budget, ('entries',))
                if len(payload['entries']) == len(entries):
                    return payload
                entries = payload['entries']
                if not entries:
                    raise HTTPException(422, 'Budget zu klein für einen Inhaltsverzeichniseintrag')

    def changes(self, request, actor='local'):
        with self.factory() as session:
            repository = RetrievalRepository(session)
            identity = self._identity(repository, actor, 'changes')
            after = unseal(request.cursor, self.settings.mcp_token, identity)['position'] if request.cursor else 0
            rows = repository.events(after, request.limit + 1)
            events, scanned = [], after
            for row in rows[:request.limit]:
                scanned = row['seq']
                if repository.event_allowed(row):
                    events.append({'sequence': row['seq'], 'event': row['event'], 'ref': row['ref'],
                                   'entity_ref': row['entity_ref'], 'hash': row['hash']})
            if after > repository.sequence():
                raise HTTPException(409, 'Cursor liegt hinter einem wiederhergestellten Bestand; erneut starten')
            complete = events
            while True:
                position = scanned if len(events) == len(complete) else events[-1]['sequence'] if events else after
                payload = fit({'events': events, 'next_cursor': seal({**identity, 'position': position},
                              self.settings.mcp_token), 'has_more': len(rows) > request.limit or len(events) < len(complete)},
                              request.budget, ('events',))
                if len(payload['events']) == len(events):
                    return payload
                events = payload['events']
                if not events:
                    raise HTTPException(422, 'Budget zu klein für ein Änderungsereignis')

    def graph(self, request):
        with self.factory() as session:
            repository = RetrievalRepository(session)
            root = repository.document(request.ref)
            if root is None:
                raise HTTPException(404, 'Quelle nicht verfügbar oder nicht freigegeben')
            queue, seen, nodes, edges = [(root['entity_ref'], 0)], set(), [], []
            edge_keys, inspected = set(), 0
            while queue and len(nodes) < request.limit:
                ref, depth = queue.pop(0)
                if ref in seen:
                    continue
                seen.add(ref)
                node = repository.document(ref)
                if node is None:
                    continue
                nodes.append(self.citation(node))
                if depth >= request.depth:
                    continue
                for edge in repository.links(ref, request.limit):
                    inspected += 1
                    if inspected > request.limit * 3:
                        break
                    left = f"{edge['from_type']}:{edge['from_id']}"
                    right = f"{edge['to_type']}:{edge['to_id']}"
                    key = (left, right, edge['relation'])
                    if key in edge_keys:
                        continue
                    edge_keys.add(key)
                    if repository.document(left) is None or repository.document(right) is None:
                        continue
                    if len(edges) < request.limit:
                        edges.append({'from': left, 'to': right, 'relation': edge['relation']})
                    if len(queue) < request.limit * 2:
                        queue.extend([(left, depth + 1), (right, depth + 1)])
            payload = fit({'nodes': nodes, 'edges': edges, 'partial': bool(queue) or inspected > request.limit * 3}, request.budget, ('edges', 'nodes'))
            retained = {node['entity_ref'] for node in payload['nodes']}
            payload['edges'] = [edge for edge in payload['edges'] if edge['from'] in retained and edge['to'] in retained]
            return fit(payload, request.budget, ('edges',))

    def context(self, request, actor='local'):
        # Deterministic selection, with source diversity and transparent goal. No model call.
        priorities = {'prepare_exam': ['exam', 'topic', 'question', 'resource', 'note', 'exercise', 'assignment'],
                      'weekly_study': ['deadline', 'assignment', 'event', 'question', 'resource', 'note'],
                      'overview': ['course', 'topic', 'resource', 'project'],
                      'question': request.types or ['resource', 'note', 'exercise', 'question', 'topic']}
        request = normalize(request)
        with self.factory() as session:
            repository = RetrievalRepository(session)
            initial_identity = {**repository.cursor_identity(actor), 'sequence': repository.sequence()}
            if request.view == 'current_semester':
                current = repository.temporal_scope()['current']
                if current is None:
                    raise HTTPException(409, 'Kein eindeutiges aktuelles Semester eingestellt')
                chosen = repository.scope(request.scope)['semester']
                if chosen is not None and chosen != current:
                    raise HTTPException(422, 'Semesterfilter widerspricht dem aktuellen Semester')
                request = request.model_copy(update={'scope': request.scope.model_copy(update={'semester': current})})
        groups = []
        for kind in priorities[request.goal]:
            if request.types and kind not in request.types:
                continue
            search = Search(query=request.query, scope=request.scope, types=[kind], top_k=min(10, request.top_k),
                            budget=64000, mode='search' if request.query else 'catalog', view=request.view,
                            deduplicate=request.deduplicate, chunks_per_document=request.chunks_per_document)
            groups.append(self.search(search, actor)['results'])
        candidates, seen, document_counts = [], set(), {}
        for rank in range(10):
            for group in groups:
                if rank >= len(group):
                    continue
                entry = group[rank]
                doc = entry['document_ref']
                if entry['ref'] not in seen and document_counts.get(doc, 0) < 2:
                    candidates.append(entry)
                    seen.add(entry['ref'])
                    document_counts[doc] = document_counts.get(doc, 0) + 1
        candidates = candidates[:request.top_k]
        with self.factory() as session:
            repository = RetrievalRepository(session)
            if initial_identity != {**repository.cursor_identity(actor), 'sequence': repository.sequence()}:
                raise HTTPException(409, 'Quellen oder Rechte während der Kontextauswahl geändert; bitte erneut abrufen')
            if not repository.validate_rows([{'ref': c['document_ref']} for c in candidates]):
                raise HTTPException(409, 'Kontextquelle während der Auswahl geändert; bitte erneut abrufen')
            open_questions = repository.open_questions([c['entity_ref'] for c in candidates])
            hierarchy = repository.hierarchy(request.scope)
            summaries = repository.summaries(request.scope)
            for group in hierarchy:
                children = [row for row in summaries if row['course_id'] == group['course_id']]
                group['summary'] = {'derived': True, 'model_version': 'extractive-v1',
                                    'scope': 'released_indexed_sources', 'stale': False,
                                    'source_hash': digest(json.dumps([(c['ref'], c['content_hash']) for c in children])),
                                    'generated_at': max((c['generated_at'] for c in children), default=None),
                                    'sources': [c['ref'] for c in children],
                                    'text': '\n'.join(c['summary'][:240] for c in children[:8]),
                                    'partial': len(children) > 8 or len(children) < group['documents']}
            from app.ai.access import allowed
            from app.learning.progress import TopicProgress, _confidence
            weak_topics = []
            # Both input domains must be released; progress includes reviews
            # AND exercise answers, so one permission cannot substitute for both.
            if allowed(session, 'category:learning_state') and allowed(session, 'category:exercises'):
                topics = repository.released_topics(request.scope)
                evidence = repository.released_progress([topic.id for topic in topics])
                for topic in topics:
                    stats = evidence[topic.id]
                    progress = TopicProgress(topic=topic,
                        anki_retention=stats['retained'] / stats['reviews'] if stats['reviews'] >= self.settings.learning_min_reviews else None,
                        anki_review_count=stats['reviews'],
                        exercise_accuracy=stats['correct'] / stats['attempts'] if stats['attempts'] >= self.settings.learning_min_attempts else None,
                        exercise_attempt_count=stats['attempts'], last_review=None,
                        confidence=_confidence(self.settings, stats['reviews'], stats['attempts']))
                    if progress.is_weak:
                        document = repository.document('topic:' + str(progress.topic.id))
                        if document is not None:
                            weak_topics.append({'ref': document['ref'], 'title': progress.topic.name,
                                'derived': True, 'confidence': progress.confidence,
                                'scope': 'released_indexed_evidence',
                                'retention': progress.anki_retention, 'accuracy': progress.exercise_accuracy,
                                'reviews': progress.anki_review_count, 'attempts': progress.exercise_attempt_count,
                                'reason': 'insufficient_evidence' if progress.confidence == 'low' else 'below_threshold'})
            semester_overviews = []
            for semester_id in dict.fromkeys(group['semester_id'] for group in hierarchy):
                children = [group for group in hierarchy if group['semester_id'] == semester_id]
                semester_overviews.append({'semester_id': semester_id, 'semester': children[0]['semester'],
                    'derived': True, 'model_version': 'extractive-v1', 'stale': False,
                    'source_hash': digest(json.dumps([group['summary']['source_hash'] for group in children])),
                    'generated_at': max((group['generated_at'] for group in children), default=None),
                    'sources': list(dict.fromkeys(ref for group in children for ref in group['summary']['sources'])),
                    'text': '\n'.join(group['course'] + ': ' + group['summary']['text'][:300]
                                      for group in children[:8] if group['course']),
                    'partial': len(children) > 8 or any(group['summary']['partial'] for group in children) or len(hierarchy) == 30})
        original_count = len(candidates)
        while True:
            payload = fit({'goal': request.goal, 'overview': hierarchy, 'sources': candidates,
                           'semesters': semester_overviews, 'weak_topics': weak_topics,
                           'corpus_revision': str(initial_identity['epoch']) + ':' + str(initial_identity['sequence']),
                           'selection': 'goal_priority_round_robin_then_fts5_bm25; max_two_chunks_per_document',
                           'deadlines': [c['ref'] for c in candidates if c['type'] in {'assignment', 'deadline', 'exam'}],
                           'open_questions': [c['ref'] for c in candidates if c['entity_ref'] in open_questions],
                           'source_handles': [c['ref'] for c in candidates],
                           'includes_full_originals': False, 'untrusted_source_data': True}, request.budget,
                          ('semesters', 'overview', 'weak_topics', 'sources'))
            if len(payload['sources']) == len(candidates):
                payload['truncated'] = payload['truncated'] or len(candidates) < original_count
                return fit(payload, request.budget)
            candidates, hierarchy = payload['sources'], payload['overview']
            semester_overviews, weak_topics = payload['semesters'], payload['weak_topics']
            if original_count and not candidates:
                raise HTTPException(422, 'Budget zu klein für einen Context-Pack-Treffer')
