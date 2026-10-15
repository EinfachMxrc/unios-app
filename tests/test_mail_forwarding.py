# SPDX-License-Identifier: AGPL-3.0-or-later
"""Synthetic forwarding never executes mail or silently creates deadlines."""

import os
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from pathlib import Path

import pytest
from sqlalchemy import select

from app.db.models import Deadline, MailItem
from app.integrations.storage import ConnectionError
from app.mail.forwarding import MailForwardingService
from app.sync.scheduler import SyncScheduler


def _service(settings, factory, coordinator):
    service = MailForwardingService(settings.model_copy(update={"server_mode": True}), factory, coordinator)
    service.configuration.save({"address": "inbox@mail.example.test", "ready": True})
    for folder in (service.mailbox.parent, service.mailbox, service.mailbox / "new", service.mailbox / "cur"):
        folder.mkdir(exist_ok=True)
        folder.chmod(0o700)
    return service


def _raw() -> bytes:
    mail = EmailMessage()
    mail["From"] = "Fictional office <office@example.test>"
    mail["To"] = "inbox@mail.example.test"
    mail["Subject"] = "Fictional submission deadline"
    due = datetime.now(UTC) + timedelta(days=5)
    mail.set_content(f"Abgabeschluss ist am {due:%d.%m.%Y}. Private synthetic body.")
    mail.add_attachment(b"x" * 600_000, maintype="application", subtype="pdf", filename="fictional.pdf")
    return mail.as_bytes()


def _deliver(service, name: str, raw: bytes) -> Path:
    path = service.mailbox / "new" / name
    path.write_bytes(raw)
    path.chmod(0o600)
    return path


def test_forwarded_mail_retains_originals_deduplicates_and_pauses(settings, factory, coordinator):
    service = _service(settings, factory, coordinator)
    raw = _raw()
    _deliver(service, "first", raw)
    _deliver(service, "repeat", raw)
    assert service.sync() == {"read": 2, "created": 1, "skipped": 0, "limited": False}
    assert (service.mailbox / "cur" / "first.seen").read_bytes() == raw
    with factory() as session:
        messages = session.scalars(select(MailItem)).all()
        assert len(messages) == 1 and messages[0].status == "proposed"
        assert messages[0].candidate_date is not None
        assert session.scalar(select(Deadline)) is None
    assert service.set_enabled(False)["connected"] is False
    _deliver(service, "paused", raw)
    with pytest.raises(ConnectionError, match="nicht aktiv"):
        service.sync()
    assert (service.mailbox / "new" / "paused").exists()
    service.set_enabled(True)
    assert service.sync()["created"] == 0
    assert "Private synthetic" not in service.state.path.read_text()


def test_forwarding_bounds_batches_and_retains_unreadable_mail(settings, factory, coordinator, monkeypatch):
    service = _service(settings, factory, coordinator)
    monkeypatch.setattr("app.mail.forwarding.MAX_BATCH", 2)
    _deliver(service, "bad", b"From: ambiguous\n\nInvalid mail")
    _deliver(service, "one", _raw())
    _deliver(service, "two", _raw())
    first = service.sync()
    assert first["limited"] is True and first["read"] + first["skipped"] == 2
    second = service.sync()
    assert second["limited"] is False
    assert first["skipped"] + second["skipped"] == 1
    assert (service.mailbox / "cur" / "bad.review").exists()


def test_forwarding_is_host_gated_and_rejects_unsafe_files(settings, factory, coordinator, monkeypatch):
    service = _service(settings, factory, coordinator)
    _deliver(service, "one", _raw())
    def reject():
        raise RuntimeError("Writer fenced")
    with monkeypatch.context() as patch:
        patch.setattr(coordinator, "assert_writer", reject)
        with pytest.raises(RuntimeError, match="fenced"):
            service.sync()
    assert (service.mailbox / "new" / "one").exists()
    (service.mailbox / "new" / "directory").mkdir()
    with pytest.raises(ConnectionError):
        service.sync()
    if os.name != "nt":
        (service.mailbox / "cur").chmod(0o755)
        with pytest.raises(ConnectionError, match="nicht privat"):
            service.sync()
    calls = []
    scheduler = SyncScheduler(None, settings, coordinator, forwarding_service=service)
    monkeypatch.setattr(service, "sync", lambda: calls.append("sync"))
    scheduler._run_forwarded_mail()
    assert calls == ["sync"]
    coordinator.close()
    scheduler._run_forwarded_mail()
    assert calls == ["sync"]
