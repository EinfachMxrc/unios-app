# SPDX-License-Identifier: AGPL-3.0-or-later

"""Local append-only user action journal for split-host recovery."""

from __future__ import annotations

import json
import os
import re
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from hashlib import sha256
from typing import Any, Literal
from uuid import uuid4

from filelock import FileLock
from starlette.requests import Request

from app.config import Settings
from app.files.atomic import replace_atomic
from app.files.localpath import native_path
from app.host.lease import HostCoordinator

MAX_BODY_BYTES = 128_000
_SECRET_KEY = re.compile(r"token|password|secret|credential|authorization|cookie|session|webhook|api.?key|^key$|url|callback|^html$", re.IGNORECASE)


def _scrub(value: Any, depth: int = 0) -> Any:
    if depth > 12:
        return "[zu tief]"
    if isinstance(value, dict):
        return {str(key)[:100]: "[geschützt]" if _SECRET_KEY.search(str(key)) else _scrub(item, depth + 1)
                for key, item in value.items()}
    if isinstance(value, list):
        return [_scrub(item, depth + 1) for item in value[:1000]]
    if isinstance(value, str):
        return value[:20_000]
    if value is None or isinstance(value, (int, float, bool)):
        return value
    return "[unbekannt]"


class ActionJournal:
    def __init__(self, settings: Settings):
        self.path = native_path(settings.local_dir / "host-actions.jsonl")
        self.head_path = native_path(settings.local_dir / "host-actions.head.json")
        self.lock_path = native_path(settings.local_dir / "host-actions.lock")

    @staticmethod
    def _chain(raw: bytes) -> tuple[str, bool]:
        chain = bytes(32)
        valid = True
        for line in raw.splitlines(keepends=True):
            if not line.endswith(b"\n"):
                valid = False
            chain = sha256(chain + line).digest()
        return chain.hex(), valid

    def _scan_file(self) -> tuple[int, str, str, bool]:
        digest = sha256()
        chain = bytes(32)
        size = 0
        valid = True
        with self.path.open("rb") as source:
            for line in source:
                size += len(line)
                digest.update(line)
                if not line.endswith(b"\n"):
                    valid = False
                chain = sha256(chain + line).digest()
        return size, digest.hexdigest(), chain.hex(), valid

    def _read_head(self) -> dict[str, Any] | None:
        if self.head_path.is_symlink():
            raise OSError("Journal-Kopf darf kein Symlink sein")
        if not self.head_path.is_file():
            return None
        try:
            value = json.loads(self.head_path.read_text(encoding="utf-8"))
            if (not isinstance(value, dict) or type(value.get("size")) is not int or value["size"] < 0
                    or not isinstance(value.get("chain"), str)
                    or not re.fullmatch(r"[0-9a-f]{64}", value["chain"])
                    or type(value.get("trusted")) is not bool):
                raise ValueError
            return value
        except (OSError, ValueError, TypeError, KeyError) as exc:
            raise OSError("Journal-Kopf ist beschädigt") from exc

    def _write_head(self, size: int, chain: str, trusted: bool) -> None:
        if self.head_path.is_symlink():
            raise OSError("Journal-Kopf darf kein Symlink sein")
        temporary = self.head_path.with_name(f".{self.head_path.name}.{uuid4().hex}.tmp")
        try:
            with temporary.open("x", encoding="utf-8") as output:
                json.dump({"size": size, "chain": chain, "trusted": trusted}, output)
                output.flush()
                os.fsync(output.fileno())
            replace_atomic(temporary, self.head_path)
        finally:
            temporary.unlink(missing_ok=True)

    def _append(self, entry: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        raw = (json.dumps(entry, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
        with FileLock(self.lock_path, timeout=5):
            if self.path.is_symlink():
                raise OSError("Aktionsprotokoll darf kein Symlink sein")
            size = self.path.stat().st_size if self.path.is_file() else 0
            head = self._read_head()
            if head is None:
                previous = self.path.read_bytes() if size else b""
                chain, valid = self._chain(previous)
                trusted = size == 0 and valid
            else:
                if head["size"] != size:
                    raise OSError("Aktionsprotokoll und Journal-Kopf stimmen nicht überein")
                chain, trusted = head["chain"], head["trusted"]
            descriptor = os.open(self.path, os.O_WRONLY | os.O_CREAT | os.O_APPEND | getattr(os, "O_NOFOLLOW", 0), 0o600)
            with os.fdopen(descriptor, "ab") as output:
                output.write(raw)
                output.flush()
                os.fsync(output.fileno())
            self._write_head(size + len(raw), sha256(bytes.fromhex(chain) + raw).hexdigest(), trusted)

    def snapshot_anchor(self) -> tuple[int, str, bool]:
        """Pin the journal prefix included when a database snapshot was made."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with FileLock(self.lock_path, timeout=5):
            if self.path.is_symlink():
                raise OSError("Aktionsprotokoll darf kein Symlink sein")
            descriptor = os.open(self.path, os.O_WRONLY | os.O_CREAT | os.O_APPEND | getattr(os, "O_NOFOLLOW", 0), 0o600)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
            size, digest, chain, valid = self._scan_file()
            head = self._read_head()
            verified = valid and (head is None or head["size"] == size and head["chain"] == chain)
            if verified:
                self._write_head(size, chain, True)
            return size, digest, verified

    async def begin(self, request: Request, coordinator: HostCoordinator) -> str:
        lease = coordinator.current()
        if lease is None:
            raise RuntimeError("Staffelstab für Aktionsprotokoll fehlt")
        action_id = uuid4().hex
        body: Any = None
        body_state = "ohne JSON"
        content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        try:
            body_size = int(request.headers.get("content-length", "0"))
        except ValueError:
            body_size = MAX_BODY_BYTES + 1
        if request.url.path.startswith('/api/ai/mcp/v2/'):
            body_state = 'KI-Leseanfrage ohne Inhalt'
        elif content_type == "application/json" and 0 <= body_size <= MAX_BODY_BYTES:
            raw = await request.body()
            if len(raw) <= MAX_BODY_BYTES:
                try:
                    body = _scrub(json.loads(raw))
                    body_state = "erfasst"
                except (json.JSONDecodeError, UnicodeDecodeError):
                    body_state = "ungültiges JSON"
            else:
                body_state = "zu groß"
        elif content_type == "application/json":
            body_state = "zu groß oder Größe unbekannt"
        self._append({
            "kind": "intent", "id": action_id, "recorded_at": datetime.now(UTC).isoformat(),
            "device_id": lease.device_id, "generation": lease.generation,
            "method": request.method, "path": request.url.path[:500],
            "body": body, "body_state": body_state,
        })
        return action_id

    def finish(self, action_id: str, status: int) -> None:
        self._append({"kind": "result", "id": action_id, "status": status,
                      "recorded_at": datetime.now(UTC).isoformat()})

    def begin_operation(self, coordinator: HostCoordinator,
                        operation: Literal["sync", "ai-outbox", "rebuild-index", "rebuild-annotations",
                                           "migrate-annotations", "stale-sync-warning", "deadline-warnings",
                                           "weekly-digest", "backup", "mycampus-sync", "public-periods-sync",
                                           "mail-sync", "timetable-sync"]) -> str:
        """Record a host-side write before it can change the local database."""
        lease = coordinator.current()
        if lease is None:
            raise RuntimeError("Staffelstab für Aktionsprotokoll fehlt")
        action_id = uuid4().hex
        self._append({
            "kind": "intent", "id": action_id, "recorded_at": datetime.now(UTC).isoformat(),
            "device_id": lease.device_id, "generation": lease.generation,
            "method": "SYSTEM", "path": f"/internal/{operation}",
            "body": None, "body_state": "ohne JSON",
        })
        return action_id

    @contextmanager
    def tracked_operation(self, coordinator: HostCoordinator,
                          operation: Literal["sync", "ai-outbox", "rebuild-index", "rebuild-annotations",
                                             "migrate-annotations", "stale-sync-warning", "deadline-warnings",
                                             "weekly-digest", "backup", "mycampus-sync", "public-periods-sync",
                                             "mail-sync", "timetable-sync"]) -> Iterator[None]:
        action_id = self.begin_operation(coordinator, operation)
        try:
            yield
        except BaseException:
            try:
                self.finish(action_id, 500)
            except OSError:
                pass  # The unresolved intent remains visible in the conflict package.
            raise
        else:
            self.finish(action_id, 200)

    def actions_since(self, since: datetime | None, device_id: str,
                      *, anchor_bytes: int | None = None,
                      anchor_sha256: str | None = None) -> tuple[list[dict[str, Any]], bool]:
        if self.path.is_symlink() or not self.path.is_file():
            return [], False
        with FileLock(self.lock_path, timeout=5):
            raw = self.path.read_bytes()
            try:
                head = self._read_head()
            except OSError:
                head = None
        chain, chain_valid = self._chain(raw)
        head_valid = (head is not None and head["trusted"] and head["size"] == len(raw)
                      and head["chain"] == chain and chain_valid)
        anchor_valid = (anchor_bytes is not None and anchor_bytes >= 0
                        and anchor_sha256 is not None and bool(re.fullmatch(r"[0-9a-f]{64}", anchor_sha256))
                        and len(raw) >= anchor_bytes and sha256(raw[:anchor_bytes]).hexdigest() == anchor_sha256)
        intact = head_valid and (anchor_valid if since is not None else True)
        if raw and not raw.endswith(b"\n"):
            intact = False
        intents: dict[str, dict[str, Any]] = {}
        results: dict[str, tuple[int, int]] = {}
        offset = 0
        for line in raw.splitlines(keepends=True):
            offset += len(line)
            try:
                item = json.loads(line.decode("utf-8"))
                if not isinstance(item, dict) or not isinstance(item.get("id"), str):
                    raise TypeError("Ungültiger Journaleintrag")
                if item.get("kind") == "intent" and item.get("device_id") == device_id:
                    timestamp = datetime.fromisoformat(item["recorded_at"])
                    if timestamp.tzinfo is None or item["id"] in intents:
                        raise ValueError("Ungültiger oder doppelter Journaleintrag")
                    intents[item["id"]] = item
                elif item.get("kind") == "result" and isinstance(item.get("status"), int):
                    timestamp = datetime.fromisoformat(item["recorded_at"])
                    if timestamp.tzinfo is None or item["id"] in results:
                        raise ValueError("Ungültiges oder doppeltes Ergebnis")
                    results[item["id"]] = (item["status"], offset)
                elif item.get("kind") not in {"intent", "result"}:
                    raise ValueError("Unbekannter Journaleintrag")
            except (UnicodeDecodeError, ValueError, TypeError, KeyError):
                intact = False
        if results.keys() - intents.keys():
            intact = False
        actions = []
        for action_id, intent in intents.items():
            outcome = results.get(action_id)
            # The result follows the committed write. A clock adjustment must
            # not hide an action that ended after the snapshot's journal anchor.
            # Unresolved intents stay visible even when they began earlier.
            if since is not None and anchor_valid and anchor_bytes is not None and outcome is not None \
                    and outcome[1] <= anchor_bytes:
                continue
            actions.append({**intent, "outcome": "erfolgreich" if outcome is not None and
                            200 <= outcome[0] < 300 else "unklar"})
        return actions, intact
