# SPDX-License-Identifier: AGPL-3.0-or-later

import logging
import threading
from email.header import Header

import httpx
from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.config import RemoteAddressNotConfigured, Settings
from app.db.models import Deadline, Notification, utc_now
from app.host.lease import HostCoordinator
from app.notify.links import dashboard_link
from app.notify.repository import muted

log = logging.getLogger(__name__)

PRIVATE_EVENT_MESSAGES = {
    "moodle-token": ("Moodle neu verbinden", "Moodle braucht deine Aufmerksamkeit.", "/system"),
    "connector": ("Uni-Verbindung prüfen", "Eine Uni-Verbindung braucht deine Aufmerksamkeit.", "/system"),
    "connector-warning": ("Uni-Verbindung prüfen", "Eine Uni-Verbindung braucht deine Aufmerksamkeit.", "/system"),
    "plausibility": ("Uni-Daten prüfen", "Neue Uni-Daten sollten geprüft werden.", "/system"),
    "material": ("Neue Unterlagen", "Eine neue Materialversion ist da.", "/notifications"),
    "mail": ("Neue Uni-Mail", "Eine neue Uni-Mail ist da.", "/mail"),
    "cards": ("Lernkarten fällig", "Deine Lernwarteschlange ist bereit.", "/study"),
    "new-files": ("Neue Unterlagen", "Neue Unterlagen sind da.", "/activity"),
    "assignment": ("Neue Aufgabe", "Eine neue Aufgabe ist da.", "/deadlines"),
    "deadline": ("Frist nähert sich", "Eine Frist nähert sich.", "/deadlines"),
    "stale-sync": ("Uni-Verbindung prüfen", "Die Uni-Verbindung sollte geprüft werden.", "/system"),
    "weekly-digest": ("Dein Wochenüberblick", "Dein Wochenüberblick ist bereit.", "/digest"),
}


def _ntfy_title(title: str) -> str:
    try:
        title.encode("ascii")
    except UnicodeEncodeError:
        return Header(title, "utf-8").encode()
    return title


def _outbound_message(item: Notification, settings: Settings) -> tuple[str, str]:
    template = PRIVATE_EVENT_MESSAGES.get(item.event_key.partition(":")[0])
    if template is None:
        return item.title, item.body
    title, message, path = template
    return title, f"{message} {dashboard_link(settings, path)}"


class Notifier:
    def __init__(self, settings: Settings, coordinator: HostCoordinator, client: httpx.Client | None = None):
        self.settings = settings
        self.coordinator = coordinator
        self.client = client or httpx.Client(timeout=15)
        self._delivery_lock = threading.Lock()

    @staticmethod
    def enqueue(session, key: str, title: str, body: str, *, course_id: int | None = None,
                read_at=None, created_at=None) -> Notification:
        if course_id is None and key.startswith("deadline:"):
            identifier = key.split(":")[1]
            deadline = session.get(Deadline, int(identifier)) if identifier.isdecimal() else None
            course_id = deadline.course_id if deadline else None
        timestamps = {"created_at": created_at} if created_at is not None else {}
        session.execute(sqlite_insert(Notification).values(event_key=key, title=title, body=body,
                        course_id=course_id, read_at=read_at, **timestamps)
                        .on_conflict_do_nothing(index_elements=["event_key"]))
        item = session.scalar(select(Notification).where(Notification.event_key == key))
        if item is None:
            raise RuntimeError("Benachrichtigung konnte nicht gespeichert werden")
        return item

    def deliver_pending(self, factory) -> None:
        self.coordinator.assert_writer()
        with self._delivery_lock:
            self._deliver_pending_locked(factory)

    def _deliver_pending_locked(self, factory) -> None:
        with factory() as session:
            pending = session.scalars(select(Notification).where(Notification.sent_at.is_(None))).all()
            for item in pending:
                if muted(session, item):
                    continue
                if item.event_key.startswith("deadline:"):
                    parts = item.event_key.split(":", 2)
                    deadline = session.get(Deadline, int(parts[1])) if len(parts) == 3 and parts[1].isdigit() else None
                    if deadline is None or deadline.removed_upstream:
                        continue
                try:
                    title, body = _outbound_message(item, self.settings)
                    if self.settings.ntfy_url and not item.ntfy_sent_at:
                        self.coordinator.assert_writer()
                        response = self.client.post(self.settings.ntfy_url, content=body.encode(),
                                                    headers={"Title": _ntfy_title(title)})
                        response.raise_for_status()
                        item.ntfy_sent_at = utc_now()
                        session.commit()
                    if self.settings.discord_webhook_url and not item.discord_sent_at:
                        self.coordinator.assert_writer()
                        response = self.client.post(self.settings.discord_webhook_url, json={"content": f"**{title}**\n{body}"})
                        response.raise_for_status()
                        item.discord_sent_at = utc_now()
                        session.commit()
                    if (self.settings.ntfy_url or self.settings.discord_webhook_url) and (
                        not self.settings.ntfy_url or item.ntfy_sent_at
                    ) and (not self.settings.discord_webhook_url or item.discord_sent_at):
                        item.sent_at = utc_now()
                        item.error = None
                    else:
                        item.error = "Kein Benachrichtigungskanal konfiguriert"
                except RemoteAddressNotConfigured:
                    item.error = "Kein von außen erreichbarer Host konfiguriert (public_server_url oder Tailscale einrichten)"
                except httpx.HTTPError as exc:
                    # Webhook-URLs sind Secrets und dürfen nie in Logs/DB landen.
                    item.error = f"Versand fehlgeschlagen: {type(exc).__name__}"
                    log.warning("Benachrichtigung %s konnte nicht gesendet werden", item.id)
            session.commit()
