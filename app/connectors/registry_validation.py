# SPDX-License-Identifier: AGPL-3.0-or-later

"""Release checks for reviewed connector and university registry changes."""

import json
from pathlib import Path

from pydantic import ValidationError

from app.connectors.manifest import (
    ConnectorManifest,
    registered_profiles,
    verified_registry,
)
from app.institutions import load_institution


def validate_registry() -> list[str]:
    errors: list[str] = []
    try:
        registry = verified_registry()
        profiles = registered_profiles()
    except (KeyError, TypeError, ValueError, ValidationError) as exc:
        return [f"Registry ist ungültig: {type(exc).__name__}: {exc}"]
    for manifest in registry.values():
        if manifest.review_status == "verified" and manifest.runtime != "container" and manifest.id != "example_university":
            errors.append(f"{manifest.id}: geprüfter Community-Code braucht einen Container")
    for profile in profiles:
        slug = profile.get("slug")
        if not isinstance(slug, str):
            errors.append("Hochschulprofil ohne gültigen Namen")
            continue
        try:
            institution = load_institution(slug)
        except (OSError, ValueError, ValidationError) as exc:
            errors.append(f"{slug}: Profil fehlt oder ist ungültig ({type(exc).__name__})")
            continue
        published = profile.get("connectors")
        if not isinstance(published, list) or set(published) != set(institution.connectors):
            errors.append(f"{slug}: Registry und Profilbindung stimmen nicht überein")
        for name in institution.connectors:
            if name not in registry and name not in {"moodle", "primuss", "mycampus", "mail"}:
                errors.append(f"{slug}: unbekannter Connector {name}")
    return errors


def validate_upgrade(previous: Path) -> list[str]:
    """Existing IDs remain stable; a changed manifest needs a new exact version."""
    raw = json.loads(previous.read_text(encoding="utf-8"))
    old = {item.id: item for item in (ConnectorManifest.model_validate(value)
                                      for value in raw["connectors"])}
    current = verified_registry()
    errors: list[str] = []
    for name, before in old.items():
        after = current.get(name)
        if after is None:
            errors.append(f"{name}: bestehende Connector-ID wurde entfernt")
        elif after.fingerprint != before.fingerprint and after.package_version == before.package_version:
            errors.append(f"{name}: Manifest geändert ohne neue Paketversion")
    return errors
