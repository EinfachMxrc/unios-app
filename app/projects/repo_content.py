# SPDX-License-Identifier: AGPL-3.0-or-later

"""Read bounded search results from an already saved Git snapshot."""

import os
import re
import subprocess
from pathlib import Path
from tempfile import TemporaryFile

from app.config import Settings


class RepositorySearchError(RuntimeError):
    """The saved repository cannot be searched safely."""


def _saved_mirror(settings: Settings, project_id: int, head: str | None) -> tuple[Path, str]:
    if project_id < 1 or not head or not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", head):
        raise RepositorySearchError("Kein durchsuchbarer Repository-Stand vorhanden")
    root = settings.data_dir / "projects" / "mirrors" / "repos"
    mirror = root / f"{project_id}.git"
    if (mirror.is_symlink() or mirror.is_junction() or not mirror.is_dir()
            or mirror.resolve().parent != root.resolve()):
        raise RepositorySearchError("Repository-Sicherung ist nicht verfügbar")
    return mirror, head


def _git_environment() -> dict[str, str]:
    environment = os.environ.copy()
    environment.update({"GIT_NO_REPLACE_OBJECTS": "1", "GIT_TERMINAL_PROMPT": "0"})
    for key in ("GIT_TRACE", "GIT_TRACE_PACKET", "GIT_TRACE_CURL", "GIT_CURL_VERBOSE"):
        environment.pop(key, None)
    return environment


def search_snapshot(settings: Settings, project_id: int, head: str | None,
                    query: str) -> list[dict[str, str | int]]:
    mirror, head = _saved_mirror(settings, project_id, head)
    query = query.strip()
    if len(query) < 2 or len(query) > 100 or any(ord(char) < 32 for char in query):
        raise RepositorySearchError("Suchbegriff muss 2 bis 100 lesbare Zeichen enthalten")
    try:
        result = subprocess.run(
            ["git", "-c", "protocol.allow=never", "--git-dir", str(mirror),
             "grep", "-n", "-z", "-I", "-F", "-i", "--no-color", "-m", "2", "-e", query, head, "--"],
            capture_output=True, check=False, timeout=10, env=_git_environment(),
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        raise RepositorySearchError("Repository-Suche ist derzeit nicht verfügbar") from exc
    if result.returncode == 1:
        return []
    if result.returncode != 0:
        raise RepositorySearchError("Repository-Suche fehlgeschlagen")
    if len(result.stdout) > 250_000:
        raise RepositorySearchError("Zu viele Treffer; Suchbegriff bitte eingrenzen")
    matches: list[dict[str, str | int]] = []
    prefix = head.encode("ascii") + b":"
    for line in result.stdout.splitlines():
        parts = line.split(b"\0", 2)
        if len(parts) != 3 or not parts[0].startswith(prefix) or not parts[1].isdigit():
            raise RepositorySearchError("Suchergebnis konnte nicht gelesen werden")
        path = parts[0][len(prefix):].decode("utf-8", errors="replace")
        excerpt = parts[2].decode("utf-8", errors="replace").strip()
        matches.append({"path": path, "line": int(parts[1]), "excerpt": excerpt[:300]})
        if len(matches) == 30:
            break
    return matches


def archive_snapshot(settings: Settings, project_id: int, head: str | None) -> bytes:
    """Create a ZIP from the immutable commit recorded by the latest mirror snapshot."""
    mirror, head = _saved_mirror(settings, project_id, head)
    with TemporaryFile() as output:
        try:
            result = subprocess.run(
                ["git", "-c", "protocol.allow=never", "--git-dir", str(mirror),
                 "archive", "--format=zip", "--prefix=projekt/", head],
                stdout=output, stderr=subprocess.DEVNULL, check=False, timeout=30,
                env=_git_environment(),
            )
        except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
            raise RepositorySearchError("Projekt-ZIP konnte nicht erstellt werden") from exc
        if result.returncode:
            raise RepositorySearchError("Projekt-ZIP konnte nicht erstellt werden")
        if output.tell() > 100_000_000:
            raise RepositorySearchError("Projekt-ZIP ist größer als 100 MB")
        output.seek(0)
        return output.read()
