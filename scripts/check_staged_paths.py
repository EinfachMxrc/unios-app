# SPDX-License-Identifier: AGPL-3.0-or-later

"""Reject local data and credentials before they enter Git history."""

from __future__ import annotations

import os
import subprocess
from pathlib import PurePosixPath


def main() -> int:
    result = subprocess.run(
        ["git", "diff", "--cached", "--name-only", "-z"],
        check=True,
        capture_output=True,
    )
    paths = [os.fsdecode(path) for path in result.stdout.split(b"\0") if path]
    forbidden = []
    for name in paths:
        path = PurePosixPath(name)
        if (
            path.parts[0] == "data"
            or path.name == ".env"
            or path.name.startswith(".env.") and path.name != ".env.example"
            or path.suffix in {".sqlite3", ".db", ".anki2", ".pem", ".key"}
            or path.parts[0] == "tests" and any(part in {"private", "shared", "logs"} for part in path.parts)
        ):
            forbidden.append(name)
    if forbidden:
        print("Lokale Daten oder Zugangsdaten dürfen nicht ins Repo:")
        for name in forbidden:
            print(f"  {name}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
