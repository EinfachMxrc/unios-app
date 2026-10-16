# SPDX-License-Identifier: AGPL-3.0-or-later
"""OS-keychain device binding to exactly one server identity."""

from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from app.integrations.storage import ConnectionError, ConnectionStore, Vault


def validate_server_url(value: str) -> str:
    value = value.strip().rstrip("/")
    parsed = urlsplit(value)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
            or parsed.query or parsed.fragment or parsed.port not in {None, 443}
            or parsed.hostname in {"localhost", "127.0.0.1", "::1"}
            or any(part in {".", ".."} for part in parsed.path.split("/"))
            or "%" in parsed.path or "\\" in value or len(value) > 300):
        raise ValueError("Eine HTTPS-Serveradresse ohne Zugangsdaten eingeben")
    return value


class ServerConnection:
    def __init__(self, home: Path):
        self.store = ConnectionStore(home / "local", "server")
        self.vault = Vault(home / "local", "local", "server")

    def state(self) -> dict:
        metadata = self.store.read()
        value = self.vault.read("device")
        configured = (isinstance(value.get("token"), str) and len(value["token"]) >= 32
                      and value.get("url") == metadata.get("url"))
        return {"mode": "client", "configured": configured, "server_url": metadata.get("url", ""),
                "keyring_available": self.vault.available()}

    def credentials(self) -> tuple[str, str]:
        metadata = self.store.read()
        value = self.vault.read("device")
        token = value.get("token")
        url = value.get("url")
        if (not isinstance(token, str) or len(token) < 32 or not isinstance(url, str)
                or url != metadata.get("url")):
            raise ConnectionError("Gerät noch nicht mit dem Server gekoppelt")
        return validate_server_url(url), token

    def assert_identity(self, url: str) -> None:
        previous = self.store.read().get("url")
        if previous and previous != url:
            raise ConnectionError("Serverwechsel benötigt eine getrennte Datenübernahme; lokale Entwürfe bleiben geschützt")

    def save(self, url: str, token: str) -> None:
        url = validate_server_url(url)
        self.assert_identity(url)
        if len(token) < 32 or len(token) > 200:
            raise ConnectionError("Server hat keinen gültigen Geräteschlüssel geliefert")
        self.vault.save("device", {"url": url, "token": token})
        self.store.save({"version": 1, "url": url, "mode": "client"})


def client_enabled(home: Path) -> bool:
    """Only an explicit client marker: a fresh source checkout without any marker is no client."""
    return ConnectionStore(home / "local", "server").read().get("mode") == "client"


def choose_mode(home: Path) -> Literal["client", "local"]:
    """Which service `uniosd serve` starts.

    An explicit marker wins. Without one, an existing database means an installation from
    before the choice existed and stays local; a first start has nothing yet, so the
    client screen opens and offers both ways.
    """
    mode = ConnectionStore(home / "local", "server").read().get("mode")
    if mode in {"client", "local"}:
        return mode
    return "local" if (home / "local" / "uni_os.sqlite3").exists() else "client"


def use_local(home: Path) -> None:
    """Remember that this device runs UniOS on its own, without a server.

    Stores no credentials. A device that is already paired keeps its server: moving data
    between the two needs the checked transfer described in docs/SERVER.md.
    """
    connection = ServerConnection(home)
    if connection.state()["configured"]:
        raise ConnectionError("Dieses Gerät ist bereits mit einem Server gekoppelt")
    connection.store.save({"version": 1, "mode": "local"})
