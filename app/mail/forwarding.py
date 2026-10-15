# SPDX-License-Identifier: AGPL-3.0-or-later
"""Import the server's dedicated, private receive-only Postfix mailbox.

The mailbox retains originals; UniOS stores only the existing mail metadata.
Mail contents and attachments never execute and dates remain proposals.
"""

import os
import stat
from datetime import UTC, datetime
from threading import Lock

from app.integrations.storage import ConnectionError, ConnectionStore
from app.mail.ingest import MAILBOX, MailParseError, parse_eml
from app.mail.repository import MailRepository

MAX_FORWARDED_BYTES = 8 * 1024 * 1024
MAX_BATCH = 100
_get_uid = getattr(os, "getuid", lambda: -1)


class MailForwardingService:
    def __init__(self, settings, factory, coordinator):
        self.settings = settings
        self.coordinator = coordinator
        self.configuration = ConnectionStore(settings.local_dir, "mail-forwarding-server")
        self.state = ConnectionStore(settings.local_dir, "mail-forwarding")
        self.mailbox = settings.local_dir / "mailbox" / "inbox"
        self.repository = MailRepository(factory)
        self.lock = Lock()

    def status(self) -> dict:
        config = self.configuration.read() if self.settings.server_mode else {}
        address = config.get("address", "")
        configured = isinstance(address, str) and bool(MAILBOX.fullmatch(address))
        ready = configured and config.get("ready") is True
        state = self.state.read()
        return {"configured": configured, "address": address if configured else "",
                "ready": ready, "connected": ready and state.get("enabled", True),
                "last_success_at": state.get("last_success_at"),
                "last_error": state.get("last_error", "")}

    def set_enabled(self, enabled: bool) -> dict:
        self.coordinator.assert_writer()
        with self.lock:
            if enabled and not self.status()["ready"]:
                raise ConnectionError("Der Mail-Empfang ist noch nicht eingerichtet")
            state = self.state.read()
            state.update(enabled=enabled, last_error="")
            self.state.save(state)
        return self.status()

    def _folders(self):
        # Check every ancestor: following a symlink to a private file is forbidden.
        for path in (self.mailbox.parent, self.mailbox, self.mailbox / "new", self.mailbox / "cur"):
            details = path.lstat()
            if not stat.S_ISDIR(details.st_mode):
                raise ConnectionError("Ungültiger Empfangsordner")
            if os.name != "nt" and (details.st_mode & 0o077 or details.st_uid != _get_uid()):
                raise ConnectionError("Der Empfangsordner ist nicht privat")
        return self.mailbox / "new", self.mailbox / "cur"

    def sync(self) -> dict:
        self.coordinator.assert_writer()
        if not self.lock.acquire(blocking=False):
            raise ConnectionError("Mailabruf läuft bereits")
        try:
            if not self.status()["connected"]:
                raise ConnectionError("Der Weiterleitungsimport ist nicht aktiv")
            pending, processed = self._folders()
            read = created = skipped = 0
            # A bounded batch permits restart/catch-up without blocking other sources.
            names = []
            with os.scandir(pending) as entries:
                for entry in entries:
                    names.append(entry.name)
                    if len(names) > MAX_BATCH:
                        break
            for name in names[:MAX_BATCH]:
                source = pending / name
                if source.is_symlink():
                    raise ConnectionError("Ungültige Datei im Empfangsordner")
                descriptor = os.open(source, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0))
                with os.fdopen(descriptor, "rb") as stream:
                    details = os.fstat(stream.fileno())
                    if not stat.S_ISREG(details.st_mode):
                        raise ConnectionError("Ungültige Datei im Empfangsordner")
                    if os.name != "nt" and (details.st_mode & 0o077 or details.st_uid != _get_uid()):
                        raise ConnectionError("Empfangene Mail ist nicht privat")
                    raw = stream.read(MAX_FORWARDED_BYTES + 1)
                flag = "seen"
                try:
                    parsed = parse_eml(raw, max_bytes=MAX_FORWARDED_BYTES)
                except MailParseError:
                    skipped += 1
                    flag = "review"
                else:
                    created += self.repository.import_rows([parsed], self.coordinator)
                    read += 1
                # Commit first. A crash before moving causes a harmless deduplicated retry.
                self.coordinator.assert_writer()
                destination = processed / f"{name}.{flag}"
                if destination.exists() or destination.is_symlink():
                    raise ConnectionError("Empfangene Mail wurde bereits verschoben; bitte prüfen")
                source.rename(destination)
            state = self.state.read()
            state.update(last_success_at=datetime.now(UTC).isoformat(), last_error="")
            self.coordinator.assert_writer()
            self.state.save(state)
            return {"read": read, "created": created, "skipped": skipped, "limited": len(names) > MAX_BATCH}
        except (OSError, ConnectionError) as exc:
            message = str(exc) if isinstance(exc, ConnectionError) else "Der Empfangsordner ist nicht verfügbar"
            self.coordinator.assert_writer()
            state = self.state.read()
            state["last_error"] = message
            self.state.save(state)
            raise ConnectionError(message) from None
        finally:
            self.lock.release()
