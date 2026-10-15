<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Desktop-Pakete

## Öffentlicher Paketlauf ab 0.1.28

Im öffentlichen Repository `EinfachMxrc/unios-app` ist der Paketlauf eingerichtet.
Vor dem Bau muss die vollständige Qualitätsmatrix am selben Commit bestanden sein.
Der öffentliche Paketlauf erzeugt Windows x64 (NSIS/MSI) und Linux x64
(DEB/AppImage). macOS bleibt bei lokalen Entwicklerbauten, bis Developer-ID und
Notarisierung für öffentliche Installer eingerichtet und geprüft sind. Die älteren
Vier-Plattform-Tabellen unten beschreiben den allgemeinen Projektablauf.

## Alpha 1 / 0.1.19

Die [Vorabversion](https://github.com/EinfachMxrc/unios-app/releases/tag/v0.1.19)
enthält nur erfolgreiche Installer-Builds mit `SHA256SUMS.txt` und
`release-info.json`. Windows-NSIS/MSI stammen aus dem geprüften lokalen Stand
`3618c99`; zusätzliche Plattformen aus dem GitHub-Paketlauf desselben App-Codes.
macOS Intel ist derzeit durch eine fehlende `onnxruntime`-Wheel blockiert.
Pakete sind nicht öffentlich vertrauenssigniert; automatische Updates bleiben
deaktiviert. Die Signier-/Gerätematrix ist in [RELEASE_READINESS.md](RELEASE_READINESS.md)
dokumentiert. Der Release erbt die private Repository-Sichtbarkeit.

Historische Bau-/Installationsprotokolle folgen unten; ihre Versionsnummern
bezeichnen frühere Prüfungen, nicht das aktuelle Downloadangebot.

**Installation 03.10.2026:** Windows-NSIS/MSI 0.1.16 gebaut. Das NSIS-Update
wurde still mit Exit 0 in der vorhandenen Benutzerinstallation ausgeführt;
Windows-Versionsinfo und Uninstall-Eintrag zeigen 0.1.16. Der installierte
Begleitdienst hat denselben SHA-256 wie das gebaute Paket. Native App wieder
gestartet; Health 200, `mode=client`. Nur ein gefrorener Begleitdienst mit
Loader-/Kindprozess läuft. Scheduled Task „Marc Uni OS“ bleibt deaktiviert;
kein UniOS-Eintrag im Login-Autostart. Raumkonfiguration über die gekoppelte
Verbindung erfolgreich gelesen. Reale Hochschulanmeldung und verbindliche
Raumbuchung wurden nicht vom Agenten bedient.

UniOS bündelt React und den lokalen Python-Dienst in einer Tauri-App. Nutzer benötigen weder Python noch Node. Studiendaten liegen unter `%LOCALAPPDATA%\UniOS` (Windows), `~/Library/Application Support/UniOS` (macOS) beziehungsweise `$XDG_DATA_HOME/UniOS` oder `~/.local/share/UniOS` (Linux). Unter Windows kann die Benutzerinstallation denselben Stammordner verwenden. Deshalb bei einer Reparatur ausschließlich manifestierte Programmdateien behandeln; niemals den gesamten UniOS-Ordner löschen oder kopieren.

## Pakete bauen

### Windows-Laufzeit ab dem Startpaket vom 05.10.2026

Der Windows-Dienst ist ein Onedir-Paket. `uniosd.exe` und der vollständige Ordner
`_internal` gehören zusammen; nur die EXE zu kopieren reicht nicht. NSIS und MSI
installieren beide im selben Programmverzeichnis. Andere Plattformen behalten
vorerst das Onefile-Format.

### Windows-Installation unabhängig vom Build-Kontext prüfen

Der Neustartfehler vom 10.10.2026 wurde durch eine in Codex umgeleitete
Installation verursacht: Die EXEs lagen im normalen Installationsordner,
`_internal` dagegen im privaten MSIX-Cache. Der normale Windows-Desktop konnte
die Python-DLL dadurch nicht finden. Das bestehende Paket 0.1.23 wurde über den
echten Windows-Desktop erneut installiert; alle 2896 Programmdateien wurden
anschließend mit exakten Kernelpfaden und SHA-256 geprüft. Normaler App-Start
und Client-Health bestanden. [Reparaturnachweis](qa/windows-runtime-repair-20261010/README.md).

Installer über Explorer starten. Danach eine normale Windows-PowerShell über
das Startmenü öffnen und im Quellverzeichnis ausführen:

```powershell
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\scripts\verify_windows_runtime.ps1 -InstallRoot "$env:LOCALAPPDATA\UniOS" -StartupCheck
```

Die lesende Prüfung verlangt für sechs Kernprogrammdateien den erwarteten
physischen Kernelpfad und startet erst danach `uniosd.exe --startup-check` mit
allen drei geerbten Pipes. Der Starttest verwendet ausschließlich ein leeres
temporäres Profil und keinen Netzwerkzugriff. Umleitungen, fehlende Dateien,
Zeitüberschreitung oder ein ungültiges Ergebnis ergeben Exit 1. Der Prüfer
ersetzt nicht den vollständigen Abgleich des jeweiligen Release-Manifests.
Seine synthetischen Regressionstests laufen mit
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\test_verify_windows_runtime.ps1`.

Ein erfolgreicher Start oder Dateiabgleich aus Codex reicht als
Installationsnachweis nicht aus. Auch `GetCurrentPackageFullName = 15700`
garantiert in diesem Kontext keine unabhängigen Dateipfade. Eine explizite
MSIX-Cache-Ausnahme darf nicht mehr als normale Windows-Installation gelten.
Microsoft beschreibt die [AppData-Umleitung paketierter Desktop-Apps](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-behind-the-scenes).

Startmessung ohne persönliche Daten mit
`python scripts/benchmark_desktop_startup.py /absoluter/Pfad/uniosd.exe --client-check`.
Die Probe startet einen temporären leeren Client und prüft Health und Oberfläche.
Ohne `--client-check` misst sie allein den Loader per ungültigem Argument.
Kein Ergebnis steht für die vollständige native GUI oder VPS-Latenz.

Das lokale Reparaturpaket 0.1.19 vom 05.10. wurde installiert und geöffnet.
NSIS-SHA-256: `3749072e267c09dc4f57387e1702637c9d8ecf691da9725853fd5b8c01ca5080`.
EXE, Python-DLL und gebündelte HTML stimmen mit dem Build überein. Ein Neustart
erreichte Client-Health nach 2,494 statt 6,846 s; etwa 64 % weniger Wartezeit in
dieser Messung. Fensterhandle separat 1,340 statt 1,186 s; keine Messung der
vollständigen Darstellung. Der veröffentlichte Alpha1-Installer bleibt unverändert.

Der Bau muss auf dem jeweiligen Betriebssystem stattfinden. Die manuell startbare GitHub-Action [Desktop-Pakete](../.github/workflows/desktop-packages.yml) erzeugt vier private Prüfarbeitsstände:

| System | Paket | Bauplattform |
| --- | --- | --- |
| Windows x64 | NSIS `setup.exe` und MSI | Windows |
| macOS Apple Silicon | DMG | macOS arm64 |
| macOS Intel | DMG | macOS x64 |
| Linux x64 | DEB und AppImage | Ubuntu 22.04 |

Lokal: `uv sync --locked --extra package --extra voice --extra ai --group dev`, im `frontend/`-Ordner `npm ci`, anschließend `uv run --no-sync python scripts/build_desktop.py`. Auf Linux werden zusätzlich die [Tauri-Systembibliotheken](https://v2.tauri.app/start/prerequisites/) benötigt. Das Ergebnis liegt unter `desktop/src-tauri/target/release/bundle/`. Der Bau nutzt die vorhandenen Sperrdateien für Python, npm und Rust. Der Build lädt zusätzlich das feste Whisper-Base-Modell (etwa 148 MB) und bündelt es samt Lizenzen. Aufnahmen werden im installierten Produkt ohne Netzabruf transkribiert; das erste Laden des Modells und die Verarbeitung benötigen je nach CPU einige Sekunden. Das KI-SDK wird mitgebündelt; KI-Zugriffe bleiben ohne persönlich verbundenen Schlüssel deaktiviert.

Eine neue Installation beansprucht den lokalen Host automatisch. Bei einer bestehenden Datenbank erstellt der Dienst vor einem Datenbankschritt einen geprüften Snapshot und bricht bei unklarem Host oder beschädigtem Snapshot ab. Die App startet im Hintergrund beim Benutzerlogin; das Schließen des Fensters beendet den lokalen Dienst nicht. Beim Öffnen erscheint sofort ein Startbildschirm; weder für die App noch für den Dienst oder dessen Hilfsprogramme öffnet sich ein Terminalfenster. Das UniOS-Symbol im Infobereich holt das Fenster zurück oder beendet UniOS samt lokalem Dienst. Allgemeine externe Links öffnen sich im Standardbrowser; Hochschul-Anmeldungen öffnen ein eigenes App-Fenster. Startprobleme stehen in `logs/uniosd.log` im UniOS-Datenordner (Windows: `%LOCALAPPDATA%\UniOS`); Anfragezeilen werden nicht protokolliert. Die Moodle-Rückkehradresse `marcunios://` wird von der installierten Desktop-App verarbeitet. Anmeldung und Handy-Code bleiben auf der offiziellen Hochschulseite.

## Signierte Updates und Veröffentlichung

### Lokale Mac-Updates und Schlüsselbund

Lokale Mac-Bauten ohne `APPLE_SIGNING_IDENTITY` und außerhalb von CI verwenden eine dauerhafte, nur auf diesem Mac erzeugte Signieridentität. `scripts/build_desktop.py` legt die signierte App und das DMG unter `~/Library/Caches/UniOS/local-builds/` ab. **Nur diese signierte App installieren**, nicht den vorherigen ad hoc signierten Tauri-Zwischenstand. Der lokale Bauschlüssel liegt in einem eigenen privaten Build-Schlüsselbund unter `~/Library/Application Support/UniOS Build Signing`; dieser enthält keine Hochschulzugänge. Schlüssel und Passwort verlassen dieses Gerät nicht und gehören nicht in Git. Eine beschädigte/unvollständige Identität führt zum Abbruch statt zu einem unbemerkten Zertifikatswechsel. Den Signierordner bei künftigen Updates erhalten.

Bei getrenntem Python-/Tauri-Bau zuerst die fertige App mit `ditto --norsrc --noextattr` außerhalb des synchronisierten Repos bereitstellen und dann `uv run --no-sync python scripts/sign_macos_local.py <Pfad-zur-App>` ausführen. Anschließend nicht erneut ad hoc signieren. Der Dienst hat den festen Signierbezeichner `app.unios.desktop.service`, die Hülle `app.unios.desktop`; das Zertifikat hält ihre Identität trotz geänderter Programmdateien stabil. Ein echter macOS-Test mit zwei unterschiedlichen ausführbaren Dateien und einem ausschließlich erfundenen Schlüsselbund-Eintrag prüft den Zugriff nach einem Update und die Ablehnung einer anschließend ad hoc signierten Datei.

Beim Wechsel von den bisherigen ad hoc Bauten kann macOS vorhandene Zugänge einmalig erneut freigeben lassen. **„Immer erlauben“** im macOS-Dialog speichert die Freigabe; „Erlauben“ gilt nur für den einzelnen Zugriff. Geschützte Dialoge bedient ausschließlich der Nutzer. Die Zugänge bleiben verschlüsselt in der OS-Keychain. Die lokale Signatur ist keine Developer-ID-Signatur und keine Notarisierung; sie gilt für private Bauten auf diesem Mac. Für eine öffentliche Veröffentlichung weiterhin den folgenden Apple-Signierweg nutzen. Hintergrunddienste aus dem Quellbaum greifen als anderes Programm auf den Schlüsselbund zu; parallel zur Desktop-App sollen sie nicht laufen.

### Öffentliche Pakete

Ein unsignierter Bau bietet keine automatische Aktualisierung an. **Für das öffentliche Repository `unios-app` sind Updater-Schlüssel eingerichtet** (Variable `UNIOS_UPDATER_PUBLIC_KEY`, Secrets `TAURI_SIGNING_PRIVATE_KEY` und `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`). Der Workflow „Desktop-Pakete“ baut damit signierte Windows- und Linux-Pakete; mit der Option `release_draft` legt er danach einen Release-**Entwurf** samt `latest.json` an. Erst das Veröffentlichen dieses Entwurfs (als Latest) schaltet den Update-Kanal `releases/latest/download/latest.json` frei. Apps, die vor der ersten signierten Version installiert wurden, enthalten den öffentlichen Schlüssel nicht und müssen einmal von Hand neu installiert werden. Der private Schlüssel liegt nur als GitHub-Secret und in einer Sicherung des Maintainers; geht er verloren, können bereits installierte Apps keine Updates mehr annehmen. Für einen signierten Bau werden die Repository-Variable `UNIOS_UPDATER_PUBLIC_KEY` (Inhalt des öffentlichen Tauri-Schlüssels) und das Repository-Secret `TAURI_SIGNING_PRIVATE_KEY` (privater Schlüssel als Pfad oder Inhalt) benötigt, bei verschlüsseltem Schlüssel auch das Secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Der Bau erzeugt dann Signaturen und den Update-Schalter in der Systemansicht. Private Schlüssel gehören nie in Git oder Download-Artefakte.

Für öffentliche macOS-Pakete sind zusätzlich die GitHub-Secrets `APPLE_CERTIFICATE` (Developer-ID-Application-Zertifikat als Base64-kodierte `.p12`), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_API_ISSUER`, `APPLE_API_KEY` und `APPLE_API_KEY_BASE64` (Notarisierungs-API-Schlüssel `.p8` als Base64) vollständig zu setzen. Die Action importiert das Zertifikat in einen temporären Schlüsselbund, lässt Tauri signieren und notarisiert bauen und prüft anschließend App-Signatur sowie DMG-Ticket. Ohne diese Werte entsteht nur ein intern nutzbarer, ad hoc signierter Mac-Prüfbau. Eine teilweise Konfiguration bricht ab. Das Zertifikat und den API-Schlüssel niemals in Chat, Git oder Build-Artefakte kopieren. Windows-Code-Signing benötigt später ein separates Codesign-Zertifikat.

Der Workflow macht diesen Schritt bei `release_draft` selbst. Von Hand: die CI-Artefakte der gebauten Plattformen (nicht gebaute werden übersprungen) nach einem signierten Bau in die Ordner `windows-x64`, `macos-arm64`, `macos-x64`, `linux-x64` entpacken. `python scripts/stage_desktop_release.py <version-aus-tauri.conf.json> <artefakte> <leerer-zielordner> --notes "Änderungen"` legt eindeutig benannte Pakete, SHA-256-Prüfsummen, `latest.json` und `release-info.json` mit App- und Datenbankschema-Version ab. Die Versionen im Tauri-Bau und gebündelten Python-Dienst müssen übereinstimmen. Die JSON-Datei verweist für Windows auf das NSIS-Setup; das MSI liegt zusätzlich für eine manuelle Installation bei. Beide Installationswege und ein Update von einer älteren Version müssen vor der Freigabe auf einem frischen Windows-Gerät geprüft werden. Der Staging-Schritt veröffentlicht selbst nichts.

Eine Übernahme installiert einen geprüften Snapshot nur, wenn dessen Datenbankschema exakt zum lokalen UniOS-Bau passt. Ein älteres Gerät bleibt im Standby und muss zuerst aktualisiert werden. Die App liegt außerhalb von `DATA_DIR`; Syncthing spiegelt die Nutzerdaten, nicht die Installation. Vor jeder lokalen Migration wird ein prüfbarer Snapshot angelegt.

**Lokaler Stand (28.09.2026):** Windows-NSIS liegt unter `desktop/src-tauri/target/release/bundle/nsis/`, das zusätzlich gebaute MSI unter `bundle/msi/`. Beide wurden nach dem aktuellen Feedback- und Schema-Paket erneut gebaut; der gebündelte Dienst beantwortete `/api/feedback/diagnostics` mit App-Version 0.1.0 und aktuellem Schema aus einem isolierten Beispielprofil. Der lokale MSI-Bau ist noch kein Installations- und Update-Nachweis auf einem frischen Gerät. In einer Ubuntu-24.04-Umgebung auf diesem PC wurden `dist/linux/UniOS_0.1.0_amd64.deb` und `dist/linux/UniOS_0.1.0_amd64.AppImage` erzeugt. Das DEB enthält Desktop-App, Sidecar und Desktop-Eintrag; der gebündelte Linux-Dienst beantwortete `/health` und `/api/setup/status` mit einem frischen Beispielprofil. Der lokale Ubuntu-24.04-Bau belegt noch keine Kompatibilität mit Ubuntu 22.04 oder anderen Distributionen. Die GitHub-Action verwendet Ubuntu 22.04 als breitere Basis.

Die öffentliche Freigabe bleibt an das [Repository- und Geräte-Audit](PUBLISHING.md) gebunden. Für Linux sind insbesondere der Start unter einer frischen Desktop-Sitzung, die `marcunios://`-Rückkehr und der Updateweg zu prüfen. GitHub Actions war zuletzt durch die Abrechnung des privaten Repositories blockiert; bis ein Lauf tatsächlich erfolgreich ist, sind macOS-Pakete nur als Baukonfiguration vorhanden.

Die [Projektseite](site/index.html), [Downloadseite](site/download.html) und [interaktive Vorschau](site/demo.html) sind statische Entwürfe. Die Vorschau verwendet erfundene Daten und öffnet keine öffentliche UniOS-API.
