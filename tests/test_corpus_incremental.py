# SPDX-License-Identifier: AGPL-3.0-or-later
"""Count actual source reads/chunking rather than timing a tiny fake corpus."""
from sqlalchemy import select, text

from app.corpus.repository import CorpusRepository
from app.corpus.worker import CorpusWorker
from app.db.models import Course, Resource, ResourceText, ResourceVersion
from app.notes.store import create_note, update_note


def test_new_version_skips_historical_text_and_ocr_invalidates_only_its_version(settings, factory, coordinator, monkeypatch):
    import app.corpus.staging as module
    with factory() as session:
        course = Course(source='fixture', source_id='incremental', name='Beispielkurs')
        session.add(course)
        session.flush()
        resource = Resource(source='fixture', source_key='incremental', course_id=course.id, name='Skript.pdf', kind='file', url='')
        session.add(resource)
        session.flush()
        resource_id = resource.id
        for number in range(1, 11):
            version = ResourceVersion(resource_id=resource_id, version=number, sha256=str(number).zfill(64),
                                      size=1, relative_path='invented.pdf', mime_type='application/pdf')
            session.add(version)
            session.flush()
            session.add(ResourceText(version_id=version.id, page_number=1, text=f'Historische Fassung {number:02d}'))
        session.commit()
    repository = CorpusRepository(factory, settings)
    worker = CorpusWorker(repository, coordinator)
    worker.drain()
    reads = []
    original = module.chunks
    monkeypatch.setattr(module, 'chunks', lambda pages, *args: (reads.append(pages), original(pages, *args))[1])
    with factory() as session:
        version = ResourceVersion(resource_id=resource_id, version=11, sha256='b' * 64, size=1,
                                  relative_path='invented.pdf', mime_type='application/pdf')
        session.add(version)
        session.flush()
        session.add(ResourceText(version_id=version.id, page_number=1, text='Neue Fassung 11'))
        session.commit()
    worker.drain()
    assert reads == [[(1, 'Neue Fassung 11')]]
    reads.clear()
    with factory() as session:
        first = session.scalar(select(ResourceVersion).where(ResourceVersion.resource_id == resource_id, ResourceVersion.version == 1))
        page = session.scalar(select(ResourceText).where(ResourceText.version_id == first.id))
        page.text = 'OCR korrigierte Fassung'  # Same file hash, new extraction content.
        session.commit()
    worker.drain()
    assert reads == [[(1, 'OCR korrigierte Fassung')]]
    reads.clear()
    repository.enqueue_all(coordinator.assert_writer)
    worker.drain()
    assert all('Fassung' not in str(value) for value in reads)
    with factory() as session:
        assert session.scalar(text("SELECT count(*) FROM corpus_documents WHERE entity_ref=:e AND latest=1"),
                              {'e': f'resource:{resource_id}'}) == 1


def test_unchanged_note_revisions_are_never_reopened(settings, factory, coordinator, monkeypatch):
    import app.corpus.repository as module
    with factory() as session:
        session.execute(text('CREATE VIRTUAL TABLE notes_fts USING fts5(note_id UNINDEXED,title,body)'))
        course = Course(source='fixture', source_id='notes', name='Notizkurs')
        session.add(course)
        session.commit()
        note = create_note(session, settings, course_id=course.id, resource_id=None, title='Beispielnotiz', body='Fassung eins')
        note_id = note.id
    worker = CorpusWorker(CorpusRepository(factory, settings), coordinator)
    worker.drain()
    reads = []
    original = module._read_revision
    monkeypatch.setattr(module, '_read_revision', lambda settings, version: (reads.append(version.revision), original(settings, version))[1])
    with factory() as session:
        update_note(session, settings, note_id, expected_revision=1, title='Beispielnotiz', body='Fassung zwei')
    worker.drain()
    assert reads == [2]


def test_source_change_during_preparation_discards_staging_without_blocking_writer(settings, factory, coordinator, monkeypatch):
    import app.corpus.staging as module

    with factory() as session:
        course = Course(source='fixture', source_id='staging-race', name='Beispielkurs')
        session.add(course)
        session.flush()
        resource = Resource(source='fixture', source_key='staging-race', course_id=course.id,
                            name='Test.txt', kind='file', url='')
        session.add(resource)
        session.flush()
        resource_id = resource.id
        version = ResourceVersion(resource_id=resource_id, version=1, sha256='a' * 64,
                                  relative_path='test.txt', size=1, mime_type='text/plain')
        session.add(version)
        session.flush()
        page = ResourceText(version_id=version.id, page_number=1, text='Alte Quelle')
        session.add(page)
        session.commit()
        page_id = page.id
        generation = session.scalar(text('SELECT generation FROM corpus_dirty WHERE entity_ref=:ref'),
                                    {'ref': f'resource:{resource_id}'})
    original = module.chunks

    def change_while_preparing(*args):
        with factory() as writer:
            writer.get(ResourceText, page_id).text = 'Neue Quelle'
            writer.commit()
        return original(*args)

    monkeypatch.setattr(module, 'chunks', change_while_preparing)
    repository = CorpusRepository(factory, settings)
    assert not repository.publish(f'resource:{resource_id}', generation, coordinator.assert_writer)
    assert repository.status()['chunks'] == 0
    monkeypatch.setattr(module, 'chunks', original)
    CorpusWorker(repository, coordinator).drain()
    with factory() as session:
        assert session.scalar(text('SELECT c.body FROM corpus_chunks c JOIN corpus_documents d ON d.ref=c.document_ref '
                                   'WHERE d.entity_ref=:ref LIMIT 1'), {'ref': f'resource:{resource_id}'}) == 'Neue Quelle'
