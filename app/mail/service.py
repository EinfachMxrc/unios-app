# SPDX-License-Identifier: AGPL-3.0-or-later
"""Read-only Microsoft mail ingestion: user-approved Graph OAuth, or a browser-crawl
fallback (``import_scraped``) for institutions that block both mail forwarding and
third-party app consent."""

import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from threading import Lock
from urllib.parse import urlsplit

import httpx
from bs4 import BeautifulSoup

from app.config import Settings
from app.integrations.storage import ConnectionError, ConnectionStore, Vault
from app.mail.ingest import MAILBOX, ParsedMail, _candidate
from app.mail.repository import MailRepository

LOGIN = "https://login.microsoftonline.com/organizations/oauth2/v2.0"
GRAPH = "https://graph.microsoft.com/v1.0"
SCOPES = "https://graph.microsoft.com/Mail.Read offline_access"
MAX_SCRAPED_BATCH = 200
MAX_SCRAPED_BODY_CHARS = 20_000


@dataclass(frozen=True)
class ScrapedMessage:
    """One message read from the user's own interactive OWA session (no stored password,
    no Graph API call) — the browser-crawl fallback for institutions that block both
    forwarding and third-party OAuth app consent."""

    message_key: str
    sender: str
    subject: str
    received_at: datetime | None
    body: str


