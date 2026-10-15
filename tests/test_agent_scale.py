# SPDX-License-Identifier: AGPL-3.0-or-later
"""50k synthetic sources and fixed expected references, never user files."""

import json
from pathlib import Path
from time import perf_counter

from sqlalchemy import insert, text

from app.corpus.contracts import Search
from app.corpus.evaluation import evaluate
from app.corpus.repository import CorpusRepository
from app.corpus.service import AgentDataPlane
from app.corpus.worker import CorpusWorker
from app.db.models import AiAccess, Course, Resource, ResourceText, ResourceVersion


def test_fifty_thousand_sources_retrieval_regression(factory, settings, coordinator, tmp_path, monkeypatch):
    golden = json.loads((Path(__file__).parent / 'fixtures' / 'agent' / 'retrieval.json').read_text(encoding='utf-8'))
    settings.mcp_token = 'synthetic-scale-' + 'x' * 40
    expected = {}
    with factory() as session:
        course = Course(source='fixture', source_id='public', name='Testkurs')
        hidden = Course(source='fixture', source_id='hidden', name='Gesperrter Testkurs')
        session.add_all([course, hidden])
        session.flush()
        course_id, hidden_id = course.id, hidden.id
        session.add(AiAccess(key=f'course:{hidden_id}', allowed=False))
        for index, document in enumerate(golden['documents']):
            resource = Resource(source='fixture', source_key=f'golden-{index}', kind='pdf',
                                course_id=course_id, name=document['title'], url='https://example.invalid/material')
            session.add(resource)
            session.flush()
            version = ResourceVersion(resource_id=resource.id, version=1, sha256=f'{index:064x}',
                                      relative_path=f'uni/nonexistent-{index}.pdf', size=100, mime_type='application/pdf')
            session.add(version)
            session.flush()
            session.add(ResourceText(version_id=version.id, page_number=1, text=document['text'], markdown=None))
            expected[document['key']] = f'resource:{resource.id}'
        session.commit()
    worker = CorpusWorker(CorpusRepository(factory, settings), coordinator)
    worker.drain()
    start = perf_counter()
    # Seed pre-extracted distractors directly: this measures index/query scaling,
    # not PDF parsing throughput. Every document still has a real synthetic domain row.
    with factory() as session:
        for batch in range(50):
            session.execute(insert(Resource), [{'source': 'scale', 'source_key': str(batch * 1000 + i),
                                                'course_id': hidden_id, 'kind': 'pdf', 'name': 'Gesperrter Inhalt',
                                                'url': 'https://example.invalid/private'} for i in range(1000)])
        session.execute(text("INSERT INTO corpus_documents SELECT 'resource:'||id||'@v1:scale', 'resource:'||id,"
                             "'resource',cast(id AS TEXT),'1','scale','scale',course_id,NULL,name,'2026-01-01',"
                             "100,'application/pdf',1,1,'[]','', '2026-01-01','sections-v1',1 FROM resources WHERE source='scale'"))
        session.execute(text("INSERT INTO corpus_chunks(ref,document_ref,position,page,heading,title,body,content_hash) "
                             "SELECT 'chunk:scale:'||id,'resource:'||id||'@v1:scale',0,1,'Rekursion','Gesperrter Inhalt',"
                             ":body,'scale' FROM resources WHERE source='scale'"),
                        {'body': ' '.join(document['key'] for document in golden['documents'])})
        session.execute(text("DELETE FROM corpus_dirty WHERE entity_ref IN (SELECT 'resource:'||id FROM resources WHERE source='scale')"))
        session.commit()
    index_seconds = perf_counter() - start
    cases = [{**case, 'scope': {'course': course_id}, 'expected': [expected[case['expected_key']]],
              'forbidden_courses': [hidden_id]}
             for case in golden['cases']]
    monkeypatch.setattr('pathlib.Path.read_bytes', lambda *_: (_ for _ in ()).throw(AssertionError('Retrieval read a file')))
    service = AgentDataPlane(factory, settings)
    report = evaluate(service, cases)
    report.update(documents=worker.repository.status()['documents'], index_seed_seconds=index_seconds,
                  corpus='synthetic pre-extracted sources; not PDF import throughput')
    (tmp_path / 'retrieval-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report))
    assert report['cases'] == 100
    assert report['recall_at_5'] >= .95 and report['recall_at_20'] >= .95
    assert report['forbidden_sources'] == 0 and report['stale_versions'] == 0
    assert report['documents'] >= 50000
    # No hardware-specific millisecond promise. Regression gate bounds the payload
    # and requires ACL filtering even WITHOUT the narrowing course filter.
    unscoped = service.search(Search(query='Rekursion'))
    assert all(hit['course_id'] == course_id for hit in unscoped['results'])
