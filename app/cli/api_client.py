# SPDX-License-Identifier: AGPL-3.0-or-later

"""One machine-readable CLI surface for the local HTTP API."""

import json
from pathlib import Path
from urllib.parse import urlsplit

import httpx


def call_api(method: str, path: str, *, port: int = 8000, body_file: Path | None = None,
             upload_file: Path | None = None, form_field: str = "file",
             output: Path | None = None, confirmed: bool = False,
             payload: object | None = None) -> object:
    verb = method.upper()
    if verb not in {"GET", "POST", "PUT", "PATCH", "DELETE"}:
        raise ValueError("HTTP-Methode muss GET, POST, PUT, PATCH oder DELETE sein")
    parsed = urlsplit(path)
    if (not (path.startswith("/api/") or (verb == "GET" and path == "/openapi.json"))
            or path.startswith("//") or parsed.scheme or parsed.netloc
            or parsed.fragment or "\\" in path or ".." in parsed.path.split("/")):
        raise ValueError("Nur relative lokale API-Pfade sind erlaubt")
    if not 1 <= port <= 65535:
        raise ValueError("Ungültiger lokaler Port")
    if verb != "GET" and not confirmed:
        raise ValueError("Schreibzugriff erfordert --yes")
    if sum(item is not None for item in (body_file, upload_file, payload)) > 1:
        raise ValueError("Nur eine Body-Quelle ist erlaubt")
    if verb == "GET" and (body_file or upload_file or payload is not None):
        raise ValueError("GET akzeptiert keinen Body")
    if output and output.exists():
        raise ValueError("Zieldatei existiert bereits")
    request_payload = json.loads(body_file.read_text(encoding="utf-8")) if body_file else payload
    url = f"http://127.0.0.1:{port}{path}"
    with httpx.Client(follow_redirects=False, trust_env=False, timeout=60) as client:
        headers = None
        if verb != "GET":
            host = client.get(f"http://127.0.0.1:{port}/api/host")
            host.raise_for_status()
            status = host.json()
            generation = status.get("generation")
            if status.get("mode") != "host" or type(generation) is not int or generation < 1:
                raise ValueError("Kein aktiver UniOS-Host für Schreibzugriff")
            headers = {"X-UniOS-Lease-Generation": str(generation)}
        if upload_file:
            with upload_file.open("rb") as stream:
                response = client.request(verb, url, files={form_field: (upload_file.name, stream)}, headers=headers)
        else:
            response = client.request(verb, url, json=request_payload, headers=headers)
    if response.is_error:
        try:
            detail = response.json()
        except ValueError:
            detail = response.text[:300]
        raise ValueError(f"HTTP {response.status_code}: {detail}")
    if output:
        output.write_bytes(response.content)
        return {"output": str(output), "bytes": len(response.content), "status": response.status_code}
    if response.status_code == 204:
        return {"status": 204}
    if "json" not in response.headers.get("content-type", "").lower():
        raise ValueError("Binäre Antwort benötigt --output")
    return response.json()