class MailService:
    def __init__(self, settings: Settings, factory, coordinator, client_factory=None):
        self.settings = settings
        self.coordinator = coordinator
        self.client_factory = client_factory or httpx.Client
        self.store = ConnectionStore(settings.local_dir, "microsoft-mail")
        self.vault = Vault(settings.local_dir, settings.institution_slug, "microsoft-mail")
        self.repository = MailRepository(factory)
        self.lock = Lock()
        self.pending: dict = {}

    def status(self) -> dict:
        state = self.store.read()
        current = state.get("institution") == self.settings.institution_slug
        return {"connected": bool(current and state.get("connected")),
                "client_id": state.get("client_id", "") if current else "",
                "keyring_available": self.vault.available(),
                "last_success_at": state.get("last_success_at") if current else None,
                "last_error": state.get("last_error", "") if current else ""}

    @staticmethod
    def _json(response: httpx.Response) -> dict:
        if len(response.content) > 2_000_000:
            raise ConnectionError("Mail-Dienst hat eine zu große Antwort geliefert")
        try:
            value = response.json()
            if not isinstance(value, dict):
                raise TypeError
            return value
        except (ValueError, TypeError) as exc:
            raise ConnectionError("Mail-Dienst hat keine gültige Antwort geliefert") from exc

    def begin(self, client_id: str) -> dict:
        self.coordinator.assert_writer()
        if not self.vault.available():
            raise ConnectionError("Sicherer System-Schlüsselbund ist nicht verfügbar")
        with self.lock, self.client_factory(timeout=15, follow_redirects=False) as client:
            response = client.post(f"{LOGIN}/devicecode", data={"client_id": client_id, "scope": SCOPES})
            if response.status_code != 200:
                raise ConnectionError("Microsoft-Anmeldung nicht verfügbar. UniOS-App-Registrierung und Freigabe prüfen.")
            data = self._json(response)
            if (not isinstance(data.get("device_code"), str) or not isinstance(data.get("user_code"), str)
                    or type(data.get("expires_in")) is not int):
                raise ConnectionError("Microsoft-Anmeldung konnte nicht gestartet werden")
            interval = max(5, int(data.get("interval", 5)))
            self.pending = {"client_id": client_id, "device_code": data["device_code"],
                            "expires": time.monotonic() + min(1800, data["expires_in"]),
                            "interval": interval, "next_poll": time.monotonic() + interval}
            return {"user_code": data["user_code"], "verification_url": "https://microsoft.com/devicelogin",
                    "interval": interval, "expires_in": data["expires_in"]}

    def _save_tokens(self, data: dict, client_id: str, old: dict | None = None) -> None:
        refresh = data.get("refresh_token") or (old or {}).get("refresh_token")
        access = data.get("access_token")
        scope = str(data.get("scope", "")).casefold().split()
        if (not isinstance(access, str) or not isinstance(refresh, str)
                or not any(item in {"mail.read", "https://graph.microsoft.com/mail.read"} for item in scope)):
            raise ConnectionError("Microsoft hat keine dauerhafte Mail-Lesefreigabe erteilt")
        self.coordinator.assert_writer()
        self.vault.save("tokens", {"client_id": client_id, "access_token": access, "refresh_token": refresh,
                                   "expires_at": time.time() + max(0, int(data.get("expires_in", 0)) - 90)})

    def poll(self) -> dict:
        self.coordinator.assert_writer()
        with self.lock:
            pending = self.pending
            if not pending or pending["expires"] <= time.monotonic():
                self.pending = {}
                raise ConnectionError("Anmeldung abgelaufen. Bitte erneut verbinden.")
            if time.monotonic() < pending["next_poll"]:
                return {"connected": False, "interval": pending["interval"]}
            with self.client_factory(timeout=15, follow_redirects=False) as client:
                response = client.post(f"{LOGIN}/token", data={
                    "client_id": pending["client_id"], "device_code": pending["device_code"],
                    "grant_type": "urn:ietf:params:oauth:grant-type:device_code"})
            data = self._json(response)
            if data.get("error") in {"authorization_pending", "slow_down"}:
                if data["error"] == "slow_down":
                    pending["interval"] += 5
                pending["next_poll"] = time.monotonic() + pending["interval"]
                return {"connected": False, "interval": pending["interval"]}
            if response.status_code != 200:
                self.pending = {}
                raise ConnectionError("Microsoft-Anmeldung nicht freigegeben oder abgelaufen. Hochschulfreigabe prüfen.")
            self._save_tokens(data, pending["client_id"])
            self.store.save({"institution": self.settings.institution_slug, "connected": True,
                             "client_id": pending["client_id"], "last_error": ""})
            self.pending = {}
            return {"connected": True, "interval": 0}

    def _access_token(self, client: httpx.Client) -> str:
        tokens = self.vault.read("tokens")
        if not tokens:
            raise ConnectionError("Bitte Uni-Mail zuerst mit Microsoft verbinden")
        if tokens.get("expires_at", 0) > time.time():
            return str(tokens["access_token"])
        response = client.post(f"{LOGIN}/token", data={"client_id": tokens["client_id"],
            "refresh_token": tokens["refresh_token"], "grant_type": "refresh_token", "scope": SCOPES})
        if response.status_code != 200:
            raise ConnectionError("Mail-Freigabe abgelaufen. Bitte erneut mit Microsoft verbinden.")
        data = self._json(response)
        self._save_tokens(data, tokens["client_id"], tokens)
        return str(data["access_token"])

    def sync(self) -> dict:
        self.coordinator.assert_writer()
        if not self.lock.acquire(blocking=False):
            raise ConnectionError("Mailabruf läuft bereits")
        try:
            state = self.store.read()
            if not self.status()["connected"]:
                raise ConnectionError("Bitte Uni-Mail zuerst mit Microsoft verbinden")
            with self.client_factory(timeout=20, follow_redirects=False) as client:
                token = self._access_token(client)
                since = (datetime.now(UTC) - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
                url = f"{GRAPH}/me/messages"
                params: dict | None = {"$select": "id,internetMessageId,subject,from,receivedDateTime,body,isDraft",
                                       "$filter": f"receivedDateTime ge {since}",
                                       "$orderby": "receivedDateTime desc", "$top": "100"}
                rows: list[ParsedMail] = []
                skipped = 0
                for _ in range(10):
                    target = urlsplit(url)
                    if (target.scheme != "https" or target.netloc != "graph.microsoft.com"
                            or target.username or target.password or not target.path.startswith("/v1.0/me/messages")):
                        raise ConnectionError("Mail-Dienst hat einen ungültigen Folgelink geliefert")
                    response = client.get(url, params=params, headers={"Authorization": f"Bearer {token}",
                        "Prefer": 'outlook.body-content-type="text", IdType="ImmutableId"'})
                    if response.status_code != 200:
                        raise ConnectionError("Mailabruf nicht möglich. Microsoft-Freigabe oder Verbindung prüfen.")
                    data = self._json(response)
                    if not isinstance(data.get("value"), list) or len(data["value"]) > 100:
                        raise ConnectionError("Mail-Dienst hat keine gültige Nachrichtenliste geliefert")
                    for message in data["value"]:
                        try:
                            if message.get("isDraft"):
                                continue
                            sender = message["from"]["emailAddress"]["address"].casefold()
                            subject = " ".join(message["subject"].split())[:500] or "(Ohne Betreff)"
                            identity = message.get("internetMessageId") or message["id"]
                            received = datetime.fromisoformat(message["receivedDateTime"])
                            body = message.get("body", {})
                            content = str(body.get("content", ""))[:20_000]
                            if body.get("contentType", "").casefold() == "html":
                                content = BeautifulSoup(content, "html.parser").get_text(" ", strip=True)
                            if not MAILBOX.fullmatch(sender) or received.tzinfo is None:
                                raise ValueError
                            rows.append(ParsedMail(sha256(f"graph:{identity}".encode()).hexdigest(), sender,
                                                   subject, received.astimezone(UTC), _candidate(subject + "\n" + content)))
                        except (KeyError, TypeError, ValueError, AttributeError):
                            skipped += 1
                    url = data.get("@odata.nextLink", "")
                    if not url:
                        break
                    params = None
                    time.sleep(self.settings.request_delay_seconds)
                created = self.repository.import_rows(rows, self.coordinator)
            state.update(last_success_at=datetime.now(UTC).isoformat(), last_error="")
            self.coordinator.assert_writer()
            self.store.save(state)
            return {"read": len(rows), "created": created, "skipped": skipped, "limited": bool(url)}
        except (ConnectionError, httpx.HTTPError) as exc:
            message = str(exc) if isinstance(exc, ConnectionError) else "Mail-Dienst derzeit nicht erreichbar"
            state = self.store.read()
            state["last_error"] = message
            self.coordinator.assert_writer()
            self.store.save(state)
            raise ConnectionError(message) from None
        finally:
            self.lock.release()

    def disconnect(self) -> None:
        self.coordinator.assert_writer()
        with self.lock:
            self.vault.remove("tokens")
            self.pending = {}
            self.store.save({"institution": self.settings.institution_slug, "connected": False})

    def import_scraped(self, messages: list[ScrapedMessage]) -> dict:
        """Same deduplicated, metadata-only storage as the Graph sync, fed from a browser
        crawl instead. ``message_key`` has no guaranteed stability (OWA exposes no stable
        message id to the DOM), so it is only ever used to build the dedup hash below, the
        same way the Graph path hashes its own message id."""
        self.coordinator.assert_writer()
        if len(messages) > MAX_SCRAPED_BATCH:
            raise ConnectionError("Zu viele Nachrichten auf einmal")
        rows: list[ParsedMail] = []
        skipped = 0
        for message in messages:
            sender = message.sender.strip().casefold()
            subject = " ".join(message.subject.split())[:500]
            if not MAILBOX.fullmatch(sender) or not subject or not message.message_key.strip():
                skipped += 1
                continue
            body = message.body[:MAX_SCRAPED_BODY_CHARS]
            rows.append(ParsedMail(
                sha256(f"owa:{message.message_key}".encode()).hexdigest(), sender, subject,
                message.received_at, _candidate(subject + "\n" + body),
            ))
        created = self.repository.import_rows(rows, self.coordinator)
        return {"read": len(messages), "created": created, "skipped": skipped}
