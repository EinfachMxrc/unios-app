# SPDX-License-Identifier: AGPL-3.0-or-later
"""Read-only originals, verified immutable exports and bounded private backups."""

import csv
import hashlib
import json
import os
import re
import shutil
import sqlite3
import stat
import subprocess
import sys
import tempfile
import time
from collections.abc import Callable
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock
from typing import BinaryIO, cast
from uuid import uuid4

from filelock import FileLock, Timeout

from app.recovery.repository import RecoveryRepository

MAX_DATABASE_BYTES = 1024 * 1024 * 1024
MAX_BACKUP_BYTES = 2 * MAX_DATABASE_BYTES
MAX_BACKUPS = 5


class VerifiedExport:
    """Own an immutable spool and its single-export slot until delivery is closed."""

    def __init__(self, source: BinaryIO, release: Callable[[], None]):
        self.source = source
        self.release = release
        self.closed = False
        self.guard = Lock()

    def read(self, size: int = -1) -> bytes:
        return self.source.read(size)

    def close(self) -> None:
        with self.guard:
            if not self.closed:
                self.closed = True
                try:
                    self.source.close()
                finally:
                    self.release()


def _private_directory(path: Path) -> None:
    if path.is_symlink() or not path.parent.is_dir() or path.parent.is_symlink():
        raise ValueError('RECOVERY_UNSAFE_DESTINATION')
    path.mkdir(mode=0o700, exist_ok=True)
    if not path.is_dir() or path.is_symlink():
        raise ValueError('RECOVERY_UNSAFE_DESTINATION')
    if sys.platform != 'win32':
        details = path.stat()
        get_uid = getattr(os, 'getuid', None)
        if get_uid is None or details.st_uid != get_uid():
            raise PermissionError('RECOVERY_DESTINATION_OWNER')
        path.chmod(0o700)
        return
    # Protect the narrowly scoped recovery directory with an inheritable owner-only DACL.
    # A generic chmod on Windows does not remove ACL grants.
    import ctypes
    from ctypes import wintypes
    whoami = Path(os.environ.get('SystemRoot', r'C:\Windows')) / 'System32' / 'whoami.exe'
    result = subprocess.run([str(whoami), '/user', '/fo', 'csv', '/nh'], capture_output=True,
                            check=True, timeout=10, text=True)
    rows = list(csv.reader(result.stdout.splitlines()))
    sid = rows[0][1] if len(rows) == 1 and len(rows[0]) == 2 else ''
    if not re.fullmatch(r'S-1-[0-9-]+', sid):
        raise PermissionError('RECOVERY_DESTINATION_ACL')
    advapi = ctypes.WinDLL('advapi32', use_last_error=True)
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    advapi.ConvertStringSecurityDescriptorToSecurityDescriptorW.argtypes = [
        wintypes.LPCWSTR, wintypes.DWORD, ctypes.POINTER(ctypes.c_void_p), ctypes.c_void_p]
    advapi.ConvertStringSecurityDescriptorToSecurityDescriptorW.restype = wintypes.BOOL
    advapi.SetFileSecurityW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, ctypes.c_void_p]
    advapi.SetFileSecurityW.restype = wintypes.BOOL
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    kernel.LocalFree.restype = ctypes.c_void_p
    descriptor = ctypes.c_void_p()
    if not advapi.ConvertStringSecurityDescriptorToSecurityDescriptorW(
            f'D:P(A;OICI;FA;;;{sid})', 1, ctypes.byref(descriptor), None):
        raise PermissionError('RECOVERY_DESTINATION_ACL')
    try:
        if not advapi.SetFileSecurityW(str(path), 0x80000004, descriptor):
            raise PermissionError('RECOVERY_DESTINATION_ACL')
    finally:
        kernel.LocalFree(descriptor)


def _private_file(path: Path) -> None:
    if os.name == 'nt':
        from app.secrets import secure_windows_env
        secure_windows_env(path)
    else:
        path.chmod(0o600)


