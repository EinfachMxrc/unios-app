# SPDX-License-Identifier: AGPL-3.0-or-later

"""Report optional capabilities without claiming an untested login works."""

import importlib.util
import shutil
from typing import Literal

from pydantic import BaseModel

from app.capabilities.repository import CapabilityRepository
from app.config import Settings

Status = Literal["ready", "attention", "disabled", "unavailable"]


class Capability(BaseModel):
    key: str
    name: str
    status: Status
    detail: str
    href: str


def _connector_status(configured: bool, health: str | None) -> Status:
    if not configured:
        return "disabled"
    if health == "ok":
        return "ready"
    return "attention"


class CapabilityService:
    def __init__(self, repository: CapabilityRepository, settings: Settings,
                 unavailable_plugins: list[str] | None = None, anki_available: bool | None = None):
        self.repository = repository
        self.settings = settings
        self.unavailable_plugins = unavailable_plugins or []
        self.anki_available = anki_available

    def list(self) -> list[Capability]:
        health = self.repository.connector_health()
        settings = self.settings
        anki_installed = self.anki_available if self.anki_available is not None else importlib.util.find_spec("anki") is not None
        moodle_configured = bool(settings.moodle_enabled and settings.moodle_base_url and settings.moodle_token)
        moodle_status = _connector_status(moodle_configured, health.get("moodle"))
        result = [
            Capability(key="core", name="Studienraum", status="ready",
                       detail="Lokale Kurse, Notizen und Suche sind verfügbar.", href="/"),
            Capability(key="moodle", name="Moodle", status=moodle_status,
                       detail="Letzter Abgleich erfolgreich" if moodle_status == "ready" else
                              "Verbindung prüfen" if moodle_status == "attention" else "Noch nicht eingerichtet",
                       href="/setup"),
        ]
        for key, name in (("primuss", "PRIMUSS"), ("mycampus", "mycampus")):
            state = health.get(key)
            result.append(Capability(key=key, name=name,
                                     status="ready" if state == "ok" else "attention" if state else "disabled",
                                     detail="Letzter Abruf erfolgreich" if state == "ok" else
                                            "Letzten Abruf prüfen" if state else "Noch keine geprüfte Verbindung",
                                     href="/setup"))
        result.extend([
            Capability(key="anki", name="Anki", status="ready" if anki_installed else "unavailable",
                       detail="Integrierte Anki-Engine installiert" if anki_installed else
                              "Anki-Engine fehlt; der Studienraum bleibt nutzbar", href="/study"),
            Capability(key="docker", name="Docker", status="ready" if shutil.which("docker") else "unavailable",
                       detail="Installiert" if shutil.which("docker") else "Optional; für Desktop-Betrieb nicht nötig",
                       href="/system"),
            Capability(key="tailscale", name="Tailscale", status="attention" if shutil.which("tailscale") or settings.tailscale_ip else "unavailable",
                       detail="Eingerichtet; Verbindung mit „Doctor“ prüfen" if shutil.which("tailscale") or settings.tailscale_ip else
                              "Optional für den Mehrgerätebetrieb", href="/system"),
            Capability(key="syncthing", name="Syncthing", status="attention" if shutil.which("syncthing") or settings.syncthing_folder_id else "unavailable",
                       detail="Eingerichtet; Ordnerstatus mit „Doctor“ prüfen" if shutil.which("syncthing") or settings.syncthing_folder_id else
                              "Optional für den Mehrgerätebetrieb", href="/system"),
            Capability(key="ai", name="KI/MCP", status="attention" if settings.mcp_enabled else "disabled",
                       detail="Aktiviert; Berechtigungen prüfen" if settings.mcp_enabled else "Deaktiviert", href="/ai"),
            Capability(key="github", name="GitHub", status="attention" if settings.github_token else "disabled",
                       detail="Token vorhanden; Verbindung noch nicht geprüft" if settings.github_token else
                              "Nicht eingerichtet", href="/projects"),
        ])
        for name in self.unavailable_plugins:
            result.append(Capability(key=f"plugin:{name}", name=f"Connector {name}", status="unavailable",
                                     detail="Plugin konnte nicht geladen werden; der Kern läuft weiter", href="/system"))
        return result
