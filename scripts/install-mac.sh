#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
set -eu

if [ "$(uname -s)" != "Darwin" ]; then
  echo 'Dieses Installationsskript ist für macOS.' >&2
  exit 1
fi

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_root"

role=${1:-}
case "$role" in
  --host) role=host ;;
  --viewer) role=viewer ;;
  '')
    printf 'Soll dieses Gerät Daten abrufen können? [J/n] '
    read -r answer
    case "$answer" in n|N|nein|Nein) role=viewer ;; *) role=host ;; esac
    ;;
  *) echo 'Verwendung: install-mac.sh [--host|--viewer]' >&2; exit 2 ;;
esac

if ! command -v uv >/dev/null 2>&1; then
  echo 'Installiere uv über den offiziellen Astral-Installer ...'
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi
command -v uv >/dev/null 2>&1 || { echo 'uv wurde nicht gefunden.' >&2; exit 1; }

if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  if command -v brew >/dev/null 2>&1; then
    echo 'Installiere Node.js über Homebrew ...'
    brew install node
  else
    echo 'Node.js 22 oder neuer fehlt. Installiere Node.js und starte diesen Befehl erneut.' >&2
    exit 1
  fi
fi
command -v npm >/dev/null 2>&1 || { echo 'npm fehlt.' >&2; exit 1; }

uv sync --locked --no-dev
(cd frontend && npm ci && npm run build)
mkdir -p data local

lease_mode=$(.venv/bin/python -m app.cli.main host status | .venv/bin/python -c 'import json,sys; print(json.load(sys.stdin)["mode"])')
if [ "$role" = host ] && [ "$lease_mode" = unclaimed ]; then
  .venv/bin/python -m app.cli.main host acquire
elif [ "$role" = viewer ] && [ "$lease_mode" = unclaimed ]; then
  echo 'Zuschauer-Gerät: Datenordner zuerst von einem Host synchronisieren.'
  exit 0
fi
if [ "$role" = viewer ] && [ ! -f local/uni_os.sqlite3 ]; then
  echo 'Zuschauer-Gerät: Ein geprüfter lokaler Datenbank-Snapshot fehlt. Zuerst Daten und Snapshot vom Host übernehmen.'
  exit 0
fi
if [ "$role" = host ] && [ "$lease_mode" != unclaimed ] && [ ! -f local/uni_os.sqlite3 ]; then
  echo 'Ein anderer Staffelstab liegt bereits im Datenordner. Zuerst die geprüfte Geräteübergabe durchführen.' >&2
  exit 1
fi

if [ "$role" = host ]; then
  if [ ! -f local/uni_os.sqlite3 ]; then
    .venv/bin/python -m alembic upgrade head
  else
    echo 'Vorhandene Datenbank bleibt unverändert. Migration erst nach geprüftem Snapshot starten.'
  fi
fi

if [ "$role" = host ] && [ ! -e local/setup.json ]; then
  printf '%s\n' '{"version":1,"institution":null,"notifications":null,"completed":false}' > local/setup.json
  chmod 600 local/setup.json
fi

if [ "$role" = host ]; then
  .venv/bin/python scripts/register_moodle_scheme.py ||
    echo 'Die Moodle-Rückkehr ist nicht automatisch eingerichtet. Im Assistenten ist die manuelle Eingabe möglich.' >&2
fi

.venv/bin/python deploy/render_service.py macos
agent_dir="$HOME/Library/LaunchAgents"
agent_file="$agent_dir/de.marc.uni-os.plist"
mkdir -p "$agent_dir"
if [ ! -e "$agent_file" ]; then
  cp local/services/de.marc.uni-os.plist "$agent_file"
  launchctl bootstrap "gui/$(id -u)" "$agent_file"
else
  echo 'Vorhandener LaunchAgent bleibt unverändert.'
fi

ready=0
attempt=0
while [ "$attempt" -lt 30 ]; do
  if curl --silent --fail --max-time 2 'http://127.0.0.1:8000/health' >/dev/null; then
    ready=1
    break
  fi
  attempt=$((attempt + 1))
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo 'UniOS wurde registriert, antwortet aber noch nicht. LaunchAgent-Status prüfen.' >&2
  exit 1
fi

echo 'UniOS ist unter http://127.0.0.1:8000/ erreichbar.'
open 'http://127.0.0.1:8000/'
