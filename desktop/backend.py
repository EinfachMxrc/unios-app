# SPDX-License-Identifier: AGPL-3.0-or-later
"""Entry point for the bundled UniOS backend.

The executable owns no study data. It always uses a per-user directory so an
application update can replace the executable without touching the database.
"""

from __future__ import annotations

import io
import os
import subprocess
import sys
from pathlib import Path
from typing import TextIO

# Keep one previous log next to the current one; enough to diagnose a failed start.
LOG_LIMIT_BYTES = 2 * 1024 * 1024


def application_home() -> Path:
    override = os.environ.get("UNIOS_HOME")
    if override:
        path = Path(override)
        if not path.is_absolute():
            raise ValueError("UNIOS_HOME muss ein absoluter Pfad sein")
        return path
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    return base / "UniOS"


def bundle_root() -> Path:
    frozen = getattr(sys, "_MEIPASS", None)
    return Path(frozen) if frozen else Path(__file__).resolve().parents[1]


def configure_runtime(home: Path) -> None:
    root = bundle_root()
    dist = root / "frontend" / "dist"
    if not (dist / "index.html").is_file():
        raise RuntimeError("Die UniOS-Oberfläche fehlt im Paket")
    home.mkdir(parents=True, exist_ok=True)
    os.environ["DATA_DIR"] = str(home / "data")
    os.environ["LOCAL_DIR"] = str(home / "local")
    os.environ["REACT_DIST_DIR"] = str(dist)
    os.environ["SERVE_REACT"] = "true"
    os.environ["VOICE_MODEL_DIR"] = str(root / "voice-model")
    os.chdir(home)


def attach_log_streams(home: Path) -> TextIO | None:
    """Give a console-less build somewhere to write instead of crashing.

    Windowed executables start with ``sys.stdout``/``sys.stderr`` set to
    ``None``; uvicorn calls ``sys.stdout.isatty()`` and would fail before the
    first request. The log stays in the per-user UniOS folder.
    """
    if sys.stdout is not None and sys.stderr is not None:
        return None
    logs = home / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    path = logs / "uniosd.log"
    if path.exists() and path.stat().st_size > LOG_LIMIT_BYTES:
        path.replace(logs / "uniosd.log.1")
    stream = path.open("a", encoding="utf-8", buffering=1)
    if sys.stdout is None:
        sys.stdout = stream
    if sys.stderr is None:
        sys.stderr = stream
    return stream


def hide_child_consoles() -> None:
    """Stop console tools (git, tailscale, restic, ...) from flashing a terminal window.

    A process without a console gets a fresh console window for every console
    child it starts, unless the child is created with ``CREATE_NO_WINDOW``.
    """
    if sys.platform != "win32":
        return
    original = subprocess.Popen.__init__

    def init(self, args, **kwargs):  # type: ignore[no-untyped-def]
        kwargs["creationflags"] = kwargs.get("creationflags", 0) | subprocess.CREATE_NO_WINDOW
        original(self, args, **kwargs)

    subprocess.Popen.__init__ = init  # type: ignore[method-assign,assignment]


def attach_mcp_streams() -> None:
    """Recover inherited pipes in a windowed Windows binary, without a console.

    Protocol output must never be sent to the normal backend log.
    Duplicate handles so Python owns only its own copy of the caller's pipes.
    """
    if sys.stdin is not None and sys.stdout is not None and sys.stderr is not None:
        return
    if sys.platform != "win32":
        raise RuntimeError("KI-Verbindung benötigt Ein-/Ausgabekanäle")
    import ctypes
    import msvcrt
    from ctypes import wintypes

    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.GetStdHandle.argtypes = [wintypes.DWORD]
    kernel.GetStdHandle.restype = wintypes.HANDLE
    kernel.GetCurrentProcess.restype = wintypes.HANDLE
    kernel.GetFileType.argtypes = [wintypes.HANDLE]
    kernel.DuplicateHandle.argtypes = [wintypes.HANDLE, wintypes.HANDLE, wintypes.HANDLE,
                                      ctypes.POINTER(wintypes.HANDLE), wintypes.DWORD,
                                      wintypes.BOOL, wintypes.DWORD]
    for attribute, handle_id, mode, flags in (("stdin", -10, "rb", os.O_RDONLY),
                                             ("stdout", -11, "wb", os.O_WRONLY),
                                             ("stderr", -12, "wb", os.O_WRONLY)):
        if getattr(sys, attribute) is not None:
            continue
        handle = kernel.GetStdHandle(handle_id & 0xFFFFFFFF)
        if attribute == "stderr" and (not handle or not kernel.GetFileType(handle)):
            sys.stderr = open(os.devnull, "w", encoding="utf-8")  # noqa: SIM115 - process-lifetime stream
            continue
        if not handle or (attribute != "stderr" and kernel.GetFileType(handle) != 3):  # FILE_TYPE_PIPE
            raise RuntimeError("KI-Verbindung benötigt geerbte Pipes")
        duplicated = wintypes.HANDLE()
        process = kernel.GetCurrentProcess()
        if not kernel.DuplicateHandle(process, handle, process, ctypes.byref(duplicated), 0, False, 2):
            raise RuntimeError("KI-Verbindung konnte den Ausgabekanal nicht öffnen")
        if duplicated.value is None:
            raise RuntimeError("KI-Verbindung hat keinen gültigen Ausgabekanal")
        fd = msvcrt.open_osfhandle(duplicated.value, flags | os.O_BINARY)
        stream = io.TextIOWrapper(os.fdopen(fd, mode), encoding="utf-8", newline="\n",
                                  write_through=True)
        setattr(sys, attribute, stream)


