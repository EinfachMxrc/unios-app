# SPDX-License-Identifier: AGPL-3.0-or-later
"""Server startup: one process, one database, snapshot before migration."""

import os
import sys
from pathlib import Path

from app.server.keyring import configure_server_keyring


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] not in {"serve", "pair", "recovery"}:
        print("Verwendung: python -m app.server serve|pair|recovery", file=sys.stderr)
        return 2
    home = Path(os.environ.get("UNIOS_HOME", "/var/lib/unios"))
    if not home.is_absolute():
        raise ValueError("UNIOS_HOME muss absolut sein")
    home.mkdir(parents=True, exist_ok=True)
    os.environ["DATA_DIR"] = str(home / "data")
    os.environ["LOCAL_DIR"] = str(home / "local")
    os.environ["SERVER_MODE"] = "true"
    os.environ["AUTOMATIC_TAKEOVER_ENABLED"] = "false"
    os.environ["API_AUTH_REQUIRED"] = "true"
    if sys.argv[1] == 'recovery':
        import uvicorn

        from app.recovery.api import create_recovery_app
        from app.recovery.config import recovery_settings
        settings = recovery_settings(home, Path(os.environ.get('REACT_DIST_DIR', '/app/frontend/dist')),
                                     server=True, allowed_hosts=os.environ.get('ALLOWED_HOSTS', '127.0.0.1,localhost,[::1]'))
        uvicorn.run(create_recovery_app(settings), host='0.0.0.0', port=8000, access_log=False)
        return 0
    configure_server_keyring(home)
    if sys.argv[1] == "pair":
        from app.sessions import SessionStore

        print(SessionStore(home / "local").create_pairing_code())
        return 0
    from desktop.backend import prepare_database

    prepare_database()
    import uvicorn

    uvicorn.run("app.main:create_app", factory=True, host="0.0.0.0", port=8000, access_log=False, workers=1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
