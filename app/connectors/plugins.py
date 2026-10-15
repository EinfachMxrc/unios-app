# SPDX-License-Identifier: AGPL-3.0-or-later

"""Fail-closed loader for reviewed, explicitly granted connector packages."""

from importlib.metadata import entry_points

from app.config import Settings
from app.connectors.base import Connector
from app.connectors.manifest import (
    CONNECTOR_API_VERSION,
    ConnectorManifest,
    verified_registry,
)
from app.connectors.permissions import ConnectorPermissions
from app.connectors.sandbox import ContainerConnector, container_installed
from app.connectors.sdk import PermissionedConnector, connector_context
from app.connectors.selection import ConnectorSelection
from app.institutions import load_institution
from app.secrets import load_connector_secret

GROUP = "unios.connectors.v1"
METHODS = ("check_auth", "list_courses", "fetch_changes", "download", "health")


class ConnectorPluginError(ValueError):
    pass


def listed_connectors(settings: Settings) -> list[dict]:
    """Describe registry items and local grants without importing plugin code."""
    registry = verified_registry()
    permissions = ConnectorPermissions(settings.local_dir)
    profile = load_institution(settings.institution_slug)
    return [{**manifest.model_dump(mode="json"), "fingerprint": manifest.fingerprint,
             "approved": permissions.is_approved(manifest),
             "profile_enabled": bool(profile.connectors.get(manifest.id)
                                     and profile.connectors[manifest.id].enabled),
             "installed": container_installed(manifest) if manifest.runtime == "container" else None}
            for manifest in sorted(registry.values(), key=lambda item: item.id)]


def _scoped_secrets(manifest: ConnectorManifest) -> dict[str, str]:
    values: dict[str, str] = {}
    for alias in manifest.secrets:
        value = load_connector_secret(manifest.id, alias)
        if not value:
            raise ConnectorPluginError(f"Konnektor '{manifest.id}' braucht sein eigenes Secret '{alias}'")
        values[alias] = value
    return values


def load_connector_plugins(settings: Settings, *, include_saved_selection: bool = True) -> list[Connector]:
    requested = [item.strip() for item in settings.connector_plugins.split(",") if item.strip()]
    if len(requested) != len(set(requested)) or "moodle" in requested:
        raise ConnectorPluginError("Konnektor-Namen müssen eindeutig sein und dürfen nicht 'moodle' heißen")
    if include_saved_selection:
        selection = ConnectorSelection(settings.local_dir)
        requested = sorted(selection.effective(set(requested)))
    if "moodle" in requested:
        raise ConnectorPluginError("Konnektor-Namen müssen eindeutig sein und dürfen nicht 'moodle' heißen")
    if not requested:
        return []
    registry = verified_registry()
    approvals = ConnectorPermissions(settings.local_dir)
    profile = load_institution(settings.institution_slug)
    available = {item.name: item for item in entry_points(group=GROUP)}
    connectors: list[Connector] = []
    for name in requested:
        manifest = registry.get(name)
        if manifest is None or manifest.review_status != "verified":
            raise ConnectorPluginError(f"Konnektor '{name}' ist nicht in der geprüften Registry")
        if manifest.api_version != CONNECTOR_API_VERSION:
            raise ConnectorPluginError(f"Konnektor '{name}' verwendet eine nicht unterstützte API-Version")
        binding = profile.connectors.get(name)
        if binding is None or not binding.enabled:
            raise ConnectorPluginError(f"Konnektor '{name}' ist in diesem Hochschulprofil nicht aktiviert")
        try:
            approved = approvals.is_approved(manifest)
        except (OSError, ValueError) as exc:
            raise ConnectorPluginError(f"Konnektor-Freigaben konnten nicht geprüft werden: {type(exc).__name__}") from None
        if not approved:
            raise ConnectorPluginError(f"Konnektor '{name}' benötigt eine erneute Berechtigungsfreigabe")
        if manifest.runtime == "trusted_python" and not settings.allow_trusted_python_connectors:
            raise ConnectorPluginError("Python-Connectoren im Host-Prozess sind nicht aktiviert")
        if manifest.runtime == "container" and not container_installed(manifest):
            raise ConnectorPluginError(f"Geprüftes Container-Image für '{name}' fehlt")
        secrets = _scoped_secrets(manifest)
        context = connector_context(manifest, settings.institution_slug,
                                    dict(binding.config), secrets)
        if manifest.runtime == "container":
            try:
                connector = ContainerConnector(manifest, context)
            except ValueError as exc:
                raise ConnectorPluginError(str(exc)) from None
        else:
            entry = available.get(name)
            if entry is None:
                raise ConnectorPluginError(f"Konnektor '{name}' ist nicht installiert")
            dist = getattr(entry, "dist", None)
            if dist is None or not hasattr(dist, "metadata") or not hasattr(dist, "version"):
                raise ConnectorPluginError(f"Konnektor '{name}' hat keine überprüfbaren Paketmetadaten")
            package_name = str(dist.metadata.get("Name", "")).lower().replace("_", "-")
            if package_name != manifest.package.lower().replace("_", "-") or dist.version != manifest.package_version:
                raise ConnectorPluginError(f"Konnektor '{name}' hat nicht die geprüfte Paketversion")
            try:
                factory = entry.load()
                connector = factory(context)
            except Exception as exc:  # noqa: BLE001 - installed packages can fail in arbitrary ways
                raise ConnectorPluginError(f"Konnektor '{name}' konnte nicht geladen werden: {type(exc).__name__}") from None
            if getattr(connector, "name", None) != name or not all(
                callable(getattr(connector, method, None)) for method in METHODS
            ):
                raise ConnectorPluginError(f"Konnektor '{name}' erfüllt die öffentliche API v1 nicht")
        connectors.append(PermissionedConnector(connector, manifest))
    return connectors
