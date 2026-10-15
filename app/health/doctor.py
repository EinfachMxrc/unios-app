# SPDX-License-Identifier: AGPL-3.0-or-later

"""Read-only local diagnostics for the CLI doctor command."""

from __future__ import annotations

import json
import os
import platform
import shutil
import sqlite3
import subprocess
import xml.etree.ElementTree as ET
from contextlib import closing
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

import httpx
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

from app.config import Settings
from app.host.conflicts import has_syncthing_conflicts
from app.host.handoff import _local_database_path
from app.host.lease import HostCoordinator, HostLeaseError, LeaseRecord
from app.host.snapshots import SnapshotVerificationError, verified_handoff_snapshot
from app.host.syncthing import folder_sync_status

Status = Literal["ok", "warning", "unknown", "not_configured"]


@dataclass(frozen=True)
class Diagnostic:
    status: Status
    message: str


def _database_reachable(settings: Settings) -> bool:
    try:
        url = make_url(settings.database_url)
        if url.get_backend_name() != "sqlite" or not url.database or url.database == ":memory:":
            return False
        database = Path(url.database).resolve()
        if not database.is_file():
            return False
        with closing(sqlite3.connect(f"{database.as_uri()}?mode=ro", uri=True)) as connection:
            return connection.execute("SELECT 1").fetchone() == (1,)
    except (OSError, sqlite3.Error, TypeError, ValueError, ArgumentError):
        return False


def _credential_file() -> Diagnostic:
    from app.secrets import require_private_env

    path = Path(".env")
    try:
        if not path.exists() and not path.is_symlink():
            return Diagnostic("ok", "Keine lokale .env-Datei vorhanden")
        require_private_env(path)
        return Diagnostic("ok", ".env-Dateirechte sind auf das Benutzerkonto beschränkt")
    except PermissionError:
        return Diagnostic("warning", ".env-Datei ist nicht auf das Benutzerkonto beschränkt")
    except OSError:
        return Diagnostic("unknown", ".env-Dateirechte konnten nicht geprüft werden")


def _tailscale(settings: Settings) -> Diagnostic:
    executable = shutil.which("tailscale")
    if executable is None:
        return Diagnostic("not_configured", "Tailscale ist auf diesem Gerät nicht installiert")
    try:
        result = subprocess.run([executable, "status", "--json"], capture_output=True, text=True,
                                timeout=3, check=False)
        if result.returncode != 0:
            return Diagnostic("warning", "Tailscale läuft nicht oder ist nicht angemeldet")
        state = json.loads(result.stdout)
        if state.get("BackendState") != "Running":
            return Diagnostic("warning", "Tailscale ist nicht verbunden")
        addresses = state.get("Self", {}).get("TailscaleIPs", [])
        if settings.tailscale_ip and settings.tailscale_ip not in addresses:
            return Diagnostic("warning", "Konfigurierte Tailscale-Adresse gehört nicht zu diesem Gerät")
        return Diagnostic("ok", "Tailscale ist verbunden")
    except (OSError, subprocess.TimeoutExpired, ValueError, TypeError, AttributeError):
        return Diagnostic("unknown", "Tailscale-Status konnte nicht geprüft werden")


def _syncthing_config_paths() -> list[Path]:
    home = Path.home()
    paths = [home / "Library/Application Support/Syncthing/config.xml",
             home / ".local/state/syncthing/config.xml",
             home / ".config/syncthing/config.xml"]
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        paths.append(Path(local_app_data) / "Syncthing/config.xml")
    return paths


