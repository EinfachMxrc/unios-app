# SPDX-License-Identifier: AGPL-3.0-or-later

"""Universal read-only entity browser and confirmed semantic link commands."""

import json
from pathlib import Path
from typing import Annotated, cast
from urllib.parse import quote

import typer
from pydantic import ValidationError

from app.cli.api_client import call_api
from app.entities.schema import EntityKind, EntityRef, RelationKind, relationship

entity_cli = typer.Typer(no_args_is_help=True, add_completion=False)


def _emit(value: object, json_output: bool) -> None:
    from app.cli.main import emit

    if json_output:
        emit(value, pretty=True)
    elif isinstance(value, list):
        for item in value:
            typer.echo(f"{item.get('id', '')}\t{item.get('name', item.get('title', item.get('question', item.get('body', ''))))}")
    elif isinstance(value, dict):
        for key, entry in value.items():
            typer.echo(f"{key}: {entry}")


def _call(method: str, path: str, *, port: int, confirmed: bool = False,
          payload: object | None = None) -> object:
    from app.cli.main import fail

    try:
        return call_api(method, path, port=port, confirmed=confirmed, payload=payload)
    except (ValueError, OSError) as exc:
        fail(str(exc), 2)


def _ref(kind: str, object_id: str) -> EntityRef:
    from app.cli.main import fail

    try:
        return EntityRef(type=cast(EntityKind, kind), id=object_id)
    except ValidationError:
        fail("Unbekannter Objekttyp oder ungültige Kennung", 2)


@entity_cli.command("list")
def list_command(kind: str, offset: int = typer.Option(0, min=0),
                 limit: int = typer.Option(50, min=1, max=100),
                 port: int = typer.Option(8000), json_output: bool = typer.Option(False, "--json")):
    """List entities of a registered kind, up to 100 per page."""
    ref = _ref(kind, "1")
    result = _call("GET", f"/api/entities/{ref.type}?offset={offset}&limit={limit}", port=port)
    _emit(result, json_output)


@entity_cli.command("get")
def get_command(kind: str, object_id: str, port: int = typer.Option(8000),
                json_output: bool = typer.Option(False, "--json")):
    """Read the public fields of one entity."""
    ref = _ref(kind, object_id)
    result = _call("GET", f"/api/entities/{ref.type}/{quote(ref.id, safe='')}", port=port)
    _emit(result, json_output)


@entity_cli.command("search")
def search_command(kind: str, query: str, port: int = typer.Option(8000),
                   json_output: bool = typer.Option(False, "--json")):
    """Search public title fields of one entity kind."""
    from app.cli.main import fail

    ref = _ref(kind, "1")
    if not 2 <= len(query.strip()) <= 100:
        fail("Suche benötigt 2 bis 100 Zeichen", 2)
    result = _call("GET", f"/api/entities/{ref.type}?q={quote(query.strip(), safe='')}", port=port)
    _emit(result, json_output)


@entity_cli.command("links")
def links_command(kind: str, object_id: str, port: int = typer.Option(8000),
                  json_output: bool = typer.Option(False, "--json")):
    """Show outgoing relationships and automatic backlinks for one entity."""
    ref = _ref(kind, object_id)
    _emit(_call("GET", f"/api/links/{ref.type}/{quote(ref.id, safe='')}", port=port), json_output)


@entity_cli.command("actions")
def actions_command(kind: str, object_id: str, port: int = typer.Option(8000),
                    json_output: bool = typer.Option(False, "--json")):
    """List registered actions, their input schemas and capabilities."""
    ref = _ref(kind, object_id)
    _emit(_call("GET", f"/api/entities/{ref.type}/{quote(ref.id, safe='')}/actions", port=port), json_output)


@entity_cli.command("action")
def action_command(kind: str, object_id: str, action_id: str,
                   input_file: Annotated[Path | None, typer.Option("--input")] = None,
                   dry_run: bool = typer.Option(False, "--dry-run"),
                   yes: bool = typer.Option(False, "--yes"),
                   port: int = typer.Option(8000), json_output: bool = typer.Option(False, "--json")):
    """Run an action using JSON input; mutations need --yes, previews use --dry-run."""
    from app.cli.main import fail

    ref = _ref(kind, object_id)
    path = f"/api/entities/{ref.type}/{quote(ref.id, safe='')}/actions"
    definitions = cast(list[dict], _call("GET", path, port=port))
    definition = next((item for item in definitions if item["id"] == action_id), None)
    if definition is None:
        fail("Aktion ist für diesen Objekttyp nicht verfügbar", 2)
    if definition["requires_confirmation"] and not (yes or dry_run):
        fail("Aktion mit --yes bestätigen oder mit --dry-run prüfen", 2)
    try:
        values = json.loads(input_file.read_text(encoding="utf-8")) if input_file else {}
        if not isinstance(values, dict):
            raise TypeError("Objekt erwartet")
    except (OSError, ValueError, TypeError):
        fail("Eingabedatei muss ein gültiges JSON-Objekt enthalten", 2)
    _emit(_call("POST", f"{path}/{quote(action_id, safe='')}", port=port, confirmed=True,
                payload={"input": values, "dry_run": dry_run, "confirmed": yes}), json_output or dry_run)


def relate_command(from_type: str, from_id: str, relation: RelationKind,
                   to_type: str, to_id: str, port: int = typer.Option(8000),
                   dry_run: bool = typer.Option(False, "--dry-run"),
                   yes: bool = typer.Option(False, "--yes"),
                   json_output: bool = typer.Option(False, "--json")):
    """Link two existing entities; preview with --dry-run, apply with --yes."""
    from app.cli.main import fail

    left, right = _ref(from_type, from_id), _ref(to_type, to_id)
    if left == right:
        fail("Ein Objekt kann nicht mit sich selbst verknüpft werden", 2)
    payload = {"from_type": left.type, "from_id": left.id, "to_type": right.type,
               "to_id": right.id, "relation": relationship(relation).kind}
    if dry_run:
        for ref in (left, right):
            _call("GET", f"/api/entities/{ref.type}/{quote(ref.id, safe='')}", port=port)
        _emit({"dry_run": True, "would_create": payload}, True)
    else:
        if not yes:
            fail("Verknüpfung mit --yes bestätigen", 2)
        _emit(_call("POST", "/api/links", port=port, confirmed=True, payload=payload), json_output)


def unlink_command(kind: str, object_id: str, edge_id: int, port: int = typer.Option(8000),
                   dry_run: bool = typer.Option(False, "--dry-run"),
                   yes: bool = typer.Option(False, "--yes"),
                   json_output: bool = typer.Option(False, "--json")):
    """Remove a relationship found on an entity; preview with --dry-run."""
    from app.cli.main import fail

    ref = _ref(kind, object_id)
    links = cast(list[dict], _call("GET", f"/api/links/{ref.type}/{quote(ref.id, safe='')}", port=port))
    edge = next((item for item in links if item["id"] == edge_id), None)
    if edge is None:
        fail("Verknüpfung bei diesem Objekt nicht gefunden", 2)
    if dry_run:
        _emit({"dry_run": True, "would_unlink": edge}, True)
    else:
        if not yes:
            fail("Entfernen mit --yes bestätigen", 2)
        _call("DELETE", f"/api/links/{edge_id}", port=port, confirmed=True)
        _emit({"unlinked": edge_id}, json_output)
