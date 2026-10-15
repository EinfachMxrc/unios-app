#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
set -euo pipefail
umask 077
root=/opt/unios
source_root=${1:?Release-Verzeichnis fehlt}
image="unios-server:${UNIOS_VERSION:-0.1.28}"
public_url=${2:?HTTPS-Adresse fehlt}
[[ "$source_root" == "$root/releases/"* && -f "$source_root/deploy/server/compose.yaml" ]]
[[ $(id -u) == 0 ]]
mkdir -p "$root/secrets" "$root/state"
chmod 700 "$root/secrets" "$root/state"
chown 10001:10001 "$root/state"
docker run --rm --user 0 --network none --entrypoint python \
  -v "$root/secrets:/secrets" "$image" -c '
import os
from pathlib import Path
from cryptography.fernet import Fernet
p=Path("/secrets/unios.key")
if not p.exists():
    fd=os.open(p, os.O_WRONLY|os.O_CREAT|os.O_EXCL, 0o600)
    with os.fdopen(fd,"wb") as output: output.write(Fernet.generate_key())
    os.chown(p,10001,10001)
if p.is_symlink() or p.stat().st_size!=44 or p.stat().st_mode & 0o077 or p.stat().st_uid!=10001:
    raise SystemExit("Server-Schluessel ist nicht sicher provisioniert")
'
docker run --rm --network none --entrypoint python "$image" -c \
  'import sys; from app.client.service import validate_server_url; validate_server_url(sys.argv[1])' "$public_url"
if [[ ! -f "$root/server.env" ]]; then
  printf 'PUBLIC_SERVER_URL=%s\nALLOWED_HOSTS=127.0.0.1,localhost\n' "$public_url" > "$root/server.env"
fi
printf 'UNIOS_SOURCE_ROOT=%s\nUNIOS_STATE_ROOT=%s\n' "$source_root" "$root" > "$root/deploy.env"
echo 'UniOS-Serververzeichnis und separater Schluessel bereit; Dienst noch nicht gestartet.'
