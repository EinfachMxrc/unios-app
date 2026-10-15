# SPDX-License-Identifier: AGPL-3.0-or-later

"""Paired-device sessions, an iCal token, and pairing codes for the local API.

Stored under ``LOCAL_DIR`` (never ``DATA_DIR``, which is synced between host
devices) so pairing is per physical device, matching the Host allowlist's
per-device design in ``app.security``. Only SHA-256 hashes of session tokens
and pairing-code secrets are kept; the iCal token is stored in plain text
because ``GET /api/session/ical-url`` must be able to hand it back.
"""

from __future__ import annotations

import json
import os
import secrets
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from hmac import compare_digest
from pathlib import Path
from typing import Any, TypeVar
from uuid import uuid4

from filelock import FileLock

SESSION_MAX_AGE_SECONDS = 400 * 24 * 3600
PAIRING_CODE_TTL_SECONDS = 600
PAIRING_CODE_MAX_ATTEMPTS = 5
_LAST_SEEN_THROTTLE = timedelta(minutes=5)

T = TypeVar("T")


def _hash(value: str) -> str:
    return sha256(value.encode("utf-8")).hexdigest()


def _timestamp(value: Any) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(value)
        return parsed.astimezone(UTC) if parsed.tzinfo is not None else None
    except (TypeError, ValueError):
        return None


def _active_session(entry: Any, now: datetime) -> bool:
    if not isinstance(entry, dict):
        return False
    created = _timestamp(entry.get("created_at"))
    return created is not None and timedelta(0) <= now - created < timedelta(seconds=SESSION_MAX_AGE_SECONDS)