class RecoveryService:
    def __init__(self, repository: RecoveryRepository, data_dir: Path, output_dir: Path):
        self.repository = repository
        self.data_dir = data_dir.resolve()
        self.output_dir = output_dir
        self._backup_guard = Lock()
        self._export_guard = Lock()

    def _source_path(self, row: dict | None, *, note: bool = False) -> Path:
        if row is None:
            raise FileNotFoundError
        relative = Path(str(row['relative_path']).replace('\\', '/'))
        candidate = self.data_dir / relative
        path = candidate.resolve()
        root = self.data_dir / ('notes' if note else 'uni')
        limit = 2 * 1024 * 1024 if note else 512 * 1024 * 1024
        if (relative.is_absolute() or '..' in relative.parts or candidate.is_symlink()
                or not path.is_relative_to(root) or not path.is_file() or path.stat().st_size > limit
                or not re.fullmatch(r'[a-f0-9]{64}', str(row['sha256']))):
            raise ValueError('RECOVERY_UNSAFE_SOURCE')
        return path

    def verified_export(self, row: dict | None, *, note: bool = False) -> tuple[str, VerifiedExport]:
        if not self._export_guard.acquire(blocking=False):
            raise ValueError('RECOVERY_EXPORT_BUSY')
        spool = None
        try:
            path = self._source_path(row, note=note)
            limit = 2 * 1024 * 1024 if note else 512 * 1024 * 1024
            _private_directory(self.output_dir)
            export_dir = self.output_dir / 'exports'
            _private_directory(export_dir)
            if shutil.disk_usage(export_dir).free < limit + 64 * 1024 * 1024:
                raise ValueError('RECOVERY_EXPORT_SPACE')
            spool = tempfile.TemporaryFile(mode='w+b', dir=export_dir)  # noqa: SIM115 - returned owner closes after delivery.
            # Windows temp files inherit the private directory ACL; POSIX tempfile uses 600.
            before = path.stat()
            flags = os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_BINARY', 0)
            descriptor = os.open(path, flags)
            with os.fdopen(descriptor, 'rb') as source:
                opened = os.fstat(source.fileno())
                if (not stat.S_ISREG(opened.st_mode) or (before.st_dev, before.st_ino) !=
                        (opened.st_dev, opened.st_ino) or path.resolve() != path):
                    raise ValueError('RECOVERY_SOURCE_CHANGED')
                digest = hashlib.sha256()
                count = 0
                deadline = time.monotonic() + 30
                for chunk in iter(lambda: source.read(1024 * 1024), b''):
                    count += len(chunk)
                    if count > limit or time.monotonic() > deadline:
                        raise ValueError('RECOVERY_EXPORT_LIMIT')
                    digest.update(chunk)
                    spool.write(chunk)
                if row is None or digest.hexdigest() != row['sha256']:
                    raise ValueError('RECOVERY_SOURCE_CHANGED')
            spool.seek(0)
            return path.name, VerifiedExport(cast(BinaryIO, spool), self._export_guard.release)
        except BaseException:
            if spool is not None:
                spool.close()
            self._export_guard.release()
            raise

    def source(self, row: dict | None, *, note: bool = False) -> Path:
        # Compatibility verification helper. HTTP never reopens this returned path.
        _name, verified = self.verified_export(row, note=note)
        verified.close()
        return self._source_path(row, note=note)

    def _backup_usage(self) -> tuple[int, int]:
        count = total = 0
        for folder in self.output_dir.iterdir():
            if folder.name in {'exports', '.backup.lock'}:
                continue
            count += 1
            if count > MAX_BACKUPS or folder.is_symlink() or not folder.is_dir():
                raise ValueError('RECOVERY_BACKUP_QUOTA')
            entries = list(folder.iterdir())
            if len(entries) > 3:
                raise ValueError('RECOVERY_BACKUP_QUOTA')
            for entry in entries:
                if entry.is_symlink() or not entry.is_file():
                    raise ValueError('RECOVERY_UNSAFE_DESTINATION')
                total += entry.stat().st_size
                if total > MAX_BACKUP_BYTES:
                    raise ValueError('RECOVERY_BACKUP_QUOTA')
        return count, total

    def backup(self):
        if not self._backup_guard.acquire(blocking=False):
            raise ValueError('RECOVERY_BACKUP_BUSY')
        try:
            _private_directory(self.output_dir)
            try:
                with FileLock(self.output_dir / '.backup.lock', timeout=0, mode=0o600):
                    return self._backup_locked()
            except Timeout:
                raise ValueError('RECOVERY_BACKUP_BUSY') from None
        finally:
            self._backup_guard.release()

    def _backup_locked(self):
        size = self.repository.database.stat().st_size
        if size > MAX_DATABASE_BYTES or self.repository.health()['status'] != 'ok':
            raise ValueError('RECOVERY_DATABASE_UNHEALTHY')
        count, total = self._backup_usage()
        if count >= MAX_BACKUPS or total + size > MAX_BACKUP_BYTES:
            raise ValueError('RECOVERY_BACKUP_QUOTA')
        if shutil.disk_usage(self.output_dir).free < size + 64 * 1024 * 1024:
            raise ValueError('RECOVERY_BACKUP_SPACE')
        folder = self.output_dir / uuid4().hex
        _private_directory(folder)
        target = folder / 'database.sqlite3'
        descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.close(descriptor)
        _private_file(target)
        deadline = time.monotonic() + 30

        with closing(self.repository.connection()) as source, closing(sqlite3.connect(target)) as output:
            page_size = source.execute('PRAGMA page_size').fetchone()[0]

            def progress(_status, _remaining, pages):
                if time.monotonic() > deadline or pages * page_size > MAX_DATABASE_BYTES:
                    raise TimeoutError('RECOVERY_BACKUP_LIMIT')
                if total + pages * page_size > MAX_BACKUP_BYTES:
                    raise ValueError('RECOVERY_BACKUP_QUOTA')

            source.backup(output, pages=256, progress=progress, sleep=0.05)
            output.set_progress_handler(lambda: int(time.monotonic() > deadline), 10000)
            if output.execute('PRAGMA quick_check(1)').fetchone()[0] != 'ok':
                raise ValueError('RECOVERY_BACKUP_INVALID')
        digest = hashlib.sha256()
        with target.open('rb') as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b''):
                if time.monotonic() > deadline:
                    raise TimeoutError('RECOVERY_BACKUP_LIMIT')
                digest.update(chunk)
        metadata = {'id': folder.name, 'created_at': datetime.now(UTC).isoformat(),
                    'sha256': digest.hexdigest(), 'verified': True, 'kind': 'database_only'}
        manifest = folder / 'manifest.json'
        descriptor = os.open(manifest, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
            _private_file(manifest)
            json.dump(metadata, output)
            output.flush()
            os.fsync(output.fileno())
        return metadata
