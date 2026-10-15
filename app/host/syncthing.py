# SPDX-License-Identifier: AGPL-3.0-or-later

"""Read the local Syncthing folder status before a future host takeover."""

from __future__ import annotations

from dataclasses import dataclass
from ipaddress import ip_address
from urllib.parse import urlsplit

import httpx


@dataclass(frozen=True)
class FolderSyncStatus:
    complete: bool
    reason: str


_ZERO_FIELDS = (
    "needBytes", "needDeletes", "needDirectories", "needFiles", "needSymlinks",
    "needTotalItems", "pullErrors", "receiveOnlyTotalItems",
)


def _local_api_url(raw_url: str) -> str | None:
    """Keep the API key on this device even if a URL was entered incorrectly."""
    try:
        parsed = urlsplit(raw_url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            return None
        if parsed.username or parsed.password or parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
            return None
        if not ip_address(parsed.hostname).is_loopback or parsed.port is None:
            return None
    except ValueError:
        return None
    return raw_url.rstrip("/")


def folder_sync_status(
    api_url: str,
    api_key: str,
    folder_id: str,
    *,
    transport: httpx.BaseTransport | None = None,
) -> FolderSyncStatus:
    """Fail closed unless Syncthing reports a fully settled local folder.

    The endpoint is queried only on a numeric loopback address. An explicit
    transport permits tests to use a fake server without contacting Syncthing.
    """
    base_url = _local_api_url(api_url)
    if not base_url or not api_key or not folder_id or folder_id != folder_id.strip():
        return FolderSyncStatus(False, "Syncthing-REST-Zugang ist nicht vollständig eingerichtet")
    try:
        with httpx.Client(timeout=3, trust_env=False, follow_redirects=False,
                          transport=transport) as client:
            response = client.get(f"{base_url}/rest/db/status",
                                  params={"folder": folder_id}, headers={"X-API-Key": api_key})
        if response.status_code != 200:
            return FolderSyncStatus(False, "Syncthing-Ordnerstatus ist nicht erreichbar")
        payload = response.json()
    except (httpx.HTTPError, ValueError, TypeError):
        return FolderSyncStatus(False, "Syncthing-Ordnerstatus konnte nicht geprüft werden")
    if not isinstance(payload, dict):
        return FolderSyncStatus(False, "Syncthing-Ordnerstatus ist unvollständig")
    if payload.get("state") != "idle" or payload.get("ignorePatterns") is not False:
        return FolderSyncStatus(False, "Syncthing-Ordner ist nicht vollständig geprüft")
    for name in _ZERO_FIELDS:
        value = payload.get(name)
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            return FolderSyncStatus(False, "Syncthing-Ordnerstatus ist unvollständig")
        if value != 0:
            return FolderSyncStatus(False, "Syncthing-Ordner ist noch nicht vollständig synchron")
    return FolderSyncStatus(True, "Syncthing meldet den lokalen Ordner vollständig synchron")
