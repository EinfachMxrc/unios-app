# SPDX-License-Identifier: AGPL-3.0-or-later
"""One-time, encrypted move from a stopped desktop host to a fresh server.

Never overwrites a server database. Original desktop files remain untouched.
Credentials are read and written through domain stores, not by copying a
keychain dump, .env, device sessions, logs or platform-specific caches.
"""

import argparse
import io
import json
import os
import re
import shutil
import sqlite3
import tarfile
from contextlib import closing
from dataclasses import asdict
from hashlib import sha256
from pathlib import Path, PurePosixPath, PureWindowsPath
from uuid import uuid4

from app.ai.provider_repository import ProviderRepository
from app.anki.collection import snapshot_collection
from app.config import Settings, get_settings
from app.export.service import _app_version
from app.files.localpath import native_path, resolve_local
from app.host.lease import HostCoordinator
from app.host.snapshots import create_snapshot, verify_snapshot
from app.institutions import load_institution
from app.integrations.storage import Vault
from app.portals.session import PortalSession, load_session, save_session
from app.secrets import save_moodle_token, save_ntfy_url
from app.server.transfer import EncryptedReader, EncryptedWriter

LOCAL_METADATA = frozenset({"setup.json", "institution-profile.json", "mcp-connection.json",
                            "timetable-connection.json", "timetable-selection-connection.json", "microsoft-mail-connection.json",
                            "campus.json", "ai-provider.json", "connectors-enabled.json", "connector-grants.jsonl",
                            "addon-catalog.jsonl", "addon-events.jsonl"})
VAULT_ENTRIES = (("timetable", "feed"), ("microsoft-mail", "tokens"))


def _known_schema(database_path: Path) -> str:
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    from alembic.script.revision import ResolutionError

    with closing(sqlite3.connect(f"{database_path.as_uri()}?mode=ro", uri=True)) as database:
        rows = database.execute("SELECT version_num FROM alembic_version").fetchall()
        if len(rows) != 1:
            raise ValueError("Datenbank-Schemaversion ist nicht eindeutig")
        revision = rows[0][0]
        if database.execute("PRAGMA foreign_key_check").fetchone() is not None:
            raise ValueError("Datenbank enthält ungültige Verknüpfungen")
    root = Path(__file__).resolve().parents[2]
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "alembic"))
    try:
        if revision not in {item.revision for item in ScriptDirectory.from_config(config).walk_revisions()}:
            raise ValueError("Neuere oder unbekannte Schemaversion: UniOS zuerst aktualisieren")
    except ResolutionError as exc:
        raise ValueError("Schemaversion ist nicht kompatibel") from exc
    return revision


def _verify_content_references(home: Path) -> None:
    root = resolve_local(home / "data")
    with closing(sqlite3.connect(home / "local" / "uni_os.sqlite3")) as database:
        for table in ("resource_versions", "note_versions"):
            for relative, digest in database.execute(f'SELECT relative_path, sha256 FROM "{table}"'):
                path = PurePosixPath(relative.replace("\\", "/"))
                target = resolve_local(root / path)
                if (path.is_absolute() or PureWindowsPath(relative).drive or ".." in path.parts
                        or not target.is_relative_to(root) or not native_path(target).is_file() or _digest(target) != digest):
                    raise ValueError("Gespeicherte Datei fehlt oder ihre Prüfsumme stimmt nicht")
        for relative, size in database.execute("SELECT relative_path, size FROM voice_memos"):
            path = PurePosixPath(relative.replace("\\", "/"))
            target = resolve_local(root / path)
            if (path.is_absolute() or PureWindowsPath(relative).drive or ".." in path.parts
                    or not target.is_relative_to(root) or not native_path(target).is_file() or native_path(target).stat().st_size != size):
                raise ValueError("Gespeicherte Audioaufnahme fehlt oder ihre Größe stimmt nicht")


def _secret_bundle(settings: Settings) -> dict:
    profile = load_institution(settings.institution_slug)
    portals = {}
    for name in ("mycampus", "primuss"):
        portal = getattr(profile, name, None)
        if portal and portal.base_url:
            saved = load_session(name, str(portal.base_url))
            if saved:
                portals[name] = {"base_url": str(portal.base_url), **asdict(saved)}
                portals[name]["captured_at"] = saved.captured_at.isoformat()
    vaults = {name: Vault(settings.local_dir, settings.institution_slug, name).read(alias)
              for name, alias in VAULT_ENTRIES}
    mcp = Vault(settings.local_dir, "local", "mcp").read("bridge")
    # The key is loaded lazily on the first AI call, so read it from its store, not from settings.
    ai_key = settings.ai_adapter_api_key or ProviderRepository(settings).load_key()
    values = {name: getattr(settings, name) for name in (
        "moodle_base_url", "moodle_token", "ntfy_url", "discord_webhook_url", "github_token",
        "anki_agent_token", "ai_adapter_api_key", "mcp_token", "mcp_enabled",
        "institution_slug", "tz", "current_semester_name", "public_periods_enabled", "moodle_enabled",
    )}
    values["ai_adapter_api_key"] = ai_key
    return {"settings": values, "portals": portals, "vaults": vaults, "mcp": mcp}


