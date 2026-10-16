<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# UniOS auf dem eigenen Server

> English: [SERVER.en.md](SERVER.en.md)

**Betriebsstand 03.10.2026:** Version 0.1.18, Schema `ff94af768293`.
Snapshot auf Marcs Wunsch über die gekoppelte App erstellt und geprüft (16:24 Uhr);
Marc bestätigte dessen Verwendung ausdrücklich vor dem Update.
Das Image wurde zuerst ohne Netzwerk oder echte Nutzerdaten als Benutzer
10001 mit schreibgeschütztem Dateisystem geprüft: Health/Web 200,
private API ohne Kopplung 401. Danach ausschließlich den UniOS-Container
über die vorhandene Edge-Anbindung aktualisiert. Container gesund;
App-Version, Schema, Assessment-Typen und einsatzbereiter Coding-Runner über den gekoppelten
Windows-Client bestätigt. Windows-App 0.1.18 installiert; alter Quellcode-Autostart deaktiviert.
Der getrennte Runner verwendet eine eigene KVM-VM und einen ausdrücklich genehmigten
privaten systemd-Proxy; Details in [RUNNER.md](RUNNER.md).
Der Release verwendet eine eigene versionierte
Compose-Umgebungsdatei, keine Überschreibung bestehender Secret-Dateien.

Seit 0.1.13 kann der eigene VPS dauerhaft Hochschulquellen lesen und den Datenbestand verwalten. Die native React-/TypeScript-/Tauri-App bleibt auf Windows, macOS oder Linux. Ihr gebündelter Dienst ist im Clientmodus eine lokale HTTPS-Brücke; er startet weder eine zweite Datenbank noch einen Scheduler oder eine Host-Übernahme.

## Was wo liegt

| Ort | Inhalt |
| --- | --- |
| VPS | SQLite, versionierte Originaldateien, Suche, Aufgaben, Termine, Notizen, Hochschulverbindungen, Spracherkennung |
| Gerät | Installierte App, Geräteschlüssel im OS-Schlüsselbund, lokale Notizentwürfe und vorhandener Offline-Cache |
| Getrennte Serverdatei | Privater Hauptschlüssel für den verschlüsselten Server-Schlüsselbund |

Offline-Notizen behalten ihre Ausgangsversion. Beim Wiederverbinden bleibt der vorhandene Drei-Wege-Abgleich aktiv. Ein Serverwechsel kann nicht still denselben Cache übernehmen; dafür ist eine getrennte Datenübernahme erforderlich. Bestehende lokale Installationen behalten ihren Altbetrieb bis zur ausdrücklichen Übernahme. Neue Installationen beginnen mit der Serverkopplung.

Ein Server bedeutet keine Ende-zu-Ende-Verschlüsselung der gesamten Datenbank gegenüber dem Serverbetreiber: der eigene Server kann die Studiendaten verarbeiten. Der HTTPS-Verkehr läuft im beschriebenen Aufbau über den bereits vorhandenen Cloudflare-Tunnel. Die Zugangsdaten werden zusätzlich im Server-Schlüsselbund verschlüsselt gespeichert; der vollständige Material-/Datenbankbestand wird nicht dadurch automatisch verschlüsselt.

## Server starten

Voraussetzungen: eigener Linux-VPS, Docker/Compose, vorhandener HTTPS-Zugang. Ein einzelner API-Prozess ist der einzige Schreiber. Der Container läuft als UID 10001, ohne zusätzliche Linux-Capabilities, mit schreibgeschütztem Root-Dateisystem und privaten Daten-Volumes. Port 8008 ist ausschließlich an Loopback gebunden. Docker-Socket und beliebige Host-Dateien werden nicht eingebunden.

