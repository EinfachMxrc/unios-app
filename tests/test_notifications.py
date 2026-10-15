# SPDX-License-Identifier: AGPL-3.0-or-later

from datetime import UTC, datetime, time, timedelta
from email.header import decode_header, make_header
from threading import Event, Thread
from time import sleep

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.db.models import ConnectorHealth, Deadline, Notification
from app.main import create_app
from app.notify.service import Notifier
from app.sync.engine import SyncEngine
from app.sync.scheduler import SyncScheduler
from tests.test_moodle_sync import FixtureMoodle


def test_ntfy_delivers_unicode_title_with_ascii_safe_header(settings, factory, coordinator):
    sent = []

    def send(request):
        sent.append((request.headers["Title"], request.content))
        return httpx.Response(200)

    configured = settings.model_copy(update={"ntfy_url": "https://notify.example.invalid/ntfy"})
    notifier = Notifier(configured, coordinator, client=httpx.Client(transport=httpx.MockTransport(send)))
    with factory() as session:
        notifier.enqueue(session, "unicode:1", "Uni-Sync ist überfällig", "38 Stunden zurück")
        session.commit()

    notifier.deliver_pending(factory)
    assert len(sent) == 1
    header, body = sent[0]
    assert header.isascii()
    assert str(make_header(decode_header(header))) == "Uni-Sync ist überfällig"
    assert body == "38 Stunden zurück".encode()
    with factory() as session:
        assert session.scalar(select(Notification)).sent_at is not None


def test_old_pending_notice_is_neutralized_before_push(settings, factory, coordinator):
    sent = []

    def send(request):
        sent.append(request.content.decode())
        return httpx.Response(200)

    configured = settings.model_copy(update={"ntfy_url": "https://notify.example.invalid/ntfy",
                                              "tailscale_ip": "100.101.102.103"})
    notifier = Notifier(configured, coordinator, client=httpx.Client(transport=httpx.MockTransport(send)))
    with factory() as session:
        notifier.enqueue(session, "new-files:old", "1 neue Uni-Datei", "Privates Skript.pdf")
        session.commit()
    notifier.deliver_pending(factory)
    assert len(sent) == 1
    assert sent[0].endswith("/activity")
    assert "Privates Skript" not in sent[0]


def test_successful_channel_is_not_retried_when_other_channel_fails(settings, factory, coordinator):
    sent_to = []
    fail_discord = True

    def send(request):
        nonlocal fail_discord
        sent_to.append(request.url.path)
        if request.url.path == "/discord" and fail_discord:
            fail_discord = False
            return httpx.Response(503)
        return httpx.Response(200)

    configured = settings.model_copy(update={"ntfy_url": "https://notify.example.invalid/ntfy",
                                             "discord_webhook_url": "https://notify.example.invalid/discord"})
    notifier = Notifier(configured, coordinator, client=httpx.Client(transport=httpx.MockTransport(send)))
    with factory() as session:
        notifier.enqueue(session, "file:1", "Neue Datei", "Beispiel")
        session.commit()

    notifier.deliver_pending(factory)
    with factory() as session:
        item = session.scalar(select(Notification))
        assert item.ntfy_sent_at is not None
        assert item.sent_at is None
    notifier.deliver_pending(factory)
    assert sent_to == ["/ntfy", "/discord", "/discord"]
    with factory() as session:
        assert session.scalar(select(Notification)).sent_at is not None


def test_concurrent_delivery_sends_each_notification_once(settings, factory, coordinator):
    first_post_started = Event()
    release_first_post = Event()
    second_started = Event()
    sent = []
    errors = []

    def send(request):
        sent.append(request.content)
        first_post_started.set()
        if not release_first_post.wait(5):
            raise AssertionError("Fake-Kanal wurde nicht freigegeben")
        return httpx.Response(200)

    configured = settings.model_copy(update={"ntfy_url": "https://notify.example.invalid/ntfy"})
    notifier = Notifier(configured, coordinator, client=httpx.Client(transport=httpx.MockTransport(send)))
    with factory() as session:
        notifier.enqueue(session, "concurrent:1", "Test", "Einmal")
        session.commit()

    def deliver(mark_started=False):
        try:
            if mark_started:
                second_started.set()
            notifier.deliver_pending(factory)
        except Exception as exc:  # noqa: BLE001 - capture exceptions raised in worker threads
            errors.append(exc)

    first = Thread(target=deliver)
    second = Thread(target=deliver, kwargs={"mark_started": True})
    first.start()
    try:
        assert first_post_started.wait(5)
        second.start()
        assert second_started.wait(5)
        sleep(0.05)
    finally:
        release_first_post.set()
        first.join(5)
        if second.ident is not None:
            second.join(5)
    assert not first.is_alive() and not second.is_alive()
    assert not errors
    assert sent == [b"Einmal"]


