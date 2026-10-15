# SPDX-License-Identifier: AGPL-3.0-or-later

"""Start FastAPI with the built React interface on one local port."""

from __future__ import annotations

import os
import sys
from ipaddress import ip_address
from pathlib import Path

import uvicorn

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    os.chdir(ROOT)
    sys.path.insert(0, str(ROOT))
    dist = Path(os.environ.get("REACT_DIST_DIR", "./frontend/dist"))
    if not (dist / "index.html").is_file():
        print("UniOS: React-Build fehlt: cd frontend && npm ci && npm run build", file=sys.stderr)
        return 2
    try:
        port = int(os.environ.get("UNIOS_API_PORT", "8000"))
    except ValueError:
        print("UniOS: ungültiger Port", file=sys.stderr)
        return 2
    if not 1 <= port <= 65535:
        print("UniOS: ungültiger Port", file=sys.stderr)
        return 2
    bind = os.environ.get("UNIOS_BIND", "127.0.0.1")
    try:
        if not ip_address(bind).is_loopback:
            raise ValueError
    except ValueError:
        print("UniOS: Dienst darf in Phase 1 nur an eine Loopback-IP binden", file=sys.stderr)
        return 2
    os.environ["SERVE_REACT"] = "true"
    uvicorn.run("app.main:create_app", factory=True, host=bind, port=port)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
