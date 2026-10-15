<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Hintergrunddienste in Phase 1

Alle Varianten starten FastAPI, das den gebauten React-Client direkt ausliefert. Die Browser-Adresse des Dienstes ist `http://127.0.0.1:8000/`. Die Entwicklungsansicht mit `npm run dev` auf Port 5173 kann parallel laufen; der separate Entwicklungs-Backendprozess auf Port 8000 muss vor dem Dienststart beendet werden.

Vorher im Projektordner `uv sync --locked` sowie im Ordner `frontend` `npm ci && npm run build` ausführen. Beim **ersten** Host-Gerät mit `.venv/bin/python -m app.cli.main host acquire` den Staffelstab anlegen und danach mit `.venv/bin/python -m alembic upgrade head` die Datenbank erstellen. Auf einem späteren Standby-Gerät wird der Staffelstab nicht erneut angelegt. `DATA_DIR` und `LOCAL_DIR` in `.env` setzen; `LOCAL_DIR` bleibt immer nur auf diesem Gerät. Auf Windows die entsprechende `python.exe` unter `.venv\Scripts` verwenden.

Der Starthelfer `scripts/run_service.py` prüft den React-Build und startet FastAPI als einen Dienstprozess. Standardmäßig bindet er Port 8000 nur an `127.0.0.1`. `UNIOS_API_PORT` kann geändert werden; `UNIOS_BIND` akzeptiert in Phase 1 ausschließlich eine Loopback-IP wie `127.0.0.1` oder `::1`. Mehrgeräte-Netzwerkbetrieb und sichere Remote-Bindung werden erst in Phase 2 eingerichtet.

## ntfy und lokales Restic-Backup

Für ntfy ein langes, zufälliges Topic erzeugen und dessen vollständige `https://ntfy.sh/<topic>`-Adresse nur in der geschützten `.env` als `NTFY_URL` speichern. Die gleiche Adresse in der ntfy-App abonnieren. Das Topic gewährt ohne zusätzliche Anmeldung Lese- und Schreibzugriff; deshalb weder in Git noch in Chat oder Screenshots teilen. UniOS verschickt nur neutrale Hinweistexte. Auf diesem Mac liegt die private Abonnementadresse zusätzlich unter `local/ntfy-subscription.md` mit Dateirechten 600. Nach Änderungen an `.env` den Dienst neu starten.

Für tägliche verschlüsselte Backups muss `restic` im `PATH` des Dienstes ausführbar sein. `RESTIC_REPOSITORY` zeigt auf einen **absoluten** Zielpfad außerhalb von `DATA_DIR`; `RESTIC_PASSWORD` steht nur in der geschützten `.env` und muss zusätzlich in einem persönlichen Passwortmanager gesichert werden. Ein externes Laufwerk oder ein Cloud-Ziel schützt auch beim Verlust des Host-Geräts. Das vorläufige Repository auf diesem Mac liegt außerhalb des Checkouts, aber noch auf demselben Gerät. Nach dem einmaligen `restic init` startet der Host das Backup täglich um 03:30 Uhr. Der aktuelle Status erscheint auf der Systemseite.

Für eine manuelle Prüfung zuerst den laufenden Host-Dienst stoppen, damit der CLI-Befehl den Staffelstab übernehmen kann. Mit `PATH="$PWD/.venv/bin:$PATH" .venv/bin/python -m app.cli.main backup` ein Backup erstellen und den Dienst danach wieder starten. Der Befehl gibt den Erfolg als JSON aus; die genauen Statusdaten stehen auf der Systemseite. Er erzeugt zuerst ein konsistentes SQLite-Abbild und sichert dann `DATA_DIR` sowie die Gerätekennung. Für die Wiederherstellung den alten Host stoppen und `restic restore latest --target restore` mit demselben Repository und Passwort ausführen; auf diesem Mac liegen die Dateien danach unter `restore/data/` und die Gerätekennung unter `restore/local/device.json`. Der Zielordner `restore/` ist getrennt und wird nicht automatisch als produktiver Datenstand aktiviert. Vor einer Übernahme das neueste Abbild aus `restore/data/backup-snapshots/` mit `PRAGMA integrity_check`, die Dateiinhalte und die Gerätekennung gegen den Staffelstab prüfen. Die ausführliche Container-Wiederherstellung weiter unten zeigt die entsprechenden Prüfschritte. Moodle-Token und andere Secrets liegen nicht im Backup und müssen auf einem neuen Gerät lokal neu eingerichtet werden.

