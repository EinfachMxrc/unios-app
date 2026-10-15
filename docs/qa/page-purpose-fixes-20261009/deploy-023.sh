#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Prepared only. Phases are explicit; this file does nothing until invoked.
# Usage: bash workspace-023-server.sh PHASE RELEASE_DIR SOURCE_SHA ARCHIVE_SHA256 IMAGE
# PHASE: build | smoke | activate
# No automatic or manual downgrade: 0.1.23 native review state can require 0.1.23.
set -euo pipefail
umask 077

phase=${1:?phase required}
release=${2:?release directory required}
source_sha=${3:?exact reviewed source revision required}
archive_sha=${4:?source archive SHA-256 required}
image=${5:?unique candidate image tag required}
[[ "$phase" =~ ^(build|smoke|activate)$ ]]
[[ "$release" =~ ^/opt/unios/releases/v0\.1\.23-[A-Za-z0-9._-]+$ ]]
[[ "$source_sha" =~ ^[a-f0-9]{40}$ && "$archive_sha" =~ ^[a-f0-9]{64}$ ]]
[[ "$image" =~ ^unios-server:0\.1\.23-[A-Za-z0-9._-]+$ ]]
test -d "$release" && test ! -L "$release"
test "$(realpath "$release")" = "$release"

base=unios-server:0.1.22-workspace-6f3f39ae3b5e
base_id=sha256:0cd1c8d2355aab2ce3eed5db731d06a4dc2af71295942b682ababdc1314f22f9
schema=ff98c7da0320
working_dir=/opt/unios/releases/0.1.19-sqlite-lock-20261005
env_file=/opt/unios/releases/v0.1.21-alpha3/deploy-final.env
files=(
  /opt/unios/releases/0.1.19-sqlite-lock-20261005/compose.yaml
  /opt/unios/releases/0.1.18-tutor-src/deploy/server/compose.edge.runner.yaml
  /opt/unios/releases/0.1.19-txt-reader-20261005/txt-image.yaml
  /opt/unios/releases/v0.1.20-alpha2-final/final-image.yaml
  /opt/unios/releases/v0.1.20-alpha2-layout-final/image.yaml
  /opt/unios/releases/v0.1.21-alpha3/image-final.yaml
  /opt/unios/releases/v0.1.22-workspace-6f3f39ae3b5e/image-022.yaml
)
original_labels=$(IFS=,; printf '%s' "${files[*]}")
compose=(docker compose --project-name unios --project-directory "$working_dir" --env-file "$env_file")
for file in "${files[@]}"; do test -f "$file"; compose+=(-f "$file"); done
test -f "$env_file"
override="$release/image-023.yaml"
retained_base_tag="unios-server:before-0.1.23-${source_sha:0:12}"
archive="$release/UniOS-0.1.23-server-source.tar.gz"

