# SPDX-License-Identifier: AGPL-3.0-or-later
"""Encrypted credential store for a headless, single-user server.

The master key is provisioned separately, never generated as a fallback and
never stored inside the data directory or container image.
"""

from __future__ import annotations

import json
import os
import stat
from pathlib import Path
from uuid import uuid4

import keyring
from cryptography.fernet import Fernet, InvalidToken
from filelock import FileLock
from keyring.backend import KeyringBackend
from keyring.errors import KeyringError, PasswordDeleteError


class ServerKeyring(KeyringBackend):
    priority = 1

    def __init__(self, directory: Path, key_file: Path):
        super().__init__()
        details = key_file.lstat()
        if not stat.S_ISREG(details.st_mode) or details.st_size != 44:
            raise KeyringError("Server-Schlüssel ist ungültig")
        get_uid = getattr(os, "getuid", None)
        if os.name != "nt" and (get_uid is None or details.st_mode & 0o077 or details.st_uid != get_uid()):
            raise KeyringError("Server-Schlüssel muss privat und dem Dienst zugeordnet sein")
        self.cipher = Fernet(key_file.read_bytes())
        directory.mkdir(parents=True, exist_ok=True)
        self.path = directory / "credentials.enc"
        self.lock = FileLock(str(directory / "credentials.lock"), timeout=10)

    def _read(self) -> dict[str, dict[str, str]]:
        if self.path.is_symlink():
            raise KeyringError("Ungültiger Schlüsselbund-Pfad")
        if not self.path.exists():
            return {}
        details = self.path.stat()
        if not stat.S_ISREG(details.st_mode) or details.st_size > 8_000_000:
            raise KeyringError("Server-Schlüsselbund ist ungültig")
        get_uid = getattr(os, "getuid", None)
        if os.name != "nt" and (get_uid is None or details.st_mode & 0o077 or details.st_uid != get_uid()):
            raise KeyringError("Server-Schlüsselbund ist nicht privat")
        try:
            value = json.loads(self.cipher.decrypt(self.path.read_bytes()))
            if not isinstance(value, dict) or any(
                not isinstance(service, str) or not isinstance(accounts, dict)
                or any(not isinstance(name, str) or not isinstance(secret, str)
                       for name, secret in accounts.items())
                for service, accounts in value.items()
            ):
                raise ValueError
            return value
        except (InvalidToken, ValueError, TypeError) as exc:
            raise KeyringError("Server-Schlüsselbund konnte nicht entschlüsselt werden") from exc

    def _write(self, value: dict[str, dict[str, str]]) -> None:
        raw = self.cipher.encrypt(json.dumps(value, ensure_ascii=True).encode())
        if len(raw) > 8_000_000:
            raise KeyringError("Server-Schlüsselbund ist zu groß")
        temporary = self.path.with_name(f".credentials.{uuid4().hex}.tmp")
        try:
            descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "wb") as output:
                output.write(raw)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, self.path)
        finally:
            temporary.unlink(missing_ok=True)

    def get_password(self, service: str, username: str) -> str | None:
        with self.lock:
            return self._read().get(service, {}).get(username)

    def set_password(self, service: str, username: str, password: str) -> None:
        with self.lock:
            values = self._read()
            values.setdefault(service, {})[username] = password
            self._write(values)

    def delete_password(self, service: str, username: str) -> None:
        with self.lock:
            values = self._read()
            if username not in values.get(service, {}):
                raise PasswordDeleteError("Zugang nicht vorhanden")
            del values[service][username]
            if not values[service]:
                del values[service]
            self._write(values)


def configure_server_keyring(home: Path) -> None:
    key = os.environ.get("UNIOS_SERVER_KEY")
    if not key:
        raise KeyringError("Separater Server-Schlüssel fehlt")
    keyring.set_keyring(ServerKeyring(home / "local", Path(key)))
