# SPDX-License-Identifier: AGPL-3.0-or-later
"""Local cache of public menu data; separate from synced user records."""

import json
import os
import secrets
from pathlib import Path


class MenuRepository:
    def __init__(self, local_dir: Path):
        self.path = local_dir / "mensa-public-cache.json"

    def read(self) -> dict:
        try:
            if self.path.is_symlink() or self.path.stat().st_size > 5_000_000:
                return {}
            value = json.loads(self.path.read_text(encoding="utf-8"))
            return value if isinstance(value, dict) else {}
        except (OSError, ValueError):
            return {}

    def save(self, values: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.is_symlink():
            raise OSError("Invalid public cache path")
        temporary = self.path.with_name(
            self.path.name + "." + secrets.token_hex(8) + ".tmp"
        )
        try:
            temporary.write_text(
                json.dumps(values, ensure_ascii=False), encoding="utf-8"
            )
            os.replace(temporary, self.path)
        finally:
            temporary.unlink(missing_ok=True)
