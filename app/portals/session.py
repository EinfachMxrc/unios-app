# SPDX-License-Identifier: AGPL-3.0-or-later

"""Keep short-lived university portal credentials in a secure OS keyring."""

import base64
import hashlib
import json
import zlib
from dataclasses import dataclass
from datetime import UTC, datetime
from secrets import token_hex
from urllib.parse import parse_qs, urlsplit

import keyring
from keyring.errors import KeyringError

from app.secrets import _secure_backend

SERVICE = "marc-uni-os:portal"
MAX_STATE_BYTES = 64_000
KEYRING_CHUNK_CHARS = 700
MAX_KEYRING_CHUNKS = 128
PORTALS = frozenset({"primuss", "mycampus"})


def keyring_available() -> bool:
    return _secure_backend()


class PortalSessionError(RuntimeError):
    """A portal session cannot be saved or used safely."""


@dataclass(frozen=True)
class PortalSession:
    portal: str
    entry_url: str
    storage_state: dict
    captured_at: datetime
    auth_cookie_hosts: tuple[str, ...] = ()


def valid_portal_url(value: str, base_url: str) -> bool:
    target = urlsplit(value)
    base = urlsplit(base_url)
    return bool(target.scheme == base.scheme == "https" and target.hostname == base.hostname
                and target.port in {None, 443} and base.port in {None, 443}
                and target.username is None and target.password is None
                and target.fragment == "" and base.username is None and base.password is None)


def _has_portal_credentials(portal: str, entry_url: str, state: dict, host: str) -> bool:
    cookies = state.get("cookies")
    has_cookie = isinstance(cookies, list) and any(
        isinstance(cookie, dict) and isinstance(cookie.get("name"), str)
        and isinstance(cookie.get("value"), str) and bool(cookie["value"])
        and (host == str(cookie.get("domain", "")).lstrip(".").lower()
             or host.endswith("." + str(cookie.get("domain", "")).lstrip(".").lower()))
        for cookie in cookies)
    if portal == "primuss":
        parameters = parse_qs(urlsplit(entry_url).query, keep_blank_values=False)
        has_session_url = any(key.lower() == "session" and values
                              for key, values in parameters.items())
        return has_cookie or has_session_url
    return has_cookie


def _cookie_matches(host: str, domain: str) -> bool:
    cookie_host = domain.lstrip(".").lower()
    return host == cookie_host or host.endswith("." + cookie_host)


def validate_session(portal: str, base_url: str, entry_url: str, state: dict,
                     auth_cookie_hosts: tuple[str, ...] = ()) -> PortalSession:
    if portal not in PORTALS or not valid_portal_url(entry_url, base_url):
        raise PortalSessionError("Portal-Adresse ist nicht erlaubt")
    if not isinstance(state, dict) or not isinstance(state.get("cookies"), list):
        raise PortalSessionError("Browser-Session ist unvollständig")
    host = urlsplit(base_url).hostname
    if host is None:
        raise PortalSessionError("Portal-Adresse ist nicht erlaubt")
    parent = ".".join(host.split(".")[1:]) if host.count(".") >= 2 else ""
    if any(not isinstance(item, str) or not parent or
           not (item == parent or item.endswith("." + parent)) or
           item == host or item.lower() != item or "/" in item or ":" in item
           for item in auth_cookie_hosts):
        raise PortalSessionError("SSO-Cookie-Domain ist nicht erlaubt")
    allowed_hosts = (host, *auth_cookie_hosts)
    for cookie in state["cookies"]:
        if not isinstance(cookie, dict) or not isinstance(cookie.get("domain"), str):
            raise PortalSessionError("Browser-Cookies sind ungültig")
    filtered_cookies = [cookie for cookie in state["cookies"]
                        if any(_cookie_matches(allowed, cookie["domain"]) for allowed in allowed_hosts)]
    origins = state.get("origins", [])
    if not isinstance(origins, list):
        raise PortalSessionError("Browser-Speicher ist ungültig")
    filtered_origins = [origin for origin in origins if isinstance(origin, dict)
                        and isinstance(origin.get("origin"), str)
                        and any(valid_portal_url(origin["origin"], f"https://{allowed}/")
                                for allowed in allowed_hosts)]
    filtered_state = {"cookies": filtered_cookies, "origins": filtered_origins}
    if not _has_portal_credentials(portal, entry_url, filtered_state, host):
        raise PortalSessionError("Noch keine Portal-Session erkannt")
    return PortalSession(portal=portal, entry_url=entry_url, storage_state=filtered_state,
                         captured_at=datetime.now(UTC), auth_cookie_hosts=auth_cookie_hosts)


