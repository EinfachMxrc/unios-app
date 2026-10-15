# SPDX-License-Identifier: AGPL-3.0-or-later

"""Moodle-Mobile-SSO-Token lokal einrichten. Zugangsdaten werden nie abgefragt."""

import argparse
import getpass
import os
import secrets
import sys
import webbrowser
from pathlib import Path
from urllib.parse import quote, urlparse

from app.config import Settings
from app.connectors.moodle.client import MoodleClient
from app.institutions import load_institution
from app.secrets import require_private_env, save_moodle_token, secure_windows_env
from app.setup.moodle_callback import token_from_callback


def store_env(path: Path, base_url: str, token: str | None) -> None:
    if path.exists() or path.is_symlink():
        if os.name == "nt":
            secure_windows_env(path)
        else:
            require_private_env(path)
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    updates = {"MOODLE_BASE_URL": base_url}
    if token is not None:
        updates["MOODLE_TOKEN"] = token
    result = []
    for line in lines:
        key = line.split("=", 1)[0].strip()
        if key == "MOODLE_TOKEN" and token is None:
            continue
        if key in updates:
            result.append(f"{key}={updates.pop(key)}")
        else:
            result.append(line)
    result.extend(f"{key}={value}" for key, value in updates.items())
    temporary = path.with_name(path.name + "." + secrets.token_hex(8) + ".tmp")
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.close(descriptor)
        if os.name == "nt":
            secure_windows_env(temporary)
        with temporary.open("w", encoding="utf-8") as output:
            output.write("\n".join(result) + "\n")
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)
    if os.name != "nt":
        os.chmod(path, 0o600)


def main() -> int:
    parser = argparse.ArgumentParser(description="Moodle-Token durch eigenen SSO-Login einrichten")
    parser.add_argument("--moodle-url", help="HTTPS-Basisadresse des Moodle-Systems")
    parser.add_argument("--env-file", type=Path, default=Path(".env"))
    parser.add_argument("--manual", action="store_true", help="Bereits selbst beschafften Mobile-Token verdeckt eingeben")
    parser.add_argument("--env-only", action="store_true", help="Token für einen Container nur in .env ablegen")
    args = parser.parse_args()
    try:
        if os.name == "nt" and args.env_file.exists():
            secure_windows_env(args.env_file)
        require_private_env(args.env_file)
    except PermissionError as exc:
        print(f"Token-Einrichtung abgebrochen: {exc}", file=sys.stderr)
        return 2
    existing = Settings(_env_file=args.env_file)  # type: ignore[call-arg]  # pydantic-settings runtime option
    profile_url = load_institution(existing.institution_slug).moodle_url
    base_url = (args.moodle_url or existing.moodle_base_url or (str(profile_url) if profile_url else "")
                or input("Moodle-Basisadresse (https://...): ")).rstrip("/")
    if urlparse(base_url).scheme != "https" or not urlparse(base_url).netloc:
        print("Nur eine vollständige HTTPS-Adresse ist erlaubt.", file=sys.stderr)
        return 2
    if args.manual:
        token = getpass.getpass("Mobile-App-Token (Eingabe unsichtbar): ").strip()
    else:
        passport = secrets.token_urlsafe(24)
        launch_url = (base_url + "/admin/tool/mobile/launch.php?service=moodle_mobile_app"
                      + "&passport=" + quote(passport) + "&urlscheme=moodledl")
        print("Der Browser öffnet den offiziellen Moodle-Mobile-SSO-Start. Melde dich selbst an und bestätige MFA.")
        print("Falls keine Seite erscheint: Kopiere im selben Browser die Weiterleitungsadresse mit ://token= aus den Entwicklerwerkzeugen.")
        webbrowser.open(launch_url)
        callback = getpass.getpass("Weiterleitungsadresse (Eingabe unsichtbar): ").strip()
        try:
            token = token_from_callback(callback, passport, base_url)
        except (ValueError, UnicodeError) as exc:
            print(f"Token konnte nicht übernommen werden: {exc}", file=sys.stderr)
            return 2
    if not token:
        print("Leerer Token.", file=sys.stderr)
        return 2
    try:
        settings = existing.model_copy(update={"moodle_base_url": base_url, "moodle_token": token})
        info = MoodleClient(settings).call("core_webservice_get_site_info")
        if not isinstance(info, dict) or "userid" not in info:
            raise ValueError("Keine gültige Moodle-Site-Info")
        in_keychain = not args.env_only and save_moodle_token(base_url, token)
        store_env(args.env_file, base_url, None if in_keychain else token)
    except Exception as exc:  # noqa: BLE001 - avoid displaying token-bearing exceptions in setup output
        print(f"Moodle-Prüfung oder Speicherung fehlgeschlagen: {type(exc).__name__}", file=sys.stderr)
        return 1
    location = "der System-Keychain" if in_keychain else ".env mit Rechten 600"
    print(f"Token geprüft und in {location} gespeichert. Tokenwert wurde nicht ausgegeben.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
