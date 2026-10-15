# SPDX-License-Identifier: AGPL-3.0-or-later

"""Explicit, read-only Git mirror updates with immutable ref snapshots."""

import json
import os
import re
import subprocess
from dataclasses import dataclass
from datetime import UTC, datetime
from hashlib import sha256
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

from filelock import FileLock, Timeout

from app.config import Settings
from app.files.atomic import ensure_directory, write_once
from app.projects.github import valid_repository


class MirrorError(RuntimeError):
    """A mirror cannot be safely created or updated."""


@dataclass(frozen=True)
class MirrorResult:
    repository: str
    fetched_at: datetime
    manifest_path: str
    manifest_sha256: str
    refs_count: int
    head: str | None


def _git(arguments: list[str], *, hooks: Path, protocol: str, timeout: int = 180,
         input_text: str | None = None, allow_failure: bool = False) -> str | None:
    environment = os.environ.copy()
    environment.update({"GIT_TERMINAL_PROMPT": "0", "GCM_INTERACTIVE": "Never", "GIT_NO_REPLACE_OBJECTS": "1"})
    for key in ("GIT_TRACE", "GIT_TRACE_PACKET", "GIT_TRACE_CURL", "GIT_CURL_VERBOSE"):
        environment.pop(key, None)
    command = ["git", "-c", "protocol.allow=never", "-c", f"protocol.{protocol}.allow=always",
               "-c", "gc.auto=0", "-c", "maintenance.auto=false", "-c", f"core.hooksPath={hooks}",
               *arguments]
    try:
        result = subprocess.run(command, input=input_text.encode("utf-8") if input_text is not None else None,
                                capture_output=True, timeout=timeout, check=False, env=environment)
    except FileNotFoundError as exc:
        raise MirrorError("Git ist nicht installiert") from exc
    except subprocess.TimeoutExpired as exc:
        raise MirrorError("Git-Spiegelung hat zu lange gedauert") from exc
    if result.returncode:
        if allow_failure:
            return None
        # Git can echo credential details. Never include stderr/stdout in API or logs.
        raise MirrorError("Git-Spiegelung fehlgeschlagen; Repository-Zugriff und Netzwerk prüfen")
    return result.stdout.decode("utf-8", errors="replace").strip()


def _safe_existing(path: Path, root: Path) -> None:
    if (path.is_symlink() or path.is_junction() or not path.is_dir()
            or path.resolve().parent != root.resolve()):
        raise MirrorError("Repository-Ablage ist kein sicherer Ordner")


def mirror_repository(settings: Settings, project_id: int, repository: str,
                      *, test_remote: str | None = None, test_protocol: str = "https") -> MirrorResult:
    """Mirror a validated GitHub repo; test_remote is only used by local fixture tests."""
    if project_id < 1 or not valid_repository(repository):
        raise MirrorError("Ungültiges Projekt oder GitHub-Repository")
    protocol = test_protocol if test_remote else "https"
    remote = test_remote or f"https://github.com/{repository}.git"
    if protocol not in {"https", "file"} or (test_remote is None and protocol != "https"):
        raise MirrorError("Unzulässiges Git-Protokoll")
    root = ensure_directory(settings.data_dir, "projects", "mirrors", "repos")
    hooks = ensure_directory(settings.local_dir, "git-disabled-hooks")
    lock_root = ensure_directory(settings.local_dir, "projects")
    target = root / f"{project_id}.git"
    try:
        with FileLock(str(lock_root / f"mirror-{project_id}.lock"), timeout=0):
            if target.exists() or target.is_symlink():
                _safe_existing(target, root)
                bare = _git(["-C", str(target), "rev-parse", "--is-bare-repository"],
                            hooks=hooks, protocol=protocol, timeout=20)
                origin = _git(["-C", str(target), "remote", "get-url", "origin"],
                              hooks=hooks, protocol=protocol, timeout=20)
                if bare != "true" or origin != remote:
                    raise MirrorError("Gespiegeltes Repository passt nicht zum Projekt")
                _git(["-C", str(target), "fetch", "--no-prune", "--no-tags", "origin",
                      "+refs/heads/*:refs/heads/*", "+refs/tags/*:refs/tags/*",
                      "+refs/pull/*:refs/pull/*"],
                     hooks=hooks, protocol=protocol)
            else:
                with TemporaryDirectory(prefix=f".{project_id}-", dir=root) as temporary:
                    staging = Path(temporary) / "repository.git"
                    _git(["clone", "--mirror", "--no-hardlinks", "--", remote, str(staging)],
                         hooks=hooks, protocol=protocol)
                    if target.exists() or target.is_symlink():
                        raise MirrorError("Repository wurde gleichzeitig angelegt")
                    staging.rename(target)
            _safe_existing(target, root)
            raw_refs = _git(["-C", str(target), "for-each-ref", "--format=%(refname) %(objectname)"],
                            hooks=hooks, protocol=protocol, timeout=20) or ""
            refs: dict[str, str] = {}
            for line in raw_refs.splitlines():
                name, separator, oid = line.partition(" ")
                if name.startswith("refs/unios/"):
                    continue
                if (not separator or not name.startswith("refs/")
                        or not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", oid)):
                    raise MirrorError("Git-Referenzen konnten nicht geprüft werden")
                refs[name] = oid
            if len(refs) > 5000:
                raise MirrorError("Repository hat zu viele Referenzen für einen Schnappschuss")
            snapshot_id = uuid4().hex
            if refs:
                updates = "".join(f"create refs/unios/snapshots/{snapshot_id}/{name.removeprefix('refs/')} {oid}\n"
                                  for name, oid in sorted(refs.items()))
                _git(["-C", str(target), "update-ref", "--stdin"], hooks=hooks, protocol=protocol,
                     timeout=30, input_text=updates)
            head = _git(["-C", str(target), "rev-parse", "--verify", "HEAD"],
                        hooks=hooks, protocol=protocol, timeout=20, allow_failure=True)
            fetched_at = datetime.now(UTC)
            manifest = {"schema": 1, "project_id": project_id, "repository": repository,
                        "fetched_at": fetched_at.isoformat(), "snapshot_id": snapshot_id,
                        "head": head, "refs": refs}
            content = (json.dumps(manifest, ensure_ascii=False, sort_keys=True) + "\n").encode("utf-8")
            manifest_dir = ensure_directory(settings.data_dir, "projects", "mirrors", "snapshots")
            manifest_path = manifest_dir / f"{snapshot_id}.json"
            write_once(manifest_path, content)
            return MirrorResult(repository=repository, fetched_at=fetched_at,
                                manifest_path=manifest_path.relative_to(settings.data_dir).as_posix(),
                                manifest_sha256=sha256(content).hexdigest(), refs_count=len(refs), head=head)
    except Timeout as exc:
        raise MirrorError("Git-Spiegelung läuft bereits") from exc
