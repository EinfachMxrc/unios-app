# SPDX-License-Identifier: AGPL-3.0-or-later

"""Add-on lifecycle, server-side grants and core-rendered view contracts."""

import hashlib
from subprocess import TimeoutExpired
from threading import BoundedSemaphore, RLock
from typing import Any

from app.addons.manifest import (
    VIEW_PERMISSION,
    ExtensionManifest,
    ExtensionManifestV2,
    ExtensionSlot,
    PageSpec,
    WidgetSpec,
)
from app.addons.repository import AddonRepository
from app.addons.runtime import execute
from app.files.atomic import ensure_directory, write_once


class AddonError(ValueError):
    def __init__(self, message: str, status_code: int = 409):
        super().__init__(message)
        self.status_code = status_code


class AddonService:
    def __init__(self, repository: AddonRepository):
        self.repository = repository
        self._lock = RLock()
        self._execution_slots = BoundedSemaphore(2)

    @staticmethod
    def _flags(manifest: ExtensionManifest, state: dict[str, Any]) -> dict[str, bool]:
        installed = state.get("installed") == manifest.fingerprint
        approved = installed and state.get("approved") == manifest.fingerprint
        return {"installed": installed, "approved": approved,
                "enabled": approved and state.get("enabled") is True}

    def catalog(self) -> list[dict[str, Any]]:
        manifests = self.repository.catalog()
        states = self.repository.status()
        builtin = self.repository.builtin()
        return [{**manifest.model_dump(mode="json"), "fingerprint": manifest.fingerprint,
                 "source": "builtin" if manifest.id in builtin else "local",
                 **self._flags(manifest, states.get(manifest.id, {}))}
                for manifest in sorted(manifests.values(), key=lambda item: item.name.casefold())]

    def import_manifest(self, manifest: ExtensionManifest) -> dict[str, Any]:
        with self._lock:
            current = self.repository.catalog().get(manifest.id)
            if current and current.fingerprint == manifest.fingerprint:
                return {"id": manifest.id, "fingerprint": manifest.fingerprint, "imported": False}
            if current and tuple(map(int, manifest.version.split("."))) <= tuple(map(int, current.version.split("."))):
                raise AddonError("Neue Manifestfassung braucht eine höhere Version")
            try:
                self.repository.import_manifest(manifest)
            except ValueError as exc:
                raise AddonError(str(exc), 400) from None
            return {"id": manifest.id, "fingerprint": manifest.fingerprint, "imported": True}

    def _manifest(self, addon_id: str, fingerprint: str) -> ExtensionManifest:
        manifest = self.repository.catalog().get(addon_id)
        if manifest is None:
            raise AddonError("Addon nicht im lokalen Katalog", 404)
        if manifest.fingerprint != fingerprint:
            raise AddonError("Manifest hat sich geändert; bitte Rechte erneut prüfen")
        return manifest

    def action(self, addon_id: str, fingerprint: str, action: str) -> dict[str, Any]:
        with self._lock:
            manifest = self._manifest(addon_id, fingerprint)
            flags = self._flags(manifest, self.repository.status().get(addon_id, {}))
            if action == "install":
                if flags["installed"]:
                    return {"id": addon_id, **flags}
            elif action == "approve":
                if not flags["installed"]:
                    raise AddonError("Addon zuerst installieren")
                if flags["approved"]:
                    return {"id": addon_id, **flags}
            elif action == "enable":
                if not flags["approved"]:
                    raise AddonError("Addon zuerst freigeben")
                if flags["enabled"]:
                    return {"id": addon_id, **flags}
            elif action in {"disable", "revoke", "uninstall"}:
                if not flags["installed"]:
                    raise AddonError("Addon ist nicht installiert")
            else:
                raise AddonError("Unbekannte Addon-Aktion", 400)
            self.repository.append_action(manifest, action)
            return {"id": addon_id,
                    **self._flags(manifest, self.repository.status().get(addon_id, {}))}

    def _view(self, manifest: ExtensionManifest, spec: WidgetSpec | PageSpec,
              course_id: int | None = None) -> dict[str, Any]:
        required = VIEW_PERMISSION.get(spec.view)
        if required is not None and required not in manifest.permissions:
            raise AddonError("Berechtigung für Addon-Ansicht fehlt", 403)
        result: dict[str, Any] = {"view": spec.view, "title": spec.title, "body": spec.body}
        if spec.view == "courses":
            result["items"] = self.repository.courses(spec.limit, course_id)
        elif spec.view == "study_blocks":
            result["items"] = self.repository.study_blocks(spec.limit, course_id)
        elif spec.view == "focus_timer" and isinstance(spec, PageSpec):
            result["duration_minutes"] = spec.duration_minutes
            result["break_minutes"] = spec.break_minutes
        return result

    def slots(self, slot: ExtensionSlot, course_id: int | None = None) -> list[dict[str, Any]]:
        manifests = self.repository.catalog()
        states = self.repository.status()
        rendered = []
        for manifest in sorted(manifests.values(), key=lambda item: item.name.casefold()):
            if not self._flags(manifest, states.get(manifest.id, {}))["enabled"]:
                continue
            for widget in manifest.widgets:
                if widget.slot == slot:
                    rendered.append({"addon_id": manifest.id, "slot": slot,
                                     "page_url": f"/addons/{manifest.id}" if manifest.page else None,
                                     **self._view(manifest, widget, course_id)})
        return rendered[:4]

    def page(self, addon_id: str) -> dict[str, Any]:
        manifest = self.repository.catalog().get(addon_id)
        if manifest is None or manifest.page is None:
            raise AddonError("Addon-Seite nicht gefunden", 404)
        state = self.repository.status().get(addon_id, {})
        if not self._flags(manifest, state)["enabled"]:
            raise AddonError("Addon ist nicht freigegeben und aktiviert", 403)
        return {"addon_id": addon_id, "runtime": manifest.runtime, "fingerprint": manifest.fingerprint, **self._view(manifest, manifest.page)}

    def navigation(self) -> list[dict[str, str]]:
        manifests = self.repository.catalog()
        states = self.repository.status()
        return [{"id": item.id, "name": item.name, "url": f"/addons/{item.id}"}
                for item in sorted(manifests.values(), key=lambda value: value.name.casefold())
                if item.page is not None and self._flags(item, states.get(item.id, {}))["enabled"]]

    def import_package(self, manifest: ExtensionManifestV2, binary: bytes):
        if len(binary) > 2_000_000 or hashlib.sha256(binary).hexdigest() != manifest.wasm_sha256:
            raise AddonError("WASM-Paket passt nicht zur Prüfsumme", 422)
        folder = ensure_directory(self.repository.catalog_path.parent, "addon-modules")
        write_once(folder / (manifest.wasm_sha256 + ".wasm"), binary)
        return self.import_manifest(manifest)

    def execute(self, addon_id: str, fingerprint: str):
        manifest = self._manifest(addon_id, fingerprint)
        if not isinstance(manifest, ExtensionManifestV2) or not self._flags(manifest, self.repository.status().get(addon_id, {}))["enabled"]:
            raise AddonError("Ausführbares Addon ist nicht freigegeben", 403)
        folder = self.repository.catalog_path.parent / "addon-modules"
        if folder.is_symlink() or folder.resolve().parent != self.repository.catalog_path.parent.resolve():
            raise AddonError("Ungültiger WASM-Ordner", 422)
        path = folder / (manifest.wasm_sha256 + ".wasm")
        if path.is_symlink() or not path.is_file() or path.stat().st_size > 2_000_000:
            raise AddonError("WASM-Paket fehlt oder ist ungültig", 422)
        binary = path.read_bytes()
        if hashlib.sha256(binary).hexdigest() != manifest.wasm_sha256:
            raise AddonError("WASM-Prüfsumme stimmt nicht", 422)
        data = {}
        if "courses.read" in manifest.permissions:
            data["courses"] = self.repository.courses(30)
        if "study_blocks.read" in manifest.permissions:
            data["study_blocks"] = self.repository.study_blocks(30)
        if not self._execution_slots.acquire(blocking=False):
            raise AddonError("Addon-Ausführung ist ausgelastet", 429)
        try:
            result = execute(binary, data)
        except (OSError, ValueError, TimeoutError, TimeoutExpired):
            raise AddonError("Addon-Ausführung abgebrochen (Rechenbudget, Zeit oder ungültige Ausgabe)", 422) from None
        finally:
            self._execution_slots.release()
        self._manifest(addon_id, fingerprint)
        if not self._flags(manifest, self.repository.status().get(addon_id, {}))["enabled"]:
            raise AddonError("Freigabe wurde während der Ausführung entzogen", 403)
        return result