def _digest(path: Path) -> str:
    result = sha256()
    with native_path(path).open("rb") as stream:
        while block := stream.read(1024 * 1024):
            result.update(block)
    return result.hexdigest()


def portable_database_paths(home: Path) -> int:
    """Convert legacy Windows separators only in verified data-file references.

    Called on the staged database before publishing; callers of the standalone
    repair must first stop the host and retain a database backup.
    """
    changed = 0
    root = (home / "data").resolve()
    with closing(sqlite3.connect(home / "local" / "uni_os.sqlite3")) as database:
        tables = {row[0] for row in database.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        updates = []
        for table in ("resource_versions", "note_versions", "voice_memos"):
            if table not in tables:
                continue
            for row_id, value in database.execute(f'SELECT id, relative_path FROM "{table}"'):
                if "\\" not in value:
                    continue
                path = PurePosixPath(value.replace("\\", "/"))
                target = (root / path).resolve()
                if (path.is_absolute() or PureWindowsPath(value).drive or ".." in path.parts
                        or not target.is_relative_to(root) or not target.is_file()):
                    raise ValueError("Dateiverweis kann nicht sicher übernommen werden")
                updates.append((table, row_id, path.as_posix()))
        with database:
            for table, row_id, value in updates:
                database.execute(f'UPDATE "{table}" SET relative_path=? WHERE id=?', (value, row_id))
                changed += 1
    return changed


def export(settings: Settings, output: Path, key: bytes) -> None:
    if output.exists() or output.is_symlink():
        raise ValueError("Übernahmepaket existiert bereits")
    coordinator = HostCoordinator(settings)
    try:
        if not coordinator.start(background=False) or not coordinator.has_instance_lock:
            raise RuntimeError("UniOS vorher vollständig schließen; kein zweiter schreibender Prozess erlaubt")
        manifest = create_snapshot(coordinator)
        folder = settings.data_dir / "host" / "snapshots"
        if not verify_snapshot(folder, manifest, check_integrity=True):
            raise RuntimeError("Snapshot konnte nicht geprüft werden")
        source_database = settings.local_dir / "uni_os.sqlite3"
        snapshot = settings.local_dir / f".server-move-{uuid4().hex}.sqlite3"
        with closing(sqlite3.connect(source_database)) as source, closing(sqlite3.connect(snapshot)) as target:
            source.backup(target)
            if target.execute("PRAGMA integrity_check").fetchone() != ("ok",):
                raise RuntimeError("Datenbank-Snapshot ist nicht intakt")
        entries = [("local/uni_os.sqlite3", snapshot)]
        schema_revision = _known_schema(snapshot)
        anki_snapshot = snapshot.with_suffix(".anki2")
        if snapshot_collection(settings, anki_snapshot):
            entries.append(("local/anki/collection.anki2", anki_snapshot))
            media = settings.local_dir / "anki" / "collection.media"
            if media.is_symlink():
                raise ValueError("Ungültiger Anki-Medienordner")
            for path in media.rglob("*") if media.is_dir() else []:
                if path.is_symlink():
                    raise ValueError("Verknüpfte Anki-Medien sind nicht erlaubt")
                if path.is_file():
                    entries.append(("local/anki/collection.media/" + path.relative_to(media).as_posix(), path))
        entries += [(f"local/{name}", settings.local_dir / name) for name in LOCAL_METADATA
                    if (settings.local_dir / name).is_file()]
        modules = settings.local_dir / "addon-modules"
        if modules.is_symlink():
            raise ValueError("Ungültiger Addon-Ordner")
        for path in modules.iterdir() if modules.is_dir() else []:
            if (path.is_symlink() or not path.is_file() or not re.fullmatch(r"[a-f0-9]{64}\.wasm", path.name)
                    or path.stat().st_size > 2_000_000 or _digest(path) != path.stem):
                raise ValueError("Ungültiges Addon-Modul")
            entries.append(("local/addon-modules/" + path.name, path))
        for path in settings.data_dir.rglob("*"):
            relative = path.relative_to(settings.data_dir)
            if relative.parts[0] in {"host", ".stfolder", ".stversions"} or path.name.startswith(".syncthing"):
                continue
            if path.is_symlink():
                raise ValueError("Verknüpfte Datei kann nicht sicher übernommen werden")
            if path.is_file():
                entries.append(("data/" + relative.as_posix(), path))
        lease = coordinator.current()
        if lease is None:
            raise RuntimeError("Quell-Host ist nicht verfügbar")
        metadata = {"version": 1, "source_generation": lease.generation,
                    "app_version": _app_version(), "schema_revision": schema_revision,
                    "files": {name: _digest(path) for name, path in entries},
                    "credentials": _secret_bundle(settings)}
        descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as target:
            writer = EncryptedWriter(target, key)
            # Windows can report shared file identities. Store each source as
            # a regular file; the importer deliberately rejects archive links.
            with tarfile.open(fileobj=writer, mode="w|", dereference=True) as archive:
                for name, path in entries:
                    if path.is_symlink():
                        raise ValueError("Ungültige Quelldatei")
                    archive.add(path, arcname=name, recursive=False)
                raw = json.dumps(metadata, default=str).encode()
                info = tarfile.TarInfo("migration.json")
                info.size = len(raw)
                archive.addfile(info, io.BytesIO(raw))
            writer.finish()
    finally:
        coordinator.close()
        if "snapshot" in locals():
            snapshot.unlink(missing_ok=True)
        if "anki_snapshot" in locals():
            anki_snapshot.unlink(missing_ok=True)


def import_package(home: Path, source: Path, key: bytes, *, verify_only: bool = False) -> dict:
    if (home / "local" / "uni_os.sqlite3").exists() or (home / "data").exists():
        raise ValueError("Übernahme nur in einen neuen Server-Datenordner; vorhandene Daten bleiben erhalten")
    # Keep staging on the same filesystem as the final Docker volume so
    # publishing a verified database remains an atomic rename.
    home.mkdir(parents=True, exist_ok=True, mode=0o700)
    stage = home / f".unios-import-{uuid4().hex}"
    stage.mkdir(mode=0o700)
    metadata = None
    files = {}
    try:
        with source.open("rb") as incoming:
            reader = EncryptedReader(incoming, key)
            with tarfile.open(fileobj=reader, mode="r|") as archive:
                for item in archive:
                    name = PurePosixPath(item.name)
                    if (not item.isfile() or name.is_absolute() or ".." in name.parts
                            or "\\" in item.name or item.size > 2 * 1024**3):
                        raise ValueError("Ungültiger Dateipfad im Übernahmepaket")
                    stream = archive.extractfile(item)
                    if stream is None:
                        raise ValueError("Datei fehlt im Übernahmepaket")
                    if item.name == "migration.json":
                        if item.size > 1_000_000 or metadata is not None:
                            raise ValueError("Ungültiges Übernahmemanifest")
                        metadata = json.load(stream)
                        continue
                    if name.parts[0] not in {"data", "local"} or len(name.parts) < 2:
                        raise ValueError("Ungültiger Übernahmebereich")
                    if (name.parts[0] == "local" and item.name not in {"local/uni_os.sqlite3", "local/anki/collection.anki2"}
                            and not item.name.startswith("local/anki/collection.media/")
                            and not (len(name.parts) == 3 and name.parts[1] == "addon-modules"
                                     and re.fullmatch(r"[a-f0-9]{64}\.wasm", name.name) and item.size <= 2_000_000)
                            and (len(name.parts) != 2 or name.name not in LOCAL_METADATA)):
                        raise ValueError("Nicht erlaubte lokale Datei")
                    destination = stage / item.name
                    native_path(destination.parent).mkdir(parents=True, exist_ok=True, mode=0o700)
                    descriptor = os.open(native_path(destination), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                    with os.fdopen(descriptor, "wb") as output:
                        shutil.copyfileobj(stream, output, length=1024 * 1024)
                    files[item.name] = _digest(destination)
                    if name.parts[:2] == ("local", "addon-modules") and files[item.name] != name.stem:
                        raise ValueError("Addon-Prüfsumme stimmt nicht")
            reader.verify_end()
        if (not isinstance(metadata, dict) or metadata.get("version") != 1
                or metadata.get("files") != files or "local/uni_os.sqlite3" not in files):
            raise ValueError("Übernahmepaket stimmt nicht mit seinem Manifest überein")
        with closing(sqlite3.connect(stage / "local" / "uni_os.sqlite3")) as database:
            if database.execute("PRAGMA integrity_check").fetchone() != ("ok",):
                raise ValueError("Übernommene Datenbank ist nicht intakt")
        portable_paths = portable_database_paths(stage)
        schema_revision = _known_schema(stage / "local" / "uni_os.sqlite3")
        if metadata.get("schema_revision", schema_revision) != schema_revision:
            raise ValueError("Manifest und Datenbank-Schemaversion widersprechen sich")
        _verify_content_references(stage)
        if verify_only:
            return {"verified": True, "files": len(files), "portable_paths": portable_paths,
                    "schema_revision": schema_revision, "source_app_version": metadata.get("app_version")}
        # Build credentials before publishing. Vault identities refer to the final
        # destination while their encrypted physical store is still staged.
        _import_credentials(home, metadata["credentials"], storage_home=stage)
        home.mkdir(parents=True, exist_ok=True, mode=0o700)
        # Publish only after every authenticated block, hash and database check
        # succeeded. A failed credential import never starts a scheduler.
        (stage / "local").rename(home / "local")
        if (stage / "data").exists():
            (stage / "data").rename(home / "data")
        else:
            (home / "data").mkdir(mode=0o700)
        from app.server.keyring import configure_server_keyring

        configure_server_keyring(home)
        settings = Settings(_env_file=None, local_dir=home / "local", data_dir=home / "data", device_name="UniOS Server")  # type: ignore[call-arg]  # Pydantic settings runtime keyword
        coordinator = HostCoordinator(settings)
        try:
            lease = coordinator.acquire_initial()
            from app.host.lease import _atomic_json

            record = asdict(lease)
            record["generation"] = metadata["source_generation"] + 1
            _atomic_json(coordinator.lease_path, record)
        finally:
            coordinator.close()
        return {"verified": True, "files": len(files), "portable_paths": portable_paths,
                "schema_revision": schema_revision, "source_app_version": metadata.get("app_version")}
    finally:
        if native_path(stage).exists():
            if (stage.name.startswith(".unios-import-") and not native_path(stage).is_symlink()
                    and resolve_local(stage).parent == resolve_local(home)):
                shutil.rmtree(native_path(stage))
            else:
                raise ValueError("Temporärer Restore-Pfad liegt außerhalb des Ziels")


def _import_credentials(home: Path, bundle: dict, *, storage_home: Path | None = None) -> None:
    from datetime import datetime

    from app.server.keyring import configure_server_keyring

    configure_server_keyring(storage_home or home)
    values = bundle["settings"]
    institution = values["institution_slug"]
    if values["moodle_token"] and not save_moodle_token(values["moodle_base_url"], values["moodle_token"]):
        raise RuntimeError("Moodle-Zugang konnte nicht gesichert werden")
    if values["ntfy_url"] and not save_ntfy_url(values["ntfy_url"]):
        raise RuntimeError("Benachrichtigung konnte nicht gesichert werden")
    for name, alias in VAULT_ENTRIES:
        if bundle["vaults"].get(name):
            Vault(home / "local", institution, name).save(alias, bundle["vaults"][name])
    if bundle.get("mcp"):
        Vault(home / "local", "local", "mcp").save("bridge", bundle["mcp"])
    if values.get("ai_adapter_api_key"):
        # Settings is built only to locate local_dir; the key goes through the provider store.
        target = Settings(_env_file=None, local_dir=(storage_home or home) / "local",  # type: ignore[call-arg]
                          data_dir=(storage_home or home) / "data")
        ProviderRepository(target).save_key(values["ai_adapter_api_key"])
    for saved in bundle["portals"].values():
        value = dict(saved)
        base_url = value.pop("base_url")
        value["captured_at"] = datetime.fromisoformat(value["captured_at"])
        value["auth_cookie_hosts"] = tuple(value["auth_cookie_hosts"])
        save_session(base_url, PortalSession(**value))
    # Values lacking an existing dedicated vault stay encrypted too. The
    # server entry point applies these before constructing Settings.
    import keyring

    from app.server.keyring import ServerKeyring

    backend = keyring.get_keyring()
    if not isinstance(backend, ServerKeyring):
        raise TypeError("Verschlüsselter Server-Schlüsselbund fehlt")
    backend.set_password("unios.server", "settings", json.dumps(values))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("export", "import"))
    parser.add_argument("--home", type=Path, required=True)
    parser.add_argument("--package", type=Path, required=True)
    parser.add_argument("--key-file", type=Path, required=True)
    args = parser.parse_args()
    key = args.key_file.read_bytes()
    if len(key) != 32:
        raise ValueError("Übernahmeschlüssel muss 32 Bytes haben")
    if args.action == "export":
        os.environ["DATA_DIR"] = str(args.home / "data")
        os.environ["LOCAL_DIR"] = str(args.home / "local")
        get_settings.cache_clear()
        export(get_settings(), args.package, key)
        print("Verschlüsseltes Übernahmepaket und geprüfter Snapshot erstellt")
    else:
        print(json.dumps(import_package(args.home, args.package, key)))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 - no credential/path details in a deployment log
        import traceback

        locations = [
            f"{Path(frame.filename).name}:{frame.name}:{frame.lineno}"
            for frame in traceback.extract_tb(exc.__traceback__)[-4:]
        ]
        print(json.dumps({"error": "MIGRATION_FAILED", "kind": type(exc).__name__, "locations": locations}))
        raise SystemExit(1) from None
