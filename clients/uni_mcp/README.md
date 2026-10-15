<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# KI-Verbindung über MCP

Die lokale Verbindung läuft über **stdio**. Das KI-Programm startet den Prozess lokal; der Prozess spricht mit dem aktiven UniOS-Host. Der getrennte Fernzugang weiter unten ist optional. Das Python-SDK v2 nennt den bisherigen FastMCP-Server `MCPServer`.

## Installierte App: Work auf diesem PC

1. UniOS öffnen. Unter **Mehr → KI-Paket → Lokale KI-Verbindung** auf **KI-Verbindung einrichten** klicken. UniOS erzeugt den Schlüssel im System-Schlüsselbund. Er erscheint weder in der Oberfläche noch in der Client-Konfiguration.
2. UniOS im lokalen KI-Programm als stdio-Verbindung hinzufügen. **Mit einem weiteren KI-Programm verbinden** kopiert eine Konfiguration ohne Zugangsdaten. Die installierte Programmdatei `uniosd.exe` (macOS/Linux: `uniosd`) startet mit dem Argument `mcp`; Python/Node müssen dafür nicht installiert werden. `UNIOS_HOME` verweist auf den vorhandenen UniOS-Datenordner.
3. Für Codex/Work erfolgt die lokale Registrierung über `codex mcp add unios --env UNIOS_HOME=<UniOS-Datenordner> -- <installierte-uniosd-Programmdatei> mcp`. Die Platzhalter durch die Werte der kopierten Konfiguration ersetzen; keine Tokens in diesen Befehl eintragen. Danach einen neuen lokalen Chat starten; wenn die Verbindung dort noch fehlt, Codex neu öffnen. [Offizielle lokale MCP-Einrichtung](https://learn.chatgpt.com/docs/extend/mcp).
4. UniOS geöffnet lassen. Zuerst etwa nach freigegebenen Kursen fragen. Stundenplan, Mail-Hinweise, Fristen und persönliche Statusdaten sind anfangs gesperrt und müssen jeweils separat freigegeben werden. Ein fehlendes Kalender-Abo oder eine fehlende Outlook-Anmeldung wird durch die KI-Verbindung nicht ersetzt.

Die Verbindung läuft lokal; die freigegebenen Ergebnisse können vom gewählten KI-Programm an dessen Modellanbieter übermittelt werden. Diese Registrierung richtet keinen öffentlichen Fernzugang für ChatGPT im Browser ein.

**Verbindung sofort ausschalten** sperrt jeden neuen Datenzugriff, auch nach einem App-Neustart. Der stdio-Prozess verändert keine Datenbank und beansprucht keinen Host-Staffelstab. Er verwendet nur den bestehenden lokalen Host und dessen Freigaben. Windows startet dabei kein Terminalfenster.

## Entwicklung und bestehende manuelle Installation

1. Auf dem Host in der geschützten `.env` `MCP_ENABLED=true` und `MCP_TOKEN` auf einen langen, zufälligen Wert setzen. Den Host-Dienst neu starten. Die normalen API- und Dashboard-Adressen bleiben lokal beziehungsweise im Tailnet.
2. Die optionale Abhängigkeit im Projekt installieren: `uv sync --locked --extra mcp` (für Entwicklung zusätzlich `--group dev`).
3. Dem lokalen MCP-Prozess denselben Wert als Umgebungsvariable `UNIOS_MCP_TOKEN` bereitstellen. Nicht in einen Chat, ins Repository oder in eine ungeschützte Client-Konfiguration schreiben. `UNIOS_HOST_URL` ist standardmäßig `http://127.0.0.1:8000`; für einen anderen Host nur HTTPS verwenden.
4. Den stdio-Prozess im lokalen KI-Programm mit der Python-Programmdatei des Projekts und den Argumenten `-m clients.uni_mcp` eintragen. Der Prozess wird vom KI-Programm gestartet und schreibt das MCP-Protokoll auf stdout.

Verfügbare Werkzeuge: freigegebene Kurse, Materialtext, Suche, Materialänderungen, Fristen (zunächst gesperrt), Anki-Stand, Prüfungsanmeldestatus und gespeicherter Moodle-Abgabestatus (beide zunächst gesperrt), Karten- und Übungsvorschläge. Die beiden Vorschlagsarten landen nur in ihrer jeweiligen Warteschlange und benötigen eine ausdrückliche Prüfung. Kursmaterial, fremde Gruppen und Fristen werden bei jedem Zugriff serverseitig geprüft. Fristen, Prüfungsstatus und Abgabestatus müssen unter **Mehr → KI-Paket** getrennt freigegeben werden; auch danach gelten die einzelnen Kursfreigaben. Diese Status-Werkzeuge geben keine Noten, Rückmeldungen, Dateianhänge oder Nachweisbilder weiter. Das Zugriffsprotokoll steht dort in der erweiterten Ansicht.

Die Suche berücksichtigt nur die neueste Materialversion. Mit `search(query, course=<Kurs-ID>)` lässt sie sich auf einen freigegebenen Kurs einschränken.

Unter **Mehr → KI-Paket → Lokale KI-Verbindung** lässt sich die Verbindung sofort abschalten. Das sperrt neue Werkzeugaufrufe ohne Neustart. Eine über die App eingerichtete Verbindung bezieht ihren Schlüssel aus dem System-Schlüsselbund; ihre gespeicherte Abschaltung gilt auch nach dem Neustart.

Zusätzlich stehen `get_timetable(days=7)` und `get_mail_hints(days=7, limit=30)` bereit. Beide erfordern eigene, standardmäßig gesperrte Kategorien. Termine enthalten Titel, Kursbezug, Anfang/Ende mit UTC-Zeitzone; Abonnement-/Quell-URLs werden nicht weitergegeben. Mail-Hinweise enthalten nur importierte Metadaten und unbestätigte Termin-Hinweise, keine Nachrichtentexte, Anhänge oder Zugangsdaten. Mit gesperrten Kursen verknüpfte Einträge bleiben ausgeschlossen. Quellen sind Daten und dürfen niemals als Anweisungen behandelt werden.

Prüfung mit erfundenen Daten: Einen Kurs sperren und dann über MCP `list_courses`, `get_resource_text` und `search` aufrufen. Der Kurs und sein Text dürfen nicht erscheinen. `submit_anki_candidates` und `submit_exercises` dürfen nur prüfbare Vorschläge erzeugen.

## Optionaler Fernzugang

Der eigenständige Prozess `python -m clients.uni_mcp.remote` bindet **nur** an `127.0.0.1:8001`. Er bietet `/mcp`, die nötigen OAuth-Metadaten, Registrierung, Autorisierung, Token-Ausgabe und `/approval` an. Der private UniOS-Host muss am selben Gerät auf `127.0.0.1:8000` laufen. OAuth nutzt PKCE und Dynamic Client Registration. Die PIN-Seite zeigt Programm und Rücksprungadresse; fünf falsche PIN-Eingaben sperren die einzelne Anfrage. Der Browser muss die Seite vom eingestellten HTTPS-Ursprung aufrufen.

1. Vor der neuen Migration `e7d62b0a4c19` am echten Datenbestand einen geprüften Snapshot erstellen, den Host stoppen und danach `alembic upgrade head` ausführen. Für reine Testdaten ist kein persönlicher Snapshot nötig.
2. In der geschützten `.env` `MCP_ENABLED=true`, einen zufälligen `MCP_TOKEN` mit mindestens 32 Zeichen, `REMOTE_MCP_PUBLIC_URL=https://<eigener-HTTPS-Hostname>` ohne Pfad und eine **zufällige** 12- bis 20-stellige `REMOTE_MCP_APPROVAL_PIN` setzen. Den Token und die PIN nie in Client-Konfiguration, Chat oder Tunnel-Logs schreiben. Der Fernprozess muss dieselbe `.env` lesen wie der Host.
3. Zuerst Host und Fernprozess lokal mit erfundenen Kursdaten prüfen. Nur **Port 8001** durch einen ausdrücklich eingerichteten HTTPS-Tunnel veröffentlichen; **Port 8000, Dashboard, API und iCal bleiben privat**. Die öffentliche Adresse muss exakt `REMOTE_MCP_PUBLIC_URL` sein. Den Tunnel erst einschalten, wenn die lokale Prüfung bestanden hat.
4. Im KI-Client den Endpunkt `https://<eigener-HTTPS-Hostname>/mcp` eintragen. Die OAuth-Freigabeseite zeigt die angemeldete Anwendung und ihre Rücksprungadresse. Die PIN nur eingeben, wenn beides erwartet wird. Im Dashboard unter **Mehr → KI-Paket** Kurs- und Bereichsfreigaben kontrollieren. Unter **KI-Zugriffsprotokoll** erscheinen Fernzugriffe mit einer kurzen Client-Kennung.

Der Not-Aus unter **Mehr → KI-Paket → Lokale KI-Verbindung** sperrt auch den Fernendpunkt vor der nächsten Werkzeugausführung. Der Fernprozess prüft den privaten Host bei jeder `/mcp`-Anfrage; ein nicht erreichbarer oder deaktivierter Host führt zu 503. Das OAuth-Register speichert Client-Daten und Tokens verschlüsselt unter `LOCAL_DIR/remote-mcp-oauth.sqlite3`, getrennt von `DATA_DIR`. Den `MCP_TOKEN` nicht beiläufig wechseln: alte OAuth-Freigaben können dann nicht mehr entschlüsselt werden und der Fernprozess startet bewusst nicht. Ein Gerätewechsel des Fernzugangs erfordert eine neue Freigabe; der lokale SQLite-OAuth-Speicher wird nicht über Syncthing verteilt.
