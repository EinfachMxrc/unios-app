# SPDX-License-Identifier: AGPL-3.0-or-later

"""Store Moodle credentials in the operating system's encrypted secret store."""

from __future__ import annotations

import os
import stat
import subprocess
from pathlib import Path

import keyring
from keyring.errors import KeyringError

SERVICE = "marc-uni-os:moodle"
NTFY_SERVICE = "marc-uni-os:ntfy"
SECURE_BACKENDS = (
    "keyring.backends.macOS",
    "keyring.backends.Windows",
    "keyring.backends.SecretService",
    "keyring.backends.kwallet",
)


def _windows_env_acl(path: Path, mode: str) -> None:
    script = Path(__file__).resolve().parents[1] / "scripts" / "windows_env_acl.ps1"
    try:
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
             "-File", str(script), "-Mode", mode, "-Path", str(path.absolute())],
            capture_output=True, check=False, timeout=10,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise PermissionError("Windows-.env-ACL konnte nicht geprüft werden") from exc
    if result.returncode != 0:
        raise PermissionError("Windows-.env-ACL darf nur dem aktuellen Benutzer Zugriff geben")


def secure_windows_env(path: Path) -> None:
    """Replace all explicit and inherited grants before storing a Windows fallback secret."""
    _windows_env_acl(path, "secure")


def require_private_env(path: Path) -> None:
    """Refuse an unsafe fallback file before settings can load its secrets."""
    try:
        details = path.lstat()
    except FileNotFoundError:
        return
    if os.name == "nt":
        _windows_env_acl(path, "check")
        return
    get_uid = getattr(os, "getuid", None)
    if (get_uid is None or not stat.S_ISREG(details.st_mode) or details.st_uid != get_uid()
            or details.st_mode & 0o077):
        raise PermissionError(".env-Datei muss dem aktuellen Benutzer gehören und Rechte 600 haben")


def _secure_backend() -> bool:
    try:
        backend = type(keyring.get_keyring())
        return (backend.__module__.startswith(SECURE_BACKENDS)
                or (backend.__module__ == "app.server.keyring" and backend.__name__ == "ServerKeyring"))
    except (KeyringError, RuntimeError):
        return False


def load_moodle_token(base_url: str) -> str:
    if not base_url or not _secure_backend():
        return ""
    try:
        return keyring.get_password(SERVICE, base_url) or ""
    except (KeyringError, RuntimeError):
        return ""


def save_moodle_token(base_url: str, token: str) -> bool:
    if not base_url or not token or not _secure_backend():
        return False
    try:
        keyring.set_password(SERVICE, base_url, token)
        return keyring.get_password(SERVICE, base_url) == token
    except (KeyringError, RuntimeError):
        return False


def save_connector_secret(connector_id: str, alias: str, value: str) -> bool:
    if not connector_id or not alias or not value or not _secure_backend():
        return False
    service = f"unios.connector.{connector_id}"
    try:
        keyring.set_password(service, alias, value)
        return keyring.get_password(service, alias) == value
    except (KeyringError, RuntimeError):
        return False


def load_connector_secret(connector_id: str, alias: str) -> str:
    if not _secure_backend():
        return ""
    try:
        return keyring.get_password(f"unios.connector.{connector_id}", alias) or ""
    except (KeyringError, RuntimeError):
        return ""


def load_ntfy_url() -> str:
    if not _secure_backend():
        return ""
    try:
        return keyring.get_password(NTFY_SERVICE, "url") or ""
    except (KeyringError, RuntimeError):
        return ""


def save_ntfy_url(url: str) -> bool:
    if not url or not _secure_backend():
        return False
    try:
        keyring.set_password(NTFY_SERVICE, "url", url)
        return keyring.get_password(NTFY_SERVICE, "url") == url
    except (KeyringError, RuntimeError):
        return False


def clear_ntfy_url() -> bool:
    if not _secure_backend():
        return False
    try:
        keyring.delete_password(NTFY_SERVICE, "url")
    except keyring.errors.PasswordDeleteError:
        pass
    except (KeyringError, RuntimeError):
        return False
    return True
