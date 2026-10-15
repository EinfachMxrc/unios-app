# SPDX-License-Identifier: AGPL-3.0-or-later
"""Device-local MCP credentials; client configuration never contains a token."""

import secrets
import sys
from pathlib import Path

from app.config import Settings
from app.integrations.storage import ConnectionError, ConnectionStore, Vault


class McpConnection:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.store = ConnectionStore(settings.local_dir, "mcp")
        # A university change must not leave a second credential behind.
        self.vault = Vault(settings.local_dir, "local", "mcp")

    def load(self) -> None:
        if self.store.read().get("configured") is not True:
            return
        token = self.vault.read("bridge").get("token")
        if isinstance(token, str) and len(token) >= 32:
            self.settings.mcp_token = token
            self.settings.mcp_enabled = True
        else:
            # A missing vault entry never falls back to an old environment token.
            self.settings.mcp_token = ""
            self.settings.mcp_enabled = False

    def setup(self) -> None:
        value = self.vault.read("bridge")
        token = value.get("token")
        if not isinstance(token, str) or len(token) < 32:
            token = secrets.token_urlsafe(48)
            self.vault.save("bridge", {"token": token})
        self.store.save({"configured": True, "version": 1})
        self.settings.mcp_token = token
        self.settings.mcp_enabled = True

    def client_config(self) -> dict:
        frozen = bool(getattr(sys, "frozen", False))
        return {"command": str(Path(sys.executable).resolve()),
                "args": ["mcp"] if frozen else ["-m", "clients.uni_mcp"],
                "env": {"UNIOS_HOME": str(self.settings.local_dir.resolve().parent)}}


def load_mcp_connection(settings: Settings) -> None:
    try:
        McpConnection(settings).load()
    except (ConnectionError, OSError):
        settings.mcp_token = ""
        settings.mcp_enabled = False
