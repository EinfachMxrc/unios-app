# SPDX-License-Identifier: AGPL-3.0-or-later

"""Local, atomic enablement state for connectors selected in the GUI."""

import json
import os
import secrets
from pathlib import Path

from filelock import FileLock


class ConnectorSelection:
    def __init__(self, local_dir: Path):
        self.path = local_dir / "connectors-enabled.json"

    def _read(self) -> tuple[set[str], set[str]]:
        if not self.path.exists():
            return set(), set()
        if self.path.is_symlink():
            raise ValueError("Ungültige Connector-Auswahldatei")
        raw = json.loads(self.path.read_text(encoding="utf-8"))
        if (not isinstance(raw, dict) or raw.get("version") != 1
                or not isinstance(raw.get("enabled"), list)
                or any(not isinstance(item, str) for item in raw["enabled"])
                or not isinstance(raw.get("disabled", []), list)
                or any(not isinstance(item, str) for item in raw.get("disabled", []))):
            raise ValueError("Ungültige Connector-Auswahl")
        enabled, disabled = set(raw["enabled"]), set(raw.get("disabled", []))
        if enabled & disabled:
            raise ValueError("Widersprüchliche Connector-Auswahl")
        return enabled, disabled

    def selected(self) -> set[str]:
        return self._read()[0]

    def effective(self, environment: set[str]) -> set[str]:
        enabled, disabled = self._read()
        return (environment | enabled) - disabled

    def set_enabled(self, name: str, enabled: bool) -> set[str]:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with FileLock(f"{self.path}.lock", timeout=5):
            selected, disabled_names = self._read()
            if enabled:
                selected.add(name)
                disabled_names.discard(name)
            else:
                selected.discard(name)
                disabled_names.add(name)
            temporary = self.path.with_name(self.path.name + "." + secrets.token_hex(8) + ".tmp")
            descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            try:
                with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
                    json.dump({"version": 1, "enabled": sorted(selected),
                               "disabled": sorted(disabled_names)}, stream)
                    stream.flush()
                    os.fsync(stream.fileno())
                os.replace(temporary, self.path)
            finally:
                temporary.unlink(missing_ok=True)
            return selected