Für die Alpha den Quellstand `v0.1.19` in einem eigenen Release-Verzeichnis
unter `/opt/unios/releases/` bereitstellen, etwa `/opt/unios/releases/v0.1.19`.
Die Bereitstellung braucht Repository-Zugriff, solange das Repository privat ist.
`provision.sh` akzeptiert absichtlich nur diesen Release-Pfad, keinen beliebigen
Checkout. Dann zunächst das Image bauen:

```sh
cd /opt/unios/releases/v0.1.19
docker build -t unios-server:0.1.19 -f deploy/server/Dockerfile .
sudo bash deploy/server/provision.sh "$PWD" https://studium.example.org/unios
docker compose --env-file /opt/unios/deploy.env \
  -f deploy/server/compose.yaml -f deploy/server/compose.edge.yaml up -d --no-build
```

Das zusätzliche `compose.edge.yaml` setzt ein bestehendes externes Netzwerk `edge` voraus. Bei einem anderen Reverse-Proxy nur die Basisdatei verwenden und den Loopback-Port anbinden. `provision.sh` startet keinen Dienst und erzeugt den Hauptschlüssel nur für einen neuen Bestand. Quellpfad, Datenverzeichnis und HTTPS-Adresse stehen getrennt von Geheimnissen in `deploy.env`/`server.env`.

`Caddyfile.fragment` ergänzt einen bestehenden HTTPS-Eingang unter `/unios`. Caddy entfernt den Präfix vor der Weiterleitung, setzt die externen Host-/HTTPS-Header und deaktiviert Zugriffprotokolle für diesen Pfad. API-/Dateiantworten erhalten `private, no-store`. `install_edge_route.py` ist ausschließlich für die bestehende Site in `/opt/edge/Caddyfile` gedacht: Kandidat validieren, Original sichern, Bind-Mount-Datei in-place schreiben, reload; bei Fehler zurücksetzen. Andere Caddy-Aufbauten separat konfigurieren.

**Der Präfixzugang ist derzeit für native Clients vorbereitet.** Er ist keine abgenommene Browser-/Handy-PWA: Frontend-Assets und Browser-Router erwarten weiterhin einen Root-Pfad. Ein öffentlicher URL-Aufruf ersetzt außerdem keine Gerätekopplung. Ohne Kopplung liefern private API und Materialien HTTP 401; die technische Health-Route liefert keine Studiendaten.

## Daten aus einer bestehenden Installation übernehmen

1. Laufenden Abgleich beenden lassen und die alte App vollständig schließen.
2. Einen zufälligen **32-Byte-Schlüssel binär** in einer privat geschützten Datei erstellen. Unter Windows keinen textbasierten Dateideskriptor verwenden. Schlüssel niemals in Chat, Git oder Logs ausgeben.
3. Mit dem alten Gerät und seinem OS-Schlüsselbund exportieren:

   ```sh
   python -m app.server.migration export --home /pfad/zum/unios-home \
     --package /privat/uebernahme.enc --key-file /privat/uebernahme.key
   ```

