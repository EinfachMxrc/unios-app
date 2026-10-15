# SPDX-License-Identifier: AGPL-3.0-or-later
"""Actual PDF import/index/snapshot/restore in an entirely synthetic temporary home.

This complements the pre-extracted million-chunk benchmark. It is neither a
million-file import nor a human retrieval evaluation or production VPS result.
"""
import argparse
import json
import os
import platform
import sqlite3
import sys
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory
from time import perf_counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pymupdf
from sqlalchemy import select, text

from app.catalog.repository import CatalogRepository
from app.catalog.service import CatalogService
from app.connectors.base import RemoteCourse, RemoteResource, Snapshot
from app.corpus.contracts import Fetch, Search
from app.corpus.evaluation import evaluate
from app.corpus.incremental_schema import install as install_incremental
from app.corpus.repository import CorpusRepository
from app.corpus.schema_v1 import install
from app.corpus.service import AgentDataPlane
from app.corpus.worker import CorpusWorker
from app.db.models import Base, Resource, ResourceVersion
from app.db.session import make_engine, make_session_factory
from app.extract.jobs import IndexJob, IndexJobs
from app.host.handoff import _stage_snapshot
from app.host.lease import HostCoordinator
from app.host.snapshots import create_snapshot, verify_snapshot
from app.notify.service import Notifier
from app.release_lab.worker import SyntheticSettings
from app.sync.engine import SyncEngine

TOPICS = [
    ('Rekursion', 'Ein Basisfall beendet eine rekursive Funktion. Der Rekursionsschritt verkleinert das Problem.',
     ['Warum braucht eine rekursive Funktion einen Basisfall?', 'Wo wird die Abbruchbedingung bei Rekursion erklärt?', 'Wie verkleinert ein Rekursionsschritt das Problem?']),
    ('Datenbanken', 'Eine Transaktion schützt die Datenbank durch atomare Änderungen. Ein Fremdschlüssel sichert die Referenzintegrität.',
     ['Wozu dient eine Transaktion in der Datenbank?', 'Wie sichern Fremdschlüssel die Referenzintegrität?', 'Wo finde ich atomare Änderungen von Datenbanken?']),
    ('Binärbaum', 'Ein Binärbaum hat höchstens zwei Kinder pro Knoten. Die Suche traversiert linke und rechte Teilbäume.',
     ['Wie viele Kinder hat ein Knoten im Binärbaum?', 'Wo wird die Suche in einem Binärbaum beschrieben?', 'Wie traversiert man linke und rechte Teilbäume?']),
    ('Ableitung', 'Die Ableitung beschreibt die lokale Änderungsrate einer Funktion. Die Kettenregel hilft bei zusammengesetzten Funktionen.',
     ['Was beschreibt die Ableitung einer Funktion?', 'Wann hilft die Kettenregel?', 'Wo wird die lokale Änderungsrate erklärt?']),
    ('Komplexität', 'Die Laufzeitkomplexität beschreibt den Aufwand eines Algorithmus. Die O-Notation erlaubt den Vergleich von Laufzeiten.',
     ['Wie vergleicht die O-Notation Laufzeiten?', 'Wo wird die Laufzeitkomplexität von Algorithmen erklärt?', 'Wie beschreibt man den Aufwand eines Algorithmus?']),
]


def pdf_bytes(pages, body):
    with pymupdf.open() as pdf:
        for index in range(pages):
            page = pdf.new_page()
            page.insert_textbox(pymupdf.Rect(40, 40, 540, 760), f'Synthetisches Studienmaterial\nSeite {index + 1}\n\n{body}', fontsize=12)
        return pdf.tobytes()


