# SPDX-License-Identifier: AGPL-3.0-or-later

"""Render a native service file with this checkout's absolute paths."""

from __future__ import annotations

import argparse
import os
import plistlib
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _replace(value: object, fields: dict[str, str]) -> object:
    if isinstance(value, str):
        for key, replacement in fields.items():
            value = value.replace(key, replacement)
    elif isinstance(value, list):
        value = [_replace(item, fields) for item in value]
    elif isinstance(value, dict):
        value = {key: _replace(item, fields) for key, item in value.items()}
    return value


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("platform", choices=("macos", "linux"))
    args = parser.parse_args()
    python = ROOT / ".venv" / "bin" / "python"
    npm = shutil.which("npm")
    if not python.is_file() or npm is None:
        parser.error("Zuerst uv sync --locked und Node.js/npm installieren")
    if not (ROOT / "frontend" / "dist" / "index.html").is_file():
        parser.error("Zuerst im frontend-Ordner npm ci und npm run build ausführen")
    output_dir = ROOT / "local" / "services"
    output_dir.mkdir(parents=True, exist_ok=True)
    paths = os.pathsep.join((str(python.parent), str(Path(npm).parent), os.environ.get("PATH", "")))
    fields = {
        "PROJECT_ROOT": str(ROOT),
        "PROJECT_PYTHON": str(python),
        "PROJECT_LOCAL": str(ROOT / "local"),
        "PROJECT_PATH": paths,
    }
    if args.platform == "macos":
        template = ROOT / "deploy" / "macos" / "de.marc.uni-os.plist.example"
        with template.open("rb") as source:
            value = plistlib.load(source)
        destination = output_dir / "de.marc.uni-os.plist"
        with destination.open("wb") as target:
            plistlib.dump(_replace(value, fields), target)
    else:
        template = ROOT / "deploy" / "linux" / "marc-uni-os.service.example"
        destination = output_dir / "marc-uni-os.service"
        text = template.read_text(encoding="utf-8")
        for key, replacement in fields.items():
            text = text.replace(key, replacement.replace("\\", "\\\\").replace('"', '\\"'))
        destination.write_text(text, encoding="utf-8")
    print(destination)


if __name__ == "__main__":
    main()
