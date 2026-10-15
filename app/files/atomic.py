# SPDX-License-Identifier: AGPL-3.0-or-later

"""Publish immutable files only after their complete content is durable."""

import os
import time
from pathlib import Path
from uuid import uuid4

from app.files.localpath import native_path, resolve_local


def replace_atomic(source: Path, target: Path) -> None:
    """Publish the same durable payload despite a short Windows sharing lock.

    Readers such as virus scanners can temporarily deny deletion of an open
    destination. Retry only Windows access/sharing/lock errors, for at most
    eight attempts (0.63 seconds of backoff). No append, rewrite or integrity
    repair happens here; a permanent failure still reaches the caller.
    """
    physical_source, physical_target = native_path(source), native_path(target)
    for attempt in range(8):
        try:
            os.replace(physical_source, physical_target)
            return
        except OSError as exc:
            if getattr(exc, "winerror", None) not in {5, 32, 33} or attempt == 7:
                raise
            time.sleep(min(0.01 * 2 ** attempt, 0.16))


def ensure_directory(root: Path, *parts: str) -> Path:
    """Create only real directories below a configured data root."""
    native_path(root.parent).mkdir(parents=True, exist_ok=True)
    base = resolve_local(root.parent)
    current = root.parent
    for part in (root.name, *parts):
        current = current / part
        if native_path(current).is_symlink():
            raise ValueError("Ablageordner ist ein symbolischer Link")
        native_path(current).mkdir(exist_ok=True)
        if native_path(current).is_symlink() or not resolve_local(current).is_relative_to(base):
            raise ValueError("Ablageordner liegt außerhalb des Datenordners")
    return current


def write_once(target: Path, content: bytes) -> Path:
    """Atomically add a file without replacing a previous version.

    A failed write leaves only a disposable temporary file, never a partial
    document or sidecar under its final name. Linking also preserves the
    no-overwrite guarantee when another process publishes the name first.
    """
    physical = native_path(target)
    if physical.is_symlink():
        raise FileExistsError("Zieldatei ist ein symbolischer Link")
    if physical.exists():
        if physical.is_file() and physical.read_bytes() == content:
            return target
        raise FileExistsError("Zieldatei enthält bereits andere Daten")
    # Keep the temporary leaf short so otherwise valid archives also work on
    # Windows paths with the traditional 260-character limit.
    temporary = target.with_name(f".t-{uuid4().hex[:16]}.tmp")
    descriptor = os.open(native_path(temporary), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        try:
            os.link(native_path(temporary), physical)
        except FileExistsError:
            if not physical.is_symlink() and physical.is_file() and physical.read_bytes() == content:
                return target
            raise FileExistsError("Zieldatei enthält bereits andere Daten") from None
        return target
    finally:
        native_path(temporary).unlink(missing_ok=True)
