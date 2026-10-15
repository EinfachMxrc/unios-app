# SPDX-License-Identifier: AGPL-3.0-or-later
"""Stage signed native artifacts and a Tauri update manifest for review."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import tomllib
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

TARGETS = {
    "windows-x64": ("windows-x86_64", "*.exe.sig", ".exe"),
    "macos-arm64": ("darwin-aarch64", "*.app.tar.gz.sig", ".app.tar.gz"),
    "macos-x64": ("darwin-x86_64", "*.app.tar.gz.sig", ".app.tar.gz"),
    "linux-x64": ("linux-x86_64", "*.AppImage.sig", ".AppImage"),
}
EXTRAS = {
    "windows-x64": ("*.msi", ".msi"),
    "macos-arm64": ("*.dmg", ".dmg"),
    "macos-x64": ("*.dmg", ".dmg"),
    "linux-x64": ("*.deb", ".deb"),
}

CHANNELS = ("stable", "beta", "nightly")


def release_policy(version: str, channel: str, minimum: str, schema: str,
                   compatible_schemas: list[str]) -> dict[str, object]:
    """Advisory metadata, not a signature over the manifest itself."""
    pattern = r"(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){2}"
    if (channel not in CHANNELS or not re.fullmatch(pattern, minimum)
            or not re.fullmatch(pattern + r'(?:-[0-9A-Za-z.-]+)?', version)):
        raise ValueError("Ungültiger Kanal oder Mindestversion")
    current_numbers = tuple(map(int, version.split('-')[0].split('.')))
    if tuple(map(int, minimum.split('.'))) > current_numbers:
        raise ValueError("Mindestversion liegt über der Zielversion")
    if channel == 'stable' and '-' in version:
        raise ValueError("Stable darf keine Vorabversion enthalten")
    schemas = sorted(set(compatible_schemas or [schema]))
    if (len(schemas) > 100 or schema not in schemas
            or any(not re.fullmatch(r'[a-f0-9]{8,64}', value) for value in schemas)):
        raise ValueError("Schema-Kompatibilität muss explizit und begrenzt sein")
    return {"channel": channel, "min_supported_version": minimum,
            "schema_version": schema, "compatible_schemas": schemas}


def read_signature(path: Path) -> str:
    """Bound staging metadata; cryptographic verification happens in the updater."""
    with path.open('rb') as source:
        raw = source.read(16385)
    if not raw or len(raw) > 16384:
        raise ValueError('Signatur muss 1–16384 Bytes enthalten')
    signature = raw.decode('utf-8').strip()
    if not signature:
        raise ValueError('Signatur ist leer')
    return signature


def only_match(folder: Path, pattern: str) -> Path:
    matches = list(folder.rglob(pattern))
    if len(matches) != 1:
        raise ValueError(f"Genau ein {pattern} unter {folder} erwartet, gefunden: {len(matches)}")
    return matches[0]


def copy_asset(source: Path, destination: Path) -> None:
    if destination.exists():
        raise FileExistsError(destination)
    shutil.copy2(source, destination)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("version", help="SemVer ohne v, z. B. 0.2.0")
    parser.add_argument("artifacts", type=Path, help="Ordner mit vier entpackten CI-Artefakten")
    parser.add_argument("output", type=Path, help="Neuer Staging-Ordner")
    parser.add_argument("--notes", default="UniOS aktualisiert")
    parser.add_argument("--channel", choices=CHANNELS, default='beta')
    parser.add_argument("--min-supported-version", default='0.1.0')
    parser.add_argument("--compatible-schema", action='append', default=[])
    args = parser.parse_args()
    if not re.fullmatch(r"(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){2}(?:-[0-9A-Za-z.-]+)?", args.version):
        parser.error("Version muss SemVer sein")
    root = Path(__file__).resolve().parents[1]
    configured_version = json.loads((root / "desktop" / "src-tauri" /
                                     "tauri.conf.json").read_text(encoding="utf-8"))["version"]
    if args.version != configured_version:
        parser.error(f"Release {args.version} passt nicht zur Desktop-App {configured_version}")
    backend_version = tomllib.loads((root / "pyproject.toml").read_text(encoding="utf-8"))["project"]["version"]
    if args.version != backend_version:
        parser.error(f"Release {args.version} passt nicht zum gebündelten Dienst {backend_version}")
    alembic = Config(str(root / "alembic.ini"))
    alembic.set_main_option("script_location", str(root / "alembic"))
    schema_version = ScriptDirectory.from_config(alembic).get_current_head()
    if schema_version is None:
        parser.error("Datenbank-Schema hat keinen eindeutigen Stand")
    try:
        policy = release_policy(args.version, args.channel, args.min_supported_version,
                                schema_version, args.compatible_schema)
    except ValueError as exc:
        parser.error(str(exc))
    if len(args.notes.encode('utf-8')) > 4096:
        parser.error("Release-Notizen dürfen höchstens 4096 UTF-8-Bytes enthalten")
    if args.output.exists() and any(args.output.iterdir()):
        parser.error("Staging-Ordner muss leer sein")
    args.output.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, object] = {"version": args.version, "notes": args.notes, "platforms": {}, **policy}
    platforms: dict[str, dict[str, str]] = {}
    staged: list[Path] = []
    for folder_name, (target, pattern, suffix) in TARGETS.items():
        folder = args.artifacts / folder_name
        signature = only_match(folder, pattern)
        signature_text = read_signature(signature)
        asset = signature.with_suffix("")
        if not asset.is_file():
            raise FileNotFoundError(asset)
        name = f"UniOS-{args.version}-{target}{suffix}"
        destination = args.output / name
        copy_asset(asset, destination)
        copy_asset(signature, args.output / f"{name}.sig")
        staged.append(destination)
        platforms[target] = {
            "signature": signature_text,
            "url": f"https://github.com/EinfachMxrc/unios-app/releases/download/v{args.version}/{name}",
        }
        if folder_name in EXTRAS:
            extra_pattern, extra_suffix = EXTRAS[folder_name]
            extra = only_match(folder, extra_pattern)
            extra_destination = args.output / f"UniOS-{args.version}-{target}{extra_suffix}"
            copy_asset(extra, extra_destination)
            staged.append(extra_destination)
    manifest["platforms"] = platforms
    (args.output / "latest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                                             encoding="utf-8")
    release_info = args.output / "release-info.json"
    release_info.write_text(json.dumps({"app_version": args.version, **policy},
                                       ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    staged.append(release_info)
    hashes = [f"{sha256(path)}  {path.name}" for path in staged]
    (args.output / "SHA256SUMS.txt").write_text("\n".join(hashes) + "\n", encoding="ascii")
    print(f"{len(staged)} Pakete und latest.json unter {args.output} bereitgestellt")


if __name__ == "__main__":
    main()