## Syncthing-Ordnerstatus für Phase 2

Die Gerätediagnose kann den lokalen Syncthing-Ordner über dessen [REST-API](https://docs.syncthing.net/dev/rest.html) lesend prüfen. Auf jedem Host-fähigen Gerät muss `DATA_DIR` als genau ein Ordner im Modus **Senden & Empfangen** eingerichtet sein, auch wenn das Gerät gerade im Standby ist. Nur reine Zuschauer-Geräte verwenden **Nur Empfangen**. Der Staffelstab steuert die Schreibrechte von UniOS; der Syncthing-Ordnermodus wechselt bei der Übergabe nicht. Die Ordner-ID aus der Syncthing-Oberfläche in `SYNCTHING_FOLDER_ID` eintragen. Den Syncthing-API-Schlüssel aus den Einstellungen nur in die geschützte lokale `.env` als `SYNCTHING_API_KEY` eintragen (Unix: `chmod 600 .env`, Windows: ACL nur für das eigene Konto). Der REST-Zugang bleibt auf einer numerischen Loopback-Adresse; Standard ist `http://127.0.0.1:8384`. `SYNCTHING_API_URL` nur ändern, wenn die lokale GUI auf einem anderen Loopback-Port läuft. Den Schlüssel nie in Git, Chat oder Screenshots übernehmen. Nach einer Änderung den UniOS-Dienst neu starten und unter „System → Gerät prüfen“ den Eintrag „Syncthing-Synchronisation“ ansehen.

Ein grüner [Ordnerstatus](https://docs.syncthing.net/rest/db-status-get.html) allein erlaubt noch keine Geräteübernahme; die folgenden zusätzlichen Prüfungen müssen erfüllt sein. Im Docker-Container muss ein lokaler REST-Zugang innerhalb seines eigenen Netzwerkraums bereitstehen; andernfalls bleibt diese Diagnose bewusst unklar.

## Geplante Übergabe zwischen zwei Geräten

Auf beiden Host-fähigen Geräten zuerst Tailscale und Syncthing nach den obigen Regeln einrichten, `DATA_DIR` vollständig abgleichen und den Moodle-Token jeweils nur lokal einrichten. `LOCAL_DIR` bleibt pro Gerät getrennt. Der bisherige Host darf erst freigegeben werden, wenn Syncthing den Ordner als vollständig synchron meldet.

1. Auf dem bisherigen Host unter **System → Staffelstab → Übergabe vorbereiten** die Prüfung lesen und bestätigen. UniOS sperrt neue Schreibaktionen, beendet laufende Arbeiten, erstellt einen finalen geprüften Snapshot und gibt den Staffelstab mit erhöhter Generation frei. Bei unvollständigem Syncthing oder einem fehlgeschlagenen Snapshot bleibt der Host schreibend. Alternativ den Dienst erst stoppen und `.venv/bin/python -m app.cli.main host release --pretty` ausführen.
2. Den vollständigen Syncthing-Abgleich auf dem anderen Gerät abwarten. Dort `doctor --pretty` ausführen; `ready_for_takeover` muss `true` melden. Fehlt der lokale Moodle-Token, ist der Snapshot zu alt oder ist eine Konfliktkopie vorhanden, zuerst die Ursache beheben. Den lokalen UniOS-Dienst auf dem Zielgerät stoppen; eine laufende Standby-Instanz darf ihre eigene SQLite-Datei nicht unter sich austauschen.
3. Auf dem Zielgerät `.venv/bin/python -m app.cli.main host acquire --pretty` ausführen (Windows: `& .\.venv\Scripts\python.exe -m app.cli.main host acquire --pretty`). Der Befehl prüft Syncthing erneut, kontrolliert Generation, Hash und SQLite-Integrität, archiviert eine vorhandene lokale Datenbank und übernimmt erst dann den Staffelstab. Danach den Ziel-Dienst starten und unter **System** Hoststatus, neue Generation, Kurse und Dateien kontrollieren. Der Catch-up-Sync startet außerhalb der Ruhezeit automatisch.
4. Den vorherigen Host nach vollständigem Abgleich im Standby prüfen. Für die Rückgabe dieselben Schritte mit vertauschten Geräten ausführen. Weder `lease.json` manuell bearbeiten noch die live genutzte SQLite-Datenbank per Syncthing verteilen.

Auf macOS den LaunchAgent mit `launchctl bootout "gui/$(id -u)/de.marc.uni-os"` stoppen und mit `launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/de.marc.uni-os.plist"` wieder starten. Auf Windows die Aufgabe **UniOS** in der Aufgabenplanung vor dem CLI-Befehl beenden und danach erneut starten. Ein aktiver fremder Staffelstab wird durch diese geplante Übernahme nie überschrieben.

### Automatische Ausfallübernahme

Auf **jedem** Host-Gerät Tailscale Serve für den lokalen UniOS-Dienst einrichten und dessen eigene HTTPS-Adresse bis `/health` als `HOST_HEALTH_URL` in der geschützten `.env` hinterlegen. Die Adresse muss auf `.ts.net` enden. Nach dem Neustart veröffentlicht der aktuelle Host seine Adresse beim nächsten Herzschlag im Staffelstab. Das Standby-Gerät prüft in einem kurzen Abstand, ob der Herzschlag älter als `AUTOMATIC_TAKEOVER_AFTER_SECONDS` ist (Standard: zwei Stunden). Es übernimmt nur, wenn Tailscale den genau passenden bisherigen Peer als offline meldet, der Gesundheitscheck keine Verbindung herstellen kann, Syncthing `DATA_DIR` vollständig synchron meldet und der neueste Snapshot zur aktuellen Generation passt und höchstens `AUTOMATIC_TAKEOVER_SNAPSHOT_MAX_AGE_SECONDS` alt ist (Standard: drei Stunden). Vor dem Wechsel werden laufende Anfragen beendet; eine vorhandene lokale Datenbank wird archiviert. Danach startet der Dienst den Scheduler. Ein Dienstneustart prüft dieselben Bedingungen sofort. `AUTOMATIC_TAKEOVER_ENABLED=false` schaltet die Ausfallübernahme aus. Für eine gezielte Prüfung bei gestopptem Standby-Dienst gibt es `unios host acquire --after-failure`; der Befehl verwendet dieselben Bedingungen. Bei unklarer Erreichbarkeit, nicht synchronem Ordner oder altem Snapshot bleibt das Gerät im Standby.

### Doppel-Host-Konflikt prüfen

Wenn zwei Geräte unabhängig geschrieben haben, entscheidet die höhere Staffelstab-Generation; bei Gleichstand gewinnt die frühere Übernahmezeit. Der Verlierer sperrt weitere Schreibaktionen und sichert ein Paket zuerst unter `LOCAL_DIR/conflicts/`, dann unter `DATA_DIR/host/conflicts/`. Das Paket enthält protokollierte Dashboard-, CLI- und Hintergrundaktionen, eine SQLite-Kopie und eine Manifestdatei mit Prüfsummen. Die Liste wird gegen den Stand des letzten gemeinsamen Snapshots und eine lokale Prüfkette geprüft; bei Verlust eines Protokollteils wird sie als unvollständig gekennzeichnet. Wenn Syncthing den unterlegenen Staffelstab als Hauptdatei belässt, kann der Gewinner seinen eigenen gültigen Konflikteintrag wiederherstellen; der verdrängte Eintrag wird zuvor unter `DATA_DIR/host/lease-resolutions/` archiviert. Ohne diese eindeutigen Belege bleibt der Schreibzugriff gesperrt. Auf „Heute“ erscheint ein Hinweis auf ungeprüfte Pakete; unter **System → Änderungen von einem anderen Gerät prüfen** stehen die Aktionen. Nur die angebotenen, einzeln bestätigten Aktionen lassen sich direkt erneut anwenden; bei allen anderen müssen die Angaben und die Datenbankkopie manuell verglichen werden. Erst nach einem Einzelbeleg für jede übernommene oder manuell geprüfte Aktion lässt sich die Paketprüfung abschließen. Das blendet den Hinweis auf „Heute“ aus, bewahrt aber das Paket und den Prüfbeleg im synchronisierten Ordner. Bei einem unvollständigen Aktionsprotokoll oder einer ungeprüften Datenbankkopie wird ausdrücklich gewarnt. Den alten Dienst erst nach Syncthing-Abgleich wieder starten. Die Pakete können persönliche Studiendaten enthalten und gehören nicht ins Repo oder in einen Support-Chat. Weitere Schreibpfade und alle nicht direkt erneut anwendbaren Aktionen müssen noch geprüft werden; vor der Nutzung als Wiederherstellungsweg ist ein Test mit zwei eigenen Geräten erforderlich.

## macOS

`.venv/bin/python deploy/render_service.py macos` erzeugt eine konkrete LaunchAgent-Datei unter `local/services/de.marc.uni-os.plist`. Sie enthält die absoluten Pfade dieses Checkouts und den aktuellen `PATH` für Node.js. `plutil -lint local/services/de.marc.uni-os.plist` prüft das Format. Für die Anmeldung als Benutzer:

```sh
mkdir -p "$HOME/Library/LaunchAgents"
cp local/services/de.marc.uni-os.plist "$HOME/Library/LaunchAgents/de.marc.uni-os.plist"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/de.marc.uni-os.plist"
launchctl print "gui/$(id -u)/de.marc.uni-os"
```

Zum Stoppen `launchctl bootout "gui/$(id -u)/de.marc.uni-os"`. Logs stehen unter `local/service.stdout.log`, `local/service.stderr.log` und `local/logs/uni_os.log`. macOS kann einem Hintergrundprozess den Zugriff auf einen Checkout unter `Documents` verweigern; dann muss der Projektordner an einem für LaunchAgents zugänglichen Ort liegen oder der Dienst erhält die erforderlichen macOS-Dateizugriffsrechte. Der direkte lokale Start aus der README bleibt verfügbar.

## Windows

Nach `uv sync --locked` und dem React-Build in PowerShell einmal `& .\.venv\Scripts\python.exe -m app.cli.main host acquire` und `& .\.venv\Scripts\python.exe -m alembic upgrade head` ausführen. `& .\deploy\windows\register-task.ps1` registriert die Aufgabe **UniOS** für die aktuelle Benutzeranmeldung und das Aufwach-Ereignis. Der Benutzer muss dafür angemeldet sein. `deploy/windows/start-uni-os.ps1` kann direkt gestartet werden, um denselben Ablauf ohne Aufgabenplanung zu prüfen. In den Energieoptionen müssen Gerät und Netzwerk nach dem Aufwachen verfügbar sein; ein ausgeschaltetes Gerät synchronisiert nicht.

## Linux mit systemd

`.venv/bin/python deploy/render_service.py linux` erzeugt `local/services/marc-uni-os.service`. Als Benutzer-Dienst nach `~/.config/systemd/user/marc-uni-os.service` kopieren und `systemctl --user daemon-reload`, `systemctl --user enable --now marc-uni-os.service` ausführen. Status: `systemctl --user status marc-uni-os.service`. Für einen Start ohne interaktive Anmeldung muss `loginctl enable-linger "$(whoami)"` auf diesem System erlaubt sein.

## Linux mit Docker Compose

`cp .env.example .env` und `chmod 600 .env` ausführen; die Pfade in `.env` für den Container nicht ändern, Compose setzt `DATA_DIR=/app/data` und `LOCAL_DIR=/app/local`. Da der Container den Schlüsselspeicher des Hosts nicht lesen kann, den Moodle-Token bei dieser Variante mit `.venv/bin/python -m scripts.setup_token --env-only` in die lokale `.env` schreiben. Einmalig `docker compose run --rm api unios host acquire` und `docker compose run --rm api alembic upgrade head`, danach `docker compose up --build -d`. FastAPI liefert die gebaute React-Oberfläche auf dem lokalen Port 8000 aus. `docker compose ps` zeigt den Dienst. Der Compose-Start mit React, API und Staffelstab wurde auf einem Linux-CI-Runner geprüft; ein späteres persönliches Zielgerät ist noch offen.

Für ein lokales verschlüsseltes Restic-Ziel `RESTIC_LOCAL_PATH` in `.env` auf einen Host-Ordner setzen, vorzugsweise eine externe Platte. Im Container lautet dessen Pfad `/app/backup`; daher `RESTIC_REPOSITORY=/app/backup` und ein eigenes `RESTIC_PASSWORD` in der geschützten `.env` eintragen. Einmalig `docker compose run --rm api restic init` ausführen. Für ein unterstütztes Cloud-Ziel stattdessen dessen Restic-Repository-URL und erforderliche Zugangsdaten in `.env` hinterlegen. Der Host erstellt dann täglich um 03:30 Uhr ein konsistentes SQLite-Abbild und sichert `DATA_DIR`. Der CI-Smoke-Test stellt ein verschlüsseltes lokales Restic-Backup wieder her und prüft die SQLite-Integrität; die Rücksicherung auf Marcs eigenem Zielgerät bleibt manuell zu prüfen.

### Wiederherstellung eines Docker-Hosts

Nur ausführen, wenn der bisherige Host vollständig gestoppt ist. Im Projektordner zuerst `docker compose stop api`. `.env` muss weiterhin auf dasselbe Restic-Repository zeigen und das zugehörige Passwort enthalten. Die Wiederherstellung erfolgt zunächst in einem getrennten Ordner:

```sh
mkdir -p restore
docker compose run --rm -e RESTORE_UID="$(id -u)" -e RESTORE_GID="$(id -g)" \
  -v "$PWD/restore:/app/restore" api sh -c \
  'restic restore latest --target /app/restore && chown -R "$RESTORE_UID:$RESTORE_GID" /app/restore'
```

Der folgende Schritt prüft die zurückgesicherte SQLite-Datei und die zum Staffelstab passende Gerätekennung. Er erstellt neue Ordner und überschreibt keine laufenden Daten:

```sh
python3 - <<'PY'
import json
import shutil
import sqlite3
from pathlib import Path

root = Path('restore/app')
snapshots = sorted((root / 'data/backup-snapshots').glob('*.sqlite3'))
assert snapshots, 'Kein SQLite-Abbild im Backup'
snapshot = snapshots[-1]
with sqlite3.connect(f'{snapshot.resolve().as_uri()}?mode=ro&immutable=1', uri=True) as db:
    assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
identity = json.loads((root / 'local/device.json').read_text())
lease = json.loads((root / 'data/host/lease.json').read_text())
assert identity['device_id'] == lease['device_id'], 'Gerätekennung passt nicht zum Staffelstab'
assert not Path('recovered-data').exists() and not Path('recovered-local').exists()
shutil.copytree(root / 'data', 'recovered-data')
Path('recovered-local').mkdir()
shutil.copy2(root / 'local/device.json', 'recovered-local/device.json')
shutil.copy2(snapshot, 'recovered-local/uni_os.sqlite3')
print('Wiederherstellung geprüft; neue Ordner: recovered-data und recovered-local')
PY
```

Erst nach Sichtprüfung die bisherigen Ordner `data` und `local` umbenennen, die neuen Ordner in `data` und `local` umbenennen und `docker compose up -d api` starten. Bei einem frischen Checkout entfallen die beiden alten Ordner. `http://127.0.0.1:8000/api/host` muss `"mode":"host"` melden. Moodle-Token und andere Secrets müssen auf dem wiederhergestellten Gerät erneut in der geschützten `.env` eingerichtet werden; sie liegen nicht im Backup.