def benchmark(documents=30, script_pages=500):
    if not 6 <= documents <= 500 or not 80 <= script_pages <= 1000:
        raise ValueError('Use 6–500 documents and 80–1000 script pages')
    with TemporaryDirectory(prefix='unios-pipeline-fixture-') as folder:
        root = Path(folder)
        settings = SyntheticSettings(data_dir=root / 'shared', local_dir=root / 'private', moodle_enabled=False,
                                     mcp_token='invented-pipeline-identity', public_periods_enabled=False)
        host = HostCoordinator(settings)
        host.acquire_initial()
        if not host.start(background=False):
            raise RuntimeError('Fixture host could not start')
        engine = make_engine(settings)
        try:
            settings.local_dir.mkdir(parents=True, exist_ok=True)
            Base.metadata.create_all(engine)
            with engine.begin() as connection:
                install(connection)
                install_incremental(connection)
                from app.assessment.index_schema import install as install_assessment
                from app.coding.index_schema import install as install_coding
                install_coding(connection)
                install_assessment(connection)
                connection.execute(text('CREATE VIRTUAL TABLE notes_fts USING fts5(note_id UNINDEXED,title,body)'))
            factory = make_session_factory(engine)
            generated = {}
            for index in range(documents):
                title, body = TOPICS[index][:2] if index < len(TOPICS) else (f'Beispielmaterial {index:03d}', 'Neutrale Hinweise zu Organisation und Arbeitsabläufen im Studium.')
                generated[str(index)] = (title + '.pdf', pdf_bytes(5, body))
            generated['large'] = ('Großes Testskript.pdf', pdf_bytes(script_pages, 'Allgemeine Hinweise zur Organisation. Dieses große Testskript enthält absichtlich keine Zielthemen der Suchfragen.'))

            class Connector:
                name = 'pipeline-fixture'

                def fetch_changes(self, since=None):
                    return Snapshot([RemoteCourse(key='sample', name='Erfundener Studienkurs', resources=[
                        RemoteResource(key=key, name=name, filename=name, url='https://example.invalid/' + key,
                                       kind='file', size=len(data)) for key, (name, data) in generated.items()])])

                def download(self, resource):
                    return generated[resource.key][1]

            start = perf_counter()
            sync = SyncEngine(factory, settings, [Connector()], Notifier(settings, host), host).run()
            import_seconds = perf_counter() - start
            if sync.status not in {'success', 'warning'}:
                raise RuntimeError('Fixture import failed')
            with factory() as session:
                resources = list(session.scalars(select(Resource).order_by(Resource.id)))
                versions = list(session.scalars(select(ResourceVersion)))
                course_id = resources[0].course_id
                expected = {row.source_key: f'resource:{row.id}' for row in resources}
                latest_id = next(row.id for row in versions if row.resource_id == next(r.id for r in resources if r.source_key == 'large'))
            start = perf_counter()
            index = IndexJobs(factory, settings, host)
            job = IndexJob(latest_id, generation=host.current().generation)
            index._index(job)
            if job.state != 'completed' or job.completed != script_pages:
                raise RuntimeError('Large PDF indexing incomplete')
            background_seconds = perf_counter() - start
            repository = CorpusRepository(factory, settings)
            start = perf_counter()
            CorpusWorker(repository, host).drain()
            corpus_seconds = perf_counter() - start
            service = AgentDataPlane(factory, settings)
            cases = [{'id': f'topic-{index}-{question}', 'query': query, 'scope': {'course': course_id},
                      'expected': [expected[str(index)]]} for index, (_, _, questions) in enumerate(TOPICS)
                     for question, query in enumerate(questions)]
            retrieval = evaluate(service, cases, compare_warm=True)
            payload = service.search(Search(query='Rekursion Basisfall', scope={'course': course_id}))
            if not payload['results']:
                raise RuntimeError('Fixture retrieval empty')
            ref = payload['results'][0]['ref']
            original_fetch = service.fetch(Fetch(refs=[ref]))
            start = perf_counter()
            manifest = create_snapshot(host)
            snapshot_seconds = perf_counter() - start
            snapshots = settings.data_dir / 'host' / 'snapshots'
            if not verify_snapshot(snapshots, manifest, check_integrity=True):
                raise RuntimeError('Snapshot verification failed')
            start = perf_counter()
            staged = _stage_snapshot(snapshots, manifest, root / 'restored.sqlite3')
            with closing(sqlite3.connect(staged)) as restored:
                restore_count = restored.execute('SELECT count(*) FROM resource_versions').fetchone()[0]
                integrity = restored.execute('PRAGMA quick_check').fetchone()[0]
                chunk_count = restored.execute('SELECT count(*) FROM corpus_chunks').fetchone()[0]
            restore_seconds = perf_counter() - start
            if restore_count != len(versions) or integrity != 'ok' or chunk_count != repository.status()['chunks']:
                raise RuntimeError('Restored source/index counts differ')
            catalog = CatalogService(CatalogRepository(factory))
            listed = catalog.course(course_id, 0, 50, '', None, lambda row: {'id': row.id})
            return {'_spdx': 'AGPL-3.0-or-later', 'schema': 1, 'fixture_only': True,
                    'hardware': {'os': platform.system(), 'os_version': platform.release(), 'python': platform.python_version(),
                                 'cpu': platform.processor(), 'logical_cpus': os.cpu_count()},
                    'fixture': {'pdf_files': len(generated), 'large_pdf_pages': script_pages,
                                'total_pdf_pages': documents * 5 + script_pages, 'original_bytes': sum(len(data) for _, data in generated.values())},
                    'timing_seconds': {'import': import_seconds, 'large_pdf_background_index': background_seconds,
                                       'corpus': corpus_seconds, 'snapshot': snapshot_seconds, 'restore_stage': restore_seconds},
                    'retrieval': retrieval, 'corpus': repository.status(), 'snapshot_checked': True,
                    'restore': {'integrity': integrity, 'versions': restore_count, 'chunks': chunk_count},
                    'bounded_course_list': {'returned': len(listed['resources']), 'total': listed['page']['total']},
                    'fetch_budget_bytes': original_fetch['budget']['used'],
                    'limits': ['No real accounts, network downloads, private settings or personal data.',
                               'Generated text-layer PDFs; OCR is not measured in this run.',
                               'Natural phrasing over synthetic content; expected-source metrics are not a human quality verdict.',
                               'Restore verifies staging/integrity/counts, not a native application recovery on a fresh device.']}
        finally:
            engine.dispose()
            host.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--documents', type=int, default=30)
    parser.add_argument('--script-pages', type=int, default=500)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = benchmark(args.documents, args.script_pages)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x', encoding='utf-8') as output:
        json.dump(result, output, ensure_ascii=False, indent=2)
        output.write('\n')
    print(json.dumps({'files': result['fixture']['pdf_files'], 'pages': result['fixture']['total_pdf_pages'],
                      'timing_seconds': result['timing_seconds'], 'recall_at_5': result['retrieval']['recall_at_5'],
                      'snapshot_checked': result['snapshot_checked'], 'restore_integrity': result['restore']['integrity']}, indent=2))


if __name__ == '__main__':
    main()
