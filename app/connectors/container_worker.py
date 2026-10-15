# SPDX-License-Identifier: AGPL-3.0-or-later

"""Public stdio worker helper for networkless connector images (protocol 1)."""

import base64
import json
import sys
from collections.abc import Callable, Mapping
from dataclasses import asdict, dataclass, is_dataclass
from typing import TextIO

import httpx
from pydantic import TypeAdapter

from app.connectors.base import Connector, RemoteResource
from app.connectors.manifest import Capability


def _jsonable(value: object) -> object:
    if is_dataclass(value) and not isinstance(value, type):
        return _jsonable(asdict(value))
    if isinstance(value, dict):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set, frozenset)):
        return [_jsonable(item) for item in value]
    return value


@dataclass
class BrokerContext:
    id: str
    profile_slug: str
    config: Mapping[str, object]
    capabilities: frozenset[Capability]
    domains: frozenset[str]
    secrets: Mapping[str, str]
    input: TextIO
    output: TextIO

    def get(self, url: str, *, timeout: float = 20) -> httpx.Response:
        """Request HTTPS through the host's checked broker; no container network."""
        self.output.write(json.dumps({"type": "http_get", "url": url}) + "\n")
        self.output.flush()
        message = json.loads(self.input.readline())
        if message.get("type") != "http_result":
            raise ValueError("HTTP-Anfrage wurde vom Host abgelehnt")
        content = base64.b64decode(message["body_b64"], validate=True)
        return httpx.Response(
            int(message["status"]), content=content,
            headers={"content-type": message.get("content_type", "")},
            request=httpx.Request("GET", url),
        )


def serve(factory: Callable[[BrokerContext], Connector], *,
          input: TextIO = sys.stdin, output: TextIO = sys.stdout) -> None:
    """Serve exactly one request; only protocol messages go to stdout."""
    if input is sys.stdin and hasattr(input, "reconfigure"):
        input.reconfigure(encoding="utf-8")
    if output is sys.stdout and hasattr(output, "reconfigure"):
        output.reconfigure(encoding="utf-8")
    try:
        request = json.loads(input.readline())
        if request.get("protocol") != 1 or request.get("method") not in {
            "check_auth", "list_courses", "fetch_changes", "download", "health"
        }:
            raise ValueError("Unbekannte Connector-Protokollversion oder Methode")
        raw = request["context"]
        context = BrokerContext(
            id=str(raw["id"]), profile_slug=str(raw["profile_slug"]), config=raw["config"],
            capabilities=frozenset(raw["capabilities"]), domains=frozenset(raw["domains"]),
            secrets=raw["secrets"], input=input, output=output,
        )
        connector = factory(context)
        method = request["method"]
        result: object
        if method == "fetch_changes":
            result = connector.fetch_changes(request.get("argument"))
        elif method == "download":
            resource = TypeAdapter(RemoteResource).validate_python(request["argument"])
            result = {"bytes_b64": base64.b64encode(connector.download(resource)).decode("ascii")}
        else:
            result = getattr(connector, method)()
        output.write(json.dumps({"type": "result", "value": _jsonable(result)},
                                ensure_ascii=False) + "\n")
        output.flush()
    except Exception as exc:  # noqa: BLE001 - never expose secret-bearing plugin errors on stdout
        print(f"Connector worker failed: {type(exc).__name__}", file=sys.stderr)
        raise SystemExit(1) from None