4. Paket und Schlüssel ausschließlich über einen vertrauten Kanal übertragen. Das Paket ist durch AES-GCM in geordneten Blöcken mit Abschlussprüfung geschützt. Der Export erstellt zuerst einen geprüften Snapshot; Originaldateien bleiben erhalten. Er übernimmt nur definierte Einstellungen und ausgewählte Zugangsdaten über ihre jeweiligen Fachspeicher, keinen OS-Keychain-Dump, `.env`, Gerätesessions oder Logs.
5. In einen **neuen** Server-Datenbestand importieren. Hauptschlüssel vorher privat provisionieren. Beispiel für das bereitgestellte Image:

   ```sh
   docker run --rm --user 10001:10001 --network none \
     -v /opt/unios/state:/var/lib/unios \
     -v /opt/unios/secrets/unios.key:/run/secrets/unios.key:ro \
     -v /opt/unios/incoming:/incoming:ro \
     -e UNIOS_SERVER_KEY=/run/secrets/unios.key \
     -e DATA_DIR=/var/lib/unios/data -e LOCAL_DIR=/var/lib/unios/local \
     --entrypoint python unios-server:0.1.18 -m app.server.migration import \
     --home /var/lib/unios --package /incoming/uebernahme.enc --key-file /incoming/uebernahme.key
   ```

   Eingangsdateien und -verzeichnis müssen privat und für UID 10001 lesbar sein. Der Import lehnt einen bereits vorhandenen Datenbestand ab, prüft sämtliche Dateihashes und SQLite-Integrität vor Veröffentlichung und erzeugt eine neue Server-Hostkennung mit höherer Generation. Alte Windows-Pfadtrenner in Datei-/Notiz-/Audioverweisen werden anschließend im geprüften Zwischenbestand in portable Pfade umgewandelt; absolute Pfade, Traversal und fehlende Zieldateien werden abgewiesen. Der Originalbestand bleibt unverändert. Der Zwischenbestand liegt im selben Docker-Volume, damit atomare Umbenennungen funktionieren. Archivlinks und unsichere Pfade werden abgewiesen; Dateiverknüpfungen werden beim Export als eigenständige Dateien gespeichert.
6. Nach erfolgreicher Prüfung Server starten, Gerät koppeln und dessen Clientbetrieb verifizieren. Originalbestand bis zur Abnahme behalten; er wird nicht als zweiter Host weiterbetrieben. Temporäre Transfer-Schlüssel anschließend entfernen.

Der Dienst erstellt vor Schema-Migrationen einen geprüften Snapshot. Live-Datenbank und App-Installation werden nicht mit Syncthing synchronisiert. Alte CLI-Befehle, die im Clientmodus direkt in die zurückgelassene Datenbank schreiben würden, werden gesperrt; REST-basierte Entity-/API-Befehle bleiben nutzbar.

## App koppeln und Work benutzen

Agent Gateway v2 verwendet acht Kernwerkzeuge und den vorbereiteten Corpus-Index.
Verträge, Source Handles, Freigaben, Budgetgrenzen und der optionale OAuth-Dienst
stehen in [AGENT_GATEWAY.md](AGENT_GATEWAY.md). Der normale lokale Work-Client bleibt
stdio-basiert und delegiert über seine bestehende Gerätekopplung an den VPS. Der
separate Compose-Overlay `compose.mcp.yaml` wird nur nach bewusster Remote-Einrichtung
zugeschaltet; er veröffentlicht am VPS lediglich Loopback-Port 8009. Eine neue
Corpus-Migration am echten Bestand verlangt erneut Marcs geprüften Snapshot.

Einmaligen, zehn Minuten gültigen Code administrativ erzeugen:

```sh
docker exec unios-server python -m app.server pair
```

Den Code ausschließlich in der App eingeben. Der Client tauscht ihn über geprüftes HTTPS gegen einen widerrufbaren Geräteschlüssel; dieser liegt im OS-Schlüsselbund, nicht im Browser-Speicher. Weitere Geräte lassen sich über Einstellungen → Geräte koppeln und widerrufen. Der Server ist dauerhaft Host; Laptop-Übernahmeflächen entfallen.

Die bestehende lokale Work-/MCP-Verbindung bleibt stdio-basiert. `uniosd mcp` spricht mit dem lokalen Begleitdienst; dieser prüft die lokale MCP-Freigabe und verwendet seine Server-Gerätekopplung. Kurs-/Bereichsfreigaben und Gerätewiderruf gelten weiterhin. Der Server-MCP-Schlüssel wird nicht in die Clientkonfiguration kopiert. Einen bereits laufenden Work-Chat bei Bedarf neu starten, damit er seine MCP-Konfiguration neu lädt.

