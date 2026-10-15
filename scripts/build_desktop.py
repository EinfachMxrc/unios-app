# SPDX-License-Identifier: AGPL-3.0-or-later
"""Build one native UniOS installer on the current operating system."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DESKTOP = ROOT / "desktop"


def run(*args: str, cwd: Path = ROOT) -> None:
    executable = shutil.which(args[0]) if args[0] == "npm" else args[0]
    if executable is None:
        raise RuntimeError(f"Bauwerkzeug fehlt: {args[0]}")
    subprocess.run((executable, *args[1:]), cwd=cwd, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend-only", action="store_true", help="Build only the frozen Python service")
    parser.add_argument("--skip-backend", action="store_true", help="Reuse an already built sidecar")
    parser.add_argument("--clean", action="store_true", help="Discard the PyInstaller build cache")
    args = parser.parse_args()
    if args.backend_only and args.skip_backend:
        parser.error("--backend-only und --skip-backend schließen sich aus")
    public_key = os.environ.get("UNIOS_UPDATER_PUBLIC_KEY", "").strip()
    if public_key and not os.environ.get("TAURI_SIGNING_PRIVATE_KEY"):
        parser.error("Für signierte Updates fehlt TAURI_SIGNING_PRIVATE_KEY")
    if not public_key and os.environ.get("TAURI_SIGNING_PRIVATE_KEY"):
        parser.error("Zum privaten Signierschlüssel fehlt UNIOS_UPDATER_PUBLIC_KEY")
    os.environ["VITE_UNIOS_UPDATES_ENABLED"] = "true" if public_key else "false"
    os.environ["VITE_UNIOS_DESKTOP"] = "true"
    if not args.skip_backend:
        # An old source-tree egg-info can shadow the installed distribution.
        run(sys.executable, "-c", "from setuptools import setup; setup()", "egg_info")
        run(sys.executable, str(ROOT / "scripts" / "download_voice_model.py"))
        run("npm", "run", "build", "--", "--configLoader", "native", cwd=ROOT / "frontend")
        run(sys.executable, "-m", "PyInstaller", "--noconfirm", *(["--clean"] if args.clean else []),
            "--distpath", str(ROOT / "dist" / "desktop-backend"),
            "--workpath", str(ROOT / "build" / "pyinstaller"),
            str(DESKTOP / "uniosd.spec"))
    triple = subprocess.check_output(["rustc", "--print", "host-tuple"], text=True).strip()
    platform_characters = "abcdefghijklmnopqrstuvwxyz0123456789_-"  # pragma: allowlist secret
    if not triple or any(character not in platform_characters for character in triple):
        raise RuntimeError("Ungültige Rust-Zielplattform")
    extension = ".exe" if sys.platform == "win32" else ""
    backend_dist = ROOT / "dist" / "desktop-backend"
    source = (backend_dist / "uniosd" / "uniosd.exe" if sys.platform == "win32"
              else backend_dist / f"uniosd{extension}")
    runtime = backend_dist / "uniosd" / "_internal"
    if sys.platform == "win32" and not runtime.is_dir():
        raise RuntimeError("Windows-Laufzeit fehlt; Dienst zuerst ohne --skip-backend neu bauen")
    destination = DESKTOP / "src-tauri" / "binaries" / f"uniosd-{triple}{extension}"
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    if not args.backend_only:
        run("npm", "ci", cwd=DESKTOP)
        bundles = {"win32": "nsis,msi", "darwin": "dmg", "linux": "deb,appimage"}.get(sys.platform)
        if bundles is None:
            raise RuntimeError(f"Nicht unterstütztes Betriebssystem: {sys.platform}")
        local_mac = (sys.platform == "darwin" and not os.environ.get("CI")
                     and not os.environ.get("APPLE_SIGNING_IDENTITY"))
        if local_mac:
            bundles = "app"
        config: list[str] = []
        config_override: dict = {}
        if sys.platform == "win32":
            # Tauri's Windows resource directory is the installation directory,
            # beside uniosd.exe. PyInstaller expects _internal at that location.
            config_override["bundle"] = {"resources": {
                "vendor/glib/LICENSE": "licenses/GLib-MIT.txt",
                "vendor/glib/COPYRIGHT": "licenses/GLib-COPYRIGHT.txt",
                str(runtime.resolve()): "_internal",
            }}
        if public_key:
            config_override.setdefault("bundle", {})["createUpdaterArtifacts"] = True
            config_override["plugins"] = {"updater": {
                    "pubkey": public_key,
                    "requireSignedVersion": True,
                    "endpoints": ["https://github.com/EinfachMxrc/unios-app/releases/latest/download/latest.json"],
                }}
        if config_override:
            override = ROOT / "build" / "desktop-package-config.json"
            override.parent.mkdir(parents=True, exist_ok=True)
            override.write_text(json.dumps(config_override), encoding="utf-8")
            config = ["--config", str(override)]
        run("npm", "run", "tauri", "--", "build", "--bundles", bundles, *config, cwd=DESKTOP)
        if local_mac:
            # Unsynced staging avoids iCloud resource forks breaking signatures.
            # Keep each output version; never replace the signing certificate.
            stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")
            staged = Path.home() / "Library" / "Caches" / "UniOS" / "local-builds" / stamp / "UniOS.app"
            staged.parent.mkdir(parents=True)
            run("/usr/bin/ditto", "--norsrc", "--noextattr",
                str(DESKTOP / "src-tauri" / "target" / "release" / "bundle" / "macos" / "UniOS.app"), str(staged))
            run(sys.executable, str(ROOT / "scripts" / "sign_macos_local.py"), str(staged))
            run("/usr/bin/hdiutil", "create", "-volname", "UniOS", "-srcfolder", str(staged.parent),
                "-format", "UDZO", str(staged.parent.parent / f"UniOS-{stamp}.dmg"))
            print(f"Lokales Mac-Paket: {staged}")
    print(f"UniOS-Paket für {triple} gebaut")


if __name__ == "__main__":
    main()