def _syncthing(settings: Settings) -> Diagnostic:
    try:
        path = next((candidate for candidate in _syncthing_config_paths() if candidate.is_file()), None)
        if path is None:
            return Diagnostic("not_configured", "Syncthing-Konfiguration wurde nicht gefunden")
        root = ET.parse(path).getroot()
        options = root.find("options")
        if options is None:
            raise ValueError("Optionen fehlen")
        forbidden = ("globalAnnounceEnabled", "relaysEnabled", "natEnabled", "localAnnounceEnabled")
        if any((options.findtext(name) or "").strip().lower() != "false" for name in forbidden):
            return Diagnostic("warning", "Syncthing-Discovery, Relays oder NAT-Traversal sind aktiv")
        folders = [folder for folder in root.findall("folder") if folder.get("path")
                   and Path(folder.get("path", "")).expanduser().resolve() == settings.data_dir.resolve()]
        if len(folders) != 1:
            return Diagnostic("warning", "DATA_DIR ist nicht eindeutig als Syncthing-Ordner eingerichtet")
        if folders[0].get("type") != "sendreceive":
            return Diagnostic("warning", "Host-fähiges Gerät braucht Syncthing Senden & Empfangen")
        if not settings.tailscale_ip:
            return Diagnostic("unknown", "Tailscale-Adresse fehlt für die Prüfung der Syncthing-Bindung")
        listeners = [(item.text or "").strip() for item in options.findall("listenAddress")]
        if not listeners or any(urlsplit(item).hostname != settings.tailscale_ip for item in listeners):
            return Diagnostic("warning", "Syncthing lauscht nicht ausschließlich auf der Tailscale-Adresse")
        addresses = [(item.text or "").strip() for device in root.findall("device")
                     for item in device.findall("address")]
        if not addresses or any(not (urlsplit(item).hostname or "").endswith(".ts.net") for item in addresses):
            return Diagnostic("warning", "Syncthing-Geräte haben keine festen Tailscale-Namen")
        return Diagnostic("ok", "Syncthing-Ordner und Tailscale-Bindung sind passend eingestellt")
    except (OSError, ET.ParseError, TypeError, ValueError):
        return Diagnostic("unknown", "Syncthing-Konfiguration konnte nicht sicher geprüft werden")


def _syncthing_sync(settings: Settings) -> Diagnostic:
    if not settings.syncthing_folder_id or not settings.syncthing_api_key:
        return Diagnostic("not_configured", "Syncthing-REST-Zugang ist nicht eingerichtet")
    try:
        path = next((candidate for candidate in _syncthing_config_paths() if candidate.is_file()), None)
        if path is None:
            return Diagnostic("not_configured", "Syncthing-Konfiguration wurde nicht gefunden")
        root = ET.parse(path).getroot()
        folders = [folder for folder in root.findall("folder")
                   if folder.get("id") == settings.syncthing_folder_id
                   and folder.get("path")
                   and Path(folder.get("path", "")).expanduser().resolve() == settings.data_dir.resolve()]
        if len(folders) != 1:
            return Diagnostic("warning", "Syncthing-Ordner-ID gehört nicht zu DATA_DIR")
    except (OSError, ET.ParseError, TypeError, ValueError):
        return Diagnostic("unknown", "Syncthing-Ordner-ID konnte nicht sicher geprüft werden")
    status = folder_sync_status(settings.syncthing_api_url, settings.syncthing_api_key,
                                settings.syncthing_folder_id)
    return Diagnostic("ok" if status.complete else "warning", status.reason)


def _syncthing_conflicts(settings: Settings) -> Diagnostic:
    if not settings.data_dir.exists():
        return Diagnostic("not_configured", "Datenordner für die Konfliktprüfung fehlt")
    try:
        if has_syncthing_conflicts(settings.data_dir):
            return Diagnostic("warning", "Syncthing-Konfliktdatei gefunden; Datenstand manuell prüfen")
        return Diagnostic("ok", "Keine Syncthing-Konfliktdatei gefunden")
    except OSError:
        return Diagnostic("unknown", "Syncthing-Konfliktdateien konnten nicht sicher geprüft werden")


def _disk_encryption() -> Diagnostic:
    system = platform.system()
    if system == "Darwin":
        command = ["fdesetup", "status"]
        enabled, disabled = "filevault is on", "filevault is off"
    elif system == "Windows":
        command = ["powershell", "-NoProfile", "-NonInteractive", "-Command",
                   ("$v=Get-BitLockerVolume -MountPoint $env:SystemDrive;"
                    "$v | Select-Object ProtectionStatus,VolumeStatus | ConvertTo-Json -Compress")]
    else:
        return Diagnostic("unknown", "Laufwerksverschlüsselung unter Linux manuell prüfen")
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=5, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return Diagnostic("unknown", "Laufwerksverschlüsselung konnte nicht geprüft werden")
    if result.returncode != 0:
        return Diagnostic("unknown", "Laufwerksverschlüsselung konnte nicht geprüft werden")
    if system == "Windows":
        try:
            payload = json.loads(result.stdout)
            state = payload["ProtectionStatus"]
            is_on = state == 1 or str(state).lower() == "on"
            is_off = state == 0 or str(state).lower() == "off"
        except (TypeError, ValueError, KeyError):
            return Diagnostic("unknown", "Status der Laufwerksverschlüsselung ist unklar")
    else:
        output = result.stdout.strip().lower()
        is_on = enabled in output
        is_off = disabled in output
    if is_on:
        return Diagnostic("ok", "Laufwerksverschlüsselung ist aktiv")
    if is_off:
        return Diagnostic("warning", "Laufwerksverschlüsselung ist nicht aktiv")
    return Diagnostic("unknown", "Status der Laufwerksverschlüsselung ist unklar")