def test_concurrent_enqueue_keeps_one_event(factory):
    first_written = Event()
    release_first = Event()
    identities = []
    errors = []

    def first():
        try:
            with factory() as session:
                item = Notifier.enqueue(session, "same:event", "Test", "Einmal")
                first_written.set()
                if not release_first.wait(5):
                    raise AssertionError("Erste Transaktion wurde nicht freigegeben")
                session.commit()
                identities.append(item.id)
        except Exception as exc:  # noqa: BLE001 - capture exceptions raised in worker threads
            errors.append(exc)

    def second():
        try:
            with factory() as session:
                item = Notifier.enqueue(session, "same:event", "Test", "Einmal")
                session.commit()
                identities.append(item.id)
        except Exception as exc:  # noqa: BLE001 - capture exceptions raised in worker threads
            errors.append(exc)

    first_thread = Thread(target=first)
    second_thread = Thread(target=second)
    first_thread.start()
    try:
        assert first_written.wait(5)
        second_thread.start()
        sleep(0.05)
    finally:
        release_first.set()
        first_thread.join(5)
        if second_thread.ident is not None:
            second_thread.join(5)
    assert not first_thread.is_alive() and not second_thread.is_alive()
    assert not errors
    assert len(identities) == 2 and identities[0] == identities[1]
    with factory() as session:
        assert len(session.scalars(select(Notification).where(Notification.event_key == "same:event")).all()) == 1


@pytest.mark.parametrize("days, expect_notice", [(1, True), (2, False), (3, True), (7, True)])
def test_deadline_warning_uses_stored_data_when_connector_is_unavailable(
    settings, factory, coordinator, days, expect_notice,
):
    settings.tailscale_ip = "100.101.102.103"
    due_date = datetime.now(settings.timezone).date() + timedelta(days=days)
    due_at = datetime.combine(due_date, time(12), tzinfo=settings.timezone).astimezone(UTC)
    with factory() as session:
        session.add(Deadline(source="fixture", source_key="active", title="Abgabe", due_at=due_at))
        session.add(Deadline(source="fixture", source_key="removed", title="Entfernt", due_at=due_at,
                             removed_upstream=True))
        session.commit()
    notifier = Notifier(settings, coordinator)
    scheduler = SyncScheduler(SyncEngine(factory, settings, [], notifier, coordinator), settings, coordinator)
    scheduler._warn_deadlines()
    scheduler._warn_deadlines()
    with factory() as session:
        notices = session.scalars(select(Notification).where(Notification.event_key.like("deadline:%"))).all()
    assert len(notices) == int(expect_notice)
    if expect_notice:
        assert notices[0].title == "Frist nähert sich"
        assert notices[0].body.endswith("/deadlines")
        assert "Abgabe" not in notices[0].body


def test_expired_moodle_token_has_specific_notice_and_visible_health(settings, factory, coordinator):
    moodle = FixtureMoodle(settings)
    moodle.responses["core_webservice_get_site_info"] = {
        "exception": "moodle_exception", "errorcode": "invalidtoken", "message": "Invalid token",
    }
    notifier = Notifier(settings, coordinator)
    engine = SyncEngine(factory, settings, [moodle.connector], notifier, coordinator)
    assert engine.run().status == "error"
    assert engine.run().status == "error"
    with factory() as session:
        notices = session.scalars(select(Notification).where(Notification.event_key.like("moodle-token:%"))).all()
        health = session.scalar(select(ConnectorHealth).where(ConnectorHealth.connector == "moodle"))
    assert len(notices) == 1
    assert notices[0].title == "Moodle neu verbinden"
    assert health.status == "error"
    assert health.message == "Moodle-Token erneuern"
    app = create_app(settings, connectors=[moodle.connector], start_scheduler=False, coordinator=coordinator)
    with TestClient(app) as client:
        response = client.get("/api/system")
    assert response.status_code == 200
    assert response.json()["health"][0]["message"] == "Moodle-Token erneuern"