assert_mounts() {
  test "$(docker inspect unios-server --format '{{range .Mounts}}{{if eq .Destination "/var/lib/unios"}}{{.Source}}:{{.RW}}{{end}}{{end}}')" = '/opt/unios/state:true' || return 1
  test "$(docker inspect unios-server --format '{{range .Mounts}}{{if eq .Destination "/run/secrets/unios.key"}}{{.Source}}:{{.RW}}{{end}}{{end}}')" = '/opt/unios/secrets/unios.key:false' || return 1
}
assert_base() {
  test "$(docker inspect unios-server --format '{{.Image}}')" = "$base_id"
  test "$(docker inspect unios-server --format '{{.Config.Image}}')" = "$base"
  test "$(docker inspect unios-server --format '{{index .Config.Labels "com.docker.compose.project"}}')" = unios
  test "$(docker inspect unios-server --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}')" = "$working_dir"
  test "$(docker inspect unios-server --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}')" = "$original_labels"
  assert_mounts
}
topology() {
  # Deliberately exclude Config.Env, env contents, private state and container logs.
  docker inspect unios-server --format '{{json .HostConfig.PortBindings}}|{{json .HostConfig.ExtraHosts}}|{{json .HostConfig.RestartPolicy}}|{{.Config.User}}|{{.HostConfig.ReadonlyRootfs}}|{{json .HostConfig.CapDrop}}|{{json .HostConfig.SecurityOpt}}'
  docker inspect unios-server --format '{{range $name, $network := .NetworkSettings.Networks}}{{println $name}}{{end}}' | sort
}
image_schema() {
  docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
    "$1" python -c 'from alembic.config import Config; from alembic.script import ScriptDirectory; print(ScriptDirectory.from_config(Config("/app/alembic.ini")).get_current_head())'
}
assert_candidate() {
  test -f "$release/build-image.id" && test -f "$release/smoke.ok"
  test "$(docker image inspect "$image" --format '{{.Id}}')" = "$(cat "$release/build-image.id")"
  test "$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" = "$source_sha"
  test "$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.version"}}')" = 0.1.23
  test "$(image_schema "$image")" = "$schema"
}
healthy() {
  for attempt in $(seq 1 150); do
    if test "$(docker inspect unios-server --format '{{.State.Health.Status}}')" = healthy && \
      curl --fail --silent --max-time 3 http://127.0.0.1:8008/health > /dev/null; then return 0; fi
    sleep 1
  done
  return 1
}
activation_failure() {
  local code=$1 active_image stop_result=not_candidate
  trap - ERR
  set +e
  active_image=$(docker inspect unios-server --format '{{.Image}}' 2>/dev/null)
  # Keep the new container, image, overrides and journals for forward repair.
  # A graceful stop may flush the current handle, but never proves downgrade safety:
  # orphan journals and failed review mirrors can remain without a current handle.
  if test "$active_image" = "$(cat "$release/build-image.id")"; then
    docker stop --time 120 unios-server > /dev/null 2>&1
    stop_result=$?
  fi
  # Only technical deployment metadata. Do not read logs, env or application state.
  (set -o noclobber
    printf 'failed_at_utc=%s\nexit_code=%s\nsource_revision=%s\narchive_sha256=%s\ncandidate_image=%s\nactive_image_id=%s\nretained_base_image=%s\ngraceful_stop_exit=%s\n' \
      "$(date -u +%FT%TZ)" "$code" "$source_sha" "$archive_sha" "$image" "$active_image" "$retained_base_tag" "$stop_result" \
      > "$release/activation.failure")
  printf '%s\n' 'Activation failed. Candidate and deployment evidence retained; no downgrade performed.' >&2
  printf '%s\n' 'Operator must repair with 0.1.23-compatible code. A clean stop alone does not authorize 0.1.22.' >&2
  exit "$code"
}

case "$phase" in
  build)
    assert_base
    test ! -e "$release/source" && test ! -e "$release/build-image.id"
    ! docker image inspect "$image" > /dev/null 2>&1
    printf '%s  %s\n' "$archive_sha" "$archive" | sha256sum --check --status
    # Validate every archive member before creating a fresh source tree. Never
    # follow links, extract devices, traverse ../, or overwrite existing files.
    python3 - "$archive" "$release/source" <<'PY'
import sys, tarfile
from pathlib import Path, PurePosixPath
archive, destination = Path(sys.argv[1]), Path(sys.argv[2])
roots = {'pyproject.toml', 'uv.lock', 'alembic.ini', '.dockerignore', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'README.md', 'desktop/backend.py'}
prefixes = ('app/', 'config/', 'institutions/', 'clients/', 'alembic/', 'frontend/', 'deploy/server/', 'docs/licenses/')
with tarfile.open(archive, 'r:gz') as package:
    members = package.getmembers()
    names = [member.name for member in members]
    assert len(names) == len(set(names)) and 0 < len(names) <= 15000
    assert sum(member.size for member in members) <= 512 * 1024 * 1024
    for member in members:
        path = PurePosixPath(member.name)
        assert member.isfile() and not path.is_absolute() and '..' not in path.parts
        assert 0 <= member.size <= 64 * 1024 * 1024
        assert member.name in roots or member.name.startswith(prefixes), member.name
        assert not any(part in {'data', 'local', '.git', 'node_modules', 'test-results', 'playwright-report'} or part.startswith('.env') for part in path.parts)
    destination.mkdir(mode=0o700)
    for member in members:
        target = destination / member.name
        target.parent.mkdir(parents=True, exist_ok=True)
        with package.extractfile(member) as source, target.open('xb') as output:
            while chunk := source.read(1024 * 1024): output.write(chunk)
    import tomllib
    assert tomllib.loads((destination / 'pyproject.toml').read_text())['project']['version'] == '0.1.23'
