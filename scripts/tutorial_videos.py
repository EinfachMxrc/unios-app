# SPDX-License-Identifier: AGPL-3.0-or-later

"""Record a short WebM tour against the invented local fake server."""

import argparse
import os
import shutil
import subprocess
from datetime import UTC, datetime
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Kurzes UniOS-Tutorial mit erfundenen Daten aufnehmen")
    parser.add_argument("--no-build", action="store_true", help="Vorhandenen Frontend-Build verwenden")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    frontend = root / "frontend"
    npm = "npm.cmd" if os.name == "nt" else "npm"
    if not args.no_build:
        subprocess.run([npm, "run", "build"], cwd=frontend, check=True)
    subprocess.run([npm, "run", "e2e:focused", "--", "tutorial.spec.ts"], cwd=frontend, check=True)
    videos = list((frontend / "test-results").rglob("video.webm"))
    if len(videos) != 1:
        raise RuntimeError("Es wurde nicht genau ein Tutorial-Video erzeugt")
    output_dir = root / "docs" / "tutorial-videos"
    output_dir.mkdir(parents=True, exist_ok=True)
    target = output_dir / f"intro-{datetime.now(UTC):%Y%m%d-%H%M%S}.webm"
    if target.exists():
        raise FileExistsError("Tutorial-Video mit diesem Zeitpunkt existiert bereits")
    shutil.copy2(videos[0], target)
    print(target)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
