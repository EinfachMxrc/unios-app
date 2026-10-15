#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
set -euo pipefail

if [[ -e .env || -e data || -e local ]]; then
  echo "Docker-Smoke benötigt einen frischen CI-Checkout ohne lokale Daten" >&2
  exit 2
fi

cp .env.example .env
chmod 600 .env
trap 'docker stop marc-uni-os-recovery >/dev/null 2>&1 || true; docker compose down --remove-orphans >/dev/null 2>&1 || true' EXIT

docker compose config --quiet
docker compose build api
docker compose run --rm api unios host acquire
docker compose run --rm api alembic upgrade head
docker compose up -d api

ready=0
for _ in {1..40}; do
  if curl --silent --fail http://127.0.0.1:8000/health >/dev/null; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" != 1 ]]; then
  docker compose logs --no-color api
  exit 1
fi

python3 - <<'PY'
from urllib.error import HTTPError
from urllib.request import urlopen

try:
    urlopen("http://127.0.0.1:8000/api/host", timeout=5)
except HTTPError as error:
    assert error.code == 401
else:
    raise AssertionError("Ungekoppelter Docker-Bridge-Zugriff wurde erlaubt")
PY

# The bridge peer is not loopback inside the container. Exercise the owner's
# normal local session from within the container without disabling authentication.
docker compose exec -T api python - <<'PY'
import json
from http.cookiejar import CookieJar
from urllib.request import HTTPCookieProcessor, build_opener

browser = build_opener(HTTPCookieProcessor(CookieJar()))


def read(path):
    with browser.open(f"http://127.0.0.1:8000{path}", timeout=5) as response:
        assert response.status == 200, path
        return response.read().decode("utf-8")


assert json.loads(read("/health"))["status"] == "ok"
assert json.loads(read("/api/host"))["mode"] == "host"
assert "UniOS" in read("/")
assert "UniOS" in read("/manifest.webmanifest")
print("Docker Compose: React, API, PWA und Staffelstab bereit")
PY

docker compose stop api
export RESTIC_REPOSITORY=/app/backup
export RESTIC_PASSWORD=ci-only-restic-fixture
docker compose run --rm -e RESTIC_REPOSITORY -e RESTIC_PASSWORD api restic init
docker compose run --rm -e RESTIC_REPOSITORY -e RESTIC_PASSWORD api python -c \
  'from app.health.backup import main; raise SystemExit(main())'
docker compose run --rm -e RESTIC_REPOSITORY -e RESTIC_PASSWORD \
  -e RESTORE_UID="$(id -u)" -e RESTORE_GID="$(id -g)" \
  -v "$PWD/restore:/app/restore" api sh -c \
  'restic restore latest --target /app/restore && chown -R "$RESTORE_UID:$RESTORE_GID" /app/restore'

python3 - <<'PY'
import json
import shutil
import sqlite3
from pathlib import Path

snapshots = list(Path("restore/app/data/backup-snapshots").glob("*.sqlite3"))
assert len(snapshots) == 1, snapshots
with sqlite3.connect(f"file:{snapshots[0].resolve()}?mode=ro&immutable=1", uri=True) as connection:
    assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    assert connection.execute("SELECT name FROM sqlite_master WHERE name='courses'").fetchone() is not None
assert Path("restore/app/data/host/lease.json").is_file()
identity = json.loads(Path("restore/app/local/device.json").read_text())
lease = json.loads(Path("restore/app/data/host/lease.json").read_text())
assert identity["device_id"] == lease["device_id"]
statuses = list(Path("data/backup-status").glob("*.json"))
assert len(statuses) == 1, statuses
assert json.loads(statuses[0].read_text())["status"] == "success"
shutil.copytree("restore/app/data", "recovered-data")
Path("recovered-local").mkdir()
shutil.copy2("restore/app/local/device.json", "recovered-local/device.json")
shutil.copy2(snapshots[0], "recovered-local/uni_os.sqlite3")
print("Docker Compose: verschlüsseltes Restic-Backup und SQLite-Wiederherstellung geprüft")
PY

recovered_image="$(docker compose images -q api)"
docker run --detach --rm --name marc-uni-os-recovery \
  --publish 127.0.0.1:8001:8000 \
  --volume "$PWD/recovered-data:/app/data" --volume "$PWD/recovered-local:/app/local" \
  --env DATA_DIR=/app/data --env LOCAL_DIR=/app/local --env DEVICE_NAME=Docker-Host \
  "$recovered_image" >/dev/null
recovered=0
for _ in {1..40}; do
  if curl --silent --fail http://127.0.0.1:8001/health >/dev/null; then
    recovered=1
    break
  fi
  sleep 1
done
if [[ "$recovered" != 1 ]]; then
  docker logs marc-uni-os-recovery
  exit 1
fi
docker exec -i marc-uni-os-recovery python - <<'PY'
import json
from urllib.request import urlopen

with urlopen("http://127.0.0.1:8000/api/host", timeout=5) as response:
    assert json.load(response)["mode"] == "host"
print("Wiederhergestellte Instanz hält den Staffelstab und läuft")
PY