PY
    docker build --label "org.opencontainers.image.version=0.1.23" \
      --label "org.opencontainers.image.revision=$source_sha" -t "$image" \
      -f "$release/source/deploy/server/Dockerfile" "$release/source"
    (set -o noclobber; docker image inspect "$image" --format '{{.Id}}' > "$release/build-image.id")
    printf '%s\n' BUILD_023_FINISHED_RUN_SMOKE_NEXT
    ;;
  smoke)
    assert_base
    test ! -e "$release/smoke.ok"
    test "$(docker image inspect "$image" --format '{{.Id}}')" = "$(cat "$release/build-image.id")"
    test "$(image_schema "$image")" = "$schema"
    # Disposable tmpfs only: no ports, networks, real state, env files or keys.
    docker run --rm -i --network none --read-only --user 10001:10001 \
      --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp:size=512m,mode=1777 \
      "$image" python - <<'PY'
import os
from pathlib import Path
from importlib.metadata import version
os.environ.update(UNIOS_HOME='/tmp/unios-023-smoke', DATA_DIR='/tmp/unios-023-smoke/data', LOCAL_DIR='/tmp/unios-023-smoke/local',
                  SERVER_MODE='true', API_AUTH_REQUIRED='true', SERVE_REACT='true', REACT_DIST_DIR='/app/frontend/dist',
                  AUTOMATIC_TAKEOVER_ENABLED='false', PUBLIC_PERIODS_ENABLED='false', NTFY_URL='', DISCORD_WEBHOOK_URL='')
home = Path('/tmp/unios-023-smoke'); home.mkdir(mode=0o700)
from cryptography.fernet import Fernet
key = home / 'fixture.key'
with os.fdopen(os.open(key, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'wb') as output: output.write(Fernet.generate_key())
os.environ['UNIOS_SERVER_KEY'] = str(key)
from app.server.keyring import configure_server_keyring
configure_server_keyring(home)
from desktop.backend import prepare_database
prepare_database()
from app.config import get_settings
from app.main import create_app
from fastapi.testclient import TestClient
assert version('unios') == '0.1.23'
with TestClient(create_app(get_settings(), connectors=[], start_scheduler=False), base_url='http://localhost') as client:
    assert client.get('/health').status_code == 200
    assert client.get('/api/courses').status_code == 401
    assert client.get('/').status_code == 200
    assert client.get('/manifest.webmanifest').status_code == 200
    assert client.get('/sw.js').status_code == 200
    assert Path('/app/frontend/dist/assets').is_dir()
print('IMAGE_023_SYNTHETIC_SMOKE_OK')
PY
    (set -o noclobber; printf '%s\n' "$image" > "$release/smoke.ok")
    ;;
  activate)
    assert_base
    assert_candidate
    test "$(image_schema "$base")" = "$schema"
    test ! -e "$override" && test ! -e "$release/base-image.reference" && test ! -e "$release/topology.before"
    test ! -e "$release/activation.success" && test ! -e "$release/activation.failure"
    ! docker image inspect "$retained_base_tag" > /dev/null 2>&1
    docker tag "$base_id" "$retained_base_tag"
    (set -o noclobber
      printf 'services:\n  api:\n    image: %s\n' "$image" > "$override"
      printf 'image=%s\nimage_id=%s\n' "$retained_base_tag" "$base_id" > "$release/base-image.reference"
      topology > "$release/topology.before")
    "${compose[@]}" -f "$override" config --quiet
    # No migration command: both images must retain the same schema head.
    trap 'activation_failure "$?"' ERR
    "${compose[@]}" -f "$override" up -d --no-build --no-deps api
    assert_mounts
    test "$(docker inspect unios-server --format '{{.Image}}')" = "$(cat "$release/build-image.id")"
    test "$(topology)" = "$(cat "$release/topology.before")"
    test "$(docker inspect unios-server --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}')" = "$original_labels,$override"
    healthy
    curl --fail --silent --max-time 10 https://unios.example.org/unios/health > /dev/null
    test "$(curl --silent --max-time 10 --output /dev/null --write-out '%{http_code}' --header 'Origin: https://unios.example.org' https://unios.example.org/unios/api/courses)" = 401
    (set -o noclobber; printf 'source_revision=%s\nimage_id=%s\nactivated_at_utc=%s\n' "$source_sha" "$(cat "$release/build-image.id")" "$(date -u +%FT%TZ)" > "$release/activation.success")
    trap - ERR
    printf '%s\n' ACTIVATION_023_HEALTHY_MOUNTS_AND_TOPOLOGY_PRESERVED
    ;;
esac