def prepare_database() -> None:
    """Claim only a new installation and snapshot an existing DB before migrations."""
    from alembic.config import Config
    from alembic.runtime.migration import MigrationContext
    from alembic.script import ScriptDirectory
    from sqlalchemy import create_engine

    from alembic import command
    from app.config import get_settings
    from app.host.lease import HostCoordinator
    from app.host.snapshots import create_snapshot, verify_snapshot

    settings = get_settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.local_dir.mkdir(parents=True, exist_ok=True)
    database = settings.local_dir / "uni_os.sqlite3"
    # A restore chosen in the app is applied now, before anything opens the database;
    # the migration below then brings an older backup up to date.
    from app.backups.restore import apply_pending_restore
    apply_pending_restore(settings, database)
    is_new = not database.exists()
    coordinator = HostCoordinator(settings)
    try:
        root = bundle_root()
        config = Config(str(root / "alembic.ini"))
        config.set_main_option("script_location", str(root / "alembic"))
        config.attributes["settings"] = settings
        config.attributes["host_coordinator"] = coordinator
        scripts = ScriptDirectory.from_config(config)
        head = scripts.get_current_head()
        if is_new:
            current = None
        else:
            engine = create_engine(settings.database_url)
            try:
                with engine.connect() as connection:
                    current = MigrationContext.configure(connection).get_current_revision()
            finally:
                engine.dispose()
        if current is not None and current not in {item.revision for item in scripts.walk_revisions()}:
            raise RuntimeError("Datenbank-Schema ist neuer oder unbekannt; UniOS auf diesem Gerät aktualisieren")
        if is_new and coordinator.current() is None:
            coordinator.acquire_initial()
        owns_lease = coordinator.start(background=False)
        if not coordinator.has_instance_lock:
            raise RuntimeError("Die lokale UniOS-Datenbank ist bereits geöffnet")
        if not owns_lease:
            if is_new or coordinator.current() is None:
                raise RuntimeError("Kein aktiver UniOS-Host; dieses Gerät braucht erst einen Datenstand")
            if current != head:
                raise RuntimeError("Standby-Datenbank benötigt eine Migration; zuerst den aktiven Host aktualisieren")
            return
        if current != head:
            if not is_new:
                manifest = create_snapshot(coordinator)
                folder = settings.data_dir / "host" / "snapshots"
                if not verify_snapshot(folder, manifest, check_integrity=True):
                    raise RuntimeError("Snapshot vor der Aktualisierung ist nicht prüfbar")
            command.upgrade(config, "head")
        if is_new:
            marker = settings.local_dir / "setup.json"
            with marker.open("x", encoding="utf-8") as target:
                target.write('{"version":1,"institution":null,"notifications":null,"completed":false}')
    finally:
        coordinator.close()


