# SPDX-License-Identifier: AGPL-3.0-or-later

"""Encrypted recovery packages and a non-destructive restore rehearsal."""

import json
from pathlib import Path
from tempfile import TemporaryDirectory

import typer

from app.config import get_settings
from app.server.migration import export, import_package

recovery_cli = typer.Typer(help="Vollständige verschlüsselte Wiederherstellung; nur in ein frisches Ziel.")


def _key(path: Path) -> bytes:
    if path.is_symlink():
        raise ValueError("Übernahmeschlüssel darf keine Verknüpfung sein")
    value = path.read_bytes()
    if len(value) != 32:
        raise ValueError("Privater Übernahmeschlüssel muss genau 32 Bytes enthalten")
    return value


@recovery_cli.command("backup")
def backup_package(output: Path = typer.Option(..., "--output"),  # noqa: B008
                   key_file: Path = typer.Option(..., "--key-file"),  # noqa: B008
                   yes: bool = typer.Option(False, "--yes")):
    """Close the host first; package includes study files, Anki and encrypted credentials."""
    if not yes:
        raise typer.BadParameter("Vollständiges verschlüsseltes Backup mit --yes bestätigen")
    try:
        export(get_settings(), output, _key(key_file))
    except (OSError, ValueError, RuntimeError) as exc:
        raise typer.BadParameter("Datensicherung fehlgeschlagen: " + type(exc).__name__) from None
    typer.echo(json.dumps({"output": str(output), "encrypted": True}))


@recovery_cli.command("restore")
def restore_package(package: Path = typer.Option(..., "--package"),  # noqa: B008
                    key_file: Path = typer.Option(..., "--key-file"),  # noqa: B008
                    destination: Path | None = typer.Option(None, "--destination"),  # noqa: B008
                    dry_run: bool = typer.Option(False, "--dry-run"),
                    yes: bool = typer.Option(False, "--yes")):
    """Verify before publishing; --dry-run uses only temporary files and never imports secrets."""
    try:
        key = _key(key_file)
        if dry_run:
            with TemporaryDirectory(prefix="unios-restore-drill-") as directory:
                result = import_package(Path(directory) / "fresh", package, key, verify_only=True)
        else:
            if not yes or destination is None:
                raise ValueError("Frisches Ziel und --yes fehlen")
            result = import_package(destination.resolve(), package, key)
    except Exception as exc:  # noqa: BLE001 - credential and path details must not appear in CLI logs
        raise typer.BadParameter("Wiederherstellung fehlgeschlagen: " + type(exc).__name__) from None
    typer.echo(json.dumps({**result, "dry_run": dry_run}))
