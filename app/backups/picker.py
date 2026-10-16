# SPDX-License-Identifier: AGPL-3.0-or-later

"""Ask the person at this computer for a folder with the system's own dialog."""

import shutil
import subprocess
import sys
from pathlib import Path

PROMPT = "Backup-Ordner für UniOS wählen"
TIMEOUT_SECONDS = 300


class PickerUnavailable(RuntimeError):
    pass


def _command() -> list[str]:
    if sys.platform == "darwin":
        return ["osascript", "-e", f'POSIX path of (choose folder with prompt "{PROMPT}")']
    if sys.platform == "win32":
        script = ("Add-Type -AssemblyName System.Windows.Forms;"
                  "$d = New-Object System.Windows.Forms.FolderBrowserDialog;"
                  f"$d.Description = '{PROMPT}';"
                  "if ($d.ShowDialog() -eq 'OK') { Write-Output $d.SelectedPath }")
        return ["powershell", "-NoProfile", "-STA", "-Command", script]
    if shutil.which("zenity"):
        return ["zenity", "--file-selection", "--directory", f"--title={PROMPT}"]
    if shutil.which("kdialog"):
        return ["kdialog", "--getexistingdirectory", str(Path.home())]
    raise PickerUnavailable("Kein Ordnerdialog verfügbar")


def choose_folder() -> str | None:
    """The chosen absolute folder, or None when the person cancelled."""
    command = _command()
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=TIMEOUT_SECONDS, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise PickerUnavailable("Ordnerdialog konnte nicht geöffnet werden") from exc
    chosen = result.stdout.strip()
    if result.returncode != 0 or not chosen:
        return None
    return str(Path(chosen))