def _anki_connect() -> Diagnostic:
    try:
        with httpx.Client(trust_env=False, timeout=1) as client:
            response = client.post("http://127.0.0.1:8765", json={"action": "version", "version": 6})
        payload = response.json()
        if response.is_success and isinstance(payload, dict) and isinstance(payload.get("result"), int) and not payload.get("error"):
            return Diagnostic("ok", "AnkiConnect antwortet lokal")
    except (httpx.HTTPError, ValueError, TypeError):
        pass
    return Diagnostic("not_configured", "AnkiConnect ist lokal nicht erreichbar")


def _takeover(settings: Settings, lease: LeaseRecord | None, device_id: str | None,
              syncthing: Diagnostic, folder_status: Diagnostic) -> Diagnostic:
    if lease is None:
        return Diagnostic("not_configured", "Noch kein Staffelstab vorhanden")
    if lease.released_at is None:
        return Diagnostic("warning", "Der bisherige Host hat den Staffelstab noch nicht freigegeben")
    if device_id == lease.device_id:
        return Diagnostic("warning", "Das freigebende Gerät darf sich nicht selbst übernehmen")
    if syncthing.status != "ok" or folder_status.status != "ok":
        return Diagnostic("warning", "Syncthing ist für die Übernahme nicht vollständig bereit")
    if settings.moodle_enabled and not settings.moodle_token:
        return Diagnostic("warning", "Moodle-Token fehlt auf diesem Gerät")
    try:
        _local_database_path(settings)
        verified_handoff_snapshot(settings.data_dir / "host" / "snapshots",
                                  generation=lease.generation, device_id=lease.device_id,
                                  max_age_seconds=7200)
    except (HostLeaseError, SnapshotVerificationError, OSError):
        return Diagnostic("warning", "Geprüfter aktueller Datenbank-Snapshot fehlt")
    return Diagnostic("ok", "Geplante Übernahme nach Stopp des lokalen Dienstes möglich")


def doctor_report(settings: Settings) -> dict[str, object]:
    coordinator = HostCoordinator(settings)
    lease = None
    device_id = None
    try:
        lease = coordinator.current()
        device_id = coordinator._device_id()
        host_owned = lease is not None and lease.released_at is None and device_id == lease.device_id
        host_status = Diagnostic("ok" if host_owned else "warning",
                                 "Staffelstab gehört zu diesem Gerät" if host_owned else "Staffelstab fehlt oder gehört einem anderen Gerät")
    except (HostLeaseError, OSError):
        host_owned = False
        host_status = Diagnostic("warning", "Staffelstab oder lokale Gerätekennung ist beschädigt oder nicht lesbar")
    checks = {
        "data_dir_exists": settings.data_dir.is_dir(),
        "data_dir_writable": settings.data_dir.is_dir() and os.access(settings.data_dir, os.W_OK),
        "local_dir_writable": settings.local_dir.is_dir() and os.access(settings.local_dir, os.W_OK),
        "moodle_configured": bool(settings.moodle_enabled and settings.moodle_base_url and settings.moodle_token),
        "database_reachable": _database_reachable(settings),
        "host_lease_matches_device": host_owned,
    }
    syncthing = _syncthing(settings)
    syncthing_sync = _syncthing_sync(settings)
    takeover = _takeover(settings, lease, device_id, syncthing, syncthing_sync)
    diagnostics = {
        "moodle_token": Diagnostic("ok" if settings.moodle_enabled and settings.moodle_token else "not_configured",
                                   "Moodle-Connector deaktiviert" if not settings.moodle_enabled
                                   else "Moodle-Token vorhanden; Gültigkeit nur beim eigenen Sync prüfbar" if settings.moodle_token
                                   else "Moodle-Token fehlt"),
        "credential_file": _credential_file(),
        "host": host_status,
        "tailscale": _tailscale(settings),
        "syncthing": syncthing,
        "syncthing_sync": syncthing_sync,
        "syncthing_conflicts": _syncthing_conflicts(settings),
        "disk_encryption": _disk_encryption(),
        "anki_connect": _anki_connect(),
        "takeover": takeover,
    }
    return {"checks": checks, "diagnostics": {name: asdict(item) for name, item in diagnostics.items()},
            "ready_for_sync": all(checks.values()) and diagnostics["credential_file"].status != "warning",
            "ready_for_takeover": takeover.status == "ok"}