class SessionStore:
    """Reads and writes the local JSON file behind device sessions and pairing."""

    def __init__(self, local_dir: Path):
        self.path = Path(local_dir) / "sessions.json"
        self.lock_path = Path(local_dir) / "sessions.json.lock"

    def _read(self) -> dict[str, Any]:
        if self.path.is_symlink():
            raise OSError("Sitzungsdatei darf kein Symlink sein")
        if not self.path.is_file():
            return {"sessions": {}, "pairing_codes": {}, "ical_token": None}
        try:
            value = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise OSError("Sitzungsdatei ist beschädigt") from exc
        if not isinstance(value, dict):
            raise OSError("Sitzungsdatei ist beschädigt")
        value.setdefault("sessions", {})
        value.setdefault("pairing_codes", {})
        value.setdefault("ical_token", None)
        return value

    def _write(self, value: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.is_symlink():
            raise OSError("Sitzungsdatei darf kein Symlink sein")
        temporary = self.path.with_name(f".{self.path.name}.{uuid4().hex}.tmp")
        try:
            descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "w", encoding="utf-8") as output:
                json.dump(value, output, ensure_ascii=False)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, self.path)
        finally:
            temporary.unlink(missing_ok=True)

    def _mutate(self, mutator: Callable[[dict[str, Any]], tuple[T, bool]]) -> T:
        """Run ``mutator`` under a file lock and persist only if it changed something."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with FileLock(self.lock_path, timeout=5):
            data = self._read()
            result, changed = mutator(data)
            if changed:
                self._write(data)
            return result

    def create_session(self, label: str) -> str:
        """Create a paired-device session and return its raw cookie token.

        Only the SHA-256 hash of the token is persisted; the raw value exists
        solely in memory here and in the cookie sent to the caller.
        """
        raw_token = secrets.token_urlsafe(32)
        now = datetime.now(UTC).isoformat()

        def mutate(data: dict[str, Any]) -> tuple[str, bool]:
            data["sessions"][uuid4().hex] = {
                "token_hash": _hash(raw_token), "label": label,
                "created_at": now, "last_seen_at": now,
            }
            return raw_token, True

        return self._mutate(mutate)

    def verify_session(self, raw_token: str) -> bool:
        """True for a non-revoked session younger than the absolute device lifetime."""
        if not raw_token:
            return False
        token_hash = _hash(raw_token)
        now = datetime.now(UTC)

        def mutate(data: dict[str, Any]) -> tuple[bool, bool]:
            for entry in data["sessions"].values():
                if not _active_session(entry, now):
                    continue
                if not compare_digest(entry["token_hash"], token_hash):
                    continue
                last_seen = _timestamp(entry.get("last_seen_at")) or now - _LAST_SEEN_THROTTLE - timedelta(seconds=1)
                changed = now - last_seen > _LAST_SEEN_THROTTLE
                if changed:
                    entry["last_seen_at"] = now.isoformat()
                return True, changed
            return False, False

        return self._mutate(mutate)

    def verify_session_readonly(self, raw_token: str) -> bool:
        """Recovery auth: bounded, fail closed and never create a lock or refresh state."""
        if not raw_token or len(raw_token) > 1024 or self.path.is_symlink():
            return False
        try:
            with self.path.open("rb") as source:
                raw = source.read(1024 * 1024 + 1)
            if len(raw) > 1024 * 1024:
                return False
            value = json.loads(raw)
            sessions = value.get("sessions") if isinstance(value, dict) else None
            if not isinstance(sessions, dict) or len(sessions) > 10000:
                return False
            token_hash = _hash(raw_token)
            now = datetime.now(UTC)
            return any(_active_session(entry, now) and isinstance(entry.get("token_hash"), str)
                       and compare_digest(entry["token_hash"], token_hash)
                       for entry in sessions.values())
        except (OSError, ValueError, TypeError):
            return False

    def list_sessions(self) -> list[dict[str, Any]]:
        def mutate(data: dict[str, Any]) -> tuple[list[dict[str, Any]], bool]:
            items = [{"id": session_id, "label": entry["label"],
                      "created_at": entry["created_at"], "last_seen_at": entry["last_seen_at"]}
                     for session_id, entry in data["sessions"].items()]
            return items, False

        return self._mutate(mutate)

    def revoke_session(self, session_id: str) -> bool:
        def mutate(data: dict[str, Any]) -> tuple[bool, bool]:
            if session_id in data["sessions"]:
                del data["sessions"][session_id]
                return True, True
            return False, False

        return self._mutate(mutate)

    def create_pairing_code(self) -> str:
        """Create a one-time pairing code, expiring after ``PAIRING_CODE_TTL_SECONDS``.

        Returns ``"<id>.<secret>"``: the id looks up the entry so failed
        attempts can be counted precisely, and only the secret's hash is
        stored.
        """
        code_id = secrets.token_hex(4)
        secret = secrets.token_urlsafe(24)
        now = datetime.now(UTC)
        expires_at = now + timedelta(seconds=PAIRING_CODE_TTL_SECONDS)

        def mutate(data: dict[str, Any]) -> tuple[None, bool]:
            data["pairing_codes"] = {
                key: entry for key, entry in data["pairing_codes"].items()
                if isinstance(entry, dict) and (expiry := _timestamp(entry.get("expires_at"))) is not None
                and expiry > now and entry.get("attempts", 0) < PAIRING_CODE_MAX_ATTEMPTS
            }
            data["pairing_codes"][code_id] = {
                "secret_hash": _hash(secret), "created_at": now.isoformat(),
                "expires_at": expires_at.isoformat(), "attempts": 0,
            }
            return None, True

        self._mutate(mutate)
        return f"{code_id}.{secret}"

    def redeem_pairing_code(self, full_code: str, label: str) -> str | None:
        """Consume a one-time pairing code and return a new raw session token.

        Returns ``None`` for an unknown, expired, already-consumed, or locked
        code, or a wrong secret (which also counts as a failed attempt).
        """
        if "." not in full_code:
            return None
        code_id, secret = full_code.split(".", 1)
        if not code_id or not secret:
            return None
        secret_hash = _hash(secret)
        now = datetime.now(UTC)

        def mutate(data: dict[str, Any]) -> tuple[str | None, bool]:
            entry = data["pairing_codes"].get(code_id)
            if entry is None:
                return None, False
            expires_at = _timestamp(entry.get("expires_at"))
            if expires_at is None or now >= expires_at or entry.get("attempts", 0) >= PAIRING_CODE_MAX_ATTEMPTS:
                del data["pairing_codes"][code_id]
                return None, True
            if not compare_digest(entry["secret_hash"], secret_hash):
                entry["attempts"] = entry.get("attempts", 0) + 1
                return None, True
            del data["pairing_codes"][code_id]
            raw_token = secrets.token_urlsafe(32)
            data["sessions"][uuid4().hex] = {
                "token_hash": _hash(raw_token), "label": label,
                "created_at": now.isoformat(), "last_seen_at": now.isoformat(),
            }
            return raw_token, True

        return self._mutate(mutate)

    def ensure_ical_token(self) -> str:
        """Return the persistent iCal subscription token, creating it on first use."""

        def mutate(data: dict[str, Any]) -> tuple[str, bool]:
            existing = data.get("ical_token")
            if isinstance(existing, str) and existing:
                return existing, False
            token = secrets.token_urlsafe(32)
            data["ical_token"] = token
            return token, True

        return self._mutate(mutate)

    def verify_ical_token(self, candidate: str) -> bool:
        if not candidate:
            return False

        def mutate(data: dict[str, Any]) -> tuple[bool, bool]:
            token = data.get("ical_token")
            return bool(isinstance(token, str) and token and compare_digest(token, candidate)), False

        return self._mutate(mutate)

    def rotate_ical_token(self) -> str:
        """Atomically invalidate the previous calendar URL without revoking devices."""
        def mutate(data: dict[str, Any]) -> tuple[str, bool]:
            token = secrets.token_urlsafe(32)
            data["ical_token"] = token
            return token, True

        return self._mutate(mutate)
