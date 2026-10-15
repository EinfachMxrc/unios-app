# SPDX-License-Identifier: AGPL-3.0-or-later

"""Run community connectors in a networkless, unmounted Linux container."""

import asyncio
import base64
import json
import shutil
import subprocess
from dataclasses import asdict

from pydantic import TypeAdapter

from app.connectors.base import (
    ConnectorAuth,
    ConnectorStatus,
    RemoteCourse,
    RemoteResource,
    Snapshot,
)
from app.connectors.manifest import ConnectorManifest
from app.connectors.sdk import ConnectorContext

MAX_MESSAGE = 48 * 1024 * 1024
MAX_HTTP_BODY = 32 * 1024 * 1024
MAX_BROKER_CALLS = 40
RESPONSE_TIMEOUT = 90
TOTAL_TIMEOUT = 120


class SandboxUnavailable(ValueError):
    pass


def _docker() -> str:
    executable = shutil.which("docker")
    if not executable:
        raise SandboxUnavailable("Docker fehlt für isolierte Community-Connectoren")
    return executable


def container_installed(manifest: ConnectorManifest) -> bool:
    if manifest.runtime != "container" or not manifest.image:
        return False
    try:
        result = subprocess.run(
            [_docker(), "image", "inspect", "--format", "{{json .RepoDigests}}", manifest.image],
            capture_output=True, text=True, timeout=8, check=False,
        )
        return result.returncode == 0 and manifest.image in json.loads(result.stdout)
    except (OSError, ValueError, subprocess.TimeoutExpired, SandboxUnavailable):
        return False


def install_container(manifest: ConnectorManifest) -> None:
    if manifest.runtime != "container" or not manifest.image:
        raise SandboxUnavailable("Dieser Connector hat kein isoliertes Container-Image")
    try:
        result = subprocess.run([_docker(), "pull", manifest.image], capture_output=True,
                                text=True, timeout=240, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise SandboxUnavailable(f"Container-Installation fehlgeschlagen: {type(exc).__name__}") from None
    if result.returncode != 0 or not container_installed(manifest):
        raise SandboxUnavailable("Das geprüfte Container-Image ist nicht verfügbar")


def container_command(manifest: ConnectorManifest) -> list[str]:
    if manifest.runtime != "container" or not manifest.image:
        raise SandboxUnavailable("Connector braucht ein geprüftes Container-Image")
    return [
        _docker(), "run", "--rm", "--interactive", "--pull", "never",
        "--network", "none", "--read-only", "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges", "--pids-limit", "32",
        "--memory", "256m", "--cpus", "1", "--user", "65532:65532",
        "--tmpfs", "/tmp:rw,nosuid,noexec,size=16m",
        "--entrypoint", "unios-connector-worker", manifest.image,
    ]


async def _send(stream: asyncio.StreamWriter, value: object) -> None:
    stream.write(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8") + b"\n")
    await stream.drain()


class ContainerConnector:
    """Synchronous connector facade; all plugin code stays inside Docker."""

    def __init__(self, manifest: ConnectorManifest, context: ConnectorContext):
        if not container_installed(manifest):
            raise SandboxUnavailable("Geprüftes Container-Image fehlt oder Docker läuft nicht")
        self.manifest = manifest
        self.context = context
        self.name = manifest.id

    async def _invoke_async(self, method: str, argument: object = None) -> object:
        process = await asyncio.create_subprocess_exec(
            *container_command(self.manifest), stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
            limit=MAX_MESSAGE,
        )
        assert process.stdin and process.stdout
        deadline = asyncio.get_running_loop().time() + TOTAL_TIMEOUT
        try:
            await _send(process.stdin, {
                "protocol": 1, "method": method, "argument": argument,
                "context": {
                    "id": self.context.id, "profile_slug": self.context.profile_slug,
                    "config": dict(self.context.config),
                    "capabilities": sorted(self.context.capabilities),
                    "domains": sorted(self.context.domains),
                    "secrets": dict(self.context.secrets),
                },
            })
            for _ in range(MAX_BROKER_CALLS + 1):
                try:
                    remaining = deadline - asyncio.get_running_loop().time()
                    line = await asyncio.wait_for(process.stdout.readline(),
                                                  timeout=min(RESPONSE_TIMEOUT, max(0, remaining)))
                except (TimeoutError, ValueError) as exc:
                    raise SandboxUnavailable("Connector-Protokoll überschritt Zeit- oder Größenlimit") from exc
                if not line:
                    raise SandboxUnavailable("Connector-Prozess endete ohne gültiges Ergebnis")
                try:
                    message = json.loads(line)
                except ValueError as exc:
                    raise SandboxUnavailable("Connector lieferte ungültiges JSON") from exc
                if not isinstance(message, dict):
                    raise SandboxUnavailable("Connector lieferte ungültige Nachricht")
                if message.get("type") == "result":
                    return message.get("value")
                if message.get("type") != "http_get" or not isinstance(message.get("url"), str):
                    raise SandboxUnavailable("Connector verwendete eine nicht erlaubte Operation")
                try:
                    remaining = deadline - asyncio.get_running_loop().time()
                    response = await asyncio.wait_for(asyncio.to_thread(self.context.get, message["url"]),
                                                      timeout=max(0, remaining))
                    if len(response.content) > MAX_HTTP_BODY:
                        raise ValueError("HTTP-Antwort zu groß")
                    payload = {
                        "type": "http_result", "status": response.status_code,
                        "content_type": response.headers.get("content-type", ""),
                        "body_b64": base64.b64encode(response.content).decode("ascii"),
                    }
                except (ValueError, OSError, TimeoutError) as exc:
                    payload = {"type": "http_error", "error": type(exc).__name__}
                await _send(process.stdin, payload)
            raise SandboxUnavailable("Connector hat zu viele HTTP-Anfragen gestellt")
        finally:
            if process.returncode is None:
                process.kill()
            await process.wait()

    def _invoke(self, method: str, argument: object = None) -> object:
        try:
            return asyncio.run(self._invoke_async(method, argument))
        except (OSError, RuntimeError) as exc:
            raise SandboxUnavailable(f"Container konnte nicht ausgeführt werden: {type(exc).__name__}") from None

    def check_auth(self) -> ConnectorAuth:
        return TypeAdapter(ConnectorAuth).validate_python(self._invoke("check_auth"))

    def list_courses(self) -> list[RemoteCourse]:
        return TypeAdapter(list[RemoteCourse]).validate_python(self._invoke("list_courses"))

    def fetch_changes(self, since: int | None = None) -> Snapshot:
        return TypeAdapter(Snapshot).validate_python(self._invoke("fetch_changes", since))

    def download(self, resource: RemoteResource) -> bytes:
        value = self._invoke("download", asdict(resource))
        if not isinstance(value, dict) or not isinstance(value.get("bytes_b64"), str):
            raise SandboxUnavailable("Connector lieferte keine Datei")
        data = base64.b64decode(value["bytes_b64"], validate=True)
        if len(data) > MAX_HTTP_BODY:
            raise SandboxUnavailable("Connector-Datei ist zu groß")
        return data

    def health(self) -> ConnectorStatus:
        return TypeAdapter(ConnectorStatus).validate_python(self._invoke("health"))
