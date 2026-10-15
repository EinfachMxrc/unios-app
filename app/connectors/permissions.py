# SPDX-License-Identifier: AGPL-3.0-or-later

"""Append-only, local connector grants pinned to a reviewed manifest."""

import json
import os
from datetime import UTC, datetime
from pathlib import Path

from filelock import FileLock

from app.connectors.manifest import ConnectorManifest


class ConnectorPermissions:
    def __init__(self, local_dir: Path):
        self.path = local_dir / "connector-grants.jsonl"

    def approvals(self) -> dict[str, str | None]:
        state: dict[str, str | None] = {}
        if not self.path.exists():
            return state
        if self.path.is_symlink():
            raise ValueError("Ungültige Connector-Freigabedatei")
        with self.path.open(encoding="utf-8") as stream:
            for line in stream:
                event = json.loads(line)
                if event.get("action") not in {"approve", "revoke"} or not isinstance(event.get("id"), str):
                    raise ValueError("Ungültiger Connector-Freigabeeintrag")
                state[event["id"]] = event.get("fingerprint") if event["action"] == "approve" else None
        return state

    def is_approved(self, manifest: ConnectorManifest) -> bool:
        return self.approvals().get(manifest.id) == manifest.fingerprint

    def append(self, manifest: ConnectorManifest, action: str) -> None:
        if action not in {"approve", "revoke"}:
            raise ValueError("Ungültige Connector-Freigabeaktion")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        event = {"id": manifest.id, "action": action, "fingerprint": manifest.fingerprint,
                 "capabilities": sorted(manifest.capabilities), "domains": sorted(manifest.domains),
                 "secrets": sorted(manifest.secrets), "at": datetime.now(UTC).isoformat()}
        with FileLock(f"{self.path}.lock", timeout=5):
            if self.path.is_symlink():
                raise ValueError("Ungültige Connector-Freigabedatei")
            with os.fdopen(os.open(self.path, os.O_APPEND | os.O_CREAT | os.O_WRONLY, 0o600),
                           "a", encoding="utf-8") as stream:
                stream.write(json.dumps(event, sort_keys=True) + "\n")
                stream.flush()
                os.fsync(stream.fileno())
