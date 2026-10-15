# SPDX-License-Identifier: AGPL-3.0-or-later
"""PyInstaller specification for the local UniOS service."""

from pathlib import Path
from importlib.metadata import distribution
import sys

from PyInstaller.utils.hooks import collect_all, collect_submodules, copy_metadata


root = Path(SPECPATH).parent
datas = [
    (str(root / "frontend" / "dist"), "frontend/dist"),
    (str(root / "alembic"), "alembic"),
    (str(root / "alembic.ini"), "."),
    (str(root / "app" / "connectors" / "registry.json"), "app/connectors"),
    (str(root / "app" / "addons" / "registry.json"), "app/addons"),
]
datas.extend((str(path), "voice-model") for path in (root / "desktop" / "voice-model").iterdir() if path.is_file())
datas.extend((str(path), "voice-licenses") for path in (root / "docs" / "licenses").iterdir() if path.is_file())
for vendor in ("faster-whisper", "ctranslate2", "av", "onnxruntime", "tokenizers"):
    metadata = distribution(vendor)
    for item in metadata.files or []:
        if any(word in str(item).lower() for word in ("license", "notice", "copying")):
            path = Path(metadata.locate_file(item))
            if path.is_file():
                datas.append((str(path), f"voice-licenses/{vendor}"))
binaries = []
license_vendors = ("recurring-ical-events", "x-wr-timezone", "wasmtime")
if sys.platform == "win32":
    license_vendors += ("pywin32",)
for vendor in license_vendors:
    metadata = distribution(vendor)
    for item in metadata.files or []:
        if any(word in str(item).lower() for word in ("license", "notice", "copying")):
            path = Path(metadata.locate_file(item))
            if path.is_file():
                destination = f"third-party-licenses/{vendor}"
                if vendor == "pywin32":
                    destination += "/" + item.parent.as_posix()
                datas.append((str(path), destination))
hiddenimports = collect_submodules("app")
hiddenimports.extend(collect_submodules("clients.uni_mcp"))
for package in ("institutions", "config", "anki", "moodle_dl", "keyring", "playwright", "mcp",
                "wasmtime", "faster_whisper", "ctranslate2", "av", "tokenizers", "onnxruntime", "anthropic"):
    package_data, package_binaries, package_imports = collect_all(package)
    datas.extend(package_data)
    binaries.extend(package_binaries)
    hiddenimports.extend(package_imports)
datas.extend(copy_metadata("moodle-dl", recursive=True))
datas.extend(copy_metadata("unios"))
datas.extend(copy_metadata("anthropic", recursive=True))

analysis = Analysis(
    [str(root / "desktop" / "backend.py")],
    pathex=[str(root)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    excludes=["pytest", "mypy", "ruff", "tkinter"],
    noarchive=False,
)
pyz = PYZ(analysis.pure)
# Windows installs the runtime alongside the sidecar. Extracting the complete
# OCR/audio stack on every GUI and MCP start otherwise costs several seconds.
# Keep other platforms' existing layout until their signed bundles are tested.
installed_runtime = sys.platform == "win32"
exe = EXE(
    pyz,
    analysis.scripts,
    *([] if installed_runtime else [analysis.binaries, analysis.datas]),
    [],
    name="uniosd",
    console=False,
    exclude_binaries=installed_runtime,
)
if installed_runtime:
    bundle = COLLECT(exe, analysis.binaries, analysis.datas, name="uniosd")
