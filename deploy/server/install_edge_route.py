# SPDX-License-Identifier: AGPL-3.0-or-later
"""Validate a single added UniOS route before reloading an existing Caddy."""

import argparse
import subprocess
from datetime import UTC, datetime
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("fragment", type=Path)
    args = parser.parse_args()
    source = Path("/opt/edge/Caddyfile")
    if source.is_symlink() or not source.is_file():
        raise ValueError("Erwartete Caddy-Konfiguration fehlt")
    previous = source.read_text()
    if "handle_path /unios/*" in previous:
        raise ValueError("UniOS-Zugang ist bereits vorhanden; vorhandene Konfiguration prüfen")
    if not previous.startswith(":80 {"):
        raise ValueError("Unerwartete bestehende Site-Konfiguration")
    fragment = args.fragment.read_text()
    candidate = previous.replace(":80 {", ":80 {\n" + fragment + "\n", 1)
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    prepared = Path(f"/opt/unios/caddy-candidate-{timestamp}")
    prepared.write_text(candidate)
    subprocess.run(["docker", "cp", str(prepared), "edge-caddy:/tmp/unios-candidate"], check=True)
    subprocess.run(["docker", "exec", "edge-caddy", "caddy", "validate", "--config",
                    "/tmp/unios-candidate", "--adapter", "caddyfile"], check=True)
    backup = source.with_name(f"Caddyfile.before-unios-{timestamp}")
    with backup.open("x") as output:
        output.write(previous)
    # Keep the bind-mounted inode; replace() would leave Caddy reading the
    # old inode. Reload only after validation; restore on any reload error.
    try:
        source.write_text(candidate)
        subprocess.run(["docker", "exec", "edge-caddy", "caddy", "reload", "--config", "/etc/caddy/Caddyfile",
                        "--adapter", "caddyfile"], check=True)
    except (OSError, subprocess.CalledProcessError):
        source.write_text(previous)
        subprocess.run(["docker", "exec", "edge-caddy", "caddy", "reload", "--config", "/etc/caddy/Caddyfile",
                        "--adapter", "caddyfile"], check=True)
        raise
    print("UniOS-Route validiert und aktiviert; vorige Konfiguration gesichert")


if __name__ == "__main__":
    main()
