# SPDX-License-Identifier: AGPL-3.0-or-later
"""A recovery window starts even when the database or a plugin is broken."""

import platform
import re
import sqlite3
import subprocess
from importlib.metadata import PackageNotFoundError, version
from urllib.parse import quote
from uuid import UUID

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from starlette.background import BackgroundTask

from app.config import Settings
from app.recovery.repository import RecoveryRepository
from app.recovery.service import RecoveryService
from app.security import extract_hostname, is_dashboard_request
from app.web.contracts import RecoveryStatusView


def create_recovery_app(settings: Settings, *, reason: str = 'requested') -> FastAPI:
    # Independent imports and no migrations, lease acquisition, worker or secrets loading.
    service = RecoveryService(RecoveryRepository(settings.local_dir / 'uni_os.sqlite3'),
                              settings.data_dir, settings.local_dir / 'recovery-backups')
    app = FastAPI(title='UniOS Recovery', docs_url=None, redoc_url=None, openapi_url=None)

    @app.middleware('http')
    async def guard(request: Request, call_next):
        if extract_hostname(request.headers.get('host', '')).casefold() not in settings.allowed_host_names:
            return JSONResponse({'code': 'RECOVERY_UNKNOWN_HOST'}, status_code=400)
        if not is_dashboard_request(request):
            return JSONResponse({'code': 'RECOVERY_FOREIGN_ORIGIN'}, status_code=403)
        if settings.server_mode:
            from app.session_api import SESSION_COOKIE_NAME
            from app.sessions import SessionStore
            if request.url.path.startswith('/api/') and not SessionStore(settings.local_dir).verify_session_readonly(
                    request.cookies.get(SESSION_COOKIE_NAME, '')):
                return JSONResponse({'code': 'RECOVERY_DEVICE_NOT_PAIRED'}, status_code=401)
        elif request.client is None or request.client.host not in {'127.0.0.1', '::1', 'testclient'}:
            return JSONResponse({'code': 'RECOVERY_LOCAL_ONLY'}, status_code=403)
        response = await call_next(request)
        response.headers['Cache-Control'] = 'private, no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['Referrer-Policy'] = 'no-referrer'
        return response

    @app.exception_handler(sqlite3.Error)
    async def database_error(request, error):
        return JSONResponse({'code': 'RECOVERY_DATABASE_UNAVAILABLE'}, status_code=503)

    @app.get('/health')
    def health():
        return {'status': 'ok', 'mode': 'recovery'}  # Window ready, independent of database health.

    @app.get('/api/recovery/status', response_model=RecoveryStatusView, response_model_exclude_unset=True)
    def status():
        return {'mode': 'recovery', 'reason': reason if reason in {'requested', 'startup_failed'} else 'startup_failed',
                'database': service.repository.health(), 'background_work': False}

    @app.get('/api/recovery/diagnostics')
    def diagnostics():
        database = service.repository.health()
        schema = database.get('schema')
        try:
            app_version = version('unios')
        except PackageNotFoundError:
            app_version = 'unknown'
        return {'app_version': app_version, 'schema_version': schema if isinstance(schema, str) and
                re.fullmatch(r'[a-f0-9]{12}', schema) else None, 'os': platform.system(),
                'mode': 'recovery', 'error_codes': [] if database['status'] == 'ok' else ['RECOVERY_DATABASE_UNAVAILABLE']}

    @app.get('/api/recovery/notes')
    def notes(after: str = Query(default='', max_length=36)):
        rows = service.repository.notes(after)
        return {'items': rows[:50], 'next_after': rows[49]['id'] if len(rows) > 50 else None}

    @app.get('/api/recovery/files')
    def files(after: int = Query(default=0, ge=0)):
        rows = service.repository.files(after)
        return {'items': rows[:50], 'next_after': rows[49]['id'] if len(rows) > 50 else None}

    def download(row, note=False):
        try:
            name, source = service.verified_export(row, note=note)

            def chunks():
                try:
                    yield from iter(lambda: source.read(1024 * 1024), b'')
                finally:
                    source.close()

            return StreamingResponse(chunks(), media_type='text/plain' if note else 'application/octet-stream',
                                     headers={'Content-Disposition': "attachment; filename*=UTF-8''" + quote(name)},
                                     background=BackgroundTask(source.close))
        except FileNotFoundError:
            raise HTTPException(404, 'RECOVERY_SOURCE_MISSING') from None
        except (ValueError, OSError, subprocess.SubprocessError):
            raise HTTPException(409, 'RECOVERY_SOURCE_UNVERIFIED') from None

    @app.get('/api/recovery/notes/{identifier}')
    def note(identifier: UUID):
        return download(service.repository.note(str(identifier)), note=True)

    @app.get('/api/recovery/files/{identifier}')
    def file(identifier: int):
        return download(service.repository.file(identifier))

    @app.post('/api/recovery/backup')
    def backup():
        try:
            return service.backup()
        except (ValueError, OSError, sqlite3.Error, subprocess.SubprocessError):
            raise HTTPException(503, 'RECOVERY_BACKUP_FAILED') from None

    @app.get('/{path:path}')
    def surface(path: str):
        if path.startswith(('api/', 'files/')):
            raise HTTPException(404)
        candidate = (settings.react_dist_dir / path).resolve()
        root = settings.react_dist_dir.resolve()
        if candidate.is_relative_to(root) and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(root / 'index.html')

    return app
