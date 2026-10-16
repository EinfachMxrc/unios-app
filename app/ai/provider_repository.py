# SPDX-License-Identifier: AGPL-3.0-or-later

"""Persistence for the AI provider connection: the API key and the chosen model.

The key lives in the operating system's secret store; only when none is available it falls
back to a file readable by the current user alone. The model choice is plain local state.
"""

import json
import os
from pathlib import Path

from app.config import Settings
from app.files.atomic import replace_atomic
from app.secrets import (
    delete_connector_secret,
    load_connector_secret,
    save_connector_secret,
    secure_windows_env,
)

CONNECTOR_ID = "ai-anthropic"
ALIAS = "api-key"


class ProviderRepository:
    def __init__(self, settings: Settings) -> None:
        self._key_file = settings.local_dir / "ai-provider.key"
        self._choice_file = settings.local_dir / "ai-provider.json"

    def load_key(self) -> str:
        key = load_connector_secret(CONNECTOR_ID, ALIAS)
        if key:
            return key
        try:
            return self._key_file.read_text(encoding="utf-8").strip()
        except OSError:
            return ""

    def save_key(self, key: str) -> None:
        if save_connector_secret(CONNECTOR_ID, ALIAS, key):
            self._key_file.unlink(missing_ok=True)
            return
        self._write_private(self._key_file, key, secret=True)

    def delete_key(self) -> None:
        delete_connector_secret(CONNECTOR_ID, ALIAS)
        self._key_file.unlink(missing_ok=True)

    def load_choice(self) -> dict:
        try:
            value = json.loads(self._choice_file.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}
        return value if isinstance(value, dict) else {}

    def save_choice(self, choice: dict) -> None:
        self._write_private(self._choice_file, json.dumps(choice, ensure_ascii=False))

    @staticmethod
    def _write_private(target: Path, content: str, *, secret: bool = False) -> None:
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(target.name + ".tmp")
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        if secret and os.name == "nt":
            # POSIX mode bits do nothing on Windows: restrict the ACL before the key is written.
            try:
                secure_windows_env(temporary)
            except PermissionError:
                os.close(descriptor)
                temporary.unlink(missing_ok=True)
                raise
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            output.write(content)
        replace_atomic(temporary, target)
