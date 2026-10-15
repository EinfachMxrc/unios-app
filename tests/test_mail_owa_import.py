# SPDX-License-Identifier: AGPL-3.0-or-later

"""Mail read from the user's own interactive OWA window (no forwarding, no OAuth app
consent) lands in the same deduplicated, metadata-only store as the other two paths."""

from datetime import UTC, datetime, timedelta

import pytest

from app.db.models import MailItem
from app.integrations.storage import ConnectionError as MailConnectionError
from app.mail.service import MailService, ScrapedMessage


def _message(key="msg-1", sender="buero@example.test", subject="Hinweis", days=10, body=""):
    due = (datetime.now(UTC) + timedelta(days=days)).date()
    return ScrapedMessage(
        message_key=key, sender=sender, subject=subject,
        received_at=datetime.now(UTC),
        body=body or f"Die Frist endet bis zum {due:%d.%m.%Y}. Bitte selbst prüfen.",
    )


def test_scraped_message_is_stored_with_a_deadline_candidate(settings, factory, coordinator):
    service = MailService(settings, factory, coordinator)
    report = service.import_scraped([_message()])
    assert report == {"read": 1, "created": 1, "skipped": 0}
    with factory() as session:
        row = session.query(MailItem).one()
        assert row.sender == "buero@example.test"
        assert row.subject == "Hinweis"
        assert row.candidate_date is not None
        assert row.status == "proposed"


def test_reimporting_the_same_message_key_does_not_duplicate(settings, factory, coordinator):
    service = MailService(settings, factory, coordinator)
    service.import_scraped([_message()])
    report = service.import_scraped([_message()])
    assert report == {"read": 1, "created": 0, "skipped": 0}
    with factory() as session:
        assert session.query(MailItem).count() == 1


def test_two_messages_with_different_keys_but_identical_content_both_land(settings, factory, coordinator):
    service = MailService(settings, factory, coordinator)
    report = service.import_scraped([_message(key="a"), _message(key="b")])
    assert report == {"read": 2, "created": 2, "skipped": 0}


def test_invalid_sender_and_empty_key_are_skipped_not_raised(settings, factory, coordinator):
    service = MailService(settings, factory, coordinator)
    report = service.import_scraped([
        _message(key="ok", sender="valid@example.test"),
        _message(key="bad-sender", sender="not-an-email"),
        _message(key="", sender="also@example.test"),
    ])
    assert report == {"read": 3, "created": 1, "skipped": 2}


def test_body_without_a_deadline_phrase_is_stored_as_info_not_proposed(settings, factory, coordinator):
    service = MailService(settings, factory, coordinator)
    service.import_scraped([_message(body="Keine Frist hier, nur eine Ankündigung.")])
    with factory() as session:
        row = session.query(MailItem).one()
        assert row.candidate_date is None
        assert row.status == "info"


def test_more_than_the_batch_limit_is_rejected(settings, factory, coordinator):
    service = MailService(settings, factory, coordinator)
    with pytest.raises(MailConnectionError, match="Zu viele"):
        service.import_scraped([_message(key=str(i)) for i in range(201)])


def test_import_scraped_requires_a_writer(settings, factory, coordinator, monkeypatch):
    def reject():
        raise RuntimeError("not the writer")

    monkeypatch.setattr(coordinator, "assert_writer", reject)
    service = MailService(settings, factory, coordinator)
    with pytest.raises(RuntimeError, match="not the writer"):
        service.import_scraped([_message()])