Hochschulanmeldung und MFA bleiben in den nativen Hochschulfenstern auf dem Nutzergerät. Die ausdrücklich erfasste Sitzung wird über die authentifizierte Verbindung im Server-Schlüsselbund abgelegt. IP-gebundene oder abgelaufene Hochschulsitzungen können eine erneute Anmeldung verlangen. Der Umzug schafft keine Microsoft-App-Registrierung. Als Alternative lässt sich der unten beschriebene Weiterleitungsempfang einrichten. Anki bleibt ein gesonderter Geräte-Agent; ein VPS ersetzt keine lokale Anki-Installation. Community-Connectoren benötigen ihre eigene isolierte Ausführungsumgebung; der API-Container erhält dafür keinen privilegierten Docker-Socket.

## Betriebsupdate vom 05.10.2026: Moodle und SQLite-Schreibkonflikte

Nachfolgendes TXT-Leser-Paket ist unter
`unios-server:0.1.19-txt-reader-20261005` aktiv, ohne Schemawechsel.
Es ergänzt die PDF-Ansicht für TXT und die gebaute Weboberfläche. Isolierter
Linux-Test mit synthetischen Texten und Quell-/Schemavergleich bestanden;
Datenvolumes und Edge-Konfiguration beibehalten. Kompatibler Vorgänger:
`unios-server:0.1.19-sqlite-lock-20261005`. Native Clients verwenden weiterhin
ihre installierte Oberfläche; neue Kurslinks kommen mit dem nächsten App-Paket.

Das Image `unios-server:0.1.19-sqlite-lock-20261005` reserviert vor dem kurzen
Datei-Savepoint einen SQLite-Schreibzugriff, bevor Metadaten gelesen werden.
Download und Parsing laufen vorher ohne diesen Zugriff. Andere Schreiber erhalten
eine begrenzte Wartezeit von 30 Sekunden. Damit vermeidet der Import den
reproduzierten Konflikt mit einem zwischenzeitlich geänderten WAL-Snapshot.
Modelle und Migrationen sind unverändert und über Quellmanifest-Vergleich geprüft;
das Update benötigt keine Datenbankmigration. Das bisherige Image bleibt als
`unios-server:before-sqlite-lock-20261005` verfügbar. Der normale Moodle-Abgleich
nach Aktivierung wurde über den gekoppelten Client als erfolgreich bestätigt.

## Spracherkennung, OCR und Sicherung

Für Mail ohne Microsoft-App-Registrierung: [Weiterleitung auf den VPS](MAIL_FORWARDING.md). Der dedizierte Empfang benötigt einen eigenen DNS-only-Mailhost, ein TLS-Zertifikat und eingehendes SMTP in der Provider-Firewall. Er wird getrennt vom HTTPS-Tunnel geprüft und erst nach externer Abnahme als bereit markiert.

Das Serverimage enthält die Sprachlaufzeit, Chromium für lesende PRIMUSS-Nachweise und deutsche/englische Tesseract-Sprachpakete. Das mehrsprachige Whisper-Modell muss unter `state/models/whisper-base` bereitgestellt werden; die Compose-Datei bindet diesen persistenten Pfad ein. Für reproduzierbare Installationen eine feste Modellrevision verwenden. Auf dem eingesetzten VPS wurde `Systran/faster-whisper-base` in Revision `ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66` eingerichtet. Aufnahmen verlassen für die Transkription das Gerät und gehen auf den eigenen Server; keine Cloud-KI ist dafür nötig.

Snapshots auf demselben VPS schützen vor fehlgeschlagenen Migrationen, ersetzen aber **keine externe Sicherung**. Für Wiederherstellung werden Daten, verschlüsselter Schlüsselbund und separat gesicherter Hauptschlüssel benötigt. Ein Verlust des Hauptschlüssels macht den Schlüsselbund unlesbar; es gibt keinen Klartext-Fallback. Ein automatisches Backup außerhalb des VPS ist separat einzurichten. macOS-/Linux-Clients und der echte Zwei-Geräte-Schlaf-/Offline-Test sind nach diesem Windows-Umzug noch gesondert abzunehmen.
