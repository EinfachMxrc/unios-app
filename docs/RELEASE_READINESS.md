<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Release-Abnahme

## Aktueller Entwicklungsstand nach Alpha1 · 04.10.2026

Diese Übersicht ist der aktuelle Einstieg für Ziele, Plattformen und offene
Abnahmen. Historische Protokolle darunter gelten für ihre jeweilige Version.
**Feature Freeze:** Heute, Kurse, Lernen und Termine bleiben die Hauptbereiche.
Betrieb über einen persönlichen HTTPS-Server mit Gerätebindung;
Tailscale/Syncthing sind ältere bzw. optionale Betriebsformen und keine
Voraussetzung für neue Benutzer. [Serveranleitung](SERVER.md).

| Schwerpunkt | Stand / Nachweis |
| --- | --- |
| KI-Kostenkontrolle | Atomare dauerhafte Reservierung vor Anbieteraufrufen; unbekannt abgerechnete Fehler bleiben gesperrt. Verbrauch und Reservierungen getrennt anzeigen |
| Große Kurs-/Notizlisten | 50 Einträge pro Seite, maximal 100; Filter vor SQL-Limit, Versionshistorie separat beim Öffnen. Begrenzte DOM-Liste statt Tausender unsichtbarer Zeilen |
| Import und Parser | Download/Parsing vor Schreibtransaktion; Parser im Kindprozess, 1 GiB RAM / 45 s Wandzeit / 64 MiB Ausgabe. Keine Behauptung einer Sicherheits-Sandbox |
| Inkrementeller Corpus | Persistente Quellengenerationen vermeiden erneute Arbeit an alten Fassungen; OCR invalidiert betroffene Fassung. Vorbereitung vor Writer-Lock, Generation vor Veröffentlichung erneut prüfen |
| Pipeline | 56 synthetische Original-PDFs, 775 Seiten, davon ein 500-Seiten-Skript; Import, Extraktion, Corpus, Suche, Snapshot und Restore-Staging gemessen. [Rohdaten und Grenzen](qa/alpha-hardening-20261004/README.md) |
| OCR | Auf diesem Windows-PC keine lokalen deutschen/englischen Sprachdaten; keine gemessene OCR-Latenz. Fake-OCR-Browsertests ersetzen diesen Nachweis nicht |
| Paketbau | `Desktop-Pakete` verlangt erfolgreiche vollständige `Qualität` am gleichen Commit: Linux/macOS/Windows, Docker und sämtliche Browserprüfungen |
| Frische Geräte / externe Woche | Offen: [Abnahmeablauf](MANUELL_TESTEN.md#nächster-alpha-kandidat-frische-geräte-und-externe-testwoche) mit 5–10 unabhängigen Benutzern. Kein Ersatz durch CI oder Screenshots |

Die **0.1.19 Alpha1**-Installer und ihr Tag bleiben unverändert. Diese Entwicklung
ist noch kein neuer installierter Kandidat. Zwei Migrationen sind vorbereitet;
vor einem Update echter Bestände verlangt `AGENTS.md` einen frischen von Marc
geprüften Snapshot.

Branchschutz lesend geprüft: `main` derzeit ungeschützt. Empfohlene Pflichtchecks:
`Backend (ubuntu-latest)`, `React und Browser`, `Linux GLib-Sicherheitsbackport`,
strikt auf aktuellem Branchstand; Force-Push/Branchlöschung sperren. Die gesamte
Plattformmatrix prüft zusätzlich der Paketbau-Gate. Aktivierung der GitHub-
Branchregeln bleibt offen; hier wird kein eingerichteter Schutz behauptet.

| Ziel | Automatisierbarer Nachweis | Offene praktische Abnahme |
| --- | --- | --- |
| Windows x64 | Lokale Python-/Browserprüfungen; volle CI separat | Frisches Setup/MSI, SmartScreen, Kopplung, Sleep/Resume, Update, Restore |
| macOS ARM | Matrix und Paketbuild separat | Installation, Schlüsselbund, Shortcuts, Sleep/Resume, Signatur/Notarisierung |
| macOS Intel | Paketlauf durch fehlende `onnxruntime`-Wheel begrenzt | Installierbarer Kandidat und komplette Bedienmatrix |
| Linux x64 | CI und Docker-Smoke separat | Frisches DEB/AppImage, Desktopintegration, Deep Links, Tray/HiDPI |
| HTTPS-VPS | Fake-API, Rechte, Versions-/Restoretests | Migration nach geprüftem Snapshot, reale OCR-/Importmessung, voller Restore-Drill |

Stand: 04.10.2026. Ausgangsbaseline war 0.1.18; der private VPS wurde nach den
Prüfungen auf 0.1.19 aktualisiert. Die öffentliche Freigabe bleibt an die offenen
Gates gebunden. Lokale Prüfungen und tatsächliche Geräteabnahme werden
getrennt dokumentiert. Es gibt keine geschätzte Bereitschaft in Prozent.

## Alpha-1-Nachtrag (04.10.2026)

`v0.1.19` wird auf ausdrücklichen Nutzerwunsch als experimentelle Vorabversion im
privaten Repository angeboten. Das ist keine Bestätigung der offenen öffentlichen
Geräte-/Signier-/Alpha-Wochen-Gates. [Release-Hinweise](releases/0.1.19-alpha.md).

Aktueller App-Code `3618c994daaadaf2956df81395bb5c949cb9c74d`:
[Qualitäts-CI 37196635430 bestanden](https://github.com/EinfachMxrc/unios-app/actions/runs/37196635430).
Lokal wurden zuletzt 413 Vitest-, 27 Navigation-/Lern-Playwright- und
21 Client-/Host-pytest-Prüfungen ausgeführt. Neun neue echte Demo-Aufnahmen für
README (Hell/Dunkel, 1440 px und 390 px) ohne Browser-Ausnahmen aufgenommen und
visuell geprüft. [Provenienz](readme/alpha-0.1.19/SCREENSHOTS.md).

Die Alpha liefert nur tatsächliche Installer mit Prüfsummen und Build-Metadaten.
Öffentliche Vertrauenssignierung, signierte Updatefeeds und frische Geräteabnahme
bleiben offen. macOS Intel ist im neuen Paketlauf durch die fehlende
`onnxruntime==1.30.0`-Wheel blockiert. Die Tabelle darunter dokumentiert weiterhin
den bisherigen Abnahmerahmen; ein CI-Paketbuild ersetzt keine physische Geräteprüfung.

## Status und Nachweis

**Bestanden** nennt einen dokumentierten tatsächlich ausgeführten Test.
**Teilweise** nennt einen begrenzten Nachweis plus fehlenden Teil.
**Offen** bedeutet kein ausreichender Nachweis. **Blockiert** nennt eine konkrete
externe Voraussetzung. Testcode allein gilt als vorbereitet, nicht als ausgeführt.

| Gate | Status | Nachweis / verbleibende Arbeit |
| --- | --- | --- |
| Backend und Browser 0.1.19 | Bestanden | GitHub am abschließenden Code-Stand: 815 Python bestanden / sieben übersprungen, Branch-Gesamtdeckung 82,85 %; 384 Frontend-Tests und Browser-Performance bestanden. Lokal 196 Browserabläufe und die zwei korrigierten Fehler in drei fokussierten Wiederholungen bestanden |
| Automatische Barrierefreiheit | Teilweise | Lighthouse Accessibility 100; NVDA/VoiceOver/Orca und Tastatur im nativen Paket offen |
| Visuelle Abnahme | Teilweise | Neue Seiten 0.1.19 Hell/Dunkel, Desktop/390 px geprüft; vollständige native Geräte-/Bedienmatrix offen |
| Windows-Upgrade | Teilweise | Bestehende Benutzerinstallation auf 0.1.19 aktualisiert; Version, Sidecar-Hash, Client-Health bestätigt. Frische VM, beide Installer, Defender/SmartScreen offen |
| macOS ARM / Intel | Offen | Bau-/Signiertests ersetzen kein installiertes aktuelles Paket auf beiden Geräten |
| Linux DEB / AppImage | Offen | Historischer Ubuntu-24.04-Bau, kein aktueller frischer Desktop-/Update-/Deep-Link-Nachweis |
| Linux-Servercontainer 0.1.19 | Bestanden | Frischer Build aus freigegebenem Git-Index; abgeschotteter HTTP-Smoke mit UID 10001, schreibgeschütztem Root-Dateisystem und ausschließlich erfundenem temporärem Bestand; kein Produktionsdeployment |
| Öffentliche Paketsignierung | Blockiert | Developer-ID/Notarisierung und Windows-Code-Signing nicht als eingerichtet nachgewiesen; [Desktop-Pakete](DESKTOP_PACKAGES.md) |
| Backup / Restore | Teilweise | Synthetischer vollständiger Export-/verschlüsselter Restore-Drill vorhanden; überprüfte Produktion-Snapshots und freigegebene Migration 0.1.18 dokumentiert. Gerätematrix/aktueller RC offen |
| Beschädigte DB / Safe Mode | Teilweise | 0.1.19: isolierte API-/Export-/Backup-Prüfungen und Browser-Schreibsperre bestanden; native Geräte-/Neustartmatrix bleibt offen |
| Updatekanäle | Teilweise | 0.1.19: drei Rust-Policy-Prüfungen, 18 Manifest-/Staging-Prüfungen und drei UI-Prüfungen bestanden. Kein öffentlicher Feed aktiv; echter signierter Update-/Rollback-Drill offen |
| Connectoren | Teilweise | Lokale Fakes und einzelne historische Nutzerbestätigungen; genaue Grenzen in [COMPATIBILITY](COMPATIBILITY.md) |
| Addon-/Connector-Isolation | Teilweise | Deterministische Rechte-/Container-/WASM-Tests; kein Beweis gegen jede Engine-Schwachstelle, Herkunftssignaturen offen |
| GPT Work | Teilweise | Acht Werkzeuge am installierten nativen MCP bestätigt; echte Kontoverbindung und quellengebundene Nutzeraufgaben weiterhin offen |
| Skalierung | Teilweise | 0.1.19: 25.000 synthetische Primärdokumente, 120 Kurse, zehn Semester, 25.141 Indexobjekte / 75.141 Chunks, echter Corpus-Indexlauf 458,65 s. 100 feste Fragen: Recall@5/20 = 1, MRR 0,995; weder PDF/OCR-Importbenchmark noch universeller semantischer Trefferbeweis |
| Erstbenutzung unter zehn Minuten | Teilweise | 0.1.19: echter separater Demo-Quellprozess, PDF-Anzeige und gespeicherte Kartenbewertung in 8,07 s. Fremder Nutzer auf frischem Gerät ohne Terminal und ohne vorgegebene Klickfolge fehlt |
| Externe Alpha-Woche | Offen | Keine abgeschlossene dokumentierte Kohorte mit 5–10 Nutzern / einer Woche |

## Prüfprotokoll je Kandidat

Abschließender Code-Stand `89bcecbbd00d35b41fef0f2e83b04ab710a19966`:
[GitHub-CI 37139751954](https://github.com/EinfachMxrc/unios-app/actions/runs/37139751954)
am 03.10.2026 bestanden. Backend einschließlich 80%-Coverage-Gate, React/Browser
und Linux-GLib-Backport grün. Docker ist im Push-Workflow planmäßig übersprungen;
sein separat ausgeführter isolierter Nachweis steht unten. Die entfernte
braces-Abhängigkeit wurde von GitHub als behoben markiert. Der letzte Folgecommit
ändert ausschließlich dieses Protokoll und PROGRESS, keinen geprüften Code.

Commit, Paketversion, Betriebssystem/Architektur, Startzeit, Dauer, Prüfende und
isoliertes Datenprofil notieren. Für jedes Gate Testbefehl, Exitcode und Artefakt
verknüpfen. Fehlende Hardware mit „offen“ kennzeichnen. Berichte enthalten nur
erfundene Daten und bereinigte technische Metadaten.

Ein Update-Drill beginnt mit einem synthetischen alten Schema und definierten
Objekt-/Dateihashes. Backup prüfen, Update durchführen, danach Notizen, Dateien,
Karten, Beziehungen, Einstellungen und Suche vergleichen. Restore in **einen
neuen** isolierten Ordner; nie einen echten Bestand für einen Chaostest verwenden.
Disk-full, gesperrte DB, beschädigte Datei, abgebrochener Job und Netzfehler jeweils
als getrennte Fälle prüfen. Kein Schema-Downgrade als unterstützten Rollback ausgeben.

## KI-Prüfung und menschliche Grenzen

Die ausführende KI bekommt Ziele, keine Klickliste: nächste Abgabe finden,
Quellen-PDF öffnen, Notiz erstellen, Zugriff widerrufen, nach Restore wiederfinden.
Ein unabhängiger Prüfer kontrolliert Quelle, Rechte, Version und gespeicherten
Zustand. Zeit, Klicks, Fehlversuche und Sackgassen getrennt protokollieren.
Screenshots ergänzen DOM-Überlauf-, Fokus- und Touch-Ziel-Prüfungen. Eine subjektive
KI-UX-Bewertung ersetzt weder deterministische Gates noch menschliche Rückmeldung.

Issue-Entwürfe enthalten Reproduktion, erwartet/tatsächlich, Version und bereinigte
Artefakte. Veröffentlichung erfolgt nach bewusster Prüfung; keine automatische
Übertragung privater Diagnosen. Echte MFA, Screenreader, Schlaf/Aufwachen,
Schlüsselbunddialoge, OS-Signierung und Campusabläufe bleiben Geräte-/Nutzerabnahme.

Für einen Release-Kandidaten gilt Feature Freeze: Fehler, Performance, Bedienung,
Recovery, Sicherheit, Installer, Dokumentation und Connector-Stabilität bearbeiten.
Offene P0-Gates verhindern die Erklärung „öffentlich abgenommen“.

## Frische Windows-Installation: ausdrücklich noch offen

Auf dem verfügbaren Entwickler-PC sind UniOS, Laufzeitwerkzeuge, Schlüsselbund-
Einträge und Serverkopplung bereits vorhanden. Ein weiterer Installerlauf, ein
neuer UniOS-Testordner oder ein neues Windows-Benutzerprofil beweisen deshalb
keine Erstinstallation auf einem frischen Betriebssystem. Diese Sitzung hat
keinen solchen frischen Windows-Desktop bereitgestellt und markiert das Gate
weiterhin **offen**.

Für die Geräteabnahme eine neue Windows-VM beziehungsweise ein frisches Testgerät
mit dokumentierter OS-Version verwenden, ohne Python, Node und alte UniOS-Daten.
NSIS und MSI aus jeweils demselben sauberen VM-Ausgangsstand prüfen. Paket/Hash,
SmartScreen-/Defender-Ergebnis und WebView-Voraussetzung festhalten. Die App muss
ohne Terminal öffnen; Demo wählen, Kurs/PDF/Notiz/Lernablauf erreichen, App beenden
und wieder öffnen. Anschließend Upgrade mit geprüfter synthetischer Sicherung und
Entwurfserhalt prüfen. Serverkopplung nur gegen eine separate Testinstanz.

Ein Prüfprotokoll enthält Status, genaue Paketversion/Commit, Windows-Build,
frischen Ausgangsstand, Installerart, Ergebnis und bereinigte Belege. „Nicht
verfügbar“ wird als offen mit Voraussetzung festgehalten, niemals als bestanden.

## Recovery-Sicherheitsnachweis dieses Arbeitspakets

Die gezielten Recovery-/Verifier-/Connector-Vorlagentests sind auf Windows mit
isolierten erfundenen Daten ausgeführt: 28 bestanden; Ruff und Mypy für die neun
betroffenen Python-Quellen bestanden. Nachgewiesen sind unter anderem nicht
schreibende Sitzungsprüfung, abgewiesene fremde Origin/Host-Anfragen, Ausfuhr nur
aus notes/uni, unveränderlicher Export trotz anschließend geänderter Quelldatei,
begrenzte parallele Ausfuhr/Sicherung, Quota-/Disk-space-Abbruch und tatsächlich
geprüfte private Windows-Datei-ACL. Das ist **kein** Erstinstallationsnachweis und
noch kein vollständiger Phasenend-Lauf.

## Updatekanäle: vorbereiteter Kandidat

Kanal- und Stagingtests: 18 bestanden mit fiktiven Artefakten. Native Rust-Tests:
3 bestanden für feste Kanäle, Mindestversion, Schema, fremde Artefaktadressen und
frische/generationstreue Snapshot-Prüfung. Native Kompilierung, Python-Ruff und
Frontend-Typecheck bestanden. Echte Signaturen, veröffentlichte Feeds, ein
installiertes signiertes Update und dessen Abbruch wurden damit **nicht** geprüft.
Zusätzlich bestanden die drei UI-Sicherheitsabläufe (Unsigned Build ausblenden,
Snapshot-Fehler sperrt Installation, Kanalwechsel verwirft geprüften Stand) und
180 DE/EN-Paritätsprüfungen. ESLint für das Update-UI bestand.

Staging: `python scripts/stage_desktop_release.py <version> <artefakte> <ziel>
--channel beta --min-supported-version <minimum> --compatible-schema <schema>`.
Nur tatsächlich geprüfte Server-Schemas explizit angeben; ohne Zusatz gilt allein
der aktuelle Alembic-Stand. Kanaldateien werden nach Abnahme unter dem festen Tag
`channel-stable`, `channel-beta` beziehungsweise `channel-nightly` veröffentlicht;
das Stagingskript veröffentlicht selbst nichts. Näheres zu unsignierten Metadaten
und verbleibenden Speichergrenzen: [TRUST](TRUST.md).

## Linux-Container: isolierter Nachweis für 0.1.19

Am 03.10.2026 wurde `deploy/server/Dockerfile` mit 947 ausdrücklich ausgewählten
Git-Index-Quelldateien gebaut; `data`, `local`, `.env`, `.tmp`, Buildprodukte und
private Laufzeitzustände waren ausgeschlossen. Quellenarchiv SHA-256:
`0909cabb0fc0bd4f5297735ef53f90cba543d53cda9d14b8d9aecc9cc4c1f689`.
Kandidatenimage: `unios-server:0.1.19`, Digest
`sha256:62d8ef7a7bd1859c005369b0086de80643e5cd7e9bcef037a1c76fa0d60b4b56`.
Dieser abschließende Neubau enthält auch die letzte Offline-Korrektur für
StudyPage/StudySessionPage; derselbe isolierte Smoke wurde erneut bestanden.

Der Prüflauf nutzte UID 10001, `--read-only`, `--network none`, keine veröffentlichten
Ports, keine Linux-Capabilities und ausschließlich frisch erzeugten tmpfs-Zustand.
Der Factory-/Demo-Ablauf startete echtes internes HTTP mit Server-Authentifizierung:
Health, 401 ohne Kopplung, freigegebene Kurs-/Karten-/Release-Statusdaten, PWA-Dateien
und unbekannter Host wurden geprüft. Ungültige fremde Umgebungseinstellungen
gelangten nicht in Demo oder Recovery. Recovery verweigerte fehlende Sitzung,
fremde Origin/Host, lieferte einen geprüften Notizexport und erzeugte eine Sicherung;
die Hashes der erfundenen DB und Sitzungsdatei blieben gleich. Exitcode 0.

Dieser synthetische Smoke allein belegt weder einen Linux-Desktopinstaller noch einen echten Hochschulabruf,
produktiven Serverstart mit echten Schlüsseln oder eine vollständige Wiederherstellung.
Während dieses isolierten Prüflaufs blieb der Produktionsdienst unverändert. Technischer Prüflauf:
`.tmp/linux-smoke-20261003T163957Z/smoke.log` (lokales, nicht veröffentlichtes
Artefakt). Der erste Harness-Aufruf benötigte eine Korrektur seines Importpfads;
der erfolgreiche Lauf verwendet `/app`, wie der reguläre Modul-Einstieg.

## Privater VPS: Aktualisierung nach den Prüfungen

Anschließend wurde ausschließlich der bestehende `api`-Dienst auf das oben
geprüfte Image 0.1.19 aktualisiert (`--no-build --no-deps`, Projekt `unios`). Vorher
lag ein geprüfter Snapshot vom 03.10.2026, 16:48:13 UTC vor; der bestätigte
Schema-Stand `ff94af768293` war unverändert und es gab keine neuen Migrationen.
Die Konfiguration wurde vor dem Wechsel auf gleiche Mounts, Netzwerke und Ports
geprüft. Daten-/Schlüsselbund-Mounts, Runner und andere Dienste blieben erhalten.

Der gestartete Dienst meldete Health `ok`, Docker-Health `healthy`, Paketversion
`0.1.19` und HTTP 401 für einen ungepaarten Diagnoseabruf. Über die bereits
gekoppelte lokale App-Brücke wurden ausschließlich App-Version `0.1.19` und
Schema-Version `ff94af768293` bestätigt. Ein Rückweg zum bisherigen Image/Compose war
vorbereitet und wurde nicht benötigt. Es wurden weder persönliche Hochschuldaten
als Test abgefragt noch öffentliche Updatefeeds oder Pakete freigegeben. Diese
private Aktualisierung ersetzt keine externe Alpha-Woche oder Geräteabnahme.
