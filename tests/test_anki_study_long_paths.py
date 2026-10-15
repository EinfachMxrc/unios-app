# SPDX-License-Identifier: AGPL-3.0-or-later
"""Long receipt filenames retain native retry/undo semantics on Windows."""
from sqlalchemy import func, select

from app.anki.collection import open_collection
from app.anki.study_undo_repository import read_journal
from app.db.models import AnkiReview
from app.files.localpath import native_path, strip_extended_prefix
from tests.test_anki_review_bridge import _card
from tests.test_anki_study_undo import _client, _payload


def test_long_review_journal_path_preserves_exactly_once_and_native_undo(settings, factory, coordinator):
    # Keep collection.anki2 below MAX_PATH, but make the hash journal and its
    # longer temporary filename cross it. Each directory component stays small.
    padding = max(1, 198 - len(str(settings.local_dir)))
    long_settings = settings.model_copy(update={'local_dir': settings.local_dir / ('p' * padding)})
    _, _, card_id, _ = _card(long_settings, factory, coordinator)
    payload = _payload(card_id, 'synthetic-long-path-review')
    with _client(long_settings, coordinator) as client:
        first = client.post('/api/anki/study/reviews', json=payload)
        assert first.status_code == 200, first.text
        journal = read_journal(long_settings, payload['review_id'])
        assert journal is not None and journal.state == 'applied'
        directory = native_path(long_settings.local_dir / 'anki' / 'review-actions')
        files = list(directory.glob('*.json'))
        assert len(files) == 1
        assert len(strip_extended_prefix(str(files[0]))) > 259
        assert list(directory.glob('*.tmp')) == []
        retry = client.post('/api/anki/study/reviews', json=payload)
        assert retry.status_code == 200 and retry.json()['already_applied']
        undone = client.post('/api/anki/study/reviews/undo', json=payload)
        assert undone.status_code == 200, undone.text
        assert read_journal(long_settings, payload['review_id']).state == 'undone'
        assert client.post('/api/anki/study/reviews/undo', json=payload).json()['already_undone']
        assert client.post('/api/anki/study/reviews', json=payload).status_code == 409
    with open_collection(long_settings) as collection:
        assert collection.db.scalar('SELECT count(*) FROM revlog') == 0
        assert collection.db.scalar('SELECT rating FROM unios_review_receipts WHERE review_id = ?',
                                    payload['review_id']) == -3
    with factory() as session:
        assert session.scalar(select(func.count(AnkiReview.id))) == 0