def save_session(base_url: str, session: PortalSession) -> None:
    if not keyring_available():
        raise PortalSessionError("Sicherer System-Schlüsselbund ist nicht verfügbar")
    validated = validate_session(session.portal, base_url, session.entry_url,
                                 session.storage_state, session.auth_cookie_hosts)
    serialized = json.dumps({"entry_url": validated.entry_url,
                             "storage_state": validated.storage_state,
                             "captured_at": validated.captured_at.isoformat(),
                             "auth_cookie_hosts": list(validated.auth_cookie_hosts)}, ensure_ascii=False)
    raw = serialized.encode("utf-8")
    if len(raw) > MAX_STATE_BYTES:
        raise PortalSessionError("Portal-Session ist für den Schlüsselbund zu groß")
    packed = base64.b64encode(zlib.compress(raw, level=9)).decode("ascii")
    chunks = [packed[index:index + KEYRING_CHUNK_CHARS]
              for index in range(0, len(packed), KEYRING_CHUNK_CHARS)]
    if len(chunks) > MAX_KEYRING_CHUNKS:
        raise PortalSessionError("Portal-Session ist für den Schlüsselbund zu groß")
    generation = token_hex(8)
    account = f"{session.portal}:{urlsplit(base_url).hostname}"
    manifest = json.dumps({"version": 2, "generation": generation, "chunks": len(chunks),
                           "sha256": hashlib.sha256(packed.encode("ascii")).hexdigest()})
    written: list[str] = []
    try:
        previous = keyring.get_password(SERVICE, account)
        for index, chunk in enumerate(chunks):
            chunk_account = f"{account}:{generation}:{index}"
            keyring.set_password(SERVICE, chunk_account, chunk)
            written.append(chunk_account)
            if keyring.get_password(SERVICE, chunk_account) != chunk:
                raise PortalSessionError("Portal-Session konnte nicht sicher gespeichert werden")
        keyring.set_password(SERVICE, account, manifest)
        if keyring.get_password(SERVICE, account) != manifest:
            raise PortalSessionError("Portal-Session konnte nicht sicher gespeichert werden")
        _remove_chunks(_chunk_accounts(account, previous))
    except PortalSessionError:
        _remove_chunks(written)
        raise
    except (KeyringError, RuntimeError, OSError) as exc:
        # The old manifest remains valid until all new chunks have been verified.
        _remove_chunks(written)
        raise PortalSessionError("Portal-Session konnte nicht sicher gespeichert werden") from exc


def _chunk_accounts(account: str, serialized: str | None) -> list[str]:
    if not serialized:
        return []
    try:
        manifest = json.loads(serialized)
        count = manifest["chunks"]
        generation = manifest["generation"]
        if (manifest.get("version") != 2 or not isinstance(count, int)
                or not 1 <= count <= MAX_KEYRING_CHUNKS or not isinstance(generation, str)
                or len(generation) != 16 or any(char not in "0123456789abcdef" for char in generation)):
            return []
        return [f"{account}:{generation}:{index}" for index in range(count)]
    except (ValueError, TypeError, KeyError):
        return []


def _remove_chunks(accounts: list[str]) -> None:
    for account in accounts:
        try:
            keyring.delete_password(SERVICE, account)
        except (keyring.errors.PasswordDeleteError, KeyringError, RuntimeError, OSError):
            pass


def _decode_session(account: str, serialized: str) -> dict:
    manifest = json.loads(serialized)
    if not isinstance(manifest, dict) or manifest.get("version") != 2:
        return manifest
    accounts = _chunk_accounts(account, serialized)
    if not accounts:
        raise ValueError("Invalid portal session manifest")
    chunks = [keyring.get_password(SERVICE, item) for item in accounts]
    if any(chunk is None or len(chunk) > KEYRING_CHUNK_CHARS for chunk in chunks):
        raise ValueError("Incomplete portal session")
    packed = "".join(chunk for chunk in chunks if chunk is not None)
    if hashlib.sha256(packed.encode("ascii")).hexdigest() != manifest["sha256"]:
        raise ValueError("Corrupt portal session")
    decoder = zlib.decompressobj()
    raw = decoder.decompress(base64.b64decode(packed, validate=True), MAX_STATE_BYTES + 1)
    if len(raw) > MAX_STATE_BYTES or not decoder.eof or decoder.unconsumed_tail:
        raise ValueError("Oversized portal session")
    return json.loads(raw)


def load_session(portal: str, base_url: str) -> PortalSession | None:
    if portal not in PORTALS or not keyring_available():
        return None
    try:
        account = f"{portal}:{urlsplit(base_url).hostname}"
        serialized = keyring.get_password(SERVICE, account)
    except (KeyringError, RuntimeError, OSError):
        return None
    if not serialized:
        return None
    try:
        payload = _decode_session(account, serialized)
        hosts = payload.get("auth_cookie_hosts", [])
        if not isinstance(hosts, list):
            return None
        stored = validate_session(portal, base_url, payload["entry_url"],
                                  payload["storage_state"], tuple(hosts))
        return PortalSession(portal, stored.entry_url, stored.storage_state,
                             datetime.fromisoformat(payload["captured_at"]), stored.auth_cookie_hosts)
    except (KeyError, TypeError, ValueError, PortalSessionError, KeyringError, RuntimeError, OSError):
        return None


def clear_session(portal: str, base_url: str) -> None:
    if portal not in PORTALS or not keyring_available():
        raise PortalSessionError("Sicherer System-Schlüsselbund ist nicht verfügbar")
    try:
        account = f"{portal}:{urlsplit(base_url).hostname}"
        serialized = keyring.get_password(SERVICE, account)
        if serialized is None:
            return
        _remove_chunks(_chunk_accounts(account, serialized))
        keyring.delete_password(SERVICE, account)
    except keyring.errors.PasswordDeleteError:
        return
    except (KeyringError, RuntimeError, OSError) as exc:
        raise PortalSessionError("Portal-Session konnte nicht entfernt werden") from exc