def main() -> int:
    if sys.argv[1:] == ['--startup-check']:
        # Isolated packaging probe, before any home, credentials or DB access.
        attach_mcp_streams()
        return startup_check()
    if sys.argv[1:2] == ['--parser-worker']:
        if len(sys.argv) != 8:
            return 2
        # This entry never initializes credentials, home, DB or the server.
        from app.extract.parser_worker import run
        try:
            run(*sys.argv[2:7], mode=sys.argv[7])
        except Exception:  # noqa: BLE001 -- source diagnostics must not enter app logs
            return 1
        return 0
    if sys.argv[1:] == ["--addon-worker"]:
        attach_mcp_streams()
        from app.addons.wasm_worker import main as worker_main
        worker_main()
        return 0
    if len(sys.argv) != 2 or sys.argv[1] not in {"prepare", "serve", "mcp", "recovery", "demo"}:
        print("Verwendung: uniosd prepare|serve|mcp|recovery|demo", file=sys.stderr)
        return 2
    try:
        home = application_home()
        if sys.argv[1] == 'demo':
            from uuid import uuid4
            home = home / 'demos' / uuid4().hex
        if sys.argv[1] == "mcp":
            attach_mcp_streams()
        else:
            attach_log_streams(home)
        if getattr(sys, "frozen", False):
            hide_child_consoles()
        configure_runtime(home)
        if sys.argv[1] == 'recovery':
            serve_recovery(home, port=8002)
            return 0
        if sys.argv[1] == 'demo':
            import uvicorn

            from app.demo.service import create_demo, demo_settings
            create_demo(home)
            settings = demo_settings(home).model_copy(update={
                'demo_mode': True, 'react_dist_dir': bundle_root() / 'frontend' / 'dist'})
            os.environ['UNIOS_FACTORY_ONLY'] = 'true'
            from app.main import create_app
            uvicorn.run(create_app(settings, connectors=[], start_scheduler=False),
                        host='127.0.0.1', port=8001, access_log=False)
            return 0
        if sys.argv[1] == "mcp":
            from clients.uni_mcp.__main__ import main as mcp_main

            mcp_main()
            return 0
        from app.client.service import choose_mode

        if sys.argv[1] == "serve" and choose_mode(home) == "client":
            import uvicorn

            from app.client.api import create_client_app

            uvicorn.run(create_client_app(home, bundle_root() / "frontend" / "dist"),
                        host="127.0.0.1", port=8000, access_log=False)
            return 0
        prepare_database()
        if sys.argv[1] == 'serve':
            from app.main import create_app

            normal_app = create_app()
    except Exception as exc:  # noqa: BLE001 - last startup boundary, reveal only the failure class.
        print(f"UniOS konnte nicht starten: {type(exc).__name__}", file=sys.stderr)
        if sys.argv[1] == 'serve':
            serve_recovery(application_home(), reason='startup_failed')
            return 0
        return 1
    if sys.argv[1] == "serve":
        import uvicorn

        # No access log: request lines can carry feed tokens and would end up in the log file.
        uvicorn.run(normal_app, host="127.0.0.1", port=8000, access_log=False)
    return 0


def startup_check() -> int:
    """Exercise the installed client with an empty temporary home and no network."""
    import asyncio
    import json
    from tempfile import TemporaryDirectory
    from time import perf_counter

    started = perf_counter()
    if getattr(sys, 'frozen', False):
        # Validate the optional SDK inside the real installer without a key or network.
        import anthropic

        if not callable(anthropic.Anthropic):
            raise RuntimeError('KI-SDK fehlt im Desktop-Paket')
    import httpx

    from app.client.api import create_client_app

    async def check(home: Path) -> dict:
        app = create_client_app(home, bundle_root() / 'frontend' / 'dist')
        async with app.router.lifespan_context(app), httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url='http://127.0.0.1:8000',
        ) as client:
            health = await client.get('/health')
            page = await client.get('/')
            return {'ok': health.status_code == 200 and page.status_code == 200
                    and health.json() == {'status': 'ok', 'mode': 'client'},
                    'client_seconds': round(perf_counter() - started, 4)}

    with TemporaryDirectory(prefix='unios-startup-check-') as directory:
        result = asyncio.run(check(Path(directory)))
    print(json.dumps(result), flush=True)
    return 0 if result['ok'] else 1


def serve_recovery(home: Path, *, reason: str = 'requested', port: int = 8000) -> None:
    import uvicorn

    from app.recovery.api import create_recovery_app
    from app.recovery.config import recovery_settings
    # Never initialize the normal credential, connector, worker or database runtime.
    settings = recovery_settings(home, bundle_root() / 'frontend' / 'dist')
    uvicorn.run(create_recovery_app(settings, reason=reason), host='127.0.0.1', port=port, access_log=False)


if __name__ == "__main__":
    raise SystemExit(main())
