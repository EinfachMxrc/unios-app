# SPDX-License-Identifier: AGPL-3.0-or-later
"""Thin CLI adapter to the same permission/budget checks as MCP."""

import json
from pathlib import Path

import httpx
import typer

from app.corpus.budget import encoded

agent_cli = typer.Typer(no_args_is_help=True, add_completion=False)


def retrieve(operation: str, payload: dict, port: int = 8000):
    if operation not in {'search', 'fetch', 'outline', 'context', 'graph', 'changes', 'act', 'jobs'}:
        raise ValueError('Unbekanntes Agent-Werkzeug')
    if not 1 <= port <= 65535:
        raise ValueError('Ungültiger lokaler Port')
    from app.ai.connection import load_mcp_connection
    from app.config import get_settings
    settings = get_settings()
    load_mcp_connection(settings)
    if not settings.mcp_enabled or not settings.mcp_token:
        raise ValueError('KI-Verbindung in UniOS zuerst freigeben')
    with httpx.Client(base_url=f'http://127.0.0.1:{port}', timeout=30, trust_env=False,
                      headers={'X-UniOS-MCP-Token': settings.mcp_token}) as client:
        response = client.post('/api/ai/mcp/v2/' + operation, json=payload)
    if not response.is_success:
        raise ValueError(f'UniOS verweigert den Abruf (HTTP {response.status_code})')
    return response.json()


@agent_cli.command('search')
def search(query: str = typer.Argument(''), course: str | None = None, semester: str | None = None,
           types: str = '', mode: str = 'search', budget: int = 12000, top_k: int = 20,
           cursor: str | None = None, port: int = 8000, view: str = 'all', deduplicate: bool = True,
           chunks_per_document: int = 2):
    """Im freigegebenen Quellenindex suchen; mode=catalog zeigt Metadaten."""
    typer.echo(encoded(retrieve('search', {'query': query, 'scope': {'course': course, 'semester': semester},
                                          'types': types.split(',') if types else [], 'mode': mode,
                                          'view': view, 'deduplicate': deduplicate,
                                          'chunks_per_document': chunks_per_document,
                                          'budget': budget, 'top_k': top_k, 'cursor': cursor}, port)).decode())


def command(operation):
    def run(request: Path, port: int = 8000):
        """JSON-Anfrage aus einer Datei an das gemeinsame Agent-Werkzeug senden."""
        if request.stat().st_size > 262144:
            raise typer.BadParameter('Anfrage größer als 256 KiB')
        payload = json.loads(request.read_text(encoding='utf-8'))
        if not isinstance(payload, dict):
            raise typer.BadParameter('JSON-Objekt erforderlich')
        typer.echo(encoded(retrieve(operation, payload, port)).decode())
    return run


for tool in ('fetch', 'outline', 'context', 'graph', 'changes', 'act', 'jobs'):
    agent_cli.command(tool)(command(tool))
