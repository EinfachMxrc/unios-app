# SPDX-License-Identifier: AGPL-3.0-or-later

"""Register the local Moodle SSO return link for the current OS user."""

import json
import os
import plistlib
import subprocess
import sys
from pathlib import Path

SCHEME = "marcunios"


def register_windows(root: Path) -> None:
    import winreg

    python = root / ".venv" / "Scripts" / "pythonw.exe"
    handler = root / "app" / "setup" / "protocol_handler.py"
    if not python.is_file():
        raise FileNotFoundError("Python-Fensterstarter fehlt")
    if not handler.is_file():
        raise FileNotFoundError("Moodle-Rückruf fehlt")
    base = rf"Software\Classes\{SCHEME}"
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, base) as key:
        winreg.SetValueEx(key, "", 0, winreg.REG_SZ, "UniOS Moodle-Anmeldung")
        winreg.SetValueEx(key, "URL Protocol", 0, winreg.REG_SZ, "")
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, base + r"\shell\open\command") as key:
        winreg.SetValueEx(key, "", 0, winreg.REG_SZ,
                          f'"{python}" "{handler}" "%1"')


def register_macos(root: Path) -> None:
    python = root / ".venv" / "bin" / "python"
    if not python.is_file():
        raise FileNotFoundError("Python-Installation fehlt")
    applications = Path.home() / "Applications"
    applications.mkdir(exist_ok=True)
    bundle = applications / "UniOS Login.app"
    command = ('do shell script "cd " & quoted form of ' + json.dumps(str(root), ensure_ascii=False)
               + ' & " && " & quoted form of ' + json.dumps(str(python), ensure_ascii=False)
               + ' & " -m app.setup.protocol_handler " & quoted form of theURL')
    subprocess.run(["osacompile", "-o", str(bundle), "-e", "on open location theURL",
                    "-e", command, "-e", "end open location"], check=True,
                   capture_output=True)
    info_path = bundle / "Contents" / "Info.plist"
    with info_path.open("rb") as source:
        info = plistlib.load(source)
    info["CFBundleIdentifier"] = "de.marc.uni-os.login"
    info["CFBundleName"] = "UniOS Login"
    info["CFBundleURLTypes"] = [{"CFBundleURLName": "UniOS Moodle-Anmeldung",
                                 "CFBundleURLSchemes": [SCHEME]}]
    with info_path.open("wb") as output:
        plistlib.dump(info, output)
    registry = ("/System/Library/Frameworks/CoreServices.framework/Frameworks/"
                "LaunchServices.framework/Support/lsregister")
    subprocess.run([registry, "-f", str(bundle)], check=True, capture_output=True)


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    try:
        if os.name == "nt":
            register_windows(root)
        elif sys.platform == "darwin":
            register_macos(root)
        else:
            print("Automatischer Moodle-Rückruf ist hier noch nicht eingerichtet.")
            return 1
    except (OSError, subprocess.CalledProcessError):
        print("Moodle-Rückruf konnte nicht registriert werden; manuelle Eingabe bleibt möglich.")
        return 1
    print("Moodle-Rückruf für dieses Benutzerkonto eingerichtet.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
