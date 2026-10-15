# SPDX-License-Identifier: AGPL-3.0-or-later
"""Synthetic pre-extracted scale fixture; never consult private app settings."""

import argparse
import json
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from time import perf_counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, insert, text

from app.corpus.chunking import chunks, content_hash, digest
from app.corpus.contracts import Fetch, Search
from app.corpus.evaluation import evaluate
from app.corpus.incremental_schema import install as install_incremental
from app.corpus.schema_v1 import install
from app.corpus.service import AgentDataPlane
from app.db.models import AiAccess, Base, Course, Resource, ResourceVersion, Semester
from app.db.session import make_session_factory
from app.release_lab.worker import SyntheticSettings


def seed(factory, documents, pages, queries, golden, progress=False):
    """Bulk pre-extracted index fixture with real synthetic source/ACL rows."""
    if not 100 <= documents <= 50000 or not 1 <= pages <= 20 or not 1 <= queries <= 500:
        raise ValueError('Fixture exceeds its explicit source/page/query limits')
    expected, public_refs, denied_count = {}, [], 0
    with factory() as session:
        from datetime import UTC, datetime
        semesters = [Semester(name=f'Synthetic Semester {i}', is_current=i == 9,
                     starts_at=datetime(2022 + i // 2, 4 if i % 2 == 0 else 10, 1, tzinfo=UTC)) for i in range(10)]
        session.add_all(semesters)
        session.flush()
        courses = [Course(source='scale', source_id=str(i), name=f'Erfundener Kurs {i}',
                          semester_id=semesters[i % 10].id) for i in range(120)]
        private = Course(source='scale', source_id='private', name='Gesperrter Testkurs', semester_id=semesters[9].id)
        session.add_all([*courses, private])
        session.flush()
        session.add(AiAccess(key=f'course:{private.id}', allowed=False))
        scope = [(course.id, course.semester_id) for course in courses]
        denied_id = private.id
        session.commit()
    golden_docs = golden['documents']
    for start in range(0, documents, 250):
        sources, versions, indexed, indexed_chunks, events = [], [], [], [], []
        for i in range(start, min(start + 250, documents)):
            identifier = i + 1
            denied = i >= len(golden_docs) and i % 10 == 0
            course, semester = (denied_id, semesters[9].id) if denied else scope[i % 120]
            if i < len(golden_docs):
                document = golden_docs[i]
                title, body = document['title'], document['text']
                expected[document['key']] = f'resource:{identifier}'
            else:
                title = f'Erfundener Stoff {i:06d}'
                body = f'Gemeinsamer Lernstoff SyntheticTopic{i:06d}. Fiktiver Inhalt ohne Hochschuldaten.'
                if denied:
                    body += '\n' + ' '.join(document['key'] for document in golden_docs)
                else:
                    public_refs.append((i, f'resource:{identifier}'))
            sources.append({'id': identifier, 'source': 'synthetic-scale', 'source_key': str(i),
                            'course_id': course, 'kind': 'pdf', 'name': title,
                            'url': 'https://example.invalid/synthetic', 'group_category': 'general'})
            for version in [1, 2]:
                source_hash = digest(f'synthetic-source:{identifier}:{version}')
                versions.append({'resource_id': identifier, 'version': version, 'sha256': source_hash,
                                 'relative_path': f'invented/{identifier}-{version}.pdf',
                                 'size': len(body.encode()) * pages, 'mime_type': 'application/pdf'})
                values, outline = chunks([(page, body if version == 2 else 'Veraltete Quelle\n' + body)
                                         for page in range(1, pages + 1 if version == 2 else 2)], title)
                ref = f'resource:{identifier}@v{version}:' + digest(f'synthetic-index:{identifier}:{version}')
                indexed.append({'ref': ref, 'entity_ref': f'resource:{identifier}', 'kind': 'resource',
                    'object_id': str(identifier), 'version': str(version), 'source_hash': source_hash,
                    'content_hash': content_hash(values, outline), 'course_id': course, 'semester_id': semester,
                    'title': title, 'date': '2026-10-04T00:00:00+00:00', 'size': len(body.encode()) * pages,
                    'mime_type': 'application/pdf', 'latest': int(version == 2), 'live': 1,
                    'outline': json.dumps(outline, ensure_ascii=False), 'summary': body[:220],
                    'generated_at': '2026-10-04T00:00:00+00:00', 'extraction_version': 'sections-v1', 'shareable': 1})
                indexed_chunks.extend({'ref': 'chunk:' + digest(f'{ref}:{chunk.position}:{chunk.content_hash}'),
                    'document_ref': ref, 'position': chunk.position, 'page': chunk.page,
                    'heading': chunk.heading, 'title': title, 'body': chunk.body, 'content_hash': chunk.content_hash}
                                      for chunk in values)
                if version == 2:
                    events.append({'entity_ref': f'resource:{identifier}', 'ref': ref, 'kind': 'resource',
                        'course_id': course, 'category': 'course_material', 'event': 'resource.updated',
                        'hash': source_hash, 'shareable': 1})
            denied_count += int(denied)
        with factory() as session:
            session.execute(insert(Resource), sources)
            session.execute(insert(ResourceVersion), versions)
            session.execute(text('INSERT INTO corpus_documents VALUES('
                ':ref,:entity_ref,:kind,:object_id,:version,:source_hash,:content_hash,:course_id,:semester_id,'
                ':title,:date,:size,:mime_type,:latest,:live,:outline,:summary,:generated_at,:extraction_version,:shareable)'), indexed)
            session.execute(text('INSERT INTO corpus_chunks(ref,document_ref,position,page,heading,title,body,content_hash) '
                'VALUES(:ref,:document_ref,:position,:page,:heading,:title,:body,:content_hash)'), indexed_chunks)
            session.execute(text('INSERT INTO corpus_events(entity_ref,ref,kind,course_id,category,event,hash,shareable) '
                'VALUES(:entity_ref,:ref,:kind,:course_id,:category,:event,:hash,:shareable)'), events)
            # These synthetic index entries are already published, not pending imports.
            session.execute(text('DELETE FROM corpus_dirty'))
            session.commit()
        if progress and (start + 250) % 5000 == 0:
            print(f'Synthetic fixture: {start + 250}/{documents} documents', flush=True)
    cases = [{**case, 'expected': [expected[case['expected_key']]], 'version': '2',
              'forbidden_courses': [denied_id]} for case in golden['cases'][:queries]]
    for i in range(len(cases), queries):
        number, ref = public_refs[(i * 97) % len(public_refs)]
        cases.append({'id': f'scale-{i}', 'query': f'SyntheticTopic{number:06d}',
                      'expected': [ref], 'version': '2', 'forbidden_courses': [denied_id]})
    return cases, denied_count, denied_id


def run(documents, pages, queries):
    golden = json.loads((Path(__file__).resolve().parents[1] / 'tests/fixtures/agent/retrieval.json').read_text(encoding='utf-8'))
    with TemporaryDirectory(prefix='unios-corpus-scale-') as directory:
        root = Path(directory)
        settings = SyntheticSettings(data_dir=root / 'synthetic', local_dir=root / 'private',
                                     moodle_enabled=False, mcp_token='invented-scale-identity')
        settings.data_dir.mkdir(parents=True)
        settings.local_dir.mkdir(parents=True)
        engine = create_engine(settings.database_url)
        try:
            Base.metadata.create_all(engine)
            with engine.begin() as connection:
                install(connection)
                install_incremental(connection)
            factory = make_session_factory(engine)
            start = perf_counter()
            cases, denied_count, denied_id = seed(factory, documents, pages, queries, golden, progress=True)
            seed_seconds = perf_counter() - start
            service = AgentDataPlane(factory, settings)
            report = evaluate(service, cases, compare_warm=True)
            start = perf_counter()
            broad = service.search(Search(query='Gemeinsamer Lernstoff', budget=64000))
            report['broad_query'] = {'latency_ms': (perf_counter() - start) * 1000,
                                    'results': len(broad['results']), 'payload_bytes': broad['budget']['used'],
                                    'forbidden_sources': sum(hit['course_id'] == denied_id for hit in broad['results'])}
            hits = service.search(Search(query=cases[0]['query'], budget=64000))['results']
            fetched = service.fetch(Fetch(refs=[hit['ref'] for hit in hits], budget=64000))['results']
            report['citation_hash_mismatches'] = sum(digest(hit['text']) != hit['content_hash'] for hit in fetched)
            with factory() as session:
                count = session.scalar(text('SELECT count(*) FROM corpus_chunks'))
            report.update(documents=documents, latest_chunks=documents * pages, historical_versions=documents,
                          indexed_chunks=count, courses=120, semesters=10, denied_documents=denied_count,
                          index_seed_seconds=seed_seconds, fixture='synthetic pre-extracted index, not PDF/OCR import',
                          source_files_created=False)
            return report
        finally:
            engine.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--documents', type=int, default=50000)
    parser.add_argument('--pages', type=int, default=20)
    parser.add_argument('--queries', type=int, default=500)
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    target = args.report.resolve()
    workspace = Path(__file__).resolve().parents[1]
    if not target.is_relative_to(workspace) or any(part in {'data', 'local', '.env', '.git'} for part in target.relative_to(workspace).parts):
        raise ValueError('Report must be a new file in the workspace outside private app storage')
    if target.exists():
        raise ValueError('Never replace an existing benchmark report')
    report = run(args.documents, args.pages, args.queries)
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open('x', encoding='utf-8') as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2)
    print(json.dumps(report), flush=True)
    if (report['recall_at_20'] < .99 or report['forbidden_sources'] or report['stale_versions']
            or report['citation_hash_mismatches'] or report['broad_query']['forbidden_sources']):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
