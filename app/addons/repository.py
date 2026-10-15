# SPDX-License-Identifier: AGPL-3.0-or-later

"""Append-only local add-on catalog/state and narrowly scoped data queries."""

import json
import os
from datetime import UTC, datetime
from importlib.resources import files
from pathlib import Path
from typing import Any

from filelock import FileLock
from sqlalchemy import select

from app.addons.manifest import ExtensionManifest, ExtensionManifestV1, manifest_adapter
from app.db.models import Course, LearningTopic, StudyBlockSuggestion, utc_now

MAX_CATALOG_BYTES = 2 * 1024 * 1024
MAX_EVENTS_BYTES = 4 * 1024 * 1024


class AddonRepository:
    def __init__(self, local_dir: Path, factory: Any):
        self.catalog_path = local_dir / "addon-catalog.jsonl"
        self.events_path = local_dir / "addon-events.jsonl"
        self.factory = factory

    @staticmethod
    def builtin() -> dict[str, ExtensionManifestV1]:
        raw = json.loads(files("app.addons").joinpath("registry.json").read_text(encoding="utf-8"))
        if raw.get("schema_version") != 1 or not isinstance(raw.get("addons"), list):
            raise ValueError("Ungültige Addon-Registry")
        manifests = [ExtensionManifestV1.model_validate(item) for item in raw["addons"]]
        if len({item.id for item in manifests}) != len(manifests):
            raise ValueError("Doppelte Addon-ID")
        return {item.id: item for item in manifests}

    @staticmethod
    def _records(path: Path, maximum: int) -> list[dict[str, Any]]:
        if path.is_symlink():
            raise ValueError("Ungültiger Addon-Speicher")
        if not path.exists():
            return []
        if path.stat().st_size > maximum:
            raise ValueError("Ungültiger Addon-Speicher")
        records: list[dict[str, Any]] = []
        with path.open(encoding="utf-8") as stream:
            for line in stream:
                value = json.loads(line)
                if not isinstance(value, dict):
                    raise TypeError("Ungültiger Addon-Eintrag")
                records.append(value)
        return records

    @staticmethod
    def _append(path: Path, event: dict[str, Any], maximum: int) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with FileLock(f"{path}.lock", timeout=5):
            if path.is_symlink():
                raise ValueError("Ungültiger Addon-Speicher")
            encoded = json.dumps(event, sort_keys=True, ensure_ascii=False) + "\n"
            if len(encoded.encode("utf-8")) + (path.stat().st_size if path.exists() else 0) > maximum:
                raise ValueError("Addon-Speicher ist voll")
            flags = os.O_APPEND | os.O_CREAT | os.O_WRONLY | getattr(os, "O_NOFOLLOW", 0)
            with os.fdopen(os.open(path, flags, 0o600),
                           "a", encoding="utf-8") as stream:
                stream.write(encoded)
                stream.flush()
                os.fsync(stream.fileno())

    def catalog(self) -> dict[str, ExtensionManifest]:
        manifests: dict[str, ExtensionManifest] = dict(self.builtin())
        builtin_ids = set(manifests)
        for event in self._records(self.catalog_path, MAX_CATALOG_BYTES):
            if event.get("action") != "import" or not isinstance(event.get("manifest"), dict):
                raise ValueError("Ungültiger Addon-Katalogeintrag")
            manifest = manifest_adapter.validate_python(event["manifest"])
            if manifest.id in builtin_ids:
                raise ValueError("Ein lokales Addon überschreibt eine Core-ID")
            manifests[manifest.id] = manifest
        return manifests

    def import_manifest(self, manifest: ExtensionManifest) -> None:
        if manifest.id in self.builtin() or manifest.id.startswith("org.unios."):
            raise ValueError("Diese Addon-ID ist für UniOS reserviert")
        self._append(self.catalog_path, {"action": "import", "at": datetime.now(UTC).isoformat(),
                                         "manifest": manifest.model_dump(mode="json")}, MAX_CATALOG_BYTES)

    def status(self) -> dict[str, dict[str, Any]]:
        states: dict[str, dict[str, Any]] = {}
        for event in self._records(self.events_path, MAX_EVENTS_BYTES):
            addon_id, action, fingerprint = event.get("id"), event.get("action"), event.get("fingerprint")
            if not isinstance(addon_id, str) or not isinstance(fingerprint, str) or action not in {
                "install", "approve", "enable", "disable", "revoke", "uninstall",
            }:
                raise ValueError("Ungültiges Addon-Ereignis")
            state = states.setdefault(addon_id, {"installed": None, "approved": None, "enabled": False})
            if action == "install":
                state.update(installed=fingerprint, approved=None, enabled=False)
            elif action == "approve" and state["installed"] == fingerprint:
                state["approved"] = fingerprint
            elif action == "enable" and state["approved"] == fingerprint:
                state["enabled"] = True
            elif action == "disable":
                state["enabled"] = False
            elif action == "revoke":
                state.update(approved=None, enabled=False)
            elif action == "uninstall":
                state.update(installed=None, approved=None, enabled=False)
        return states

    def append_action(self, manifest: ExtensionManifest, action: str) -> None:
        if action not in {"install", "approve", "enable", "disable", "revoke", "uninstall"}:
            raise ValueError("Ungültige Addon-Aktion")
        self._append(self.events_path, {"id": manifest.id, "action": action,
                                        "fingerprint": manifest.fingerprint,
                                        "at": datetime.now(UTC).isoformat()}, MAX_EVENTS_BYTES)

    def courses(self, limit: int, course_id: int | None = None) -> list[dict[str, str]]:
        statement = select(Course.id, Course.name).order_by(Course.name).limit(limit)
        if course_id is not None:
            statement = statement.where(Course.id == course_id)
        with self.factory() as session:
            rows = session.execute(statement).all()
        return [{"label": name, "href": f"/courses/{identifier}"} for identifier, name in rows]

    def study_blocks(self, limit: int, course_id: int | None = None) -> list[dict[str, str]]:
        statement = (select(LearningTopic.name, StudyBlockSuggestion.starts_at)
                     .join(StudyBlockSuggestion, StudyBlockSuggestion.topic_id == LearningTopic.id)
                     .where(StudyBlockSuggestion.status == "accepted",
                            StudyBlockSuggestion.starts_at >= utc_now())
                     .order_by(StudyBlockSuggestion.starts_at).limit(limit))
        if course_id is not None:
            statement = statement.where(LearningTopic.course_id == course_id)
        with self.factory() as session:
            rows = session.execute(statement).all()
        return [{"label": name, "detail": starts_at.isoformat(), "href": "/learning"}
                for name, starts_at in rows]
