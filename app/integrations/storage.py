# SPDX-License-Identifier: AGPL-3.0-or-later
"""Atomic public connection metadata; large credentials stay in the OS vault."""

import json
import os
from hashlib import sha256
from pathlib import Path
from uuid import uuid4

import keyring
from keyring.errors import KeyringError, PasswordDeleteError

from app.secrets import _secure_backend


class ConnectionError(ValueError):
    pass


class ConnectionStore:
    def __init__(self, directory: Path, name: str):
        self.path = directory / f"{name}-connection.json"

    def read(self) -> dict:
        if not self.path.exists():
            return {}
        if self.path.is_symlink() or self.path.stat().st_size > 100_000:
            raise ConnectionError("Verbindungseinstellungen sind beschädigt")
        try:
            result = json.loads(self.path.read_text(encoding="utf-8"))
            if not isinstance(result, dict):
                raise TypeError
            return result
        except (OSError, ValueError, TypeError) as exc:
            raise ConnectionError("Verbindungseinstellungen konnten nicht gelesen werden") from exc

    def save(self, value: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.is_symlink():
            raise ConnectionError("Ungültiger Pfad für Verbindungseinstellungen")
        temporary = self.path.with_name(f".{self.path.name}.{uuid4().hex}.tmp")
        try:
            with temporary.open("x", encoding="utf-8") as stream:
                json.dump(value, stream)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self.path)
        finally:
            temporary.unlink(missing_ok=True)


class Vault:
    """Chunked immutable generations fit Windows Credential Manager's blob limit."""

    def __init__(self, directory: Path, institution: str, name: str):
        identity = sha256(f"{directory.resolve()}:{institution}".encode()).hexdigest()[:24]
        self.service = f"unios.{name}.{identity}"

    @staticmethod
    def available() -> bool:
        return _secure_backend()

    def read(self, alias: str) -> dict:
        if not self.available():
            return {}
        try:
            pointer = keyring.get_password(self.service, alias)
            if not pointer:
                return {}
            metadata = json.loads(pointer)
            count = metadata["count"]
            generation = metadata["generation"]
            if type(count) is not int or not 1 <= count <= 128 or len(generation) != 32:
                raise ValueError
            parts = [keyring.get_password(self.service, f"{alias}:{generation}:{index}")
                     for index in range(count)]
            if any(part is None for part in parts):
                raise ValueError
            raw = "".join(part or "" for part in parts)
            if sha256(raw.encode()).hexdigest() != metadata["hash"]:
                raise ValueError
            value = json.loads(raw)
            if not isinstance(value, dict):
                raise TypeError
            return value
        except (KeyringError, RuntimeError, ValueError, KeyError, TypeError) as exc:
            raise ConnectionError("Verbindungsdaten im Schlüsselbund sind nicht verfügbar") from exc

    def save(self, alias: str, value: dict) -> None:
        if not self.available():
            raise ConnectionError("Sicherer System-Schlüsselbund ist nicht verfügbar")
        raw = json.dumps(value, ensure_ascii=True)
        if len(raw) > 64_000:
            raise ConnectionError("Verbindungsdaten sind zu groß")
        generation = uuid4().hex
        parts = [raw[index:index + 700] for index in range(0, len(raw), 700)]
        try:
            old_pointer = keyring.get_password(self.service, alias)
            for index, part in enumerate(parts):
                keyring.set_password(self.service, f"{alias}:{generation}:{index}", part)
            pointer = json.dumps({"generation": generation, "count": len(parts),
                                  "hash": sha256(raw.encode()).hexdigest()})
            keyring.set_password(self.service, alias, pointer)
            if self.read(alias) != value:
                raise ConnectionError("Schlüsselbund konnte die Verbindung nicht sichern")
            if old_pointer:
                self._remove_parts(alias, json.loads(old_pointer))
        except (KeyringError, RuntimeError, ValueError) as exc:
            raise ConnectionError("Verbindung konnte nicht im Schlüsselbund gespeichert werden") from exc

    def _remove_parts(self, alias: str, metadata: dict) -> None:
        count = metadata.get("count", 0)
        if type(count) is not int or not 0 <= count <= 128:
            return
        for index in range(count):
            try:
                keyring.delete_password(self.service, f"{alias}:{metadata['generation']}:{index}")
            except PasswordDeleteError:
                pass

    def remove(self, alias: str) -> None:
        if not self.available():
            raise ConnectionError("Sicherer System-Schlüsselbund ist nicht verfügbar")
        try:
            pointer = keyring.get_password(self.service, alias)
            if pointer:
                keyring.delete_password(self.service, alias)
                self._remove_parts(alias, json.loads(pointer))
        except (KeyringError, RuntimeError, ValueError, KeyError) as exc:
            raise ConnectionError("Verbindung konnte nicht entfernt werden") from exc
