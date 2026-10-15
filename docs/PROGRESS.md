<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

## 15.10.2026 – Öffentlicher Release 0.1.28 veröffentlicht

Kandidat `461f567e22ea73dba1b748de02b4e58271ecbd12`,
[Qualitätslauf 38775534418](https://github.com/EinfachMxrc/unios-app/actions/runs/38775534418):
alle sechs Pflichtjobs erfolgreich. Linux 1.361 bestanden / zwölf Skips und
84,53 % Coverage; macOS 1.363 / zehn Skips; Windows 1.364 / neun Skips samt
Dienststartprüfung. Alle 1.435 Frontendtests und **530 Browserfälle in einem
vollständigen Lauf** bestanden. Docker prüft auch Backup/Wiederherstellung;
GLib-Sicherheitsprüfung grün. Lighthouse am endgültigen normalen Web-Build:
Accessibility 100 und Legacy-PWA 100, keine Laufzeitfehler.

PR #23 ist zusammengeführt; zu diesem Zeitpunkt keine offenen PRs. Der
öffentliche Hauptzweig enthält dieselben Dateien wie der geprüfte Kandidat.
Der Paketlauf 38779476404 hat die sechs Prüfjobs am exakten Commit bestätigt
und Windows x64 (EXE/MSI) sowie Linux x64 (DEB/AppImage) erfolgreich gebaut.
Die isolierten Client-Startproben bestehen: Windows 2,976 s und Linux 6,448 s
inklusive Loader; diese Messungen ersetzen keine normale GUI-/Geräteabnahme.
Vier Paketprüfsummen stimmen mit den CI-Belegen überein; beide Update-Signaturen
und ihre signierte Version 0.1.28 wurden offline geprüft.

[Release v0.1.28](https://github.com/EinfachMxrc/unios-app/releases/tag/v0.1.28)
am 15.10.2026 um 18:07 UTC veröffentlicht und als neueste Ausgabe gesetzt.
Alle 13 GitHub-Asset-Hashes stimmen mit dem geprüften Staging überein. Öffentlicher
Update-Feed und SHA256SUMS anonym heruntergeladen und mit den Uploads verglichen.
Feed im Beta-Kanal, nur tatsächlich gebaute Windows-/Linux-Plattformen. Belege:
`docs/qa/public-release-0.1.28-20261015/release-verification.json` und die
Verifikationsdateien im Release. Keine neue Geräteinstallation oder Hochschul-
abnahme behauptet; kein öffentlicher Mac-Installer ohne Developer-ID/Notarisierung.

## 15.10.2026 – Kursnamen nach Cache-Hydrierung und PDF-Testvorbedingung

Lauf 38770630888 bestand alle Plattform-/Betriebsjobs: Linux 1.361 Tests mit
84,53 % Coverage, macOS 1.363 und Windows 1.364 Tests samt Dienststartprüfung.
Browser 528 von 530 bestanden, einschließlich sämtlicher KI- und Mitschriftfälle.
Das Kursnamenformular übernahm nach einem frischen Server-Refetch seinen alten
Vergleichswert aus dem ersten Cache-Render. Unberührte Formulare gleichen jetzt
Wert und Vergleichswert vor dem Paint ab; eigene Eingaben und deren ursprünglicher
Vergleichswert bleiben erhalten, sodass echte Fremdänderungen weiterhin kollidieren.
Zwei gezielte Regressionen prüfen beide Fälle.

Der PDF-Test verließ nach einem Deep-Link die Ansicht, bevor der asynchron
geöffnete Dialog sichtbar war. Er bestätigt jetzt zunächst den geöffneten Dialog
und prüft danach unverändert dessen Rückkehr/Persistenz. Keine Produkt-Speicherung,
Tests oder Coverage-Grenzen werden deaktiviert; noch keine Paketfreigabe.
Die Kursnamen-Regression schlägt mit dem bisherigen Produktcode fehl und
besteht mit der Korrektur. Beide Unit-Fälle sowie 16 Browserfälle in zwei
aufeinanderfolgenden Ausführungen bestehen; Typecheck, Lint und Build sind grün.

## 15.10.2026 – Befunde aus dem festen Kandidaten

Lauf 38756486505 bestand Linux, macOS, Docker und GLib; Browser 526 bestanden /
vier fehlgeschlagen. Drei KI-Fälle fehlten wegen des im Browser-CI nicht
installierten optionalen SDKs; das Extra `ai` wird dort jetzt wie im Backend
installiert. Der vierte Fall verlor einen umbenannten Mitschrifttitel beim
folgenden Texteingang. Feldänderungen lesen das andere Feld nun aus dem neuesten
Entwurf beziehungsweise Live-Ref statt aus einem älteren Editor-Rückruf.
Ein gezielter Regressionstest hält bewusst einen alten Rückruf fest und prüft
den erhaltenen Titel. Alle neun NoteDocument-Tests bestehen.

Windows bestand die korrigierte Anki-Backup-Prüfung, scheiterte später beim
Host-Übergabetest am einsekündigen Warten auf den HTTP-Arbeiter. Ereignisgesteuerte
Wartefristen erlauben nun CI-Anlaufzeit; alle bisherigen Sperr- und Reihenfolge-
Prüfungen bleiben erhalten, der gehaltene Arbeiter wird auch nach einem
fehlgeschlagenen Assert freigegeben. 17 Host-/Backupfälle, Ruff und mypy bestehen.
Der vorherige Kandidat ist weiterhin keine Paketfreigabe.
Nach Korrektur zusätzlich 23 kombinierte Browserfälle für KI-Verbindung und
Mitschrift einschließlich Titel-/Inhaltsfortsetzung, Hell/Dunkel und Mobil
bestanden. Typecheck, Lint und endgültiger Frontend-Build sind grün.

## 15.10.2026 – Fester öffentlicher Release-Kandidat nach PR #22

Der parallele Merge von PR #22 hat den manuellen Freigabelauf auf `main`
automatisch abgebrochen. Linux (1.360 Tests, zwölf Skips, 84,53 % Coverage),
macOS (1.362 Tests, zehn Skips), Docker und GLib bestanden. Der Windowslauf
meldete einen echten Testaufbaufehler: Die neue Anki-Backup-Prüfung hielt ihre
SQLite-Verbindung nach dem Transaktionskontext offen. Die Fixture schließt
ihre Verbindungen jetzt ausdrücklich vor der Wiederherstellung, wie beim
echten App-Start. Produkt-Backup und Sperrprüfungen werden nicht abgeschwächt.
Fehlschläge im normalen Backendlauf brechen nun sofort ab; ein grüner Lauf
prüft weiterhin den vollständigen Bestand. Der vorzeitig beendete Browserlauf
ist kein bestandener Gesamtlauf.

PR #22 mit Feedback-Formularen und optionalem signiertem Release-Entwurf ist
im neuen Kandidaten enthalten. Die volle Matrix und anschließend die Pakete
werden auf einem festen Release-Zweig ausgeführt, damit weitere Main-Merges
diesen Stand nicht wieder abbrechen. Lighthouse am gemeinsamen vorherigen
Frontend: Accessibility 100, Legacy-PWA 100, keine Laufzeitfehler.

Kandidat lokal: neun Backup-/Stagingtests, zwei Feedback-Unit-Tests und acht
passende Navigations-/Feedback-Browserfälle bestanden; Ruff, mypy, Typecheck,
Lint und Build grün. Der Windows-Nachweis erfolgt erneut auf dem echten
CI-Windows, die lokale Korrektur wird nicht als bestandene Plattformabnahme gezählt.

## 15.10.2026 – Öffentliche Download-Verweise

Die statische Downloadseite verweist jetzt auf den jeweils aktuellen öffentlichen
Release statt auf die alte private Alpha 0.1.19. Sie bietet keinen ungeprüften
macOS-Download an und verweist für den lokalen Bau auf die Bauanleitung.
README-Links auf `releases/latest` waren bereits korrekt. Diese reine Dokumentations-
Nachlieferung verändert den geprüften Installer-Quellstand nicht.

## 15.10.2026 – KI-SDK im öffentlichen Desktop-Paket

Nach Zusammenführung aller 17 Dependency-PRs und PR #19 ist ein Paketierungs-
Fehler aufgefallen: Der öffentliche Desktop-Workflow installierte das optionale
Anthropic-SDK nicht. Der Paketbau installiert jetzt das vorhandene Extra `ai`;
PyInstaller nimmt SDK und Metadaten ausdrücklich auf. Unpaketierte Installationen
ohne Extra erhalten beim Verbinden einen erklärenden 503 statt eines Importfehlers.
Ein Regressionstest prüft diesen echten HTTP-Fehlerpfad mit erfundenem Schlüssel.
Die Startprobe des tatsächlich eingefrorenen Clients importiert zusätzlich das
SDK ohne Schlüssel oder Netzwerk. 19 gezielte Backend-/Desktopfälle bestehen
mit einem Windows-Skip; Ruff und mypy für 647 Dateien sind grün.
Der vollständige Freigabelauf muss auch diesen endgültigen Quellstand einschließen.

## 15.10.2026 – Öffentliche Dependency-Nachlieferung und Windows-Testdiagnose

Nach dem Zusammenführen von PR #11 hat Dependabot die weiteren PRs #12–#18
eröffnet. Diese sieben Köpfe werden zusätzlich gebündelt: MathLive 0.111.1
(Sicherheitskorrekturen), lucide-react 1.55.0, FastAPI 0.143.0, jsdom 30.1.2,
Anthropic 1.13.0, Radix UI 1.8.0 und Tauri-Frontend-API 2.12.3. Die neue
MathLive-Lizenz bleibt unverändert erhalten; Paketübersicht und Herkunftshinweis
sind anhand der installierten Pakete aktualisiert.

Der vollständige öffentliche Lauf am vorherigen Stand 3dbcee36 bestand Linux
inklusive 84,47 % Coverage, macOS, Docker, GLib und alle 529 Browserfälle in
einem Lauf. Windows war nach rund 34 Minuten bei 37 % ohne bis dahin gemeldete
Testfehler; der Lauf wurde wegen des nachfolgenden Quellstands abgebrochen.
Das war kein festgefahrener Test und kein vollständig erfolgreicher Matrixlauf.

Die Testfixture erstellt ihr leeres synthetisches SQLite-Schema jetzt einmal
pro pytest-Worker. Jeder Fall erhält eine eigene kopierte Datei mit denselben
Tabellen, Fremdschlüsseln, Indizes, FTS-Triggern und unveränderten Durabilitäts-
Einstellungen. Vorhandene Testdatenbanken werden nicht überschrieben; Tests mit
eigener Datenbank behalten den bisherigen Initialisierungspfad. Eine lokale
Stichprobe senkt den wiederholten Setup-Anteil von 0,13 auf 0,01 Sekunden;
die Verbesserung auf Windows muss der nächste vollständige CI-Lauf bestätigen.

Parallel ist PR #19 mit weiteren Produktänderungen für dieselbe Version
0.1.28 erschienen und inzwischen in main übernommen worden. Die Nachlieferung
ist auf diesen öffentlichen Hauptzweig abgestimmt. Nach abgeschlossener
kombinierter lokaler Prüfung braucht der gemeinsame Quellstand eine neue
vollständige Release-Matrix; nur zu diesem Stand dürfen Pakete gebaut werden.
Noch kein neuer Installer und kein Release veröffentlicht.

Nachlieferung lokal geprüft: 1.344 Pythonfälle mit acht Plattform-Skips nach
der Fixture-Änderung (297,03 Sekunden; vorher 416,54 Sekunden), 1.430
Frontendtests, 52 Browserfälle, Typecheck, Lint, Ruff, mypy, i18n, OpenAPI,
Build und Bundle-Grenzen bestanden. Keine native Neuinstallation durchgeführt.

Nach Abgleich mit dem inzwischen übernommenen PR #19 erneut kombiniert geprüft:
1.357 Backendfälle / acht Plattform-Skips, 1.430 Frontendtests und 25 passende
Browserfälle für KI-Adapter, Backups und Lernwerkzeuge. Eine konkrete Demo-
Regression des neuen Provider-Dienstes zusätzlich korrigiert: Der Demomodus
liest keine gespeicherten KI-Schlüssel und ruft keine Modellliste ab; Verbinden,
Modellwahl und Trennen werden vor Netzwerk-/Speicherzugriff mit 403 abgelehnt.
Auch CLI-Demos setzen jetzt ausdrücklich das Demo-Flag. 22 gezielte Backendfälle
einschließlich vier neuer Schutzprüfungen, Ruff und mypy für 647 Dateien bestehen.

Neun README-Bilder nach dem Zusammenführen von PR #19 und allen 17 Updates
erneut aus einer frischen CLI-Demo aufgenommen und einzeln angesehen; keine
Browser-Ausnahmen. Der öffentliche PR-19-Lauf zeigte außerdem im lokalen
Docker-Image noch Python 3.12 trotz Mindestversion 3.13. Das Basisimage ist
angeglichen; der vollständige Docker-Smoke muss am gemeinsamen Stand bestehen.

## 15.10.2026 – 0.1.28: KI-Schlüssel, Backup mit Anki, Prüfung der Fremdbefunde, Öffentlichkeit

API-Schlüssel einfügen und Modell aus der Anbieterliste wählen (Schlüsselbund, keine
Modell-IDs mehr). Zwölf Befunde eines externen Code-Reviews gegen den Code geprüft:
sieben bestätigt und behoben (Budgetsperre nach abgelehnten Anfragen, Anki fehlt im
Backup, ausgeblendete Slots im KI-Kontext, unlösbare Nullstellen, Prüfungssperre,
Desktop-Berechtigung, Deploy-Tags), mehrere widerlegt (Papierkorb wird global
gefiltert, Hinweisstand 4 ist beabsichtigt, SQLite-Downgrade funktioniert). Python 3.13
vereinheitlicht, Frontend einmal mit Prettier formatiert. Öffentliches Repository
`unios-app` mit neuer Historie angelegt. Backend 1359 Tests
(ein umgebungsbedingter Fehlschlag), Frontend 1427 Tests, Playwright KI-Ablauf grün.
Keine Windows-/macOS-Pakete gebaut; echter Anthropic-Schlüssel nicht geprüft.

## 15.10.2026 – Öffentlicher Release 0.1.28 in Vorbereitung

Auf ausdrücklichen Auftrag im öffentlichen Repository EinfachMxrc/unios-app
arbeiten. Alle zehn offenen Dependency-PR-Köpfe in einem Release-Zweig
zusammengeführt; Sperrdateien konfliktfrei. Die bereits geprüften Abschluss-
Nachweise und zwei Test-/Auditkorrekturen als Patch ohne private Git-Historie
übernommen. Versionsmanifeste auf 0.1.28 vereinheitlicht. Öffentlich fehlende
Qualitäts- und Desktop-Paket-Workflows aus dem vorhandenen Projektablauf ergänzt;
Paketbau bleibt an die volle Qualitätsmatrix desselben Commits gebunden.

Lokal 1.345 Backendtests bestanden, acht Plattform-Skips; der einzelne echte
macOS-Schlüsselbund-ACL-Test bleibt für den separaten CI-Mac. Ruff, mypy für
642 Dateien, alle 1.429 Frontendtests, Typecheck, Lint, i18n, OpenAPI und Build
bestanden. Alle 529 Browserfälle in Gesamtlauf und gezielten Korrekturläufen
zugeordnet: verspätete Markdown-Cursorwiederherstellung behoben, neue Playwright-
FFmpeg-Version installiert, Galerie pro Theme/Viewport getrennt. Deren fünf
Fälle bestehen ohne Retry. Neun frische README-Bilder angesehen; Lighthouse
Accessibility und Legacy-PWA jeweils 100. Belege unter
`docs/qa/public-release-0.1.28-20261015/`.

Öffentliche GitHub-Matrix, Docker-Smoke und native Pakete stehen noch aus.
Der erste öffentliche CI-Lauf hat zusätzlich das übergroße Startpaket gefunden:
KaTeX und Syntaxhervorhebung wurden über Aufgabenbeschreibungen früh geladen.
Die gemeinsame Aufgabenanzeige lädt diese Bibliotheken jetzt erst bei Bedarf;
der Originaltext bleibt währenddessen lesbar. Bestehende Größenlimits bleiben
unverändert. Lokal bestehen alle 1.430 Frontendtests einschließlich einer
neuen Prüfung für nachgeladene Formeln, Inline-Labels und unveränderten Code.
39 passende Browserabläufe bestehen auch mit dem korrigierten endgültigen Build.
Die Qualitätsmatrix führt den gesamten Linux-Pythonbestand beim manuellen
Voll-Lauf direkt mit Coverage aus; derselbe Bestand wird nicht zusätzlich ohne
Coverage wiederholt. macOS/Windows und normale PR-Läufe behalten ihren vollen
pytest-Lauf. Alle sechs Pflichtjobs des Paket-Gates bleiben unverändert.
Keine persönlichen Installations-/Betriebsbelege, Nutzerdaten, Secrets oder
privaten Git-Referenzen übernehmen. Release erst mit wirklich erzeugten und
geprüften Paketen veröffentlichen; offene Plattformen benennen und ohne
signierte Pakete keinen automatischen Updatefeed anbieten.


## 15.10.2026 – Installiertes Paket: Start, Navigation, Mensa und Kalender

Beim Mac-Start einen verwaisten PyInstaller-Arbeiter als belegenden Prozess
gefunden; die vorherige Health-Prüfung hatte diesen alten Dienst erreicht.
Einmalig nur den eindeutig zugeordneten alten Client geordnet beendet, danach
öffnet die bisherige App wieder. Native Beenden-/Neustartpfade senden künftig
TERM an den eigenen Supervisor, damit dieser seinen Arbeiter abräumen kann.
Zwei echte Prozess-Lebenszyklustests und Rust-Releasekompilierung bestanden.
Mac-Paket aus Feature-Commit 4f6251a8 am 15.10. um 10:57 UTC installiert,
vorherige App versioniert gesichert, Signatur und alle sieben Bundle-Dateien
gegen den fertigen Build geprüft. Nach bestätigtem Schließen frisch gestartet:
Port 8000 gehört zur neuen nativen App über Loader und Worker; Client-Health ok.
Zweimaliges Beenden/Öffnen über die echte GUI bleibt manuell offen, weil die
Mac-Steuerung mit „native pipe startup failed“ ausfällt. Health allein wurde
ausdrücklich nicht als Beweis für die Prozesszuordnung verwendet.

Die Mensa hält öffentliche Gerichtebilder begrenzt im Server-RAM (LRU, 64 MB,
128 Einträge, 24 Stunden). Nur erfolgreiche validierte Bildantworten dürfen
privat für 24 Stunden im Browser bleiben; Fehler und andere APIs bleiben
no-store und die Anmeldung bleibt erforderlich. Filter verstecken bestehende
Karten, statt ihre Bilder neu einzusetzen. Gemischte Karten haben gleich hohe
Fotoflächen mit einem ruhigen Ersatz für fehlende/defekte Bilder; Kategorien
ohne Fotos bleiben kompakt. Anbieter-Platzhalter werden weiterhin verworfen.

Eigene Kurs-Anzeigenamen liegen getrennt von Originalname und Quell-ID,
mit Längenbegrenzung und Schutz gegen veraltete Änderungen. Abgleiche ändern
die persönlichen Namen nicht. Aktivitätslinks wählen nun die normale Seite
mit Nachbardokumenten, scrollen zum Ziel und heben es dreimal kurz hervor.
Aktivitätsfilter einschließlich Nur Inhalte bleiben auf diesem Gerät erhalten;
explizite Links haben Vorrang, Verbindungswechsel löschen den Filterkontext.
Die Seitenleiste behält ihren eigenen Scrollzustand über Bereichswechsel,
Lazy-Loading, Klicks sowie Zurück/Vorwärts. Spät eintreffende Kurse dürfen eine
zwischenzeitliche Nutzerbewegung nicht überschreiben. Acht Bereiche einschließlich
Uni-Mail zweimal durch echte Klicks und Historiennavigation geprüft.

Benachrichtigungen bieten Alle/Ungelesen, klare Gruppen und einzelne Gelesen-
Schalter ohne Navigation. Uli bekommt Kopfbewegungen, Augenbrauen, Füße,
Verbeugung, Jubel und gelegentliche ruhige Reaktionen; Bewegungsreduktion und
unsichtbare Fenster werden respektiert. Die eigene UniOS-Figur bleibt erhalten.

Der Kalender bietet Einzeltermin, diesen und folgende sowie die ganze
wöchentliche Serie. Serien sind ausdrücklich gleiche Quelle, Titel, Wochentag
und ursprüngliche Uhrzeit; persönliche Einzelanpassungen bleiben erhalten.
Versionierte Regeln gelten auch nach erneutem Import und für neue Termine
desselben Zeitslots. Originaltermine bleiben unverändert. Berliner Ortszeiten,
Sommer-/Winterzeit, konfliktgeschützte Änderungen und Rückgängig sind geprüft.
Der iCal-Link kann Stundenplan, weitere Hochschultermine, eigene Termine,
Abgaben/Mail-Fristen, Prüfungen, Lernblöcke und öffentliche Fristen einzeln
enthalten. Bisherige Links ohne Auswahl exportieren weiter alle Quellen.

Lokale Prüfung: 50 gezielte Backendfälle, vollständiger Frontendlauf mit
1.427 Fällen, Typecheck, Lint, Ruff, mypy und Build bestanden. Die geänderten
Browserabläufe sind vollständig in fortgesetzten Teilgruppen geprüft: alle
526 aktuell gesammelten Fälle erfolgreich zugeordnet. Eine große Ansichten-
Galerie bestand nach Retry (flaky), ein Formeleditor-Zeitlimit im separaten
Wiederholungslauf. Die lange Sidebar-Prüfung wartet jetzt auf das Layout.
Lighthouse: Kalender 96–100 Accessibility; Startseite und Legacy-PWA 100.
Synthetische Bilder, Abdeckungs- und Installationsnachweise liegen unter
docs/qa/workspace-ux-20261015/. Kein vollständig grüner Einzellauf.
Ein älterer Anki-Test brauchte eine deterministische Ersatz-ID bei Erstellung
innerhalb derselben Millisekunde (separater Test-Commit). Der lokale OS-ACL-
Signiertest benötigt eine zusätzlich vertraute Wegwerfidentität und kann hier
nicht ohne Freigabe laufen; keine System-Vertrauensregeln dafür geändert.

Server-Image unios-server:0.1.27-workspace-4f6251a8e617 nach isoliertem
Docker-Smoke ohne echte Daten aktiviert. Vor den Migrationen ff9ae4c2b832 und
ff9bf5d3c943 über die reguläre gekoppelte App einen Snapshot erzeugt und geprüft
(10:48 UTC); neue Instanz um 10:49 UTC healthy, HTTPS ok, private API ohne
Kopplung weiterhin 401. Bestehende Netzwerke, Mounts und Sicherheitsoptionen
erhalten; vorheriges Image bleibt verfügbar.
Persönliche Kalenderkorrekturen und individuelle Verbindungszustände bleiben
in privaten Betriebsnachweisen. Die öffentlichen Tests benutzen ausschließlich
erfundene Termine und lokale Fake-Systeme. Serverseitiger automatischer
Mailabruf ist nicht eingerichtet; die Windows-Browserfunktion ist getrennt.

## 15.10.2026 – Restliche VPS-Updates und Moodle-Zugriffshinweise

Marc hat die ausstehenden Arbeiten einschließlich Umami ausdrücklich zur
selbstständigen Durchführung freigegeben. Vor Umami 3.2.0 → 3.4.0 einen
konsistenten Datenbankdump erstellt, dessen Archiv geprüft und vollständig
in einer isolierten PostgreSQL-Instanz ohne Netzwerk wiederhergestellt.
Erst danach sechs zusätzliche Migrationen ausgeführt: insgesamt 26 erfolgreich,
keine offene/fehlgeschlagene Migration. Umami 3.4.0 healthy; bestehende
Topologie und bisheriges Image erhalten. Keine Backupinhalte ausgegeben.

Die drei zuvor zeitversetzt angebotenen Ubuntu-Pakete auf ausdrücklichen
Fortsetzungsauftrag installiert. APT meldet nun null offene Updates; dpkg
sauber, keine fehlgeschlagene systemd-Unit und kein weiterer Neustart nötig.

Moodle behandelt in get_assignments auch für das Konto nicht zugängliche
Aktivitäten als Warnung. Diese werden jetzt nur dann als sachlicher Hinweis
behandelt, wenn alle angefragten Kurse und alle laut Kursübersicht sichtbaren
Aufgaben in der Antwort enthalten sind. Sichtbare/gelieferte betroffene
Aktivitäten, fehlende Kurse/Aufgaben und unbekannte oder fehlerhafte Antworten
bleiben echte Warnungen. Keine neuen Moodle-Aufrufe und keine Rechteumgehung.
Alte Aufgaben und Fristen bleiben bei Zugriffsbeschränkungen weiterhin erhalten.
Die privaten begrenzten Diagnosen sind auch bei erfolgreichem Abgleich unter
System sichtbar, ohne Störungsbenachrichtigung. Keine Schemaänderung.

92 gezielte Pythonfälle und alle 1.424 Frontendfälle bestanden. Ruff, mypy
(637 Quelldateien), Typecheck, Lint und Build bestanden; zwei Playwright-Abläufe
prüfen echte Warnungen sowie erfolgreiche Abgleiche mit Zugriffshinweis.
Quellstand b7b81e8d1e50 auf dem Server aktiviert (09:13:00 UTC), Image
sha256:a9d7d0bd70af3feae4292e75645a4e36efa3378b6108fa4bab861aff48f6eef3.
Isolierter Smoke mit synthetischer Datenbank, Zugriffshinweis und fehlender
sichtbarer Aufgabe bestanden, Schema ff99e3b1a721 unverändert. Topologie,
HTTPS-Health und private API-Abweisung bestätigt. Der anschließende reguläre
Moodle-Abgleich endete erfolgreich: Status ok, bisheriger Sammelfehler weg,
Zugriffshinweis weiterhin vorhanden. Keine zusätzliche Hochschulanmeldung
oder manuell ausgelöste Moodle-Abfrage.

Mac-App neu gebaut, mit derselben lokalen Identität signiert und installiert;
alle sieben Programmdateien gegen das geprüfte Paket gehasht, alte App als
Rückfallversion erhalten. Isolierte Client-Startprüfung vor/nach Installation
bestanden, aktiver Client gesund, bestehende Kopplung und Schlüsselbund verfügbar.
Abschluss: alle 15 Container laufen, alle sechs Healthchecks bestehen, keine
fehlgeschlagene systemd-Unit. Nachweis ohne Hochschuldetails:
docs/qa/moodle-diagnostics-20261015/completion.json.

## 15.10.2026 – VPS-Systemwartung und Runner-Startreihenfolge

Auf ausdrücklichen Auftrag Ubuntu und vorhandene Systempakete aktualisiert:
53 APT-Updates, Docker 29.9.1 und Compose 5.6.0. Bestehende lokale Konfiguration
beibehalten, keine Pakete entfernt. Sechs Container auf aktuelle Images ihrer
bestehenden Reihen umgestellt: Python 3.12, Caddy 2, PostgreSQL 16 und beide
Cloudflare-Tunnel. Alte Images und Deploymentkonfigurationen erhalten.

Beim Neustart vorhandenen Zyklus zwischen Runner-Socket, sockets.target und
Docker reproduziert. Socket wartet künftig nicht auf Docker, sondern bindet
mit FreeBind=yes an dieselbe private Bridgeadresse. Alte Unit versioniert
behalten, Installationsskript entsprechend korrigiert. Shellsyntax und
systemd-Unitprüfung bestanden. Zweiter echter Neustart bestätigt den Fix.

Abschluss 08:07:51 UTC: Ubuntu 26.04.1 LTS und Kernel 7.0.0-38-generic,
SSH mit unverändertem Host-Pin erreichbar, alle 15 Container laufen, sechs
vorhandene Healthchecks bestanden, keine fehlgeschlagene systemd-Unit und
kein ausstehender Neustart. UniOS HTTPS 200, private API ohne Kopplung 401;
privater Runner ohne Authentisierung 401. Betriebsevidenz:
docs/qa/moodle-diagnostics-20261015/verification.json.

Offen: Drei APT-Updates sind von Ubuntu wegen Phasing zurückgestellt.
Umami 3.4.0 liegt isoliert bereit, bleibt wegen sechs zusätzlichen Migrationen
bis zu Marcs geprüftem Snapshot bei 3.2.0. Selbst gebaute andere Anwendungen
haben auf dem VPS keinen Git-Checkout; deren Releasecode wurde nicht geändert.
Keine echten Bestandsdateien, .env oder Server-Secrets direkt gelesen.

## 15.10.2026 – Einzelgründe für unvollständige Moodle-Aufgabenabfragen

Auf Nutzerauftrag begrenzte Diagnose beim bestehenden Aufgabenabruf ergänzt:
Anzahl angefragter/gelieferter Kurse, Warnungsanzahl, Moodle-Kurs-/Aktivitäts-ID
und fest zugeordnete Erklärungen für die bekannten Warncodes. Eine Aktivität
wird nur dann einem Kurs zugeordnet, wenn die bereits geladene Kursübersicht
dies belegt, auch bei einer ausgeblendeten Aktivität oder einem ausgeblendeten
Abschnitt. Fehlende Zuordnung und unbekannte Werte bleiben ausdrücklich
unbekannt. Höchstens 20 Details, weitere Warnungen werden gezählt.

Keine zusätzlichen Moodle-Anfragen, keine Rohmeldungen, URLs, Namen, Tokens
oder Inhalte übernommen. Details bleiben im privaten Connectorstatus und
werden über die vorhandene Systemansicht angezeigt; weder allgemeiner
Diagnoseexport noch Release-Health, Push oder Logs erhalten sie. Ein späterer
vollständiger Aufgabenabruf entfernt die alte Diagnose. Alte Aufgaben und
Abgabetermine bleiben bei einer Teilantwort erhalten. Keine Schemaänderung
oder neue Abhängigkeit. Manuelle Abnahme in docs/MANUELL_TESTEN.md beschrieben.

Gezielte Moodle-, Sync-, Paket- und Datenschutztests bestanden (70 verschiedene
Pythonfälle, ein Skip). Ruff für das Repo und mypy für 637 Quelldateien
bestanden. Frontend-Typecheck und Build bestanden; ein Playwright-Ablauf mit
echtem Fake-Connector, Sync und Systemansicht bestanden, Diagnose in Light/Dark
bei 1440/390 px geprüft. Anschließend Mac-SSH-Zugang nach Marcs Freischaltung
und unabhängig bestätigtem Host-Fingerabdruck erfolgreich verwendet. Hinweise
für spätere Codex-Sitzungen stehen in der globalen AGENTS.md; private Schlüssel
wurden nicht gelesen oder ausgegeben.

Server-Patch aus cafa2332a080 ohne neue Abhängigkeiten oder Schemaänderung auf
das verifizierte 0.1.27-Basisimage gebaut. Isolierter Docker-Smoke mit
ausschließlich synthetischen Daten bestanden. Neues Image am 15.10.2026 um
07:58:21 UTC aktiv und healthy, lokale/öffentliche Health-Prüfung erfolgreich,
private API ohne Kopplung 401; bisherige Topologie und altes Image erhalten.
Ein regulärer Abgleich hat inzwischen konkrete Aktivitäts-Kontextwarnungen
in der privaten Systemansicht geliefert. IDs und Hochschuldetails werden nicht
in das Repo übernommen. Keine neue Hochschulanmeldung und kein zusätzlicher
manuell ausgelöster Abgleich. Betriebsnachweis:
docs/qa/moodle-diagnostics-20261015/DEPLOYMENT.md.

## 15.10.2026 – Aktuellen GitHub-Stand auf dem Mac installiert, 0.1.27

Auf Nutzerauftrag origin aktualisiert; Quellstand 0dddc941 entspricht GitHub
main. Mac-Paket einschließlich Frontend und eingefrorenem Dienst neu gebaut
und mit der bestehenden lokalen Programmidentität signiert. Alle 324
gebündelten UI-Dateien gegen den aktuellen Build geprüft. Vorhandene App
als datierte Rückfallversion erhalten, neue App unter /Applications/UniOS.app
installiert; beide installierten Programmdateien entsprechen dem Neubau.

26 gezielte Desktop-/Client-/Signierbefehltests bestanden, ein plattformbedingter
Skip. Frontend-Typecheck und Build bestanden. Isolierter Client-Start vor
Installation 9,64 s, installierte Kopie 7,77 s; Signaturprüfung bestanden.
App geöffnet, lokales Health meldet Clientbetrieb. Bestehende Serverkopplung,
verfügbarer Schlüsselbund und abgeschlossene Einrichtung über die vorgesehenen
Statusendpunkte bestätigt. Keine Bestandsmigration oder Serveraktualisierung.

Anschließende Moodle-Diagnose: bestehender Serverstatus meldet weiterhin die
pauschale Warnung zum unvollständigen Aufgabenabruf. Der Connector erzeugt sie
bei jedem nicht leeren warnings-Feld von mod_assign_get_assignments und
verwirft die einzelnen Gründe. Moodle unterscheidet im offiziellen
MOODLE_405_STABLE-Quellcode Kurszugriffsrechte, Einschreibung und
Modulzugriffsrechte; der konkrete Fall ist aus dem gespeicherten Status nicht
mehr bestimmbar. Bestehender Regressionstest für den Erhalt gespeicherter
Aufgaben und Termine bei Teilantwort bestanden. Keine echte Hochschulabfrage
oder erneute Anmeldung zur Diagnose ausgelöst; Ursache nicht als behoben
ausgegeben.

## 14.10.2026 – Aktuellen GitHub-Mailstand ausliefern, 0.1.27

Auf Nutzerauftrag GitHub main einschließlich Outlook-Browserimport und
OpenAPI-Korrektur integriert. Vor der Auslieferung fehlende Tauri-Registrierung
für portal_scroll ergänzt und den Setup-Portaltyp auf myCampus/PRIMUSS
begrenzt. Mailauswahl erlaubt nur Listen-/Rasterzeilen, keine Navigation;
die übrigen Portale erhalten dadurch keine zusätzlichen Klickrechte.
Unbekannte Datumsanzeigen bleiben unbekannt, Login-/MFA-Seiten werden nicht
durchlaufen und ein erschöpfter Lesedurchgang wird als unvollständig gemeldet.
Windows-Schreibschutz bleibt ohne POST-Freigabe für Mail aktiv. Die tatsächliche
Outlook-DOM und Microsoft-Leserequests sind nicht mit einem echten Konto
geprüft; hieraus wird keine bestätigte Postfachfunktion behauptet.

Gezielte Mailtests bestanden: zwölf Pythonfälle, 27 Frontendfälle, zwei
Browserabläufe über die Fake-App mit tatsächlichem Importendpunkt. Vollständiges
Frontend: 1.423 bestanden; native Windows-Tests: 20 bestanden. Ruff, mypy,
Typecheck, Lint, i18n, OpenAPI und Build bestanden. Vollständiges Python:
1.298 bestanden, zwölf übersprungen; vollständiger Browserlauf: 517 bestanden.
Vier Mail-Screenshots in Light/Dark bei 1440/390 px geprüft.

Quellstand ee446f43d5d4 als v0.1.27 auf GitHub gesichert. Server am
14.10.2026 um 20:16:35 UTC aktiviert: Image
sha256:87f0bdb48f6a4fbe9515f869282d57a56a510c76442f62ec32ab5295d0b0cf52,
Container healthy, HTTPS-Health ok, private API ohne Kopplung 401.
Isolierter Docker-Smoke bestanden; vorheriges Image und Deploymenttopologie
erhalten. Keine neue Datenbankmigration.

Windows-NSIS und MSI gebaut; NSIS auf dem PC erfolgreich installiert.
Alle 2.825 Programmdateien über physische Pfade, Größen und SHA-256 geprüft;
isolierter Starttest bestanden, ungepackte Laufzeit und bestehende
Serverkopplung bestätigt. Private Profilverzeichnisse nicht direkt gelesen.
GitHub Actions 38630585711 startete wegen Abrechnung/Ausgabenlimit keinen
Prüfschritt; lokal bestandene Prüfungen sind separat im Auslieferungsnachweis
dokumentiert. Release bleibt Entwurf ohne automatischen Updatekanal.
Bestehende Notizversionen und Kopplung bleiben erhalten.

## 14.10.2026 – Privates Mitschriftenredesign in der App

Auf ausdrücklichen Nutzerauftrag fünf bestehende Vorlesungsmitschriften über
die gekoppelte App neu strukturiert und mit ausgewählten, bereits gespeicherten
Folien ergänzt. Lernkästen, sparsame Textmarker, aufklappbare Herleitungen,
ein Abhängigkeitsdiagramm und 25 interaktive Selbsttestfragen eingesetzt.
Quellen, Mitschrift und eigene Erklärungen bleiben erkennbar. Bestehende
Fassungen als neue Notizversionen erhalten; unmittelbar vor dem Schreiben
Revisionen und Schreibgeneration geprüft, danach gespeicherte Inhalte und
unveränderte frühere Versionen zurückgelesen. Fehlende Aufgabenangaben nicht
ergänzt oder als verifiziert ausgegeben.

Darstellung mit 1440 und 390 px in Light/Dark geprüft, keine Seitenüberbreite
oder Formelfehler. Alle 25 Antwortschalter und erhaltenen Originalabschnitte
in den tatsächlich gespeicherten Notizen geprüft. Zahlenbeispiele und eine
Schaltung unabhängig rechnerisch kontrolliert. Kein Zugriff auf neue
Hochschulanmeldungen, keine Migration und keine Programmänderung. Private
Notizinhalte, Quellenauszüge, IDs und Screenshots bleiben außerhalb des Repos.

## 14.10.2026 – Moodle-Warnung korrekt erklären und Quizlinks, 0.1.26

Marcs Meldung aus der einfachen Systemansicht reproduziert: ReleaseHealthPanel
stellte warning und error beide als fehlgeschlagene Prüfung dar und zeigte
last_success_at ohne Bedeutung an. Warnungen heißen nun „Abgleich mit Warnung“,
Fehler „Abgleich fehlgeschlagen“; der Zeitpunkt ist ausdrücklich der letzte
erfolgreiche Abgleich. Vorhandene Gründe kommen aus der ohnehin geladenen
Systemansicht und werden nur bei passendem Connector/Status angezeigt.
Der beschränkte Release-Health-Endpunkt enthält weiterhin keine Fehlertexte.

Moodle-Quizaktivitäten ohne Dateianhang wurden bisher übersprungen. Sichtbare
Quizmodule werden als sichere, von Zugangsdaten bereinigte Moodlelinks in
ihrem Kursabschnitt übernommen. Anklickbare Linktitel öffnen die externe
Seite. Keine zusätzlichen Moodle-Abfragen, keine automatischen Testversuche,
keine erratenen Öffnungs-/Schließtermine; die bestehenden Kalenderdaten bleiben
die einzige Terminquelle. Fixtures sind erfunden und übernehmen keine Inhalte
aus Marcs Screenshots.

46 gezielte Pythonfälle, mypy, Ruff, neun betroffene Frontendfälle und vier
Browserabläufe bestanden. Vollständiges Frontend mit 1.413 Fällen bestanden,
Typecheck/Lint und Build bestanden. Vollständiges Python: 1.291 bestanden,
zwölf übersprungen. Der vollständige Browserlauf bestand 495 Fälle; zwei
Testprüfungen waren mehrdeutig bzw. warteten nicht auf das Schließen des
Anmeldefensters. Nach deren Korrektur bestanden alle 37 Fälle der beiden
betroffenen Specs, einschließlich der zuvor ausgelassenen 19 Fälle. Damit
sind alle 516 Browserfälle abgedeckt; keine Programmänderung beim Nachlauf.
0.1.26 ausgeliefert: GitHub main enthält Produkt- und Testkorrektur; Tag
v0.1.26 zeigt auf die gebauten Produktquellen 90afebe. Der VPS verwendet das
getestete Image und ist gesund, unangemeldete private API weiter 401. Die
Docker-Mountliste variiert in ihrer Reihenfolge; der semantische Nachvergleich
bestätigt unveränderte Mounts, Netzwerke und Schutzoptionen. Voriges Image
bleibt erhalten. Windows NSIS/MSI gebaut; NSIS auf dem PC installiert,
2.825 physische Programmdateien gegen SHA-256 und Größe geprüft, isolierter
Start bestanden, bestehende Kopplung und Schlüsselbund verfügbar. Fünf
GitHub-Paketdateien gegen SHA-256 geprüft. Entwurfsrelease, kein automatischer
Updatefeed; Actions vor dem ersten Schritt durch Kontolimit blockiert.
Paketquellen auf 0.1.26 vereinheitlicht. Keine neue
Datenbankmigration. Bestehende lokale Änderungen außerhalb des isolierten
Release-Worktrees bleiben erhalten.

## 14.10.2026 – Verbindungswarnungen nach erneuter Anmeldung, 0.1.25

Nach erfolgreicher Prüfung und sicherer Speicherung eines neuen Moodle-Tokens
wird nur der überholte Tokenfehler zurückgesetzt. Import-/Dateifehler anderer
Ursache und die Zeitpunkte des letzten Datenabgleichs bleiben erhalten.
Die neue Repository-/Serviceschicht hält diese Entscheidung aus dem Router.
„Heute“ bezeichnet Warnungen anderer Connectoren nicht mehr als Moodle-Fehler;
pausierte Moodle-Warnungen werden nicht als aktive Verbindung ausgegeben.

Ein gesperrter myCampus-Unterlink löst nicht automatisch einen vollständigen
Abbruch mit vermeintlich abgelaufener Anmeldung aus: Der Import prüft zunächst
erneut die Einstiegsseite, ohne Login-Weiterleitungen zu verfolgen. Bleibt
sie lesbar, wird nur der Unterlink als nicht lesbar gemeldet. Scheitert auch
die Einstiegsseite an der Anmeldung, bleibt der Fehler sichtbar. Abrufe sind
weiterhin sequentiell mit Abstand; keine Umgehung von MFA oder Zugriffsschutz.

Gemeinsamer, threadsicherer Importstatus nimmt neue Anmeldungen wahr und
verwirft ausschließlich Fehler alter Anmeldungen. Das gilt auch, wenn ein
alter Worker erst nach der neuen Anmeldung fehlschlägt. Laufende Jobs und
andere Fehler werden nicht weggewischt. Die Oberfläche bietet bei einem
echten Anmeldefehler gezielt „myCampus-Anmeldung übernehmen“ an.
GitHub-PR #26 für die Logarithmusvorlage ebenfalls konfliktfrei integriert.

Nach Marcs Hinweis auf fehlende Fehlerdetails zusätzlich den Cachewechsel
nach nativer Anmeldung korrigiert: Einrichtung, System, Fähigkeiten,
Importstatus und auch inaktive Heute-Abfragen werden sofort neu geprüft.
Noch ungeprüfte Zustände zählen nicht als Fehler. Tatsächliche Warnungen
zeigen ihren vorhandenen Grund direkt auf „Heute“.

44 gezielte Pythonfälle und 13 Browserabläufe bestanden, vollständiges
Frontend mit 1.409 Fällen bestanden. Ruff, mypy, Typecheck, Lint, OpenAPI und
Build bestanden. Erster vollständiger Browserlauf mit 513 Fällen bestanden;
für den zusätzlichen Cachefix wird der vollständige Lauf wiederholt. Im
ersten Python-Gesamtlauf bestanden 1.289 Fälle und zwölf Skips; die einzige
fehlgeschlagene Router-Guard-Fixture lieferte noch keinen SyncEngine-Ersatz
für dessen neue Health-Repository-Abhängigkeit. Fixture korrigiert und den
Guard erneut geprüft. Der wiederholte vollständige Pythonlauf besteht mit
1.290 Fällen und zwölf Skips; der endgültige Browserlauf besteht mit allen
514 Fällen. Vier Screenshots hell/dunkel bei 1440/390 px selbst geprüft,
ohne horizontalen Überlauf. Echte Hochschulzugriffe bleiben ausschließlich
manuell; konkrete Abnahme unter docs/MANUELL_TESTEN.md.

Produktstand f7a32cdb234c3cead860bf97c4219d198ab20f4b auf GitHub-main und
v0.1.25; Windows-Bauquelle ist exakt derselbe Stand. Server aktiviert,
Container und öffentlicher Healthcheck gesund, private API HTTP 401. Kein
weiterer Schemawechsel seit der snapshotgeprüften 0.1.24-Auslieferung.
Windows-Installation erfolgreich, alle 2.825 Programmdateien nach Größe,
SHA256 und tatsächlichem Kernelpfad geprüft. Unabhängiger Dienststart besteht,
neu geöffnete App gesund und bestehende Serverkopplung verfügbar. Aktueller
Importstatus idle, ohne alten Anmeldefehler; dies ist kein Beweis einer echten
Hochschulsitzung. Temporären Installationstask entfernt. Frühere Pakete und
Serverimages erhalten; keine privaten Bestandsdateien gelesen oder kopiert.

GitHub-Installer, Serverquellen und Manifest hochgeladen und gegen die
GitHub-SHA256 geprüft. Gesamtpaket und Prüfbeleg ergänzt; alle sieben
GitHub-Assets gegen die lokalen SHA256 geprüft. Der neue
CI-Lauf 38596505580 bleibt vor dem ersten Jobschritt wegen des GitHub-
Kontozahlungs-/Ausgabenlimits blockiert. Keine bestandene GitHub-CI oder
neue signierte automatische Updatefreigabe behauptet; Release ist ein Entwurf.
Technischer Beleg: docs/qa/connection-warnings-20261014/verification.json.

## 14.10.2026 – Gemeinsames Update 0.1.24

GitHub-main einschließlich der drei Link-/Listen-Korrekturen und der zehn
Abhängigkeitsupdates mit dem Argon-Review zusammengeführt. Alle zusätzlichen
Quelländerungen erhalten. Frischer Checkout und frische Installation der
Abhängigkeiten: cn wird tatsächlich von den sechs UI-Komponenten verwendet;
die irrtümliche Entfernung korrigiert und Review-/Lizenzdokumentation berichtigt.
Metadaten auf 0.1.24 vereinheitlicht, GitHub-Lockfile-Updates unverändert erhalten.
CI ist wegen Kontozahlung/Ausgabenlimit vor dem ersten Jobschritt blockiert.

Marc hat den aktuellen, geprüften Server-Snapshot am 14.10.2026 im Chat
bestätigt. Nach isoliertem Docker-Smoke mit synthetischer Migration Server
auf 0.1.24 aktiviert. Quellschema ff99e3b1a721 für den Papierkorb; automatische
Migration durch den vorhandenen, snapshotgesicherten App-Start. Container
gesund, lokale/öffentliche Healthchecks bestanden, private API ohne Kopplung
HTTP 401. Mounts, Netzwerke, Ports und Härtung unverändert verglichen.
Serverzugriff ausschließlich mit bestehendem SSH-Schlüssel und geprüfter
Hostidentität; keine privaten Bestands-/env-/Schlüsseldateien gelesen.

Produktquellen c636da4dd93a773fcf28fd7260e9c2d57c8cb8e5 auf GitHub-main und
unter v0.1.24. Vollständige neue Läufe: 1.280 Pythonfälle bestanden (12 Skips),
1.407 Frontendfälle und alle 509 Browserfälle bestanden. Ruff, mypy,
Typecheck/Lint, OpenAPI, i18n und Build bestanden. Windows-Dienst neu gebaut,
isolierter Start mit allen drei Pipes bestanden. NSIS und MSI fertig gebaut;
Installation erfolgreich: alle 2.825 expliziten Programmdateien stimmen mit
dem NSIS-Paket überein und liegen am erwarteten physischen Pfad, ohne
MSIX-Umleitung. Der unabhängige Starttest besteht. Die neu gestartete App
meldet einen gesunden Client; bestehende Serverkopplung und Schlüsselbund
sind verfügbar, der gekoppelte technische Hoststatus meldet Server/Host.
Keine privaten Unterlagen oder Bestandsdateien für die Prüfung geöffnet.

Tauri patcht die Kennung des Paketformats nach dem Cargo-Build. Der anfängliche
Vergleich der nativen EXE gegen das Cargo-Manifest wurde deshalb korrigiert:
NSIS-Payload aus dem hashgeprüften Installer extrahiert und exakt verglichen.
Nur drei Kennungsbytes unterscheiden NSIS und MSI. Alle übrigen 2.824
Programmdateien bestanden bereits den ersten Vergleich. Das korrigierte
Manifest wird als separate Version erhalten; die Installer bleiben identisch.
Sechs ursprüngliche GitHub-Assets vollständig hochgeladen und deren
GitHub-SHA256 mit den lokalen Artefakten abgeglichen. Prüfbeleg unter
docs/qa/argon-release-20261014/. Release bleibt ohne neue signierte
Vierplattform-Updatefreigabe als Entwurf; installierter Server und PC sind
dennoch aktualisiert. Temporären Installations-Task anschließend entfernt.

Der Windows-Bauquellstand a5e3f417f8f49d2069bf255f737e224aca1be190 unterscheidet
sich vom GitHub-Produktquellstand nur in CI-/Browser-Testkonfiguration; sämtliche
Runtimequellen sind identisch. Die zusätzliche CI-Änderung wurde aus dem nur
lokalen Releasecommit entfernt, weil die GitHub-Anmeldung keinen workflow-Scope
hat. Bestehende CI-Chrome-Konfiguration erhalten; lokale Läufe verwendeten
gebündeltes Chromium. Keine veröffentlichte Historie umgeschrieben.

## 14.10.2026 – Direkte Datei-Benachrichtigungen und stabiler Aktivitätsfilter

Einzelne vorhandene Dateien öffnen aus dem Benachrichtigungsfenster direkt im
Leser. Sammelmeldungen führen zum zugehörigen Kurs statt zum Aktivitätsverlauf;
entfernte oder ausgeschlossene Dateien bekommen kein erfundenes Leserziel.
Ereignisse stehen vor lokalen Änderungen. Filter behalten Scrollposition und
Fokus, während vorherige Ergebnisse bis zur neuen Antwort stehen bleiben.

Sechs Backendfälle, 16 betroffene Frontendfälle und beide Browserabläufe
bestanden. Gesamtes Frontend mit 1.407 Tests, Typecheck, Lint, PWA-Build,
Ruff und vollständiges mypy bestanden. Desktopansicht selbst geprüft;
Integrationsnachweise stehen im folgenden Reviewabschnitt.

## 14.10.2026 – Argon-Review: HTTP-Grenzen, Offline-UI und API-Verträge

Bestätigte Folgebefunde korrigiert: Upload-Limit während des Einlesens mit
begrenztem RAM-/temporärem Dateipuffer; Writer-Prüfung beim Portalexport;
ein MCP-Audit pro Aktion mit erhaltenen Freigabe-/OAuth-Regeln; vollständige
Cache-Sperren; Legacy-Cookie auch für native MCP-Geräte; bestätigte Erneuerung
des Kalenderlinks; protokollierte Host-Freigabe außerhalb ihres eigenen Drains.

Import von app.main initialisiert keine Produktinstanz mehr. Lokaler Dienst,
VPS, Docker und nativer Backendstart verwenden die Factory ausdrücklich.
Gemeinsamer Retrievalcache und isolierter Fake-Reset einschließlich Konflikten,
Snapshots, Mail, Doctor, Addonereignissen und Medien. Browserartefakte liegen
standardmäßig unter Playwright-Ausgabe, Dokuexport braucht ein ausdrücklich
gesetztes Ziel. Resetfixture, Theme-Schlüssel und portunabhängige URL-Prüfungen
korrigiert. Windows-UI-Update stellt bei abgebrochenem Kopieren vorhandene Bytes
aus dem geprüften versionierten Backup wieder her.

Verbliebene UUID-Aufrufe benutzen gemeinsamen kryptografischen Fallback.
Standby-Lernsitzungen sperren Bewerten und Undo samt Tastatur; lokale Offline-
bewertungen des bisherigen Hauptgeräts bleiben möglich. Für die 67 genannten
JSON-Antworten API-Modelle ergänzt, Paket-/Notenmodellnamen eindeutig und
Frontend-Lerntypen daraus abgeleitet. Betroffene Entity-/Lern-/MCP-Zugriffe
schrittweise in Services/Repositories verlagert. PyWin32 als direkte Windows-
Abhängigkeit begründet: Parser starten angehalten in einem Job und der gesamte
Prozessbaum wird bei Abbruch bestätigt beendet, auch nach Elternprozessende.
Damit wird der im Gesamtlauf reproduzierte Cleanup-Race sicher behoben;
der taskkill-Fallback bleibt bei ungeklärten Kindern streng. Windows-WASM
übernimmt SystemRoot unabhängig von der Großschreibung. Zusätzlich respektiert
Zahlenformatierung explizite LaTeX-Blöcke und escaped Dollarzeichen;
Coding-Runner benötigt keinen optionalen Backendbezeichner.
Ungenutztes cn und separate KaTeX-Typen entfernt. Alle 40 direkten Runtime-
Paketversionen mit Lockfile verglichen, Lizenz-/Herkunftshinweise erhalten.
README unterscheidet Entwicklung und öffentliche Freigabe.

Gezielte Gruppen bestanden: 58 HTTP-/MCP-/Portal-Fälle, 32 MCP-/Auth-/Preis-/
Update-Fälle, 52 Plattform-/Setup-Fälle, 48 Lern-/Entity-Fälle, 16 Übergabe- und
Journalfälle (ein Skip), 11 Import-/Dienstfälle (zwei damalige Build-Skips),
vier CLI-Fälle gegen tatsächliche Auth-/Generation-Middleware. Vollständige
Frontendprüfung: 1.407 Tests bestanden; eine bestehende identische englische
Marker-Syntaxprobe zuvor korrigiert. Ruff, mypy, Lint/Typecheck, Sprachprüfung,
OpenAPI und generierte Typen geprüft, PWA-Build bestanden. 14 gezielte Browser-
fälle bestanden. Kalenderpanel in Hell/Dunkel auf 1440/390 px selbst geprüft.

Vollständiger Pythonlauf: 1.279 bestanden, 12 übersprungen (19:38 min).
Zusätzlich elf Parser-/API-Regressionen nach der letzten Ergänzung bestanden;
die vier CLI-Fälle prüfen auch eine normale Notiz-Schreibanfrage durch echte
Auth-/Generation-Middleware. Zwei Worker waren in der 48-Fälle-Messung etwas
schneller (17,64 statt 18,56 s). Alle sechs Fehler des ersten vollständigen
Browserlaufs reproduziert und korrigiert. Zweiter vollständiger Browserlauf:
508 bestanden, ein Notiz-/Fold-Fall einmal fehlgeschlagen (17,4 min). Dieser
Fall auf getrennten lokalen Ports fünfmal bestanden; Ursache des einzelnen
Fehlschlags bleibt ungeklärt. Kein vollständig fehlerfreier Browsergesamtlauf
behauptet. Docker-Daemon nicht erreichbar; kein Docker-Smoke behauptet.

Parallel geänderte aktuelle Editorfassung erneut mit vollständigem Vitest
(1.407 bestanden), Typecheck, Lint und PWA-Build geprüft. Die PyWin32-
Lizenzsammlung des Windows-Bundles erfasst 17 vorhandene Dateien mit getrennten
Zielpfaden, damit gleichnamige Lizenzdateien erhalten bleiben.

Parallel erscheinen weitere Änderungen an Notizeditor und Fernadressen/
Benachrichtigungen im Arbeitsbaum; sie werden erhalten und nicht als eigene
Reviewarbeit committed. Vollständiger Befundabgleich: `docs/ARGON_REVIEW.md`.
Kein Bestandszugriff, keine Migration, Installation, Veröffentlichung oder
Serveraktivierung. Abschluss gegen den frisch gebauten aktuellen Arbeitsbaum:
25 gezielte Browserfälle für Benachrichtigungen, Aktivitätsfilter, Listen,
LaTeX, Marker und einklappbare Abschnitte bestanden. Getrennte Fake-/Vorschau-
Ports 8194/4194 verhindern Überschneidungen mit parallel laufender QA.
Eigene neue Frontenddateien formatiert und 30 betroffene Unitfälle erneut
bestanden; SPDX-, Staging-, Secret-, Ruff- und Vertragsprüfungen bestanden.

Zusätzlicher Nutzerauftrag: Datei-Benachrichtigungen öffnen vorhandene Dateien
direkt im Leser, bei mehreren Dateien den zugehörigen Kurs. Ereignisse stehen
im Aktivitätsverlauf vor lokalen Änderungen. Filterwechsel aktualisieren den
URL-Zustand ohne Seitenwechsel: Scrollposition, Fokus und Inhalt während des
Nachladens bleiben erhalten. Backendziel und die beiden Browserabläufe mit
synthetischen Dateien/50 Ereignissen geprüft.

## 14.10.2026 – Argon-Review: Sitzungsablauf und Standby-Suche

Die vorhandenen 400 Tage gelten jetzt als absolute serverseitige Lebensdauer
für Browser- und native Gerätesitzungen. Ungültige, zeitzonenlose oder zukünftige
Erstellungszeiten werden abgewiesen; der Rettungsmodus verändert dabei keine
Datei. Neue Kopplungscodes bereinigen abgelaufene/ungültige/gesperrte Vorgänger.
Nachgeladene Moodle-Profiladressen durchlaufen denselben HTTPS-Validator wie
direkt konfigurierte Adressen.

SQLite entscheidet mit seinem Authorizer zwischen lesenden CTEs und Schreib-
operationen. Vorbereitete Statements werden bei vorhandenem Host-Koordinator
nicht zwischengespeichert, damit auch frühere Schreibabfragen nach Staffelstab-
verlust erneut geprüft werden. Rollback bleibt möglich; lesende Suche funktioniert.
Sieben reproduzierte Fehler vor dem Fix; danach alle 40 betroffenen Pythonfälle,
gezieltes Ruff und vollständiges mypy für app/tests bestanden. Keine Migration,
keine private Bestandsdatei gelesen oder verändert. Weitere Reviewpakete folgen.


## 14.10.2026 – Textmarker und einklappbare Mitschrift-Abschnitte

Vier Markerfarben über Textauswahl, Werkzeugleiste und ⌘/Strg+Umschalt+H;
`==Text==` und farbige portable Markdown-Kurzformen. Auswahländerungen bleiben
auf die gewählten Wörter beschränkt, Änderungen am Cursor wirken auf die
bestehende Markierung. Code und nicht unterstützte Syntax bleiben wörtlich.

Einklappbare Abschnitte bündeln bestehende Absätze oder beginnen leer;
Titel, Formeln, Quellen, Tabellen, Listen und Lernkästen bleiben editierbar.
Auf-/Zuklappen verändert keine Notizversion. Verborgener Cursor wird verhindert;
„Außerhalb weiterschreiben“ und ⌘/Strg+Enter verlassen den Abschnitt. Lesen
startet geschlossen, Editieren geöffnet; Drucken zeigt vollständigen Inhalt.
Tastaturbedienung und reduzierte Bewegung berücksichtigt. GPT-Auftrag kennt
beide Formate. Keine neue Abhängigkeit oder Migration.

1.400 vollständige Frontendtests und zwölf Notiz-/Block-Backendfälle bestanden.
Typecheck, gezielter ESLint, Sprachprüfung und PWA-Build bestanden. 21 verschiedene
Browserfälle einschließlich bisherigem Editor, Lernkästen, Quellen, Speichern,
Neuladen, Farben, Druck und Fokuswechsel bestanden; Hell/Dunkel auf 1440/390 px
visuell geprüft. Zwischenzeitlichen Druckfehler behoben; unvollständigen Build
nach lokaler Ordnerbereinigungsstörung erhalten und frischen Build verwendet.
Sofortiges Tippen nach „Außerhalb weiterschreiben“ zusätzlich mit 14
gezielten Unitfällen und einem Browserfall geprüft; DOM-Fokus erfolgt synchron.
Die Oberfläche liegt im eingefrorenen Dienstpaket. Ein bloßer nativer Neubau
mit altem Dienst enthält weiterhin alte UI-Dateien; vollständiges Dienstpaket
mit aktuellem Frontend neu gebaut. Signierte Mac-App installiert, isolierter
Client-Smoke bestanden (10,92 s), vier ausgelieferte UI-Dateien entsprechen
dem aktuellen Build. Bestehende Programmidentität erhalten; nach persönlicher
macOS-Freigabe sind Kopplung und Schlüsselbund bestätigt. Gesamter Stand auf
GitHub main hochgeladen; Fernstand und lokaler Commit stimmen überein.
Letzte GitHub-Prüfung startete wegen Abrechnung/Ausgabenlimit nicht; kein
Codefehler-Protokoll vorhanden. Kein Live-Serverupdate durchgeführt.


## 14.10.2026 – Lernkästen, GPT-Layout und eigene Moodle-Bearbeitung

Merksatz, Beispiel, Lerntipp und typischer Fehler als portable Markdown-Kästen
mit Symbol, Beschriftung und eigener Farbe in Editor und Leser. Bestehende
Kästen bleiben kompatibel. Der Vorlesungs-GPT-Auftrag beschreibt das Layout,
fordert vollständige wichtige Herleitungen und Seitenbelege, unterscheidet
eigene Erklärungen und behauptet keine unbelegte Prüfungsrelevanz.

„In der App bearbeiten“ öffnet eine eigene Lösungsvorlage zur Moodle-Aufgabe,
mit Aufgaben-Zitat, Lösungsweg, Kontrolle und offenen Fragen. Formeln und Raster
bleiben nutzbar. Vorhandene lokale Entwürfe haben Vorrang; Öffnen erzeugt keine
Notiz und übermittelt keine Abgabe. Quellenlink führt intern zum aktuellen
Aufgabentermin. Moodle-Standardantworten ohne URL bekommen den belegten cmid-
Link. Unvollständige Aufgabenantworten entfernen keine vorhandenen Termine.
Terminänderungen und ausdrücklich bestätigte Fristen mit Fixtures geprüft.

43 Backendfälle und 52 verschiedene gezielte Frontendfälle bestanden;
15 Browserfälle (fünf neue, zehn vorhandene Editorabläufe), Typecheck, gezielter
ESLint, Sprachprüfung, Ruff, mypy und PWA-Build. Hell/Dunkel auf 1440/390 px
visuell geprüft. Keine Migration oder neue Abhängigkeit. Textmarker und einklappbare
Abschnitte sind als nächste mögliche Erweiterungen dokumentiert, noch nicht gebaut. Keine Live-Prüfung des privaten Moodle-Abschnitts.
Signierte Mac-App installiert; isolierter Client-Smoke bestanden (8,84 s).
Vier ausgelieferte UI-Dateien stimmen mit dem Build überein, bestehende
Programmidentität erhalten. Nach persönlicher macOS-Freigabe sind Kopplung und
Schlüsselbund verfügbar. Quellstand c069453 lokal auf main integriert.
PC-Paket `UniOS-PC-Update-c069453.zip` in `dist/server-prepared/` enthält diesen
neuen Stand mit 1.463 versionierten Quellen, Prüfsumme, Entpacker und PC-Auftrag.
Archivintegrität und frisches Entpacken bestanden. Serverupdate, Windowslauf
und echter Moodle-Sync für den genannten Abschnitt stehen aus; kein Push.

## 14.10.2026 – Kombinierte Mac-Installation und PC-Serverpaket

Stand bf978b2 mit Vorlesungsseiten, leeren Notizen, Wiederaufnahme und
Rechenraster signiert installiert. Client-Smoke bestanden (9,57 s), zehn
UI-Dateien anhand der ausgelieferten Prüfsummen geprüft. Bestehende
Programmidentität erhalten; nach persönlicher macOS-Freigabe sind Kopplung und
Schlüsselbund verfügbar. Keine privaten Daten zur Prüfung gelesen.

Server-SSH auf diesem Mac nicht eingerichtet. Marc hat ausdrücklich eine
PC-Übergabe gewählt. Festes Quellpaket bf978b2 (1.459 versionierte Dateien,
SHA256 und Größen geprüft), PC-Auftrag und frischer Entpacker vorbereitet.
Keine persönlichen Daten enthalten; kein Serverupdate oder GitHub-Push.
Neuere Änderungen sind separat zu paketieren. Leere Notiztexte und exakte
GPT-Seitenverweise erfordern weiterhin den aktualisierten Server.

## 14.10.2026 – Mitschrift und Rechenraster zusammengeführt

Notizpaket `64276a8` und Rechenraster `28f5019` gemeinsam auf dem Hauptstand
integriert. Beide Fortschrittseinträge und Sprachschlüssel erhalten. Alle
1.380 Frontendtests, Typecheck, ESLint, Sprachprüfung und gemeinsamer PWA-Build
bestanden. 23 gemeinsame Browserfälle bestanden, einschließlich leeren Notizen,
Vorlesungsseiten, Notiz-Wiederaufnahme, vorhandenem Editor und Rechenraster.
Die Canvas-Sichtbarkeitsprüfung berücksichtigt die kurzzeitig doppelte Fläche
während einer PDF-Neuzeichnung. Aktualisierte Ansichten auf Desktop und 390 px
visuell geprüft. Lokaler Merge-Commit, kein Push und keine neue Installation.
Der installierte Raster-Client und sein gekoppelter Server wurden nicht ersetzt.

## 14.10.2026 – Vorlesungsseiten, leere Mitschriften und Wiederaufnahme

„Heute bearbeitet“ hält Datum und PDF-Seitenbereiche in der Mitschrift fest,
auch ohne eigene Prosa. Portable Quellenblöcke nennen die konkrete PDF-Version;
Tage und Fassungen bleiben erhalten. Eigene Ergänzungen und Querverweise
bestimmen weder erfasste Seiten noch die vorgeschlagene Quelle. Enter übernimmt
Seiten ohne versehentliche Notizanlage. „Auftrag für GPT kopieren“ bereitet einen
belegenden Entwurf mit exakten Quellen vor, ohne automatischen KI-Aufruf.
`lookup.fetch` versteht diese Materialverweise mit üblichen Quellenrechten,
historischer Version und seitengebundenen Fortsetzungen; unindizierte oder
widerrufene Quellen bleiben gesperrt. Keine Migration oder neue Abhängigkeit.

Leere benannte Notizen können ausdrücklich angelegt, später gefüllt und wieder
geleert werden; die Versionshistorie bleibt erhalten. „Leere Mitschrift“ leert
nur die unveränderte Standardvorlage. „Mitschrift öffnen“ sucht und paginiert
ältere Kursnotizen neben der PDF. Die zuletzt gewählte UUID bleibt nach einem
Neustart gespeichert, gebunden an die bestehende Kopplung. Neue Entwürfe bleiben
beim Wechsel erhalten; langsame Wiederherstellung und laufende Neuanlage
verdrängen keine neue Eingabe. Fehlende Notizen sind über die Auswahl ersetzbar.

1.366 Frontendtests und 45 verschiedene Browserfälle bestanden, einschließlich
frischem Browser-Kontext, Notizrevisionen, Seiten-/Datumswechsel, Enter und
vorhandenem Leser/Editor. Typecheck, ESLint, 73 de/en-Namespaces, PWA-Build,
OpenAPI-/API-Typenabgleich, Ruff und vollständiges mypy bestanden. Vollständiger
Backendlauf: 1.276 bestanden, sechs übersprungen; der bereits bekannte temporäre
macOS-Signaturtest scheitert weiterhin an der ungültigen Testidentität
(`tests/test_macos_signing.py:84`). Maschinenvertrauen unverändert.
Gezielte Quellen-/Notizprüfung: 66 Fälle einschließlich nachträglich geprüfter
Budgetgrenze und überlappender Quellenfortsetzungen. Gemischte Seiten-/Vollabrufe
überspringen bei gekürzten Antworten keine frühen Abschnitte.

Hell/Dunkel auf 1440/390 px visuell geprüft; Screenshots separat versioniert.
Lokaler Quellcode und Build; keine neue Mac-Installation, kein Serverdeployment
und kein Push. Leere body-Notizen sowie GPT-Materialverweise benötigen den
aktualisierten Server. Die installierte App bleibt zunächst beim vorherigen
Stand. [Bedienung und Nachweise](qa/lecture-notes-20261014/README.md).

## 14.10.2026 – Feste Schreibpositionen und Tab

Rechenraster in Notizeditor und PDF-Mitschrift ergänzt. Felder behalten feste
Spaltenbreiten und Zeilenhöhen; Ergänzungen verschieben keine Nachbarfelder.
Tab/Shift+Tab wechseln Felder, Enter/Shift+Enter wechseln die Zeile. Am Ende
entsteht eine neue Zeile; zusätzliche Spalten sind ausdrücklich hinzufügbar.
Hochzahlen und Zahlenbasen erscheinen nach Verlassen eines Feldes. Lange Inhalte
sind im Feld horizontal scrollbar. Bis zu 20 Zeilen, sechs Spalten, 200 Zeichen
je Feld; keine automatische Rechnung und kein Überschreiben anderer Einträge.

Gespeichert als bestehender UniOS-Studienbaustein im Markdown, ohne Migration
oder Abhängigkeit. Ungültige Raster bleiben als wörtlicher Code erhalten. In der
PDF-Mitschrift öffnet Rechenraster den Baustein am Cursor erneut; Abbrechen
verändert den Entwurf nicht. Normales Quelltext-Schreiben akzeptiert echte Tabs;
Listen behalten ihre Einrückung. Escape, dann Tab ermöglicht den Fokuswechsel.
Editor-Dialoge liegen nun auch auf dem Handy über der PDF-Seitenleiste.

64 gezielte Frontendtests und sieben verschiedene Browserabläufe bestanden,
einschließlich messbarer Feldpositionen, schneller Tab-Eingabe, Speichern,
Neuladen, Abbrechen und mobilen Entwürfen. Typecheck, betroffener ESLint,
Sprachprüfung und Desktop-Frontend-Build bestanden. Desktop und 390 px visuell
geprüft. Signierte Mac-App installiert, Client-Smoke 15,89 s bestanden.
Sieben ausgelieferte UI-Dateien entsprechen dem geprüften Paket; Kopplung und
bisherige Programmidentität bestätigt. Isoliertes Arbeitspaket auf
`codex/fixed-writing-grid` wegen gleichzeitiger Änderungen im Hauptcheckout;
kein Push.

## 14.10.2026 – Hochzahlen, Zahlenbasen und Binärrechnungen

Direktes Schreiben im Notizeditor unterstützt `2^5`, `2^15`, `^5`, `(-9)10`,
`(10111)2` und `(2^5-1)10`. Leerzeichen, Rechenzeichen oder Enter schließen die
Eingabe ab; mehrstellige Exponenten bleiben vollständig. Im Markdown-Text der
PDF-Mitschrift bleiben die Zeichen editierbar, die Vorschau stellt sie als Formeln
dar. Code und ausdrücklich abgegrenzte LaTeX-Formeln behalten ihre Behandlung.

Drei explizite Binärzeilen wie `(01110)2`, `+(10111)2`, `=(00101)2` werden als
Spaltenrechnung mit Strich dargestellt. Die Darstellung verändert oder berechnet
keine Zahlen; Einer-/Zweierkomplement und Bitbreite bleiben die gewählte Rechnung.
Formeln werden mit der bestehenden portablen Markdown-/LaTeX-Struktur gespeichert.
Keine Abhängigkeit oder Migration. Die Eingabehilfe zeigt die neuen Kurzformen.

64 gezielte Frontendfälle und fünf Browserabläufe einschließlich Speichern,
Neuladen, PDF-Vorschau, Bruch und Matrix bestanden. Typecheck, betroffener ESLint
und Desktop-Frontend-Build bestanden; nach Integration des aktuellen Hauptstands
wiederholt. Signierte Mac-App aus dem isolierten Checkout installiert;
Client-Smoke 13,10 s bestanden. Bestehende Programmidentität und Kopplung
bestätigt; ausgelieferte UI-Dateien stimmen mit dem geprüften Build überein.
Lokaler Paket-Commit, kein Push.

## 14.10.2026 – Schreiben, eigene Notizkarten und Offline-Vorbereitung

Die drei zuerst empfohlenen Vergleichsideen umgesetzt. „Heute“ zeigt eine
konkrete Fortsetzung samt Begründung und tatsächlichem Ziel. Kursseiten bieten
eine explizite Offline-Vorbereitung aktueller PDFs und Notiztexte mit tatsächlichen
Speicherzählungen, Größen-/Mengenlimits und sichtbar ausgeschlossenen Medien,
Übungen sowie vollständigen Kartenbeständen. Dateien und API-Caches sind an den
vorhandenen Kopplungsarbeitsbereich gebunden; ein Wechsel entfernt alte Lesedaten.

Auswahl in gespeicherter Mitschrift → eigene Frage/Antwort → ausdrückliches
Speichern erstellt eine manuelle Anki-Karte mit Notiz-UUID, Revision, Hash und
Auswahl. Spätere Notizänderungen verändern die Quelle nicht. Verlorene Antworten
lassen sich mit derselben UUID erneut prüfen. Queue und Lernen öffnen die
historische Notizrevision. Visuelle Formeln behalten bei Auswahl ihr LaTeX.
Keine neue Abhängigkeit, Migration oder Pflicht-KI.

Aufzählungszeichen nach dem Tailwind-Reset wieder sichtbar gemacht. Direktes
Tippen unterstützt `- `, `* `, `+ `, `1. `, `# ` bis `###### ` und `> `;
`[ ] ` nach einem Punkt konvertiert nur diesen Punkt zur Checkbox. Markdown-Enter
setzt Listen/Nummerierungen fort, beendet leere Punkte und hält Code wörtlich;
Tab/Shift+Tab ändern Listeneinrückungen. Kompakte Eingabehilfe und mobile
Kartenaktion ohne abgeschnittene Beschriftung ergänzt.

1.292 Frontendtests sowie 50 verschiedene Browserfälle bestanden. Typecheck,
ESLint, 71 de/en-Namespaces, Build, OpenAPI-/API-Typenabgleich, Ruff für versionierte
und neue Quellen sowie vollständiges mypy bestanden. Gezielt 55 Karten-/Anki-
Backendfälle bestanden; abschließende Notiz-/PDF-Quellenprüfung 41 bestanden.
Gesamter Backendlauf: 1.256 bestanden, sechs übersprungen, ein unveränderter
macOS-Signaturtest: Seine temporäre Zertifikatsidentität wird nicht als gültig erkannt
(`tests/test_macos_signing.py:84`). Die unvollständigen lokalen Testinstallationen
von pyee/greenlet wurden mit den vorhandenen Lockfile-Versionen repariert;
Zertifikat-Vertrauensrichtlinien und persönliche Schlüssel bleiben unberührt.

Hell/Dunkel auf 1440/390 px visuell geprüft, einschließlich Offline-Neuladen,
Retry ohne Kartenduplikate, geänderter Quelle und Formel-/Markdown-Auswahl.
Aktuelle Screenshots separat versioniert; frühere Lesergalerie erhalten.
Quellcode und PWA-Build lokal; kein neuer Installer, Serverdeployment oder Push.
[Bedienung, Nachweise und Grenzen](qa/comparison-improvements-20261014/README.md).

## 13.10.2026 – Wahrheitstabelle wie an der Tafel

Die Hauptansicht zeigt Eingangsspalten, einen UND-Term je Belegung und den
abgetrennten Ausgang Y. Indizierte Variablen erscheinen mit Tiefzahlen,
Negationen mit Überstrichen. Eins-Zeilen werden hervorgehoben; daneben stehen
nur ihre mit + verbundenen Minterme als kanonische DNF. Keine Änderung der
eingegebenen Funktion. Operatorrangfolge und notwendige Klammern bleiben in
der formatierten Vorschau erhalten. Zwischenschritte sind separat einblendbar.
Ausgeblendete Ergebnisse erzeugen weder Hervorhebung noch Lösungsformel.

Einfügen speichert portable Markdown-Tabellen mit einzelnen LaTeX-Termteilen,
auch in der PDF-Mitschrift; lange DNF-Summen umgehen keine Formelgrenzen.
28 gezielte Vitest-Fälle und zehn betroffene Browserabläufe bestanden (fünf
Funktionstests, fünf Tafelansicht-/Layouttests). Typecheck, betroffener ESLint,
Sprachprüfung und Build bestanden. Hell/Dunkel auf Desktop und 390 px visuell
geprüft; die letzte DNF-Zeile wird nicht durch die Aktionsleiste verdeckt.
Keine zusätzliche Abhängigkeit; bestehende Notizen bleiben unverändert.
Signierte Mac-App installiert; isolierter Client-Smoke 11,90 s bestanden.
Ausgelieferte Tabellenkomponente und CSS stimmen mit dem geprüften Build
überein; bestehende Kopplung und Schlüsselbundzugriff bestätigt. Kein Push.

## 13.10.2026 – Notizlinks bleiben in der Mac-App

Interne Markdown-Links werden im Notizeditor und -leser vor verbrauchten
Editor-Klicks aufgefangen. Eigene Wiki-/Peek-Interaktionen bleiben erhalten.
Die native Behandlung neuer Fenster gibt lokale Links an den Router zurück;
der Router akzeptiert nur tatsächliche App-Seiten auf der eigenen Origin.
Damit bleiben auch Tastatur-/Bedienungshilfe-Aktivierungen in UniOS. Notiz-,
Kurs- und Übungsziele behalten Parameter und Anker. Externe Webseiten sowie
Datei-/API-Downloads behalten ihr bisheriges Verhalten.

12 betroffene Vitest-Fälle, gezielter Rust-Test, Typecheck, betroffener ESLint,
Frontend-Build und zwei Browserabläufe bestanden: Lesen, Bearbeiten, native
Fensterweiterleitung und externe Quelle. Automatisierte Tests mit erfundenen
Notizen; keine bestehenden Notiztexte oder Verknüpfungen geändert.
Signierte Mac-App installiert, Client-Smoke 9,44 s bestanden; ausgelieferte
Navigation stimmt mit dem geprüften Build überein. Bestehende Kopplung und
Schlüsselbundzugriff bestätigt. Den gemeldeten Kursübersichtslink anschließend
im echten Mac-Fenster geprüft: Ziel erscheint innerhalb von UniOS.

## 13.10.2026 – Logikzeilen und Gleichwertigkeitsprüfung

Das Formel-Fenster bietet „Logik direkt tippen“: ASCII-Zeichen wie `->`, `!`,
`*` und `+` erscheinen als Logikzeichen, ganze Gleichungen bleiben frei schreibbar.
Ein einzelnes `=` vergleicht beide vollständigen Seiten bei allen 0/1-Belegungen
(maximal sechs Variablen / 64 Fälle / 256 Zeichen). Ungleiche Ausdrücke erhalten
ein konkretes Gegenbeispiel mit Variablenwerten und Ergebnissen beider Seiten;
auch die Wahrheitstabelle unterstützt den Vergleich. `=>` und `<=>` behalten
ihre Bedeutung. Unvollständige Gleichungen und Ketten werden nicht als geprüft
angezeigt. Mathematische und logische Entwürfe bleiben beim Wechsel erhalten.

29 gezielte Vitest-Fälle und vier Browserabläufe bestanden: falsche/richtige
Implikationsgleichung, Gegenbeispiel, Speichern und Neuladen, Entwurfswechsel,
Wahrheitstabelle sowie bestehende Matrix-/KV-Eingabe. Typecheck, betroffener
ESLint, de/en-Sprachprüfung und Frontend-Build bestanden. Keine neue Abhängigkeit.
Signierte Mac-App installiert; isolierter Client-Smoke 8,94 s. Installierte
Dialog-/Tabellen-Dateien stimmen mit dem geprüften Build überein; bestehende
Kopplung und Schlüsselbundzugriff bestätigt. Änderungen lokal committet.

## 13.10.2026 – Zitierende Notizen mit älteren Serverständen

Der native Client ergänzt den fehlenden PDF-Zitat-Endpunkt ausschließlich nach
HTTP 404 über authentifizierte Material- und Notiz-GETs. Quellen werden mit
verifizierten Versions-IDs und demselben Parser wie im Backend ausgewertet;
Seiten, alte Fassungen und UUID-Notizen bleiben erhalten. Vorhandene Endpunkte
und echte Berechtigungs-/Serverfehler bleiben unverändert. Die Metadatenliste
sucht nur Titel; deshalb wird vollständig paginiert statt nach Quelltext gesucht.
Scan maximal 200 Notizen / 12 s; bei Erreichen der Grenze wird ausdrücklich ein
Serverupdate verlangt, keine unvollständige oder erfunden leere Liste ausgegeben.

31 gezielte Pythonfälle, Ruff, Mypy (614 Quellen; final betroffene Quellen),
Typecheck, betroffener ESLint und ein Browserablauf mit absichtlich fehlendem
Serverendpunkt bestanden. Browser prüft sichtbare zitierende Notiz, Notizlink
und Seitensprung. Signiertes Mac-Paket gebaut und installiert; isolierter
Client-Smoke 9,02 s. Der vorher fehlgeschlagene reale Leseaufruf liefert HTTP 200;
bestehende Kopplung bestätigt. Eine bestehende Lösungsquelle explizit auf ihre
Originalseite verlinkt, vorherige Notizrevision erhalten. Keine Schemaänderung,
kein Serverdeployment und kein Push; keine privaten Inhalte im Repository.

## 10.10.2026 – LaTeX direkt in Notizen und zuverlässiges Weiterschreiben

Notizeditor, Markdown, Notizleser, PDF-Mitschrift und Randkommentare geprüft.
Direkt getippte `$…$`, `\(…\)`, `$$…$$` und `\[…\]` werden nach dem
Schlusszeichen dargestellt, auch mehrzeilige eigene Gleichungsblöcke. Originales
LaTeX, Matrixzeilen und umgebender Text bleiben erhalten; Konvertierungen sind
rückgängig machbar. Eine zugeklappte Schreibhilfe ergänzt die vorhandenen
Tastaturvorlagen. PDF-Randkommentare erhalten eine passive optionale Vorschau.

Explizit escaped Dollarzeichen bleiben nach erneutem Speichern Text. Der
Ansichtswechsel stellt Markdown-Schreibposition und Fokus wieder her; schnelle
Navigation zum Anfang/Ende synchronisiert Editor- und Browserauswahl, statt
sporadisch an die alte Position zu springen. Dateiimporte überschreiben keine
neueren Eingaben. Breite Tabellen/Formeln scrollen intern; Tabellen sind per
Tastatur erreichbar. Der mobile Notizkopf zeigt auch bei 150 % Schrift sämtliche
Aktionen vollständig.

Alle 1.080 Frontendtests, Typecheck, ESLint, 67 de/en-Namespaces und PWA-Build
bestanden. 61 unterschiedliche betroffene Browserfälle abgenommen (60 gemeinsam,
ein veralteter Testselektor korrigiert und gezielt bestanden); zusätzlich acht
bestandene Wiederholungen für schnelle Tastaturnavigation. Hell/Dunkel,
Desktop/390 px und 100/150 % Schrift geprüft. Ausschließlich synthetische Daten,
keine neue Abhängigkeit, Schemaänderung oder PC-/Serververöffentlichung.
[Befunde, Bedienung und Abnahme](qa/note-latex-20261010/README.md).

## 10.10.2026 – Alle Aufgabenansichten einheitlich lesbar

Alle acht Assessment-Typen und die übrigen Aufgabenwege geprüft: Lernübungen,
Vorschlagsprüfung, Coding, Kursbeschreibung, Fristklärung und Schnellansicht.
Ein gemeinsamer passiver Renderer zeigt Überschriften, Teilaufgaben, Code,
Wahrheitstabellen und LaTeX einschließlich Brüchen, Summen und Matrizen. Breite
Tabellen behalten ihre natürliche Breite und scrollen intern statt ihre
Überschriften buchstabenweise zu zerlegen. Aufgaben und Antworten verwenden
relative Schriftgrößen; lange Titel/Optionen umbrechen vollständig.

Vorschlagsformulare stehen auch mobil untereinander und haben eine aufklappbare
Fragevorschau. Zahlenantworten erhalten ein kompaktes Feld mit Formatbeispielen,
Rechenwege eine korrekt zugeordnete Eingabehilfe. Vorheriges Tutorfeedback bleibt
während laufender Probeprüfungen verborgen. Codebausteine behalten Einrückung;
Antwortwerte, Indizes, Quellen und Freigabe-/Lösungsschritte bleiben unverändert.

85 gezielte und anschließend alle 1.031 Frontendtests, Typecheck, vollständiges ESLint, 67 de/en-Namespaces,
PWA-Build und 41 betroffene Browserfälle gemeinsam bestanden. Bilder in
Hell/Dunkel, 1280×720, 390×844 und 150 % Schrift geprüft; die letzte mobile
Überschriftenkorrektur zusätzlich mit drei bestandenen Browserfällen
abgenommen. Prüfung aller Ansichten/Typen mit erfundenen Grenzfällen, keine
fachliche Bewertung aller persönlich gespeicherten Einzelaufgaben. Freigegebenen
UniOS-Quellenkatalog ergänzend geprüft, lokale persönliche Daten nicht gelesen.
Keine neue Abhängigkeit, Schemaänderung oder Windows-/Serververöffentlichung.
[Befunde, Umsetzung und Abnahme](qa/task-presentation-20261010/README.md).

## 10.10.2026 – Seitenleiste mit konkretem Arbeitskontext

UniOS zeigte im einfachen Standardmodus nur fünf Bereiche und verbarg seine Kurse.
Kursverknüpfungen sind jetzt standardmäßig sichtbar, beim Betreten eines Kurses
öffnen sich Materialien und Notizen. Bewusste gespeicherte Ausblendungen bleiben
erhalten. Suche und neue Notiz sind direkt erreichbar; bis zu fünf zuletzt
geöffnete Inhalte führen zu echten Notizen oder PDFs samt zuletzt gelesener Seite.
Der Verlauf bleibt ausschließlich im aktuellen Fenster und lässt sich ausblenden.

Navigation scrollt unabhängig vom erreichbaren Fußbereich. Leere Kursgruppen
haben einen echten nächsten Schritt und sind ebenfalls ausblendbar. Suchdialog
fokussiert die Eingabe und kehrt zum sichtbaren Auslöser zurück; neue Notiz erhält
ungespeicherte Entwürfe. 29 gezielte Vitesttests, Typecheck, vollständiges ESLint,
67 de/en-Namespaces, PWA-Build und 21 betroffene Browserfälle gemeinsam bestanden.
Zusätzlicher Bildlauf bestanden; Hell/Dunkel, 1440×1000, 1280×720, 390×844 und
150 % Schrift geprüft. Keine neue Abhängigkeit,
keine Schemaänderung und kein neuer Windows-/Serverrelease.
[Vergleich, Abnahme und Vorschau](qa/sidebar-workspace-20261010/README.md).

## 10.10.2026 – Stundenplan sichtbar und kompakter

Starre Stundenhöhe durch automatisches Einpassen ergänzt, Kopf verkleinert und
große Kalenderansicht mit Dialog-/Tastaturbedienung eingebaut. In der geprüften
Arbeitswoche sind alle Termine bis 17:30 im Raster und in der großen Ansicht
auch im echten 1280×720-Fenster sichtbar. Die vollständigen 24 Stunden bleiben
erreichbar; Hinweise führen zu Terminen außerhalb des sichtbaren Ausschnitts.
Manueller Zoom bleibt gespeichert, Ziehgeometrie wird während einer Geste
festgehalten, große Schrift bricht die Handyüberschrift vollständig um.

30 gezielte Vitesttests, Typecheck, vollständiges ESLint, 67 de/en-Namespaces,
PWA-Build und 26 betroffene Browserfälle gemeinsam bestanden. Hell/Dunkel,
390 px und 150 % Schrift geprüft; echte Großansichts-Fensterbilder und ihre
Grenzen dokumentiert. Portal-Montage-/Fokusfehler und Escape während einer
Ziehgeste vor der Abnahme korrigiert; sehr frühe/späte Termine bleiben erreichbar.
Keine neue Abhängigkeit oder Schemaänderung; kein neuer Windows-/Serverrelease.
[Abnahme, Verhalten und Bilder](qa/calendar-visibility-20261010/README.md).

## 10.10.2026 – Windows-Neustartfehler der Installation repariert

Normaler Windows-Desktop konnte die Python-DLL nicht finden: Die beiden EXEs
lagen im Benutzer-Installationsordner, `_internal` war nur im privaten
Codex-MSIX-Cache vorhanden. Die frühere Prüfung mit expliziter Cache-Ausnahme
belegte deshalb keinen normalen Windows-Start. Unabhängige Desktop-Probe
bestätigte die fehlenden Dateien. Vorhandenes, hashgebundenes NSIS-Paket 0.1.23
über den echten Desktop erneut installiert; anschließend alle 2896
Programmdateien bytegleich und mit exaktem physischem Kernelpfad bestätigt.
Synthetischer Starttest Exit 0, normale native App geöffnet, eigener Dienst
mit Client-Health `ok`, kein Fehlerfenster. Kein Rechnerneustart durchgeführt.

Dauerhafter lesender Prüfer `scripts/verify_windows_runtime.ps1` lehnt
Umleitungen ab und verlangt beim isolierten Starttest alle drei Pipes.
Beide PowerShell-Dateien syntaktisch geprüft; 11 synthetische Regressionstests
bestanden, einschließlich echter Pipeprüfung, fehlender DLL, Umleitung,
Zeitlimit und ungültiger Ergebnisse. Dauerhafter Prüfer an der reparierten
Installation im unabhängigen Desktop-Kontext ebenfalls Exit 0.
Fehlender Eingabekanal im ersten zusätzlichen Starttest verursachte einen
zweiten Dialog; Test korrigiert, ursprünglicher Fehlnachweis erhalten.
Private Bestände nicht gelesen oder kopiert; kein neuer Produktrelease.
[Reparatur, Prüfungen und Grenzen](qa/windows-runtime-repair-20261010/README.md).

## 10.10.2026 – Aufgabenansicht lokal verbessert und abgenommen

Marc hat ausdrücklich die Darstellung der gezeigten Java-Transferaufgabe
bestätigt. Aufgabe erhält mehr Fläche, Java einen passiven Codeblock mit
konservativer Einrückung und Syntaxfarben, Prosa einen eigenen Absatz.
Kompakter Übernahmestreifen, erklärtes Antwortfeld mit zehn Zeilen und
Strg/Cmd + Enter über native Formularvalidierung. Nachladen erhält Entwurf
und Fokus; Übernahme fokussiert einen bedienbaren Eintrag. Prüfungs-URLs
warten auf ihre passenden Daten; Ladefehler und fremde Aufgaben werden
nicht als normale Übung angezeigt. Breite Formeln und Code scrollen intern.

49 gezielte Vitesttests, Typecheck, vollständiges ESLint, 67 de/en-Namespaces,
PWA-Build und alle 13 betroffenen Browserfälle in einem finalen Lauf bestanden.
Sechs synthetische Bilder auf Desktop/390 px in Hell/Dunkel selbst geprüft.
Vorherige Test-/Buildfehler und konkrete Grenzen bleiben dokumentiert.
Keine neue Abhängigkeit oder Schemaänderung; noch kein neuer Windows-/
Serverrelease. [Abnahme und Bilder](qa/assessment-view-20261010/README.md).

## 09.10.2026 – Update 0.1.23 auf Windows und Server ausgeliefert

Produktquellstand `84c5af45c6372daee58cedef881d5d0613b12477` gepusht,
Windowsinstaller nach vollständigem Neubau von GitHub zurückgeladen und
installiert: Exit 0, ProductVersion 0.1.23, alle 2896 manifestierten
Programmdateien einschließlich 293 UI-Dateien bytegleich bestätigt. Die neue
App und ihr Dienst laufen. Die unabhängige Prüfung bindet die beobachtete
MSIX-Runtimeumleitung ausdrücklich; sie behauptet keinen unvirtualisierten
Installationsort oder private Serverkopplung.

Serverimage 0.1.23 gesund aktiviert; Mounts, Topologie und Schema ff98c7da0320
erhalten. Vollständiges ZIP mit Installern, Quellen und Prüfbelegen auf GitHub
hochgeladen und nach `Downloads\UniOS-0.1.23` zurückgeladen; lokale Datei,
GitHub-Digest und Rückdownload stimmen überein. Der GitHub-Release bleibt
Entwurf, weil Konto-Zahlungs-/Ausgabenlimits sechs CI-Jobs vor dem ersten
Schritt blockieren. Kein bestandener Plattform-/Mac-Lauf behauptet.
Alle konkreten Lieferdaten und Prüfsummen im
[Auslieferungsbeleg](qa/page-purpose-fixes-20261009/DELIVERY.md).
Beim abschließenden GitHub-Abgleich zusätzlich zwei bestehende
Abhängigkeitsmeldungen bestätigt (sharp 0.35.4 und source-map-js 1.2.1).
Diese Updates sind offen und im Auslieferungsbeleg getrennt dokumentiert;
keine behobene Sicherheitsmeldung oder konkrete Produktausnutzbarkeit behauptet.

## 09.10.2026 – Seiten- und Bedienungsupdate 0.1.23 lokal abgenommen

Bestätigte Seitenkorrekturen in eigenem Code umgesetzt:
identitätsgebundene Entwürfe und Speicherantworten, fortgesetzte PDF-Mitschrift,
begrenzte Lernlisten und sichtbare Sammelfreigaben, mobile Notiznavigation,
gegliederte Einstellungen, Campus-Fristen und gezielte Gedankenübernahme.
PDF-Historie berücksichtigt Fensterbreite und wartet bei einer anfangs offenen
mobilen Mitschrift auf die tatsächliche Readerposition. Der Mitschriftknopf
bleibt in der festen PDF-Leiste erreichbar; Neuladen nach 6,5 Sekunden Modal
erhält sichtbare PDF-Seite und exakten Scrolloffset. Windows-Parserabbruch
bestätigt das Prozessbaum-Ende oder meldet den Cleanupfehler mit Originalursache.

Abnahme: 1082 Backendtests bestanden, 12 übersprungen; 965 Frontendtests,
Ruff über 617 Dateien, mypy über 589 Dateien, vollständiges ESLint, Typecheck,
OpenAPI/API-Vertrag und 67 de/en-Namespaces bestanden. Final 45 betroffene
Browserfälle bestanden. Der vorherige vollständige Lauf bleibt mit 389/390
bestanden dokumentiert; korrigierter Bildtest und zusätzlicher Neuladefall
decken zusammen mit den unveränderten übrigen Fällen alle 391 aktuellen
Browserfälle ab. Kein einzelner vollständiger 391-Fälle-Erfolg behauptet.
24 Hauptansichten selbst und unabhängig geprüft; zwölf finale Lighthouse-
Ansichten erreichen 96–100 Punkte, PWA-/Bundlelimits bestanden. Schema bleibt
ff98c7da0320. Quellbindung und Windows-/Serverauslieferung folgen jetzt;
noch keine Installation oder Plattformfreigabe behauptet.

## 09.10.2026 – Kalender direkt bearbeiten, lokal geprüft

Eigene UniOS-Implementierung ergänzt: Drag/Resize, freie Zeit aufziehen, eigene Termine,
Formular, 15-Minuten-Raster, Escape, Undo und Tastaturalternative. Persönliche
Änderungen an importierten Terminen bleiben als Überlagerung getrennt vom
Original. Revisionen und bestehender LocalAction-Verlauf verhindern stille
Überschreibung; keine Schemaänderung. Journal/Export/KI/Suche verwenden die
effektiven Termine, entfernte/interne Kalenderobjekte werden nicht indiziert.

716 Frontendtests, alle 355 verschiedenen Browserfälle über Haupt- und gezielten
Korrekturlauf, 1021 Backendfälle über Haupt- und Pfad-Korrekturlauf bestanden;
zwölf Backendfälle übersprungen. Vollständiger Ruff/mypy, Typecheck/Lint,
OpenAPI/i18n, Build und Budgets bestanden. 16 Light-/Dark-Bilder bei 1440/390 px,
Lighthouse A11y 96–100; kleine Desktoptargets und echte Mac-Gesten als offene
manuelle Prüfung dokumentiert. [Abnahmenachweis](qa/calendar-editing-20261009/README.md).
**Lokal fertig, noch nicht installiert oder auf dem Server aktiviert.**


**Interne Lernpfad-Links in der nativen App korrigiert (09.10.2026):**
Der globale Browser-Handler respektiert bereits behandelte Klicks. Relative
Notiz-/Materiallinks und relative oder gleichursprüngliche absolute Links zu
Assessment-/Coding-Aufgaben öffnen sich im vorhandenen Arbeitsbereich; externe
Quellen öffnen weiterhin den Browser. Die Markdown-Zulassung verwendet dieselbe
Routenprüfung. 15 gezielte Vitest-Tests, Typecheck, vollständiger Lint, nativer
Build und ein Playwright-Ablauf mit synthetischem Kurs und nativer Bridge
bestanden. Die Korrektur wurde aus einem isolierten Arbeitsstand als lokales
UI-Update auf den installierten Windows-Client angewendet: 277 Build-Dateien
SHA-256-geprüft, Vorgänger vollständig gesichert und HTML-Auslieferung identisch
zum neuen Build. Kein neuer Installer oder Serverrelease. Bereits geöffnete
Fenster benötigen ein Neuladen bzw. einen App-Neustart.
Details: [Prüfnachweis](qa/internal-note-links-20261009/README.md).

**Update 0.1.21 auf PC und Server installiert (08.10.2026):** Produktrevision
`900395f354844e51a0afd86be2b5ad523891c497` mit Mathe-/Lernwerkzeugen, PDF-Clips
und Apple-inspiriertem Kalender ausgeliefert. Windows-NSIS tatsächlich von
GitHub heruntergeladen, SHA-256 geprüft, Exit 0; App 0.1.21 gestartet. Alle 2878
Programm-/277 UI-Dateien bytegleich, Kopplung erhalten und eigener HTTPS-Host
erreichbar. Installierter Dienst isoliert geprüft, Median 0,6844 s.

VPS-Image `unios-server:0.1.21-alpha3-final` aktiv und gesund, ID
`sha256:d9c78615bac7360f05266f20067a94d12dfea1e0e9f0d29e54b86aee974b06fe`.
Backend-/Migrations-/Connector-Quellen und ausgelieferte Konfiguration identisch
zum Vorgänger, Schema ff98c7da0320 unverändert. Daten-/Schlüssel-Mounts erhalten;
Health/HTTPS und API-Schutz geprüft. Vorgänger für Rückkehr verfügbar.

712 Frontendtests und 15 Paket-/Release-Tests bestanden; sämtliche 350 lokalen
Browserfälle abgedeckt (349 Hauptlauf plus isolierter Produktions-PWA-Check an
bytegleichem Build). Gesamt-ZIP SHA-256
`aa355333b200cd566c35280fccf1a546f66e19a5150773a30c5f889706f86a49`, Installer,
Serverquellen und vollständiger Quellcode als GitHub-Entwurf hochgeladen.
GitHub blockiert die neue vollständige Matrix `37757305844` vor dem ersten
Schritt wegen Kontozahlung/Ausgabenlimit. Kein grüner finaler CI-Lauf behauptet;
Release-Freigabe und neue Mac-/Linux-Pakete bleiben ausstehend. Details:
[Auslieferungsnachweis](qa/release-021-20261008/README.md).

**Release 0.1.21 in Vorbereitung (08.10.2026):** Das angeforderte Gesamtupdate
bündelt MathLive/Lernwerkzeuge/PDF-Ausschnitte und den Apple-inspirierten Kalender.
Versionsmetadaten für Server und native Pakete gemeinsam auf 0.1.21 angehoben;
keine Schema-/Kopplungsänderung gegenüber dem aktivierten 0.1.20-Stand. Bytegleiche
WOFF2-Schriften werden lokal geteilt, doppelte WOFF-/TTF-Fallbacks entfallen:
17.991.636 Bytes roh / 5.053.932 gzip im PWA-Precache, bestehende Budgets bestanden.
Installerbau, vollständige CI, GitHub-Paket und Aktivierung werden nach Abschluss
separat mit der tatsächlichen Quellrevision und den Prüfsummen dokumentiert.

Die erste vollständige GitHub-Matrix `37693137614` besteht in sämtlichen
Backend-/Plattform-, Docker- und GLib-Jobs. Frontend 712 Tests bestanden;
Browser 349 bestanden, ein Testselektor fand sowohl die Notizvorschau als auch
die Mathevorschau. Beide Klicks dieses Tests sind nun auf die Markdown-Werkzeugleiste
und den exakten Schaltflächennamen begrenzt. Kein Produktcode oder Schema verändert.
Die vollständige Freigabematrix wird am korrigierten Quellstand erneut gestartet.

## 07.10.2026 – Kalender im gewünschten Apple-Stil lokal überarbeitet

Die Tageskarten des Stundenplans durch ein zusammenhängendes Zeitraster mit
Montag–Sonntag, Tag/Woche/Liste, dezenten Kursfarben, Markierung für heute und
Aktuell-Linie ersetzt. Überschneidungen bekommen eigene Spalten. Termine öffnen
vollständige Zeit-/Raumdetails per Maus oder Tastatur; Escape gibt den Fokus zurück.
Auf dem Handy Tagesauswahl mit lesbarer Agenda, bei Bedarf ganze Woche als Liste.
Die Fristen-Monatsansicht bekommt ein ruhiges Raster und eine vollständige,
chronologische Liste für den gewählten Tag. Pfeiltasten gehen über Monatsgrenzen.
API, Abos, persönliche Zeitslots und kompakte Heute-Ansicht weiterverwendet;
keine neue Abhängigkeit, Backendänderung oder Datenbankmigration.

10 gezielte Frontendtests und 10 betroffene Playwright-Fälle, Typecheck, kompletter
Lint, de/en-i18n und Build bestanden. Zwölf Lighthouse-Snapshots von Woche, Monat
und Termin-Dialog in Light/Dark bei 1440/390 px erreichen Accessibility 100.
Wochen-/Monatsbilder visuell geprüft. Nur synthetische Daten und Fake-Dienste.
Gefundene Fokus-, Tabellen-ARIA-, Klickflächen- und Sprachsteuerungsprobleme
korrigiert. [Abnahme und Vorschau](qa/calendar-apple-20261007/README.md).
Lokal abgeschlossen; noch kein neuer Release oder Serverupdate. Gleiches Tempo
wie iPad/Pencil bleibt eine offene echte Nutzerprüfung, keine zugesicherte Eigenschaft.

## 07.10.2026 – Lernwerkzeuge und Tastatur-Mitschrift lokal abgeschlossen

Auf Nutzerwunsch die priorisierten Helfer aus dem Studienausblick eingebaut:
40 suchbare Mathevorlagen, 1–8 Zeilen/Spalten für Matrizen, mehrzeiliges LaTeX,
MathLive-Aliasse in KaTeX, exakte Zahlensysteme/Bruchteile und Bitinterpretation,
kanonische DNF/KNF und geprüfte KV-Gruppen, editierbare Beziehungsskizzen,
Übungen mit verdeckter Lösung, Statistik/Binomialverteilung, Quellenbelege,
Projektprotokolle und Codeablauftabellen. PDF-Bildausschnitte verwenden die
bestehende private Medien-API und erhalten Version, Seite und Auswahlrechteck.
Keine neue Abhängigkeit, Backendänderung oder Datenbankmigration.

Slash-Befehle öffnen mit Enter/Tab die passende Vorlage/Ansicht. Formeleingabe
und Lernwerkzeuge sind per Strg/⌘+Shift+M bzw. Shift+Leertaste erreichbar;
Strg/⌘+Enter übernimmt. Dieselbe Mathehilfe in Übungsantworten sowie in Frage,
Lösung und Hinweis. Cancel erhält den Text einschließlich des eingetippten
Quick-Befehls. Tabellen/Diagramme enden mit einem Schreibabsatz. Kompakte
Dialoge und sichtbare Einfügeaktionen; weitere Optionen eingeklappt.

Beim Prüfen korrigiert: ungewollter leerer Diagrammblock nach Undo, Enter als
zusätzliche Matrixzeile, Canvas-Mount im Portal, Tastaturfokus nach gescheitertem
PDF-Upload und unzulässiges ARIA-Attribut. Ungültige Eingaben bleiben erhalten;
fehlgeschlagener Upload beschädigt die Mitschrift nicht und ist wiederholbar.

Alle 701 Frontendtests, Typecheck, vollständiger Lint, de/en-i18n und Build
bestanden. 54 betroffene Playwright-Fälle ohne Skip/Retry bestanden, Windows
Chrome, final 2,0 min. Einschließlich echter PNG-Speicherung/Quellenrücksprung,
Formel-/Diagramm-/Übungs-Roundtrip sowie bestehender Reader-Gesten im
120-Seiten-PDF. Lighthouse 13.5.0: 24 tatsächliche Dialog-Snapshots in
Dark/Light bei 1440/390 px, jeweils Accessibility 100 und keine fehlgeschlagenen
numerischen Audits. SPDX-/Herkunftsprüfung und Diff-Check bestanden.

[Bedienung](STUDY_TOOLS.md), [Abnahme mit Bildern](qa/study-tools-20261007/README.md)
und echte MacBook-/Unterrichtsprüfung in `MANUELL_TESTEN.md`. Ausschließlich
erfundene Fixtures, keine privaten Unterlagen. Das Paket ist lokal abgeschlossen;
keine vollständige Phasen-/Release-Abnahme oder Installation behauptet.
Die installierte Veröffentlichung bleibt 0.1.20. Fremde Markdown-Apps erhalten
Diagramm-/Übungsquellen als Code; kein vollständiger TeX/TikZ-/UML-Editor,
symbolischer Löser oder automatisch garantierter globaler KV-Minimierer.

## 07.10.2026 – Schnelle Mathe-/Logik-Mitschrift lokal abgeschlossen

Eigenständige Umsetzung für Inline-/Blockmathe, Markdown und Schaltungen.
Ausgewählte freigegebene indizierte Primärabschnitte bestätigen den Bedarf an
Mathezeichen, Wahrheitstabellen in mehreren Notationen und Stellenwertsystemen.
Originaldateien, private Konfiguration und persönliche Inhalte wurden nicht als
Fixtures oder Repo-Dateien verwendet. Handschriftliche Formel-OCR ist teilweise
beschädigt und bleibt eine ausdrücklich benannte Grenze.

Visuelle lokale MathLive-Eingabe mit 14 Vorlagen, Tab-Navigation und Strg/⌘+Enter
im Notizeditor und neben dem PDF. Inline-/Blockformeln roundtrippen Standard-LaTeX
in Markdown mit KaTeX/MathML. Cursor-/Auswahlbereiche bleiben beim Einfügen erhalten.
Ein lokaler AST erzeugt bis zu 64 Wahrheitstabellen-Zeilen mit optionalen
Zwischenschritten oder leeren Ergebnissen. PDF-Seitenübersicht rendert nur nahe
Thumbnails. Bestehender verankerter Zoom, Quellenmarkierungen, Entwürfe und
Versionen bleiben erhalten. Sofortiger Tastaturfokus und sichtbare lokale
Bildschirmtastatur korrigiert; Kontrast ausgewählter Notizmetadaten verbessert.

MathLive 0.111.0 und KaTeX 0.19.0 exakt gepinnt, MIT-Lizenzen/Herkunft dokumentiert
und Lizenztexte im ausgelieferten Frontend. Fonts lokal gebaut/precached, kein
CDN oder neuer Backend-Vertrag. Keine Migration. Alle 689 Frontendtests,
Typecheck, Lint, i18n-Prüfung und Build bestanden. Alle 37 betroffenen Browserfälle
ohne Skip/Retry bestanden (Windows Chrome, 1,1 min), einschließlich 120-Seiten-PDF,
Bruch/Matrix/Tastatur, Undo, lokalem Entwurf und bestehendem Reader/Editor.
Lighthouse 13.5.0: acht tatsächliche Dialog-Snapshots in Dark/Light bei 1440/390 px,
jeweils Accessibility 100, keine fehlgeschlagenen numerischen Audits.

Zehn neue Mathe-/Logikbilder plus aktuelle Reader-Regressionsbilder unter
`docs/qa/study-writing-20261007`; historische Reader-Bilder erhalten.
[Bedienung](STUDY_WRITING.md) und echter
MacBook-/Unterrichtstest in `MANUELL_TESTEN.md`. Menschliches Unterrichtstempo
und native macOS-/Safari-Bedienung wurden nicht auf diesem Windowsgerät gemessen.
Das Arbeitspaket ist lokal integriert; keine neue GitHub-Veröffentlichung,
Server-/Desktopinstallation oder vollständige Phasen-/Release-Abnahme behauptet.
Die bereits installierte Veröffentlichung bleibt 0.1.20.

## 07.10.2026 – Angenommene Lernaufträge mit durchgängigem Arbeitskontext lokal integriert

„Jetzt lernen“ öffnet einen angenommenen Block/Zyklus mit seinem tatsächlichen
Kurs, Themen und Prüfungstermin. Quelle/Mitschrift, bestehende Kursnotizen,
Kursübungen und native Kurskarten bleiben im selben Auftrag verbunden. Die
sticky Modusleiste berücksichtigt ihre echte mobile Höhe; Seitenwechsel halten
PDF-Version und Leseposition. Entwürfe und Übungsantworten überleben den
Moduswechsel, gespeicherte Quellennotizen behalten ihre echte Notiz-ID. Die
mobile Übungsansicht nutzt einen eigenen Inhaltsfluss mit gemessenen 316 px
für Frage und Antwort bei 390 px Viewport.

Neue Focus-/Practice-Schichten trennen HTTP, Fachregeln und Datenzugriff. Kursfilter
wirken vor den Listenlimits; gemeinsame Versuchszähler ersetzen Abfragen je
Aufgabe. Ein gemeinsamer Timerzustand ersetzt doppelte Zustandslogik. Fremde
Notizen/Quellen werden anhand ihrer echten Kurs-ID vor Editor/Dateiladen geprüft.
Native GUID-/UniOSId-Bindungen erhalten Kurszuordnung nach Kursumbenennung;
die breitere Deck-Queue einschließlich Unterstapeln bleibt ehrlich bezeichnet.
Kontext-GETs verändern Auswahl, Karten, Reviewlog und FSRS nicht. Bestätigte
Runtime-Art, Restore-Schranke und unabhängig vom Browser-Onlinestatus abgefragter
lokaler Clientstatus erhalten lesbare Offline-Daten und sichere Schreibgrenzen.

1015 Pythonfälle bestanden, zwölf erwartete Skips (1000,70 s); alle 172 echten
Root-Testdateien genau einmal, keine rekursiven temporären Testverzeichnisse.
Alle 672 Frontendfälle in 75 Dateien bestanden (10,68 s). Ruff für 682 Pythondateien,
Mypy für 564 Quellen, vollständiges ESLint, TypeScript-Build, 61 i18n-Namespaces,
OpenAPI/Typen, SPDX für 1541 eigene Textdateien und Bundle-/PWA-Grenzen sind grün.
Der gezielte Browserabschluss besteht alle 15 Szenarien (28,52 s).

Der vollständige Browserumfang besteht 319 Szenarien in vier frischen,
sequentiellen Durchläufen (80/82/85/72; zusammen 654,17 s), ohne unerwartete
Ergebnisse, Skips, flakige Erfolge oder konfigurierte Retries. Alle 319 Test-IDs
decken den ursprünglichen Gesamtumfang exakt einmal ab. Zwei vorherige monolithische
Diagnoseversuche hatten je einen initialen JavaScript-Asset-Ausfall mit
`ERR_NO_BUFFER_SPACE`; die OS-/Netzwerkursache bleibt unbewiesen. Im dritten
Durchlauf wurde die mehrdeutige Galerieabfrage auf den echten Shell-Seitenkopf
begrenzt und dieser komplette Durchlauf erneut bestanden. Timeouts und
Sichtbarkeitsassertion bleiben erhalten; der Produktbuild wurde nicht verändert.

16 Hell-/Dunkel-/Desktop-/Mobilzustände erreichen Lighthouse 100; alle 354
numerischen Detailaudits einschließlich Gewicht null bestehen. Alle 16
Originalbilder selbst gelesen. URL/Pager/gerenderte PDF-Seite 12, 120 Seitenslots,
Tastatureingabe im Entwurfs-/Antwortspeicher und erreichbare Aktionen geprüft.
13 rohe CDP-Abbrüche bleiben mit Einzelbelegen erhalten: vier vollständig
gelesene PDF-Streams, vier bestätigte 204-Opened-Writes, vier bewusst ersetzte
Due-GETs und ein signalabgebrochener Notifications-GET mit erfolgreichem
Nachfolger. Unerklärte Abbrüche, HTTP-/Console-/Pageerrors, Warnungen und
Teardown-Abbrüche: null. 204 historische QA-Originalbilder nach Browserabnahme
per Hash erhalten. Finaler Produktbuild:
`5a5e62e97f5640d11d2b04e86ae91089b3f990d6a4bc717b325e3636d30505a4`.

Die getrennte Legacy-KI-Review-Reparatur ist bereits in Commit `b8a118f`
integriert: bestätigte historische Reviews nach nativer Löschung reparieren
nur die eindeutig vorhandene ursprüngliche SQL-Karte. Fehlende, mehrdeutige oder
neu gebundene Karten erhalten keine erfundene Historie. 81 Anki-Tests einschließlich
40 Bridge-Fällen bestanden; der vollständige Pythonlauf oben enthält die Reparatur.

Abnahme: `qa/focus-workspace-20261007/README.md` und dort `validation-summary.json`.
Nächster belegter Produkthebel: eine bereits gespeicherte Synthesenotiz neben
einem wechselbaren Reader/einer Referenznotiz, mit gemeinsamem Editorcontroller
und bestehendem `expected_revision`-/Merge-Pfad. Beziehungskandidaten mit 24er-Cap
und unpaginierte 50er-Rückverweise bleiben konkret dokumentierte Folgearbeit.
Physische MacBook-/Safari-/WebView-Gesten, signierte Installer und Live-Anki-
Desktop-Abnahme stehen aus; Docker-Engine nicht erreichbar. Keine privaten
Bestände migriert, kein Push/Deployment; das umfassende Produktmandat bleibt aktiv.

## 07.10.2026 – Mehrfenster-Entwürfe und Review-Recovery vollständig lokal integriert

Kartenentwürfe verwenden atomare gemeinsame Revisionen, haltbare Konfliktkopien
und unveränderliche Sendrequests. Zwei Fenster verlieren keine eigene Formulierung;
gesicherte Fassungen lassen sich bewusst übernehmen. Der Desktopdialog hält beim
Scrollen die Quelle sichtbar. Pairing schreibt vorher eine dauerhafte Sperre und
koordiniert POST/ACK; unklare Antworten lassen alte Writes gesperrt. Der sichere
UUID-Fallback verhindert einen App-Startfehler bei fehlendem `randomUUID`.

Die Offline-Reviewqueue hängt Bewertungen atomar an und entfernt beim ACK nur
die betreffende UUID. Nativer Scheduler und Receipt committen gemeinsam; die
SQL-Brücke erhält vorhandene Karten-IDs/FKs und dedupliziert Bewertungen. Native
GUID-Notiz-ID-Wechsel, SQL503/Restart und Löschung/Reimport der ursprünglichen
eigenen Karte verlieren den bestätigten Lernverlauf nicht. Historische Replay-ACKs
ohne native Karte liefern `card: null`; Ersatzkarten bleiben unberührt. Themen,
Wochenstand und weiterer abgeleiteter Fortschritt aktualisieren nach dem ACK sofort.
Die additive Migration `ff98c7da0320` wurde nur synthetisch geprüft.

Stand der Abnahme: 984 Pythonfälle bestanden, zwölf übersprungen (16:19 min).
Alle 628 Frontendfälle in 67 Dateien und 312 vollständige Browserabläufe
bestanden (8:58 min), ohne Fehler, Skips oder flakige Erfolge in der Browserabnahme.
Der gezielte Abschlusslauf besteht alle 13 Szenarien. Ruff, mypy für 566 Quellen,
TypeScript, vollständiges ESLint, i18n für 61 Namespaces, OpenAPI/Typen,
SPDX für 1513 eigene Textdateien sowie Build-/Bundle-Grenzen sind grün.
16 Hell-/Dunkel-/Desktop-/Mobilzustände
erreichen Lighthouse 100; 358 numerische Detailaudits einschließlich Gewicht null
sind ohne Befund, Warnung oder Laufzeitfehler. Alle 16 Originalbilder selbst geprüft,
Desktop-Quellentitel/Zitat/Link vor und nach Aufnahme kontrolliert. Finaler Build:
`be366997c9ab7483e688c9c5da59cc7f6fc752ef60dd2506abc85caf3b710566`.
Python, Browser, Lighthouse und Bundleprüfung verwenden denselben eingefrorenen
Produktstand. Historische QA-Originalbilder wurden nach dem Browserlauf erhalten.

Abnahme und konkrete Komponenten-/Speicherverträge:
`qa/study-recovery-20261007/README.md`. Physische MacBook-/Safari-/WebView-Abnahme
bleibt offen; Docker-Engine ist nicht erreichbar. Alte KI-Queue-Marker erhalten
nach nativer Kartenlöschung noch keine sichere historische SQL-Reparatur; diese
genaue Grenze ist als eigener Anschluss dokumentiert. Nächster Produkthebel:
„Jetzt lernen“ mit durchgängigem Kurs-/Themenkontext statt globaler Übersichten.
Neue Übungen vor ihrem ersten Versuch zunächst ehrlich kursbezogen anbieten.
Keine privaten Daten migriert, kein Push/Deployment; das umfassende Mandat bleibt aktiv.

## 07.10.2026 – Eigene Quellenkarten vollständig lokal integriert

Gespeicherte PDF-Markierungen und Reader-Recall erzeugen eigene Frage-/Antwort-
Karten mit haltbarem Entwurf, expliziter Freigabe und eingefrorener Quelle.
UUID-Replay, Einzeltransfer, native GUID und capability-geschützter Desktop-Agent
verhindern doppelte Übernahme bei verlorener Antwort oder unterbrochenem ACK.
Eigene Karten brauchen keine KI-Freigabe und verbrauchen kein KI-Kandidatenbudget.
Die additive Migration `ff97d2a90616` wurde ausschließlich synthetisch geprüft.

`/study/cards` gehört zum Kernbereich Lernen. Herkunft wird vor dem 200er-Limit
gefiltert; ein direkter Link holt auch eine ältere Karte gezielt. Mobile Links
umbrechen, gespeicherte Inhalte sind lesbarer Text. Bei Größenwechsel besitzt
nur der Kartendialog den Fokus; Kommentar und Recall-Position bleiben erhalten.
Aufdecken zeigt die native Antwort einmal, einschließlich ihrer eigenen Vorlage.
Tatsächliche Lighthousefehler bei Quellenlink-Styling und Suchschaltflächen-Namen
sind behoben; native Beschriftung bleibt auch in der mobilen Symbolansicht erhalten.

Alle 956 Python-Fälle bestanden, zwölf übersprungen (15:15 min). Alle 607
Frontend-Fälle in 65 Dateien bestanden. Ruff, mypy für 561 Quellen, TypeScript,
vollständiges ESLint, i18n für 61 Namespaces, OpenAPI/Typen und Build-Grenzen
bestanden. Dialog, aufgedeckte Session und eigener Kartenbereich erreichen
in zwölf Hell-/Dunkel-/Desktop-/Mobilzuständen Lighthouse 100 ohne fehlerhafte
Detailaudits, auch bei Gewicht null, und ohne Warnungen. Die vollständige
Browserabnahme: 303 bestanden in 8:08 min, keine Fehler, Skips oder flakigen
Erfolge. Frische Fake-Dienste und identischer Buildhash für Browser, Lighthouse
und Bundleprüfung. Der abschließende gezielte Lauf besteht alle vier Szenarien;
zwölf Originalaufnahmen der bedienbereiten Ansichten sind selbst visuell geprüft.
Die Aufnahme wartet auf den echten Animationsabschluss und verändert keine
Radix-Präsenzanimation. Produktbuild gegenüber der Gesamtprüfung unverändert.

Abnahme und Grenzen: `qa/manual-source-cards-20261007/README.md`. Mehrfenster-
Entwurfskoordination und die GUID-/idempotente SQL-Fortschrittsbrücke nach
ID-Wechsel oder SQL-Ausfall sind als nächste Korrekturen konkret dokumentiert.
Danach folgen fokussierte Lernarbeit, Konzeptcanvas und mathematisches
Notizrendering. Docker-Engine nicht erreichbar; physische MacBook-/WebView-
Abnahme offen. Keine privaten Bestände migriert, kein Push oder Deployment.
Das umfassende Mandat bleibt aktiv.

## 07.10.2026 – Gezielte Decksessions vollständig lokal integriert

Der native Anki-Scope wird vor der 100er-Auswahl gesetzt. 101 neue Karten in A
verdecken die einzelne Karte in B nicht mehr. Unterstapel, Tageslimits,
Lernschritte, Suspensions/Bury und Reihenfolge stammen aus dem offiziellen
Scheduler. Tageskategorien und eigener/gesamter Kartenbestand sind getrennt;
ein nativer Baum liefert alle Zähler. APIs, generierte Typen und UI sind synchron.
Fachregeln und Collection-Zugriff sind aus der HTTP-Schicht extrahiert.

Offline-Neustart berücksichtigt haltbare ausstehende Bewertungen, Online-Neustart
wartet auf Replay und holt eine frische Scoped Auswahl. Ein echter Before-ACK-
Request konnte zuvor nach dem Replay A001 erneut anbieten; die Korrektur liefert
A002 mit genau einem Receipt/Review. Wechselnde Stapel können keine neuere
Initialisierung abbrechen. Reviews behalten kompatible optionale Scope-IDs;
Receipt-Replay funktioniert auch nach Änderung/Löschung des früheren Scopes.

Alle 908 Python-Fälle bestanden, zwölf übersprungen (14:29 min), ebenso 565
Frontend-Fälle in 60 Dateien. Ruff, mypy für 548 Quellen, TypeScript, ESLint,
i18n, OpenAPI/Typen und Build/Bundle-Grenzen bestanden. Übersicht und echte
B-Sitzung: Lighthouse 100 ohne fehlerhafte Detailaudits, auch bei Gewicht null.
Konkrete Footerlink-/Shortcut-Kontrastfehler und falsche DOM-/Tab-Reihenfolge
sind korrigiert. Acht Originalaufnahmen in Hell/Dunkel und 1440/390 px geprüft.
Letzter gezielter Browserlauf: drei bestanden. Finale vollständige Integration:
299 bestanden in 8:01 min, keine Fehler, Skips oder flakigen Erfolge. Frische
Fake-Dienste; identischer Buildhash für Browser, Lighthouse und Bundleprüfung.

Details: `qa/study-deck-scope-20261007/README.md`. Der folgende konkrete
Quellenkarten-Vertrag stand in `MANUAL_SOURCE_CARD_PLAN.md` damals noch vor der
Umsetzung; der aktuelle Stand steht oben. Docker mangels Engine und physische MacBook-/WebView-Abnahme
bleiben offen. Keine Migration privater Bestände, Veröffentlichung oder Installer.
Das umfassende Mandat bleibt aktiv.

## 07.10.2026 – Reader-/Suchpakete vollständig lokal integriert

Endgültiger Quellstand: 891 Python-Fälle bestanden (zwölf übersprungen),
534 Frontend-Fälle in 54 Dateien und 293 Browserfälle bestanden. Browserlauf
7:48 Minuten, keine Fehler, Skips oder flakigen Erfolge; alle Fake-Dienste frisch
gestartet. Auch bestehende Offline-/FSRS-, Standby-/Übergabe-, Notizrevisions-,
500-Seiten- und Workspace-Restore-Abläufe bestanden. Recovery-Gate blieb aktiv.

Ruff, mypy für 544 Quellen, TypeScript, vollständiges ESLint, i18n, OpenAPI und
generierte Typen, Produktionsbuild und Bundle-Grenzen bestanden. Home/Reader-
Lighthouse je 100 ohne fehlerhafte Detailaudits, auch bei Gewicht null. Der
Buildhash ist identisch. Hell-/Dunkel-Desktop-/Mobilaufnahmen visuell geprüft;
eigene veränderte Aufnahmen aus dem finalen Lauf erneut geöffnet.
Synthetischer Prüfauszug: `qa/reader-workspace-20261007/validation-summary.json`.

Fertige Pakete lokal separat versioniert; kein Push, Installer oder Deployment.
Docker-Smoke mangels erreichbarer Engine und native MacBook-/WebView-Prüfung
offen. Das Mandat bleibt aktiv: gezielte Decksessions, dauerhafte Quellkarten,
Konzeptcanvas und mathematisches Notizrendering sind noch nicht implementiert.

## 07.10.2026 – Nächste Lernpakete konkret vorbereitet

Der bestehende Deckfehler ist im Quellcode belegt: globales 100er-Kartenfenster
wird erst im Client nach Deck gefiltert. `STUDY_DECK_SCOPE_PLAN.md` beschreibt den
noch nicht implementierten migrationsfreien Fix: echte Auswahl vor dem Fenster,
Anki-Unterdecks/Tageslimits, gebündelter Engine-Deckbaum statt Request pro Zeile,
kompatibler Review-/Outbox-Scope, Restore im finally und ehrlicher Offline-Cache.
Kernabnahme: 101 Karten in A und eine fällige Karte in B mit realer temporärer
Anki-Collection. Dieser Fehler ist durch das Reader-Paket noch nicht behoben.

`STUDY_WORKFLOW_NEXT_PACKAGES.md` trennt davon dauerhafte eigene Quellkarten,
fokussierte Lernblöcke und ein persistentes Konzeptboard mit stabilen IDs.
Jedes Paket benennt Nutzerszenario, Pain Point, Komponenten-/Speicherlogik,
Implementierungsgrenze und Abnahme. Bestehendes FSRS und Assessments werden
weiterverwendet. Freier Canvas und mathematisches Notizrendering bleiben offen;
das umfassende Mandat ist nicht abgeschlossen.

## 07.10.2026 – Lokaler Testtransport und echte Reader-Accessibility

Dev/Preview verwenden für HTTP-Loopback-Ziele einen gemeinsamen begrenzten
Keep-Alive-Agent. Vites bisheriger Proxy setzte je Anfrage Connection: close;
einzelne Recovery-502 mit EADDRINUSE waren belegt, vollständige Porterschöpfung
hingegen nicht. Recovery-Gate, Timeouts und fachliche Fehler werden nicht
abgeschwächt. Fünf netzwerkfreie Konfigurationschecks sowie frische Browserläufe
mit 21 und 28 Fällen bestanden. Fehlerdiagnostik erfasst auch Console-Fehler und
dedupliziert wiederholte Meldungen.

`audit_pwa.py --path /material/1` prüft jetzt lokale Unterseiten; ungültige Pfade
werden zurückgewiesen, Reports bleiben getrennt und die alte Home-CLI kompatibel.
Ruff und gezieltes mypy bestanden. Lighthouse 13.5.0 am endgültigen Build:
Home 100 und tatsächlicher Reader 100, keine numerischen Audits unter 1 auch bei
Gewicht null, keine Runtimefehler/Warnungen. Beide Originalaufnahmen wurden
visuell geöffnet. Buildhash und Details: `qa/reader-workspace-20261007/`.

Der finale Build hält alle Bundle-Grenzen ein: 236 eindeutige Precache-Assets,
16.459.728 Bytes roh und 4.432.817 Bytes gzip, innerhalb 18 MiB/5 MiB. Alle
Einzelbudgets bestanden. Docker-CLI ist vorhanden, die lokale Engine nicht
erreichbar; der Docker-Smoke ist deshalb offen. Kein Container-/Volume-Start,
keine Installation, Live-Migration oder Veröffentlichung vorgenommen.

## 07.10.2026 – Sichtbare Benachrichtigungszahl im zugänglichen Namen

Lighthouse meldete trotz Score 100 einen ungewichteten Fehler: die sichtbare
Badge-Zahl fehlte im Namen des Benachrichtigungsbuttons. Der de/en-Name enthält
jetzt dieselbe Zahl einschließlich „99+“; bei null bleibt er ohne Zahl. Der Tooltip
nennt weiterhin die genaue Anzahl. Sechs Komponentenfälle und die zugehörigen
acht Notification-/zwei Shell-Browserfälle bestanden; Dialogtitel bleiben gleich.
Alle 28 gezielten Browserfälle und der 534-Fälle-Frontend-Gesamtlauf sind grün.
Die abschließende Lighthouse-Prüfung kontrolliert auch ungewichtete Audits.

## 07.10.2026 – Reader-Randfälle aus unabhängiger Gegenprüfung

Auf Seite 1 konnte der mobile Rückfokus einen versteckten Button im geschlossenen
Seitensprung treffen. Er fokussiert jetzt dessen sichtbares, tastaturbedienbares
Summary ohne Scrollen. Auf 1.920 px blieb die PDF-Breite trotz Split bei 760 px;
ein alter Anker konnte nach Seite 100/Mobil wieder Seite 80 öffnen. Gemessene
unveränderte Fit-Geometrie, direkte Navigation und echtes Scrollen verwerfen
solche Anker. Eine wirkliche Breitenänderung behält ihre Positionskorrektur.

Vier Browserregressionen prüfen Einseiten-/Zweiseiten-PDF, 80→100→Mobil und
No-op-Split-Taste mit anschließendem Scrollen. Die alten Builds scheiterten
belegt an Fokus, Seite 80 statt 100 und einer Seitenanteilabweichung von 0,751.
Alle 28 gezielten Reader-/Notification-/Shell-Browserfälle bestanden am Fix.

Ein fehlgeschlagener initialer Render-Layer bleibt jetzt als Fehler sichtbar,
auch nach einem 760→900→760-Zoomburst oder verspätetem Callback. Nur ein wirklich
fertiger Ersatz löscht den aktiven Fehler; überholte Ersatzfehler werden ignoriert.
Zwei gezielte Regressionen scheiterten vor dem Fix, 15 Renderfälle bestanden danach.
Keine automatischen Retry-Schleifen oder doppelten Layer-Keys.

Gesamter Frontend-Lauf: 534 Fälle in 54 Dateien bestanden. Ein instabiler
Neuanlagen-Test wartete auf den Server-ACK-Render, bevor der lokale Fehlerindikator
im Folgerender vorlag; er wartet jetzt auf den tatsächlichen Fehlerzustand und
prüft zusätzlich die verweigerte Draft-Löschung. Dafür war kein Produktfix nötig.
Typecheck, vollständiges ESLint, i18n, Build und Bundle-Grenzen bestanden.

## 07.10.2026 – Vollständige isolierte Backend-Abnahme

Der korrigierte Gesamtlauf bestand: 891 Python-Fälle, zwölf übersprungen,
13:33 Minuten. Die Windows-Langpfadregressionen, globale Notizauflösung und der
echte isolierte Zwei-Dienst-/Standby-Ablauf sind enthalten. Ruff bestand und
mypy meldete keine Fehler in 544 Quellen; die Quellenliste stammt aus Git und
umgeht unzugängliche alte Testordner. Schema und generierte API-Typen sind aktuell.
Die Browser-Abnahme folgt am endgültigen Reader-/Accessibility-Build separat.

## 07.10.2026 – Cmd+K findet alle sieben Inhaltstypen

Die Palette kappte PDF-/Markierungstreffer vor eigenen Notizen auf sieben und
ließ Kursnotizen, Jots und Clips aus. Ein begrenzter Round-Robin berücksichtigt
jetzt alle sieben API-Typen, erhält deren eigene Rangfolge und füllt freie Plätze
auf. Typisierte Ziele navigieren zu Notizen, Quellen und externen Ankündigungen.
Ein eigener Suchhook ordnet Antworten ihrer Eingabe zu; Debounce, Abbruch und
verkürzte Suchtexte lassen keine alten Treffer wieder erscheinen.

20 gezielte Unit- und drei Browserfälle bestanden; sie sind Teil der 525 Unit-
und 21 fokussierten Browserfälle am gemeinsamen Stand. Typecheck, ESLint und
i18n bestanden. Tastaturbedienung, viele PDF-Treffer, alle Typen, identische IDs
und verspätete Antworten geprüft. Keine API- oder Dependency-Erweiterung.
Weiterführende Lernpakete mit Pain Point, Konzept und Codegrenzen stehen in
[STUDY_WORKFLOW_NEXT_PACKAGES.md](STUDY_WORKFLOW_NEXT_PACKAGES.md).

## 07.10.2026 – Paket 2/3: Reader als zusammenhängender Lern-Arbeitsbereich

Der modale Desktop-Reader wurde zum nicht modalen, per Pointer und Tastatur
verstellbaren Split mit Markierungen, Mitschrift und Wiederholen. Mobil bleibt
der fokussierte Bottom-Sheet. Kompakte Werkzeugleiste, Seiten-Direktsprung und
eine schwebende Quellaktion halten den Stoff sichtbar. Exzerpte erhalten einen
Link zur genauen Fassung und Seite; bestätigte Fragen verdecken die Antwort bis
zum Aufdecken. Das ist noch keine dauerhafte FSRS-Lernkarte.

Gesten und Render-Ebenen sind getrennt: Pinch bündelt Änderungen pro Frame,
Two-Finger-Pan bewegt das Dokument, Alt-Swipe wechselt pro Momentum-Burst eine
Seite. Ein fertiger Canvas bleibt sichtbar, bis der ruhende Ersatzrender mit
Text/Links/Markierungen bereit ist. Gespeicherte Seitenanteile erhalten Seite 80
auch bei Split- und Desktop-/Mobilwechsel; Schließen des mobilen Panels fokussiert
sichtbare Reader-Steuerungen ohne Sprung zum weit entfernten Auslöser.

Reader und Voll-Editor teilen laufende Quellen-Notizspeicherungen. Remounts oder
Navigation erzeugen innerhalb derselben App-Sitzung keine zweite Create-Anfrage;
ein älteres ACK löscht keine späteren Eingaben. Gesperrter Gerätespeicher wird
offen angezeigt. Nach vollständigem Reload/verlorenem Server-ACK besteht noch
keine garantierte Backend-Idempotenz. Der Desktop sperrt native Kontextmenüs
nicht mehr global; native WebView-/MacBook-Hardwareprüfung bleibt offen.

525 Vitest-Fälle in 53 Dateien, 21 gezielte Browserfälle, Typecheck, ESLint, i18n,
Produktionsbuild und alle Bundle-Grenzen bestanden. Die Browserfälle umfassen
synthetische 120-Seiten-PDFs, Seite 80, Auszüge/Quellenlinks, konkurrierende ACKs,
responsive Speicherung, fertige Render-Ebenen und alle vier Hell-/Dunkel-
Desktop-/Mobilaufnahmen. Aufnahmen wurden visuell geöffnet. Vollständige
Integration und Accessibility werden separat protokolliert. Kein FPS- oder
Lernzeitgewinn behauptet, keine neue Dependency.

Die vier geforderten Pakete, Pain Points, Komponentenlogik und Codepfade stehen
in [READER_STUDY_WORKSPACE.md](READER_STUDY_WORKSPACE.md); geprüfte Primärquellen
und Lizenzentscheidungen in [READER_OPEN_SOURCE_BENCHMARK.md](READER_OPEN_SOURCE_BENCHMARK.md).
Das umfassende Codebase-/Produktmandat bleibt aktiv.

## 07.10.2026 – PWA-Abhängigkeiten und messbare Bundle-Grenzen

Workbox nimmt zusätzlich `.mjs`, `.woff` und `.ttf` auf. Vorher fehlten dem kalten
Offline-Cache der PDF-Worker sowie Codicon/Fira-Code-Schriften. Der neue Browserfall
öffnet nur Heute, trennt das Netz und lädt diese Dateien erfolgreich aus dem Cache,
bevor Reader oder Editor erstmals geöffnet wurden. Bestehende Offline-Leseabläufe
bestanden ebenfalls. Das ist keine Behauptung, dass ungeöffnete PDFs offline liegen.

Der Bundle-Gate prüft zusätzlich NotesPage, Monaco-Editor/Sprachmodule/Worker und
die gesamte deduplizierte Precache-Nutzlast einschließlich aller Worker/Schriften.
Am geprüften Build: 236 eindeutige Assets, 16.458.715 Bytes roh und 4.432.562 Bytes
gzip, innerhalb 18 MiB/5 MiB; alle einzelnen gzip-Budgets bestanden. Keine neue
Dependency, API-Cache-Regel oder Inhaltsmigration. Build, Typecheck, Lint und
i18n bestanden; Frontend-Gesamtlauf inzwischen 525 Fälle.

## 07.10.2026 – Globale Notizverknüpfungen statt gefiltertem 50er-Katalog

Wikilinks lösten vorher ausschließlich gegen die aktuell sichtbare Notizseite
auf. Der neue API-/Service-/Repository-Pfad liefert globale, eindeutig geprüfte
Zielmetadaten, maximal 32 Titel mit je 200 Unicode-Zeichen pro Batch. Frontend-
Resolver begrenzen echte parallele Requests auf vier; Abbruch, Offline-Cache,
Mehrdeutigkeit und Umbenennungen sind berücksichtigt. Remote-Vorschläge im
Markdown-/Rich-Editor ersetzen weder Dokument noch Undo-Historie. Quellenlinks
navigieren bei normalem Klick zur genauen App-Route; modifizierte Klicks behalten
das native Linkverhalten.

Eingehende Wikilinks verwenden eine gemeinsame Titelprojektion je Transaktion.
Der Zähltest belegt drei SELECTs beim Refresh mit einer und 80 Quellen. Die
Körpersuche bleibt linear und ist als Folgeoptimierung dokumentiert.

33 gezielte Python- und 17 Frontend-Fälle bestanden, ebenso Typecheck, Lint,
OpenAPI-/Typprüfung und der Browserablauf mit 53 Notizen: Quelle außerhalb der
ersten 50, Filter/Paging, Unicode, doppelter Titel und zwei Umbenennungen. Die
Integration wird separat geprüft. Keine neue Datenbankmigration oder Dependency.

## 07.10.2026 – Prüfgrundlage: isolierter Bootstrap und Windows-Langpfade

Pytest, Fake-Server und OpenAPI-Exporter erzeugen keine implizite Standard-App
mehr. Fake-Settings verwenden keine `.env`, keine privaten Profil-/Keychain-
Resolver und keine externen Dienste; Alembic erhält dieselben isolierten
Einstellungen. Standby/Übergabe übernehmen sichere Fake-Settings. Der Exporter
ignoriert auch geerbte Prozess-Settings und konstruiert die Contract-App explizit.
Sechs frische Subprocess-Regressionen und zwei Schema-Isolationsfälle bestanden;
Ruff, gezieltes mypy und unveränderte OpenAPI-/Typprüfung bestanden.

Der echte Diensttest startet weiterhin den produktiven Bootstrap und Uvicorn,
jetzt aus einer bytegleichen Runner-Kopie in einer synthetischen Staging-Wurzel.
Die Kindprozesse erhalten nur explizite Test-Settings; Guards verhindern private
Konfiguration, System-Credentials und externe Verbindungen. Ein zweiter echter
Dienst bleibt lesend (423 bei Schreibversuch), Datenbank und gemeinsame Dateien
bleiben unverändert. Alle fünf Dienstfälle bestanden, auch mit vergifteten
geerbten Proxy-/Connector-Variablen. Der erste isolierte Gesamtlauf hatte wegen
des geerbten Factory-Flags noch einen Fixture-Fehler; der korrigierte Gesamtlauf
wird separat protokolliert.

Beim ersten Gesamtlauf scheiterten 20 bestehende Python-Fälle unter langen
Windows-Testpfaden. Dieselben Fälle bestanden mit kurzem Pfad vor dem Source-Fix.
Sieben zusätzliche Kurz-/echte Langpfadregressionen reproduzierten den Defekt:
Lesen, Metadaten-Dedup und Rebuild benutzten bisher keine nativen Langpfade.
`files/sidecars.py` und `files/store.py` greifen nun konsequent über `native_path`
zu; gespeicherte relative Archivpfade bleiben portabel. 16 gezielte Fälle,
Ruff und mypy bestanden. Der isolierte Gesamtnachlauf läuft separat.

Einschränkung der früheren Prüfbehauptung: Vor dieser Korrektur konnten ein
Modulimport und der echte Dienststart lokale Einstellungen laden. Synthetische Inhalte
beweisen deshalb keine vollständig isolierte Initialisierung. Private Inhalte
wurden nicht absichtlich betrachtet oder als Fixtures übernommen. Die neue
Regression verbietet ausdrücklich private Resolver, `.env` und Keychainzugriffe.
Keine echte Datenmigration oder Installation vorgenommen.

## 07.10.2026 – Paket 1: Sofort löschen / aufräumen

Sieben nachweislich ungenutzte Frontend-Quellen entfernt: sechs historische
Stylesheets und den alten Navigationshelfer, zusammen 4.011 Zeilen / 109.004 Bytes.
Importgraph einschließlich Lazy-Imports, CSS-Imports, Sprach-Globs und
Packaging-/Prüfwerkzeuge abgeglichen; aktive Komponenten und optionale Module
bleiben erreichbar. Die drei Design-Dokumente zeigen nun auf aktive CSS-Layer.
Keine Bundle-Ersparnis aus bereits unimportierten Quellen behauptet.

Bereichsinventur und belegte Folgeprobleme in `CODEBASE_AUDIT_20261007.md`:
Wikilinks hängen am gefilterten 50er-Index, eingehende Links werden beim Speichern
quadratisch neu geprüft, Sammlungen begrenzen spät, Kontextmenüs sind im Desktop
global gesperrt. Diese weiteren Befunde sind durch diesen Bereinigungs-Commit
noch nicht behoben. Das umfassende Nutzerziel bleibt aktiv.

Geprüft am gemeinsamen Arbeitsstand: TypeScript, vollständiges ESLint, i18n,
Produktionsbuild und 460 Vitest-Fälle bestanden; keine fehlenden lokalen Imports,
`git diff --check` bestanden. Bestehende PDF-/Offline-Markierungsabläufe und
500-Seiten-Rendering im Browser bestanden. Neue Reader-Abläufe gehören zum
nächsten Paket und sind noch in Korrektur/Abnahme. Keine echten Studiendaten,
Installation, Live-Migration oder Veröffentlichung.

## 05.10.2026 – TXT-Dateien im PDF-Leser

TXT erhält eine separate, pro Quellhash unveränderliche PDF-Ansicht ohne neue
Abhängigkeit oder LibreOffice. Eingebaute Unicode-Schrift, Wort-/Zeilenumbruch,
Seiten, UTF-8/BOM, UTF-16/BOM und Windows-1252. Originale bleiben bytegetreu.
Binärdaten werden abgelehnt; Eingabe 1 MiB, Ausgabe 250 Seiten und Verarbeitung
15 s begrenzt. Erzeugung nur auf dem schreibenden Host; vorbereitete Ansichten
auch lesend abrufbar. Kurse und Hochschulunterlagen bieten den Leser anhand des
Originaldateinamens an, auch bei abweichendem Anzeigenamen/MIME.

21 gezielte Backendfälle einschließlich bestehender PDF-/Office-Markierungen
bestanden, ein Vitest-Fall und fünf Browserabläufe bestanden. TXT-Zuordnung,
Öffnen im echten Reader, Textlayer, Originaldownload und mobile Breite geprüft.
Desktop-/Mobilaufnahmen selbst angesehen. Ruff, gezieltes mypy, ESLint und
Frontend-Build mit Typecheck bestanden. Initiale Sandbox-Läufe scheiterten an
gesperrten Testordnern bzw. nativen Unterprozessen; frische isolierte Testordner
und freigegebene Build-Ausführung anschließend erfolgreich. Kein Schemawechsel.

Vorheriger GitHub-Lauf: Backend und React/Browser bestanden; GLib-Job bekam keinen
gehosteten Runner, Docker dadurch übersprungen. Nur fehlgeschlagene Jobs erneut
angefordert; kein Quellfehler aus diesem Infrastrukturabbruch abgeleitet.
Serverimage `unios-server:0.1.19-txt-reader-20261005` aktiv: alle Python-/Schema-
Quellen vor/nach dem Paket verglichen, isolierter Linux-Smoke ohne Netzwerk oder
echte Datenvolumes bestanden (Unicode, Pagination, Cache, bytegetreues Original).
Health nach Wechsel erfolgreich; kompatibler Vorgänger `0.1.19-sqlite-lock-20261005`
bleibt für Rollback erhalten. Kein echter Bestand gelesen oder migriert.
Kein neuer nativer Installer: Server unterstützt TXT auch für vorhandene direkte
Material-/Suchlinks. Neue „PDF öffnen“-Links der lokalen Desktop-Oberfläche
benötigen das nächste regulär geprüfte App-Paket. GitHub-Wiederholung weiterhin
wegen Runner-Zuteilung wartend; erfolgreich geprüfter TXT-Paketstand wird separat
versioniert.

### 04.10.2026 – Alpha-Härtung: Gesamtprüfung und Release-Gate

Erste vollständige GitHub-Matrix am Commit `51254c3`: Docker und GLib bestanden;
Linux/macOS-Typprüfung fand einen ungeschützten Zugriff auf die Windows-Konstante
`CREATE_NO_WINDOW`. Plattformverträglichen Zugriff korrigiert, Linux-/macOS-mypy
und sechs lokale Parser-/Importfälle bestanden. Neuer kompletter Lauf erforderlich;
aus dem ersten Upload wird keine bestandene Plattformmatrix abgeleitet.

Atomare KI-Reservierungen, begrenzte Kurs-/Notizlisten, Parsergrenzen und
inkrementeller Corpus integriert. Die Budgetanzeige unterscheidet tatsächlichen
Verbrauch und noch reservierte Tokens. Materialsuche läuft serverseitig inklusive
Dateinamen; direkte Quellenlinks umgehen gespeicherte Filter und fokussieren das
Zieldokument. Leere Suchergebnisse erhalten die passende Meldung. Versionsarchive
werden separat geladen; neue und alte Originale bleiben bytegetreu abrufbar.

Vollständiger Python-Lauf: 845 bestanden, zwölf übersprungen; ergänzend elf
gezielte Fälle inklusive neuer Release-Gates und Windows-Prozessbaum bestanden.
425 Vitest-Tests, vollständiger Browserlauf 257 bestanden; abschließend zwölf
Kurs-/Katalog-/Kontextfälle am letzten Build bestanden. Ruff, mypy für 529 Dateien,
TypeScript, ESLint, OpenAPI und i18n geprüft. Alle 44 Aufnahmen elf Hauptabläufe
auf Desktop/Mobil in Hell/Dunkel selbst angesehen. Accessibility 100, Legacy-PWA
100; Bundlebudgets eingehalten. 20 synthetische Browsermissionen ohne Fehler oder
Abbruch, p50 304 ms / p95 1.014 ms; keine menschliche Studie oder Beschleunigungsquote.

Installer-Paketbau verlangt künftig vollständige erfolgreiche Qualitätsmatrix am
exakten Quellcommit. Aktuelle Plattform-/Betriebsübersicht und praktische Abnahme
für frische Geräte, Upgrade, Restore und externe Testwoche dokumentiert. Lokaler
Docker-Smoke mangels Daemon und echte OCR mangels Sprachdaten offen. Keine neue
Installation, kein veränderter Alpha1-Tag, keine Live-Migration. Vor letzterer
weiterhin frischer vom Nutzer geprüfter Snapshot nötig. Prüfprotokoll und
synthetische Rohdaten: `docs/qa/alpha-hardening-20261004/README.md`.

### 04.10.2026 – Prüfbericht: Importhärtung und inkrementeller Corpus

Downloads, Extraktion und Corpus-Vorbereitung laufen vor der Schreibtransaktion.
Originale werden pro Datei veröffentlicht; fehlgeschlagene Extraktion behält das
Original und meldet den Fehler. Moodle liest begrenzte Streams (512 MiB) und
akzeptiert keine komprimierte Downloadantwort. Andere Connectoren bleiben bei
ihrer bisherigen Bytes-Schnittstelle; dort greift die Grenze nach Download.

Dokumentenparser läuft als eigener Kindprozess mit 1 GiB Speichergrenze,
45 Sekunden Wandzeit, begrenzter Ausgabe und ZIP-Ausdehnung. Windows-JobObject,
POSIX-Limits, Abbruch, Fortschritt und gebündelter Sidecar-Einstieg vorbereitet.
Das begrenzt Ressourcen, isoliert aber keine Dateisystem-/Netzwerkrechte und ist
keine Sicherheits-Sandbox. Office- und große PDF-Auswertung erfolgen außerhalb
der langen Import-Schreibtransaktion; Originalablage/Veröffentlichung bleiben
kurze atomare Transaktionen und können bei großen Dateien weiterhin I/O kosten.

Persistente Quellengeneration pro Fassung erlaubt Wiederverwendung unveränderter
historischer Chunks/Outlines. Nur neue Fassung bzw. korrigierter OCR-Text wird neu
verarbeitet. Vorbereitung in begrenzten temporären JSONL-Dateien; Generation vor
Veröffentlichung erneut prüfen. Gleichzeitige Quellenänderung verwirft Staging.
74 Import-/Moodle-/Desktop-/Corpus-Fälle und 29 abschließende Korrekturfälle
bestanden. Migration `ff96c1980515` vorbereitet, kein echter Bestand migriert.

Echte Pipeline mit 56 erfundenen PDFs / 775 Seiten gemessen: Import 48,49 s,
500-Seiten-Hintergrundindex 1,39 s, Corpus 46,64 s, geprüfter Snapshot 0,15 s,
Restore-Staging 0,04 s. 15 Suchfragen fanden erwartete Quellen; kein Beweis für
große reale Dateien oder manuelle Suchqualität. OCR-Sprachdaten lokal fehlen.
Rohdaten, Grenzen und Browseraufnahmen unter `docs/qa/alpha-hardening-20261004/`.

Paketbau verlangt vollständige erfolgreiche CI-Matrix am identischen Commit.
Zwei Gate-Tests verhindern Freigabe bei Teilmatrix, falschem Commit oder
übersprungenen Jobs. Frische Geräte und externe Woche ausdrücklich offen;
aktueller Einstieg `docs/RELEASE_READINESS.md`. Branchschutz nur lesend geprüft.

### 04.10.2026 – Prüfbericht: begrenzte Listen und lazy Versionshistorie

Materialien/Notizen standardmäßig 50, maximal 100 Einträge je Anfrage. Filter
vor SQL-Limit; deterministische Sortierung und Gesamtzahl. Notizkursnamen über
Join statt einzelner Kursabfragen. Kursantwort enthält nur aktuelle Fassungen;
Versionshistorie wird beim Aufklappen separat in Seiten zu 20 geladen. React
rendert nur die aktuelle Seite, behält Filter/Seitenposition und lädt Suchfilter
nach kurzer Eingabepause. Vorherige Ergebnisse bleiben innerhalb desselben
Kurses/Notizfilters während des Nachladens sichtbar. Gezielt: vier Backendfälle,
zwei Browserabläufe, Typecheck/Build/ESLint/i18n, 425 Vitest-Tests und mypy grün.
OpenAPI und generierte API-Typen erneuert; kein echter Bestand verändert.

### 04.10.2026 – Prüfbericht: atomare KI-Budgetreservierung

Monatsbudget wird vor Anbieter-I/O in einer kurzen SQLite-Schreibtransaktion
dauerhaft reserviert. Gleichzeitig laufende Anfragen teilen sich einschließlich
ausstehender Reservierungen dieselbe Obergrenze. Abgelehnte/abgeschnittene
Antworten buchen gemeldeten Verbrauch einschließlich Cache- und Fallback-Tokens.
Unbekannt abgerechnete Netzwerkfehler/Prozessabbrüche geben das Budget nicht
automatisch frei. SDK-Wiederholungen abgeschaltet; konservative Reservierung
enthält Systemtext, Framing und beide Fallback-Versuche. Status zeigt tatsächlichen
Verbrauch und gesperrte Reservierungen getrennt. Reproduktion: zwei parallele Anfragen à 601 bei Limit 1.000 lassen
nur eine zu. 34 Adapter-/API-/Reservierungstests, danach 20 abschließende Tests
inklusive drei weiterer Anbieterfälle bestanden; Ruff und gezieltes mypy grün.
Migration nur vorbereitet (`ff95b0879404`), echter Bestand nicht verändert.

### 04.10.2026 – Product Quality Pass: Kontext, Feedback und mobile Bedienung

Die 25 Qualitätsziele sind in `docs/UX_QUALITY.md` mit Umsetzung bzw. vorhandenem
geprüftem Ablauf abgeglichen. Explizite UI-Zustände erhalten PDF-Seite/Zoom/Suche,
Kursfilter, Such-URL, Kalenderwoche, Editorcursor und noch nicht abgeschickte
Übungsantworten. Sitzungsdaten begrenzt; Cursor und Antworten nur im RAM,
keine automatische Erfassung von Passwörtern oder Kalenderlinks. Erfolgreiche
Gerätekopplung leert den Kontext. Der einfache Standard bleibt bei vier Bereichen.

Kartenbewertungen schalten nach dauerhaftem lokalem Speichern weiter; HTTP blockiert
keine weitere lokale Bewertung. Bestätigungen entfernen nur ihre Review-UUID.
Gemeinsame Speicher-/Fehler-/Feldanzeigen, Zeilen-Skeletons, Quellenvorschau mit
Suchmarkierungen, Fokusmodus, optionale kompakte Abstände und begrenztes Kurs-
Prefetch ergänzt. Benachrichtigungen nach Kurs gruppiert und priorisiert;
Empfehlungen erklären vorhandene Daten, Offline-Hilfe nennt tatsächliche Grenzen.

44 Aufnahmen der elf Hauptabläufe in Hell/Dunkel bei 1440/390 px selbst angesehen.
Dabei schwebenden Empfehlungshinweis unter den Erklärungstext gesetzt und störenden
Überschriftsfokusrahmen entfernt. Touch-Prüfung fand eine unsichtbar positionierte
Notizvorschau: jetzt als Portal am unteren Bildschirmrand. Integration fand zu
frühen Fokus beim ersten Seitenaufruf und gespeicherten Kursfilter vor gezielter
PDF-Work-Anfrage; korrigiert. PDF-Markierungsleiste bleibt beim Zurückkehren geöffnet.

Python: 827 bestanden, 12 übersprungen. Vitest: 425 bestanden. Ruff, mypy für
513 Dateien, Typecheck, ESLint, i18n, OpenAPI und Bundle-Budgets bestanden.
Gezielte abschließende Browser-Nachprüfung: 23 bestanden. Vollständiger Browser-
Abschlusslauf: 254 bestanden in 10,3 Minuten. Lighthouse Accessibility 100,
Lighthouse-11-PWA-Prüfung 100 am gebauten Frontend mit Fake-Daten. 20 synthetische
UX-Missionen bestanden, null Testfehler/Abbrüche; p50 329 ms, p95 1127 ms inklusive
Navigation und Assertions. Bericht mit einzelnen Klickzahlen unter `missions.json`;
keine Nutzerstudie, keine pauschale Geschwindigkeitszahl.

Keine neue Abhängigkeit oder Datenbankmigration. Docker-Smoke lokal mangels laufendem
Daemon nicht ausführbar; native Geräte-, SSO- und Bildschirmtastaturprüfung bleibt
manuell. Nachweise unter `docs/qa/ux-quality-20261004/`. Der veröffentlichte
Alpha1-Installer, installierte App und VPS wurden durch diesen Pass nicht verändert.

### 04.10.2026 – Alpha-Fokus: vier Hauptbereiche und Editor-Stabilität

Neuer einfacher Standard auf Desktop/Handy: Heute, Kurse, Lernen, Termine;
Mobil ergänzt Mehr. Leere Bibliothek und Kursverknüpfungen verborgen.
Gespeicherte Layouts, ausgeblendete Bereiche und manuelle Kursreihenfolgen bleiben
erhalten; Zurücksetzen übernimmt den neuen Standard. Technische Werkzeuge liegen
unter einem aufklappbaren Abschnitt in Weitere Bereiche, Studienwerkzeuge und
Räume bleiben direkt erreichbar. Plattformgerechte Strg-K-/⌘-K-Anzeige.

Wiederholte Notiztests deckten einen echten Tiptap-Lebenszyklusfehler auf:
Beim Wiederherstellen lokaler Entwürfe nutzten Leser/Editor eine bereits zerstörte
Instanz. Effekt- und Renderzugriffe abgesichert, keine Entwürfe automatisch
überschrieben. Fünf Notizabläufe dreimal wiederholt: 15 bestanden.

Vollständiger Integrationslauf: 229 Playwright- und 413 Vitest-Tests bestanden;
Python-Abnahme siehe Corpus-Paket. Typecheck, ESLint, i18n, OpenAPI und Bundle-
Budgets bestanden. 20 Aufnahmen der Hauptseiten und Weitere Bereiche in Hell/Dunkel
bei 1440/390 px selbst angesehen. Dabei versetzte Kalenderpfeile gefunden,
mobil in einer gemeinsamen Zeile ausgerichtet und fünf Kalender-/Sichtprüfungen
erneut bestanden. Lighthouse Accessibility der gebauten Startseite: 100.

Feature Freeze für neue sichtbare Bereiche in Roadmap dokumentiert. Screenshots,
Nachweise und Grenzen unter `docs/qa/alpha-focus-20261004/`; keine native
Betriebssystemmatrix vorgetäuscht. Docker-Smoke lokal mangels laufendem Daemon
nicht ausführbar. Bestehende Alpha1-Installer/Tag, installierte App und VPS bleiben
auf ihrem veröffentlichten Stand; keine neue Migration. Dieser Ausbau ist der
nachfolgende Entwicklungsstand, siehe `docs/ALPHA_FOCUS.md`.

### 04.10.2026 – Agent Corpus: gezielte Auswahl und Million-Chunk-Prüfung

Bestehende acht Gateway-Werkzeuge um sechs Ansichten, begrenzte Chunks je
Dokument, exakte Dubletten, nachvollziehbare Treffergründe und Corpus-Revision
erweitert. REST, CLI und MCP nutzen dieselben Fachregeln. Kurzlebiger Cache
bindet Agent, Rechte, Revision und relevante Lese-/Workflowzustände; vor Ausgabe
werden Rechte, aktuelle Fassungen und ausstehende Änderungen erneut geprüft.
Keine neue Datenbankmigration oder Abhängigkeit.

Context Packs ergänzen extraktive Semesterüberblicke und ausschließlich
freigegebene Lernindikatoren. Python-AST liefert qualifizierte Symbole und
syntaktische Aufruferkandidaten. Metadaten-Platzhalter werden weder als gelesene
PDF-Seiten noch als Beleg für identischen Dateiinhalt behandelt. Grenzen bei
Semantik, Mailthreads, Codeauflösung und Budgets stehen ausdrücklich in
`docs/AGENT_CORPUS_SCALE.md`; keine modellgenaue Tokenzählung behauptet.

Reproduzierbarer künstlicher Bestand: 50.000 Dokumente, eine Million aktuelle
und 50.000 historische Chunks, 120 Kurse, zehn Semester, 500 Suchfälle.
Recall@5/20 100 %, MRR 0,999, keine gesperrten oder alten Suchtreffer;
ausgewählte Abruf-Hashes stimmen. Allgemeine Abfrage 13,69 → 3,22 Sekunden
(rund 76,5 % schneller). Kalter p95 leicht höher; keine pauschale App-Zahl.
Messwerte und Grenzen unter `docs/benchmarks/agent-corpus-20261004.json`.

75 Corpus-/Cache-Tests und vollständiger Python-Lauf: 827 bestanden, 12
übersprungen. Zusätzliche Katalogprüfung nach abschließender Erklärungskorrektur
bestanden. Ruff, mypy für 514 Dateien, OpenAPI-Export und generierte Typen geprüft.
Windows-Testdaten benötigen wegen der Pfadlänge ein frisches kurzes temporäres
Verzeichnis; keine echten Nutzerdateien oder Hochschulkonten verwendet.

### 04.10.2026 – README und Alpha 1 / 0.1.19

Deutsche und englische README vollständig auf den aktuellen Server-/Clientbetrieb,
Blockeditor und Lernarbeitsplatz ausgerichtet. Neun neue echte Screenshots mit
erfundenem Demo-Semester: Heute Hell/Dunkel, Kurs, PDF, Editor-Fokusmodus,
Lernen/Karteikarten sowie 390-px-Ansichten. Nach vollständigem Laden aufgenommen,
visuell geprüft, keine Browser-Ausnahmen. Reproduktionsskript und Provenienz
liegen unter `scripts/readme_screenshots.mjs` / `docs/readme/alpha-0.1.19/`.

Alpha-Vorabversion `v0.1.19` mit Windows-NSIS/MSI (bestehende Installation geprüft),
macOS-Apple-Silicon-DMG und Linux-DEB/AppImage vorbereitet; letztere beiden
Plattformjobs im Paketlauf `37197766239` erfolgreich. macOS Intel ist durch
eine fehlende `onnxruntime==1.30.0`-Wheel blockiert und erhält keinen falschen
Download. Alle fünf Installer nach dem Staging per SHA-256 verglichen;
Prüfsummen, Lizenzhinweise und `release-info.json` für die Release-Assets erstellt.
Die Pakete enthalten den geprüften App-Code `3618c99` (Qualitäts-CI `37196635430`
bestanden). Dokumentationsänderungen ergänzen keine Datenbankmigration.

Downloadseite, Release-Hinweise und Abnahmeprotokoll nennen Signier-/Gerätegrenzen;
Repo bleibt privat, keine Stable/Beta/Nightly-Feeds oder Pages-Freigabe.
Server-Provisionierung nutzte noch Image 0.1.18; auf vorhandenes Compose-Image
0.1.19 korrigiert und benötigten Release-Pfad in der Anleitung erklärt.
Shell-Syntax, drei bestehende Server-Pakettests, Node-Syntax, 61 lokale
Dokumentationslinks und neun PNG-Dateien geprüft. Downloadseite bei 1440/390 px
ohne horizontalen Überlauf oder Browser-Ausnahmen geprüft.

### 04.10.2026 – Stabile Navigation und weniger wiederholte Abrufe

Alle verzögert geladenen Seiten teilen eine Suspense-Grenze. Bei Übergängen
bleibt die Oberfläche sichtbar; Kaltaufrufe bekommen die vollständige Navigation
mit Ladeplatzhaltern. Fehlerhafte Moduldownloads bieten Erneut laden und andere
Bereiche. Intent-Vorladen per Hover/Fokus/Touch und dezente Fortschrittsanzeige,
ohne eingebettete große Editoren oder PDF-Inhalte vorab zu laden.

Kurze, ausdrücklich begrenzte Wiederverwendung von Navigationsantworten; echte
Änderungen, Sync-Abschluss und Neustarts aktualisieren weiterhin. Keine erneute
Karteikarten-Abfrage bei leerer Bewertungswarteschlange. Schlüsselbundprüfung
des nativen Proxys blockiert den Event-Loop nicht; Gerätebindung bleibt pro
Request geprüft. Keine Datenbank-/Schemaänderung.

Fake-Benchmark über 20 Tabwechsel: fehlende App-Frames 111 → 0; API-Requests
175 → 34. 413 Vitest-, 27 Playwright- und 21 Client-/Host-pytest-Prüfungen
bestanden, zusätzlich ESLint, i18n, Typecheck, Ruff und mypy. Vier Lernseiten
in Hell/Dunkel bei 1440/390 px visuell geprüft. Messgrenzen und Verfahren:
`docs/NAVIGATION_PERFORMANCE.md`.
Isolierter VPS-Smoke deckte fehlende Direktlink-Routen auf; Üben, Programmieren,
weitere statische Seiten und Karteikarten-Sitzungen unterstützen nun auch F5.

### 04.10.2026 – Benachrichtigungsfenster und gemeinsamer Gesehen-Stand

Glocke öffnet ein nicht modales Fenster über der aktuellen Seite. Bis zu sechs
kurze Vorschauen mit Dateinamen beziehungsweise Aufgabentitel, Kurs, Zeitpunkt
und Ungelesen-Punkt. Klick öffnet Details nach erfolgreicher Lesebestätigung;
Escape, Schließen und Außenklick schließen das Fenster. Die vollständige
Übersicht bleibt über einen eigenen Link erreichbar. Lange Listen scrollen
innerhalb des Fensters, Aktionen bleiben auch bei 390 × 560 px sichtbar.

Neue Sammelbestätigung markiert alle Benachrichtigungen bis zur erfassten ID,
auch über der bisherigen 200-Einträge-Grenze. Spätere Meldungen bleiben neu;
vorhandene Lesezeitpunkte werden erhalten. Server löst den Lesestatus über
Sync-Läufe und Materialversionen auf die neuen Dokumenthinweise von Heute auf.
Geteilter Query-Cache aktualisiert Glocke, Übersicht und Heute sofort.
Importierte Dokumente ohne eigene Benachrichtigung werden zusätzlich über den
bestehenden lokalen Gesehen-Stand bestätigt. Der Hinweis bleibt nach F5 weg;
später importierte Dokumente erscheinen wieder. Fehlgeschlagene Bestätigungen
verändern weder Zähler noch lokalen Gesehen-Stand.

Ruff, mypy, Typecheck, ESLint, i18n, 395 Vitest-Tests, Produktionsbuild,
OpenAPI-Konsistenz, Bundle-Budget und SPDX bestanden. 15 passende Browserabläufe
bestanden; vier Hell/Dunkel-Screenshots auf Desktop/390 px sowie die lange Liste
bei geringer Fensterhöhe selbst angesehen. Backend prüft Sammelbestätigung
mit 251 Meldungen, spätere Ankünfte, einzelne Quellen, begrenzte Vorschauen,
API-Validierung und Standby-Schreibschutz mit erfundenen Daten.

Server-Abbild isoliert ohne Netzwerk und Nutzerdaten-Volumes geprüft.
Models und sämtliche Migrationsquellen sind zum vorherigen Server identisch;
keine neue Datenbankmigration. Neues Abbild auf dem VPS aktiviert, Health OK;
vorheriges Abbild erhalten. Windows-Paket enthält 237 geprüfte Frontend-Dateien,
einschließlich Popover und Sammelbestätigung. Windows-App installiert und
geöffnet, Installer Exit 0 und identischer SHA-256 des Begleitdiensts.
Laufende App meldet status=ok/mode=client und liefert die Popover-Styles aus;
VPS-Container meldet healthy. Keine echten Studiendaten als Testbestand benutzt.

### 04.10.2026 – Darstellungsprüfung und gemeinsame Kopfzeile

Den gemeldeten Zeilenumbruch auf die alleinstehende Benachrichtigungsglocke
im dreispaltigen Header zurückgeführt. Glocke in die Aktionsgruppe verschoben,
explizite Rasterbereiche gesetzt und Kopfzeilenregeln aus vier CSS-Schichten
in Shell.css zusammengeführt. Kompakter Zähler ab 100; genauer Wert bleibt
zugänglich. Überlappung bei 901 px mit 360 px Seitenleiste behoben. Das
Startseitenraster wechselt nach verfügbarer Inhaltsbreite auf eine Spalte.
Sichtbare Felder und Abstände in Einrichtung, Schriftgröße und
Benachrichtigungsfilter vereinheitlicht. Vite-Build/Vorschau verwenden den
nativen Config-Loader, weil der Standardloader native Pakete falsch bündelte.

49 Ansichten in Dark/Light auf 1440 px und 390 px erzeugt: 196 Screenshots,
Kontaktbögen visuell durchgesehen; korrigierte Formulare und Header sowie
Coding, Prüfungen, Import und Willkommen zusätzlich größer geprüft.
Durchsuchbare lokale Bildübersicht und Grenzen in VISUAL_AUDIT_2026-10-04.md.
Keine echten Hochschuldaten in Tests. Typecheck, ESLint, i18n, 395 Vitest-Tests,
Produktionsbuild und SPDX bestanden; 26 Playwright-Abläufe bestanden,
nach der letzten Rasterkorrektur vier betroffene Abläufe erneut bestanden.
Header bei 320–2301 px mit/ohne Seitenleiste sowie 150 Prozent Schriftgröße
und deaktivierter Suche geprüft. 237 eingefrorene Frontend-Dateien im
Windows-Begleitdienst stimmen mit dem endgültigen Build überein.
Windows-App als aktualisiertes lokales 0.1.19-Paket installiert und geöffnet;
Installer Exit 0, installierter Begleitdienst mit identischem SHA-256.
Die laufende App meldet /health mit status=ok und mode=client und liefert
beide korrigierten CSS-Regeln tatsächlich aus. Kein neues Datenbankschema
und keine Änderung am Serververtrag.

### 03.10.2026 – Nachgewiesen ungenutzten Code bereinigt

Importgraph von 379 Frontend-Quell-/CSS-Dateien sowie Referenzen und größere
Funktionskörper in 552 Python-Dateien geprüft. Drei nie importierte
UI-Komponenten (Select, Separator, Tabs), der ungenutzte `lib/utils.ts`-Reexport
und die zurückgelassene Shadcn-Generator-Konfiguration entfernt. Sieben
verbraucherlose Typ-Aliasse gestrichen; API-Schemas bleiben erhalten. Der
Lizenzprüfer und die Herkunftshinweise berücksichtigen die entfernten Dateien.

Ungenutztes JavaScript-Updater-Paket entfernt; der tatsächlich verwendete
native Rust-Updater bleibt eingebunden. Bereits genutzte `@tauri-apps/api`
mit ihrer bisher aufgelösten Version direkt deklariert, keine vorhandene
Paketversion aktualisiert. Notizseite verwendet den Namen `NoteStudio` direkt.
Nach der Bereinigung keine weiteren verwaisten Frontend-Laufzeitdateien im
gleichen Scan. Scheinbar ungenutzte Backend-Worker, Desktop-Begleitdienst und
Remote-MCP-Einstiege anhand ihrer tatsächlichen Verbraucher bestätigt.
Lokaler Betrieb, Migrationen und Markdown-Quelleditor werden weiterhin genutzt.

Typecheck, ESLint, 395 Frontend-Tests, Produktionsbuild, npm-CI-Dry-Run,
SPDX sowie Ruff und mypy für den angepassten Lizenzprüfer bestanden.
26 Playwright-Abläufe gegen Fake-App bestanden: Startseite, Rich-/Markdown-
Editor einschließlich Audio und Konflikten, Räume sowie Seitenleiste.
Voriger GitHub-Lauf 37146313310 erfolgreich. Entscheidungen und Grenzen in
CODE_CLEANUP.md und dem aufklappbaren Bericht CODE_CLEANUP.html festgehalten.
Keine Änderung am Datenbankschema oder HTTP-Vertrag; installierte App und
VPS wurden durch dieses reine Quellcodepaket nicht ausgetauscht.

### 03.10.2026 – Räume: HAR-verifizierter automatischer Abruf

Die zwei vom Nutzer bereitgestellten HARs ausschließlich offline untersucht;
keine Cookies/Tokens/Sessionwerte ausgegeben oder übernommen, keine Originale
ins Repo oder in Fixtures kopiert. Kategorie-Verfügbarkeit (Bibliothek-ID 8)
und Einzelraum-Verfügbarkeit (für 4-032 aufgezeichnet) sind GET-Endpunkte mit
Datum, Personenzahl, Startsekunden und Dauer. Freie Angebote und deren
Epoch-Zeitstempel passen in beiden Aufzeichnungen exakt zur Anfrage in
Europe/Berlin. Die einzige aufgezeichnete Ablehnung betrifft die 14-Tage-Grenze,
keine bestehende Buchung. Der Nutzer weiß selbst keinen belegten Zeitraum;
deshalb bleibt dessen Antworttext offen und wird nicht geraten.

Native Schaltflächen „Verfügbarkeit prüfen“ und „Alle Räume prüfen“ fragen
die Auswahl direkt im vom Nutzer angemeldeten Hochschulfenster ab. Fester
Pfad, GET, Same-Origin, keine Weiterleitung oder Buchungsaktion; HTML maximal
256 KiB in inertem Template, zehn Sekunden Timeout. Ausgabe ausschließlich
erkannter Status/passender Angebotstext, kein Roh-HTML oder Loginexport.
Native Sperre verhindert parallele Prüfungen, mindestens eine Sekunde zwischen
Requests. Fortschritt und Stoppen vor der nächsten Anfrage; laufende Anfrage
kann noch bis zum Timeout auslaufen. Neues erfolgloses Prüfen entkräftet
vorherige freie Angebote für genau diesen Raum/Zeitraum. Unklare Antworten
bleiben unklar. Tatsächliche Buchung weiterhin persönlich im Portal.

30-Minuten-Überschrift unterstützt, echter Kalenderwert zusätzlich nativ
validiert, vollständiges Angebotsdatum samt Jahr gegen Zeitstempel geprüft.
Direkte Abfrage und bloßes Seitenlesen sind sichtbar unterschieden. Manuelle
Formularbedienung eingeklappt; primäre Abfrage neben Zeitraum und Loginfenster.
Keine Datenbankänderung, kein Serverabruf mit HAR-Zugangsdaten.

393 Frontend-Unit-Tests im vollständigen Lauf bestanden, anschließend 18
gezielte Raumtests einschließlich zweier zusätzlicher HTTP-/Abbruchfälle.
Zwei native Rust-Prüfungen, Typecheck, ESLint, DE/EN-Prüfung und Build bestanden.
Acht Playwright-Abläufe gegen Fake-App bestanden; Raumabfrage, Einschränkungen,
Abbruch, alte Angebote und unveränderte Grundabläufe geprüft. Vier aktuelle
Screenshots in Hell/Dunkel bei 1440/390 px selbst geprüft, kein Überlauf.
Voriger GitHub-Lauf 37143501485 erfolgreich. Original-HARs bleiben ausschließlich
bei Marc. Protokoll/Abnahme in ROOM_BOOKING.md und MANUELL_TESTEN.md dokumentiert.

**Offen:** echte Belegt-Antwort, direkte Prüfung in einer frisch angemeldeten
installierten App und vollständiger Tageskalender. Die neue native Funktion
braucht ein neues Desktop-Paket; App/VPS wurden mit dieser Quelländerung noch
nicht ausgetauscht. Kein abgeschlossener Live-Belegungsplan behauptet.

### 03.10.2026 – Räume: Vergleich und geprüfte Zeiten

Raumvergleich für genau Datum, Startzeit, Dauer und Personenzahl ergänzt.
Gelesene offizielle freie Angebote erhalten Quelle und Prüfzeit. Eine im
Hochschulportal ausdrücklich angezeigte bestehende Buchung kann für einen
konkreten Raum vom Nutzer bestätigt werden; „Buchungskonflikt“ nennt sichtbar
„Von dir bestätigt“. Die tatsächliche Belegt-Meldung wurde noch nicht geliefert;
ihre automatische Erkennung und ein vollständiger Live-Belegungsplan bleiben
offen. Fehlendes Angebot, Loginfehler und Schließzeiten erzeugen keinen Konflikt.
Zeitintervalle werden nicht auf angrenzende/teilweise überlappende Zeiten
übertragen. Ein Konflikt belegt nicht jede Minute des angefragten Intervalls.

Geprüfte Zeiten sind je Tag anklickbar und bleiben bei Navigation erhalten.
Nach zwei Minuten wird der frühere Status als ältere Prüfung gekennzeichnet.
Maximal 100 Beobachtungen im Arbeitsspeicher; Neuladen/Schließen beendet sie.
Keine Serverpersistenz, keine automatische Reservierung, keine neue Migration.
Konflikteingabe klappt nach dem Merken zu. Bei der Sichtprüfung entdeckter
dauerhaft sichtbarer Skip-Link ausgeblendet, Tastaturfokus bleibt sichtbar.

Typecheck/Build, ESLint, DE/EN-Prüfung, neun gezielte Vitest-Fälle und sechs
Playwright-Abläufe (fünf Räume plus Heute) bestanden. Zeit-/Personen-/Raumwechsel,
veraltete Beobachtungen, Navigation, Bestätigungspflicht, fehlender Anbieter und
Keyboard-Fokus geprüft. Vier aktuelle Screenshots mit zehn erfundenen Räumen
in Hell/Dunkel bei 1440/390 px selbst geprüft, kein horizontaler Überlauf.
Manuelle Portalabnahme in ROOM_BOOKING.md und MANUELL_TESTEN.md ergänzt.
Voriger GitHub-Lauf 37142240050 erfolgreich. Dieses Paket ist eine Quellcode-
Änderung; installierte App und VPS wurden dabei nicht ausgetauscht.

### 03.10.2026 – UniOS-Logo und App-Icon v2

Neues U-/Buch-Zeichen und Wortmarke mit Geist-Outlines. Brand-Kit unter
`docs/brand/v2`: skalierbare SVGs, transparente PNGs für Hell/Dunkel/einfarbig,
1024-Pixel-App-Icon, kleine Favicons, Windows-ICO (sieben Größen), macOS-ICNS und
Linux-PNG. Die maskierbare PWA-Datei ist vollständig deckend; alle Motivpixel
liegen innerhalb der zentralen sicheren Kreisfläche. Imagegen-Konzept und
Herkunft der OFL-Schrift sind dokumentiert, endgültige Symbole sind eigene
Vektorgeometrie. Vorherige Icons bleiben erhalten.

Versionierte Assets sind in Navigation, Willkommen-Seite, nativem Startfenster,
PWA, Projektseite, Dokumentationsseiten und README eingebunden. Eigene
`unios-brand-mark`-Klasse verhindert Eingriffe historischer Buchstaben-Icon-CSS.
Typecheck, ESLint, Build, acht betroffene Unit-Tests und sechs Browserabläufe
bestanden. Zusätzlich acht frische Screenshots von Heute/Willkommen in beiden
Themes auf 1440/390 px: Logos geladen, kein horizontaler Überlauf, selbst geprüft.
Lighthouse Accessibility 100 und PWA 100. ICO-Größen und ICNS-Container geprüft;
maskierbares Motiv: maximaler Radius 192,96 px bei erlaubten 204,8 px.
Dieses Paket enthält keine Datenbank-/API-Änderung. Installierte Pakete/VPS
wurden dabei nicht neu gebaut oder ausgetauscht; das neue native Icon wird beim
nächsten Installerbau übernommen. Kein öffentlicher Release oder Update-Feed.

### 03.10.2026 – Einstieg, Rettung und Release Lab (0.1.19)

CI-Nachprüfung: Der erste Upload scheiterte unter Linux an den ausschließlich
unter Windows vorhandenen ctypes.WinDLL-Typen. Der Plattformzweig ist jetzt
explizit für win32 prüfbar; gezielte Recovery-Prüfung (18 Fälle) und Mypy für beide
Plattformen bestanden. shadcn-Generator samt einzigem braces-Pfad entfernt;
MIT-Stylesheet lokal und mit Herkunft erhalten. Frontend-Build und CSS-Hash
unverändert, npm audit ohne bekannte Schwachstellen. Diese Korrektur ändert
keinen Nutzerablauf und erfordert keine Migration; App/VPS laufen weiter mit
dem bereits geprüften privaten Paket 0.1.19. Abschließender GitHub-Lauf
[37139751954](https://github.com/EinfachMxrc/unios-app/actions/runs/37139751954) für
`89bcecbbd00d35b41fef0f2e83b04ab710a19966` vollständig grün: 815 Backend-Tests,
sieben übersprungen, Branch-Gesamtdeckung 82,85 % (Gate 80 %), 384 Frontend-Tests,
Browser-Performance und Linux-GLib-Backport. Docker im Push-Workflow übersprungen;
der gesonderte isolierte Nachweis bleibt unten dokumentiert. GitHub markiert
braces-Alert 2 als behoben. Abschließender Folgecommit nur Dokumentation.

Neue Willkommen-Seite mit getrenntem Demo-Semester: vier Kurse, zwölf echte
dreiseitige Beispiel-PDFs, Aufgaben, Notizen und 15 beantwortbare Anki-Karten.
Native Demo und Rettung laufen auf eigenen lokalen Ursprüngen. Der Rettungsmodus
benutzt ausschließlich Initialisierungsparameter, ignoriert kaputte Umgebungs-
und Dotenv-Konfiguration und startet ohne Connectoren, Scheduler oder Migration.
Notizen/Originaldateien werden begrenzt und nach Hash-Prüfung exportiert;
geprüfte Datenbankkopien ersetzen ausdrücklich keinen vollständigen Snapshot.
Readonly-Sitzungsprüfung verändert keine echten Sitzungsdateien. Diagnoseexport
enthält nur technische Kennwerte, keine Studieninhalte oder Rohlogs.

Sicherung auch in der einfachen Systemansicht sichtbar; kein doppelter Knopf.
Gesundheitsanzeige liest tatsächlichen Datenbank-, Index-, Freigabe- und
Verbindungszustand. Work-Assistent prüft Kurse/Inhaltskategorien vor Freigabe;
Mail und Prüfungen sind standardmäßig aus. Import-Assistent übernimmt Markdown,
Notizen-CSV und Dateien nach Vorschau/Bestätigung und verweist auf bestehende
Anki-/iCal-Abläufe. Vollständige Vault-/Notion-Archive sind nicht implementiert.
Lokale Nutzungszähler sind opt-in; deaktivieren löscht die Zähler, nichts wird
automatisch versendet. Feedback kann eine freiwillige Diagnose anhängen.

Native Updatepolitik für Stable/Beta/Nightly prüft Version, Mindestversion,
explizite Schema-Kompatibilität, feste GitHub-Ziele, Signatur und vor Installation
eine frisch geprüfte Sicherung. Allgemeine Frontend-Updaterberechtigung entfernt;
unsignierte private Pakete bieten keinen öffentlichen Update-Feed an. Signierung
und echter Update-Drill bleiben Geräteabnahme. Schema weiterhin ff94af768293.

Release Lab: feste synthetische Prüfungen, vier Personas, Zielmissionen für
Erstbenutzung/Work/Chaos, getrennte externe Tester-/Prüfer-/UX-Beobachtungen und
Hash-Prüfung der Belege. Lokale Issue-Entwürfe; Veröffentlichung nur separat
bestätigt an das feste Repository, mit Metadaten-Minimierung und Belegen gegen
doppelte Übertragung. Keine Issues veröffentlicht. Sechs Testpakete plus Retrieval
bestanden: 117 Fälle, eine ausgewiesene Auslassung. Frischer isolierter Corpus-Lauf
mit 25.000 Primärdokumenten, 120 Kursen, zehn Semestern und historischen Versionen:
25.141 Indexobjekte / 75.141 Chunks, 458,65 s; 100 feste Fragen Recall@5/20 = 1,
MRR 0,995. Keine gesperrten/veralteten Quellen oder Hash-Abweichungen. Keine Aussage
über echte PDF/OCR-Importleistung oder frei formulierte beliebige Fragen.

Abnahme: vollständiger Python-Lauf 802 bestanden / zwölf übersprungen, danach
59 gezielte Release-/CLI-/Rechte-/Lab-Prüfungen bestanden. 384 Frontend-Tests,
Ruff, Mypy (514 Quellen), TypeScript, ESLint, OpenAPI und Build bestanden. Voller
Browsertest: 196 bestanden, zwei Fehler; beide korrigiert und mit drei fokussierten
Offline-/Reconnect-Abläufen bestanden. Ein verzögerter echter Modusabruf belegt:
lokale Bewertungen bleiben erhalten, keine Übertragung vor Prüfung, anschließend
genau zwei gespeicherte Serverbewertungen. Lesecache bleibt auch bei unerreichbarem
Server und weiterhin vorhandenem Internet nutzbar; Schreibaktionen bleiben gesperrt.
Lighthouse Accessibility und PWA jeweils 100. Neue Seiten Hell/Dunkel auf Desktop
und 390 px per Screenshots geprüft. Windows-NSIS/MSI gebaut; echter gebündelter
Begleitprozess beantwortet eine Demo-Karte nach PDF-Anzeige in 19,55 s. Windows-
Prüfharness beendet jetzt auch den eigenen PyInstaller-Kindprozess vollständig.
Isolierter Linux-Container mit endgültigem Quellstand bestanden, UID 10001,
schreibgeschütztes Root-Dateisystem, kein Netzwerk/Port/Produktions-Mount.

Anschließend private Aktualisierung ausgeführt: neue geprüfte Sicherung über die
gekoppelte App am 03.10., 16:48:13 UTC. VPS ausschließlich API-Dienst auf geprüftes
0.1.19-Image gewechselt; Netzwerke, Ports, Schlüsselbund und Daten-Mounts bleiben
erhalten. Schema ff94af768293 unverändert, keine neue Migration. Gekoppelte
Diagnose bestätigt Version 0.1.19, Schema und lesbare Datenbank; Indexmetadaten
verfügbar. Windows-NSIS still installiert (Exit 0), registrierte Version 0.1.19
und installierter Begleitdienst-Hash identisch zum geprüften Build. App geöffnet;
Client gekoppelt, Server-Topologie, keine lokalen Hintergrundjobs. Früherer Task
„Marc Uni OS“ weiterhin deaktiviert. Öffentliche Pakete/Updatefeeds nicht aktiviert.

Feature Freeze, genaue Hochschulgrenzen, Beitrags-/Sicherheitsregeln und verbleibende
Abnahmen: RELEASE_READINESS.md, RELEASE_LAB.md, COMPATIBILITY.md, TRUST.md,
ADD_UNIVERSITY.md sowie die neuen Architektur-/Beitragsdokumente. Frische OS-
Installationen, native Screenreader/Schlaf/Keychain, öffentliche Signierung,
echte Work-Zielaufgaben und eine externe Alpha-Woche bleiben ausdrücklich offen.

### 03.10.2026 – Coding-Tutor und gemeinsame Assessment Engine (0.1.18)

Neue native Lernansichten „Programmieren“ und „Üben“: lokale Monaco-IDE mit Java,
Python und JavaScript, Hilfsdateien, Syntaxfarben, Entwurfsrevisionen/CAS-Konflikten,
lokaler Entwurfsrettung, Versuchshistorie und Diff. Sieben versionierte Vorlagen
führen echte öffentliche/verdeckte, Eigenschafts- und größere Eingaben aus.
Hint-Stufen 1–3; Musterlösung nur nach ausdrücklicher Anforderung. Mutationstests
betreffen das vertrauenswürdige Orakel, nicht kompilierten Lernenden-Code.
Keine vorgetäuschte asymptotische Komplexitäts- oder Java/Python-LSP-Prüfung.

Gemeinsame Registry für Auswahl, Freitext, begrenzte symbolische Mathematik,
Parsons, Reihenfolge, Zuordnung, Zahlen und mündliche Antworten; Coding wird delegiert.
Aufgaben/Vorschläge, unveränderliche Antworten und Tutor-Feedback sind getrennt.
Mathe: sichere AST-Analyse rationaler Polynome, Äquivalenz/Ableitung und reelle
Nullstellen bis Grad 2; unbekannte Schritte bleiben unbekannt. Freitext und mündlich
erhalten keine erfundene objektive Bewertung. Lokale DE/EN-Transkription mit
abspielbarer Sitzungsaufnahme; gespeichert wird die geprüfte Antwort als Text.
Probeprüfungen sperren Hilfe/Ergebnisse bis Abgabe; laufende Prüfungen sind nach
Neustart wieder auffindbar. Konfidenz, Hilfe, reale Fehler und begrenzte Historie
bestimmen Übungsprioritäten. SQL/Logik/Diagramme/Concept Maps bleiben weitere Prüfer.

Abschnittsaufträge aus Reader/Notiz pinnen Quelle/Kurs/Inhaltsstand und erlauben
höchstens sechs überprüfbare Work-Vorschläge. Bestehende acht Gateway-Werkzeuge
verwenden gemeinsame Entity Actions; neue Kategorie und OAuth-Scope `coding:propose`
sind opt-in. Kurs- und Quellrechte werden vor Queue-Limits geprüft. Work startet
keine Programme, gibt keine Prüfungen ab und ändert keine deterministischen Noten.
Neue Aufgaben/Versuche sind im abgeleiteten Index ohne erwartete Antworten/Musterlösungen
verfügbar; laufende Prüfungsantworten bleiben ausgeschlossen.

Unter ausdrücklich bestätigtem Nutzerauftrag eigene KVM-VM auf dem VPS eingerichtet:
2 GB RAM, 2 vCPUs, maximale virtuelle Disk 20 GB, Ubuntu 22.04, Judge0 1.13.1.
Keine UniOS-Volumes, Hostfreigaben oder Host-Docker-Sockets. Privilegierte Container
laufen nur im Gast. cgroup-v1-Bootoption nur im Gast, kein VPS-Reboot/Host-GRUB-Eingriff.
QEMU `restrict=on`, API-Token, begrenzte Ausgabe/Prozesse/CPU/Wandzeit/Speicher.
49 echte synthetische Programmausführungen bestanden: drei Sprachen, sieben Vorlagen,
Hilfsdateien, Compiler-/Laufzeitfehler, Zeitlimit, Netzwerkverbot und fehlende UniOS-Daten.
Eine zusätzliche Speicherprobe läuft mit 16 MiB und wird bei 400 MiB/256-MiB-Limit
beendet. Ein CPU-Limit kann auf ausgelastetem Gast vor dem Speicherlimit greifen.
Private Firewallregeln für bestehende Standard-/UniOS-Docker-Brücken ausdrücklich
bestätigt und eingerichtet. Direkter Bridge-Forward beantwortete Anfragen nicht;
nach ausdrücklicher Nutzerfreigabe unprivilegierten systemd-Loopback-Proxy mit
höchstens 32 Verbindungen eingerichtet. Compose priorisiert die UniOS-Brücke als
Gateway: andernfalls nutzte der dual angebundene Container die nicht freigegebene
Edge-Brücke. Keine zusätzliche Firewall- oder öffentliche Freigabe.

Zusätzlich PDF-Journal/Index-Wettlauf behoben: Leser warten auf den bestehenden
Writer-Lock und laden den Datenbankstand danach neu. Writer verwenden bereits gehaltenen
Lock ohne verschachtelte Sperre. Deterministischer Parallelitätstest deckt genau
Append-vor-Commit ab; tatsächliche Journalabweichungen bleiben Fehler.

Abnahme: 707 Backend-Tests bestanden, 12 ausgewiesen übersprungen; 352 Frontend-Tests
und alle 191 Browserabläufe bestanden. Ruff (ohne nicht ausgelieferte Diagnosehilfen),
mypy für 489 Quelldateien, TypeScript, ESLint, OpenAPI-/Typen-Abgleich und Build bestanden.
Neue Seiten in Hell/Dunkel auf Desktop/390 px anhand aller acht Screenshots geprüft;
kein horizontaler Überlauf. Lighthouse Accessibility und PWA jeweils 100.
Serverimage und Windows-NSIS/MSI 0.1.18 gebaut; Lizenzen mitgeliefert.
Container-/Runner-Integration mit ausschließlich synthetischem Bestand bestanden.
Snapshot auf Nutzerwunsch über die gekoppelte App erstellt und geprüft (03.10.,
16:24 Uhr); Marc bestätigte ausdrücklich dessen Verwendung und Aktualisierung.
Produktiven VPS auf 0.1.18/Schema ff94af768293 migriert, Container gesund.
Runner-Zugang über den verschlüsselten Anwendungsschlüsselbund provisioniert;
gekoppelter Client bestätigt Runner bereit für alle drei Sprachen und neun Typen.
Windows-App 0.1.18 installiert, Sidecar-Hash mit Build identisch, App geöffnet.
Alter Quellcode-Autostart weiterhin deaktiviert; Client betreibt nur seine Serverbrücke.
Installierter nativer MCP-Handshake bestätigt alle acht Gateway-Werkzeuge.
macOS/Linux-Installation und tatsächliche Mikrofon-/Work-Kontofreigabe bleiben manuell.
Nachprüfung des Windows-Quellarchivs: Bash-Dateien im Export auf LF normalisiert,
Originaldateien und Binärdateien bleiben erhalten. Drei Pakettests und Mypy für
490 Quelldateien bestanden; korrigiertes Archiv auf dem VPS mit `bash -n` geprüft.
Einrichtung/Grenzen: ASSESSMENT_ENGINE.md, RUNNER.md, MANUELL_TESTEN.md.

### 03.10.2026 – Agent Gateway v2 / abgeleiteter Quellenindex (0.1.17)

Vorbereiteter, versionierter Corpus-Index mit FTS5, Metadatenfiltern, stabilen
Dokument-/Chunk-Handles, PDF-Lesezeichen/Überschriften, extraktiven Zusammenfassungen,
privaten Quellenlinks und dauerhaftem Sequenzfeed. Live-Kurs-/Bereichsrechte und
Fremdgruppenfilter werden vor Rangfolge/Limit geprüft. Historische Quellen umgehen
keine aktuellen Rechte. Dirty-Queue, isolierte Quellfehler, Einzelarbeiter und
Host-Fencing; Veröffentlichung ist atomar. Keine Originaldateien beim Retrieval.
Migration ff92ed546071 verändert ausschließlich abgeleitete Tabellen/Trigger.
Bei Snapshot-Restore wird die Corpus-Epoche nur in der geprüften Stagingkopie erneuert.

Acht gemeinsame MCP-/REST-/CLI-Werkzeuge: search, fetch (inklusive Batch), outline,
context, graph, changes, act, jobs. JSON-Budget inklusive Metadaten/Continuation wird
konservativ in UTF-8-Bytes begrenzt; keine modellgenaue Tokenzahl. Cursor sind signiert
und an Agent/Freigaben/Indexzustand gebunden. Context Packs wählen Quellentypen im
Wechsel; offene Fragen schließen erledigte Fragen und Hervorhebungen aus. Entity
Actions bleiben auf bereits freigegebene lesende Operationen begrenzt.

Optionaler Remote-OAuth-Dienst um Lesescopes, signierte interne Scope-Weitergabe,
Token-eigenen Abschaltcheck und separate Compose-Einbindung erweitert. Default-MCP
bietet v2; altes Werkzeugset ausdrücklich mit UNIOS_MCP_LEGACY=1. Notizen, Übungen,
Code und Lernkarten brauchen eigene zunächst ausgeschaltete Freigaben. KI-Seite zeigt
den Index eingeklappt; Auftragsseite unterstützt bewussten Neuaufbau und Abbruch.
Code aus gespeicherten Git-Commits erhält Dateipfade und Python-AST-Symbole/Zeilen;
andere Sprachen bleiben Dateitext, Referenzen sind syntaktisch, kein universeller LSP.

Geprüft: abschließender vollständiger Backend-Lauf 665 bestanden/12 ausgewiesen
übersprungen, einschließlich Abbruch-/Rollback-/Restore-/CLI- und Remote-Bind-Prüfungen.
346 Frontend-Tests und alle 188 Browserabläufe bestanden; TypeScript/ESLint/i18n,
OpenAPI-Typen, Ruff, SPDX, Geheimnisprüfung und PWA-Build bestanden.
Mypy: 470 Quelldateien fehlerfrei. Hauptseiten in Hell/Dunkel auf Desktop/390 px
anhand der Screenshots geprüft, neue Indexansichten zusätzlich in voller Größe.
Lighthouse Accessibility und Lighthouse 11 PWA jeweils 100.
Skalentest: 100 feste Fragen, 50022 synthetische vorindizierte Dokumente, Recall@5/20
und MRR jeweils 0,98, keine unerlaubten/veralteten Treffer, mediane Suche etwa 26 ms.
Zwei rein semantische Fragen fehlen ohne Embeddings. Seedzeit ist kein PDF-Importtest.
Verträge, Grenzen und Wiederherstellung: AGENT_GATEWAY.md.

Docker-Image unios-server:0.1.17 getrennt auf dem VPS gebaut und ausschließlich mit
erfundenem temporärem Bestand geprüft: Migration, FTS-Retrieval und Remote-MCP mit
verschlüsseltem Testschlüsselbund erfolgreich. OAuth-Metadaten über den gebundenen
Loopback-Port HTTP 200, MCP ohne Anmeldung HTTP 401. Windows-NSIS und MSI 0.1.17
gebaut. Zunächst nicht installiert; die spätere freigegebene Installation von
0.1.18 übernimmt diese Migration und den Gateway-Client vollständig (siehe oben).
Remote-OAuth-Veröffentlichung sowie macOS/Linux-Geräteabnahme bleiben getrennte Schritte.

Die beiden roten Browserfälle der vorherigen GitHub-CI wurden reproduziert und
behoben: Nach Einfügen eines Hinweisblocks sitzt der Editorcursor tatsächlich in
dessen Textabsatz. Der Setup-Fixture wartet auf den Navigationsabruf statt auf einen
beliebigen Hintergrundrequest. Beim Schließen einer Kursaufgabe wird ihr URL-Anker
entfernt; der Browsertest wartet auf das tatsächliche Entfernen des Dialogs.
Der Lighthouse-Runner löst unter Windows die npm-Programmdatei ausdrücklich auf.

# Projektfortschritt

**Raumbuchung und Windows-Update 0.1.16 (03.10.2026):** Die nachgereichten Nutzerbilder belegen URL, Startzeiten, Dauern und die sichtbare Angebotsseite. Neue Raumseite über Mehr, Suche, Palette und anpassbare Navigation; offizielles separates Desktop-Fenster, beschriftete Felder auf Nutzerklick vorbereiten und ausschließlich das sichtbare passende Angebot übernehmen. Verbindliche Buchung bleibt im Hochschulfenster; keine vollständige Belegungs-API oder Buchungsbestätigung erfunden. Andere Hochschulen bekommen keine Coburger Räume. Ältere Server werden nur über ihr authentifiziert gewähltes Profil unterstützt. [ROOM_BOOKING.md](ROOM_BOOKING.md) beschreibt Grenzen und manuelle Abnahme.

Heute zeigt einen leeren, erfolgreich geladenen Stundenplan als kompakte Zeile mit Abstand zu den nächsten Bereichen. Ladefehler werden nicht als freier Tag ausgegeben. Vollständiger Python-Lauf: 643 bestanden, 12 plattformbedingte Auslassungen; sechs zusätzliche Gateway-Regressionen gezielt bestanden. 346 Frontend-Tests, Ruff, mypy, TypeScript, ESLint, API-Typen und Übersetzungen bestanden. Vollständiger Browserlauf: 184 bestanden, drei Offline-/PWA-Fehler durch parallel ersetzten Desktop-Bau; nach getrenntem Web-Bau alle sechs betroffenen Tests bestanden. Acht abschließende Browserprüfungen bestanden; 188 Screenshots über 44 Ansichten plus Mail-Einrichtung sowie neue gefüllte Raum-/leere Heute-Zustände selbst angesehen. Neue Ansichten zusätzlich in voller Größe; Lighthouse Accessibility 100. Native Hochschulkonto-Abnahme bleibt offen.

Windows 0.1.16 still installiert (Exit 0); Versionsinfo, Registry und Paket-/Installationshash des Begleitdiensts bestätigt. Native App geöffnet und `mode=client`, Health 200 geprüft; alte Scheduled Task deaktiviert, kein UniOS-Login-Autostart. Marc bestätigte am 03.10. den selbst erstellten und geprüften Snapshot vor dem VPS-Schemaschritt. Neues Serverimage zuerst ohne Netzwerk/Nutzerdaten mit temporärem Testschlüssel geprüft (Health/Web 200, private API 401), anschließend ausschließlich UniOS-Container aktualisiert. Server 0.1.16 gesund; Schema `ff81dc435f60` und zehn konfigurierte Räume über den gekoppelten Windows-Client bestätigt. Keine echte Raumbuchung vorgenommen.

**Direkt bearbeitbarer Blockeditor (02.10.2026):** Notizen öffnen als Rich-Text-Dokument mit H1–H6, Listen, Checklisten, Zitaten, Tabellen samt Zeilen-/Spaltenaktionen, Syntaxfarben und Code-Ligaturen. `/` und die Bausteinauswahl unterstützen benannte Hinweis-, Definitions-, Frage-, Wichtig-, Zusammenfassungs- und eigene Blöcke; Blöcke lassen sich ziehen, verschieben, duplizieren und entfernen. Private Bilder/Audio/Video per Auswahl, Zwischenablage oder Drop, verknüpfte UniOS-Objekte mit echter Zielauflösung, bestehende Wikilinks/Peek, Abschnitte und Fokusmodus. Markdown bleibt das kanonische versionierte Format; Quelltext und Leseansicht sind optional. Öffnen erzeugt keine Version; Entwürfe, Konflikte, Suche und bisherige Notizen funktionieren weiter. CLI/REST/UI nutzen `note.blocks` und bestätigtes revisionsgeschütztes `note.edit_block`; MCP darf nur lesen. Medien bis 25 MB mit Inhaltsprüfung, gekoppeltem Zugriff und Range-Wiedergabe, im vollständigen Export enthalten. Keine Datenbankmigration oder Installation am echten Bestand. Format, Grenzen, Abhängigkeiten und Geräteabnahme: [NOTE_STUDIO.md](NOTE_STUDIO.md).

Vollständiger Python-Lauf: 639 bestanden, zwölf plattform-/optionale Fälle übersprungen. Anschließend zwölf gezielte Fälle einschließlich neuem 401-Test für ungekoppelte Geräte und Medienexport bestanden. 336 Frontend-Tests, TypeScript, ESLint, Übersetzungen, Ruff, mypy (449 Quellen), OpenAPI und Produktionsbuild bestanden. Hauptbundle 130.263 gzip-Bytes bei 225.280 Budget; Editor separat geladen. Lighthouse Accessibility 100; Editor-Screenshots Hell/Dunkel auf Desktop und 390 px selbst geprüft. Tatsächliche Blockbewegung, Tabellenbearbeitung, benannte Blöcke, WAV-Abspielen/Neuladen und die alten Notiz-/Konfliktabläufe bestätigt. Vollständiger Browserbestand: 180 von 181 Abläufen im Gesamtlauf bestanden; der letzte Vorschau-Test nach eindeutiger Titelprüfung ebenfalls bestanden. Sein alter H2-Selektor war durch korrekt gerenderte Inhaltsüberschriften mehrdeutig geworden. Offline-/PWA-Abläufe bestanden. Zwei Fehler aus dem vorherigen vollständigen CI-Lauf korrigiert: Kommando-Palette verfolgt den tatsächlichen asynchronen Sync-Abschluss; Setup-Test ändert seinen Fixture-Zustand erst beim Navigationsabruf. Native IME-, System-Drop-, Webview-Codec- und Screenreader-Abnahmen stehen in MANUELL_TESTEN.md offen.

**Visuelle Prüfung aller Seiten (02.10.2026):** 43 Ansichten in Hell/Dunkel auf Desktop und 390 px geprüft, einschließlich aller Detailansichten und zusätzlicher Mail-Einrichtung. Einheitliche Eingabefelder, breite Textareas und ruhigere Formulare; Kalenderlink gestapelt, laufende Stunden markiert und vergangene auf Heute ausgeblendet. Quellenverwaltung eingeklappt, offene Terminvorschläge weiterhin direkt sichtbar. Mensa mit einfacher Tagesnavigation und Wochentag, echtem Ernährungsfilter, Quellenkategorien und Quellenfotos; Mittagspause am Seitenende. Mail priorisiert Nachrichten; Hochschulunterlagen aus dem Standardmenü entfernt. 631 Python-Tests, zusätzlich drei portable Signiertests, 331 Frontend-Tests bestanden. Der Browserbestand umfasst 171 Abläufe: zunächst 167 bestanden, alle vier Korrekturen anschließend im gezielten Lauf bestätigt. Typecheck, ESLint, Ruff, mypy, Build, OpenAPI, Übersetzungen und feste Bundle-Budgets bestanden; Lighthouse Accessibility 100. Die bisherige Linux-/Windows-/Docker-CI-Abnahme ist erfolgreich; die zwei echten macOS-Signier-/ACL-Tests bestehen jetzt ebenfalls auf dem isolierten Runner. Keine neue Installation oder Migration des echten Bestands. Details: [VISUAL_AUDIT.md](VISUAL_AUDIT.md).

**Produktauftrag 1–15 (02.10.2026):** Alle beauftragten Pakete sind im Code umgesetzt. Zusätzlich zu den Punkten 1–7: konfliktgeschütztes lokales Undo einschließlich Themen-Merge, gebündelter Entity-Verlauf, Meldungszentrale, persistente Hintergrundaufträge mit Fortschritt/Abbruch/Wiederholung, ausführbare WASM-Addons im begrenzten separaten Prozess, Connector-Katalog mit Rechtefreigabe, Barrierefreiheit und feste Performance-Budgets. Der aktuelle GitHub-PDF-Reader ist enthalten. Abschließende lokale Abnahme: 623 Python-Tests bestanden, 12 übersprungen; 327 Frontend-Tests und 169 Browser-Tests bestanden. Ruff, mypy, Typecheck, ESLint, Build, OpenAPI, Übersetzungen, SPDX und Registry-Prüfung bestanden; Lighthouse Accessibility 100. Docker-Smoke und die Betriebssystemmatrix werden über GitHub Actions geprüft, da die lokale Docker-Engine nicht erreichbar ist. Reale Geräte-/Kontotests und Signierung bleiben offen; eine produktive Migration auf `ff81dc435f60` benötigt zuerst den vom Nutzer geprüften Snapshot gemäß `AGENTS.md`. Details und Grenzen: [PRODUCT_COMPLETION.md](PRODUCT_COMPLETION.md).

**Produktauftrag 1–7 (02.10.2026):** Unified Views mit Spalten, echten fälligen Anki-Karten und konservativem Abgabefilter; Entity-Schema v2; lesbarer Export plus vollständiger verschlüsselter Restore-Drill; strukturierte Suche vor SQL-Limits; gemeinsame Registry-Aktionen in der Palette und Tastaturnavigation. Fünf Browserabläufe und gezielte Python-Tests bestanden. Keine echten Konten oder Gerätebestände verwendet. Vollständiger Auftrag und verbleibende Abnahmen: [PRODUCT_COMPLETION.md](PRODUCT_COMPLETION.md).

Stand: 02.10.2026. Maßgeblich ist [BAUAUFTRAG.md](BAUAUFTRAG.md). Frühere Schritte und Testergebnisse stehen in Git. Entwicklung und automatisierte Tests verwenden ausschließlich erfundene Daten und lokale Fake-Server.

**PDF bis zum Dokumentende scrollen (02.10.2026):** Beim Nachladen einer Seite löste React-PDF die äußere Suspense-Ladeansicht aus und setzte die Scrollposition zurück. Dokument und Seiten laden jetzt innerhalb des Readers; feste Seitenhöhen aus den tatsächlichen PDF-Abmessungen verhindern zusätzlich Sprünge beim Ein-/Ausblenden und bei gemischten Seitenformaten. Die Seitenanzeige erkennt auch eine kurze letzte Seite am Dokumentende. Der Desktop-Scrolltest scheiterte vor der Korrektur; danach sieben Reader-Browserabläufe einschließlich 20 Seiten im Hoch-/Querformat bei 1300/390 px, Suche, Markierungen, Offline-Puffer und Export bestanden, ebenso elf Such-Unit-Tests, Typecheck, ESLint, Ruff und betroffenes mypy. Letzte Zeilen in beiden Bildschirmgrößen visuell geprüft. Mac-Paket mit unveränderter dauerhafter Signatur gebaut, geprüft und installiert; Dienstdatei entspricht per SHA-256 dem Paket. Keine persönlichen PDFs gelesen, keine Schemaänderung.

**Moodle-Änderungsprüfung gezielt auf Dateien (30.09.2026):** Die bisherige Ganzkurs-Abfrage prüfte auch Moodle-Aktivitäten ohne Dateien auf optionale Änderungs-Callbacks. Nach dem vollständigen Abruf der sichtbaren Kursinhalte nutzt der Connector bevorzugt die von Moodle angekündigte, lesende `core_course_check_updates`-Funktion, ausschließlich für sichtbare Aktivitäten mit abrufbaren Dateien und den Bereich `fileareas`. Große Kurse werden sequentiell in kleinen Anfragen geprüft. Kurse, Links, Aufgaben, Ankündigungen und Termine werden weiterhin regulär gelesen. Ältere Dienste behalten die bisherige Ganzkurs-Abfrage; relevante Datei-Warnungen und fehlende Fähigkeiten bleiben sichtbar. Ein fehlender Ganzkurs-Endpunkt erzeugt keine Warnung, wenn die gezielte Alternative angeboten wird. Der Regressionstest scheiterte vor der Korrektur an der Aktivität ohne Dateien; danach alle 29 Moodle-/Sync-Tests, Ruff/mypy bestanden, einschließlich versteckter Aktivitäten, unveränderter Dateien ohne erneuten Download, Änderung bei gleichen Dateimetadaten, relevanter Datei-Warnung und vollständiger Prüfung großer Kurse. Mac-App und DMG über den neuen lokalen Paketweg gebaut, signaturgeprüft und installiert; Dienst-SHA-256 stimmt mit dem Paket überein, derselbe Signierbezeichner und dasselbe Zertifikat wie bei der vorher freigegebenen Version. /health antwortet mit HTTP 200. Der zuvor ausdrücklich vom Nutzer freigegebene echte Abgleich über die normale lokale API bestätigt HTTP 200, Status success, Moodle ok, keine Änderungsprüfungs-Warnung und keinen erneuten Anmeldebedarf. Ausgegeben wurden ausschließlich diese Betriebsflags; keine Tokens, Session-Adressen oder Hochschulinhalte gelesen/ausgegeben und keine Sicherheitsdialoge bedient.

**Dauerhafte Mac-Identität und verständlicher Moodle-Hinweis (30.09.2026):** Die bisherigen ad hoc Signaturen binden „uniosd“ an einen pro Build wechselnden Code-Hash und verlieren deshalb bei Updates die Schlüsselbund-Freigabe. Lokale Mac-Pakete bekommen jetzt einen festen Bezeichner und ein dauerhaftes lokales Signierzertifikat aus einem separaten privaten Build-Schlüsselbund. Der Paketbau stellt die signierte App außerhalb des synchronisierten Repos bereit; Anleitung in DESKTOP_PACKAGES.md. Zwei echte macOS-Prüfungen mit ausschließlich erfundenen Einträgen bestätigen Zugriff nach Austausch durch anders gebauten, gleich signierten Code, Ablehnung nach Wechsel zur ad hoc Signatur sowie Abbruch bei verlorener/unsicherer Signieridentität. Insgesamt zehn Paket-/Signiertests bestanden (ein Windows-Test ausgelassen), Ruff/mypy, Typecheck, ESLint/Prettier, Übersetzungen, Produktions-Build und beide Aktualisierungs-Browserabläufe bestanden. Nutzer bestätigt, dass bei Moodle lediglich der Änderungsprüfungs-Hinweis erscheint; dieser erklärt jetzt ausdrücklich, dass die Kursinhalte abgefragt wurden und dafür keine erneute Anmeldung nötig ist. App und DMG gebaut; App signaturgeprüft und installiert, installierte Dienstdatei per SHA-256 gleich zum geprüften Paket. Nutzer hat „Immer erlauben“ bestätigt; der installierte Dienst antwortet danach auf /health mit HTTP 200. Die dauerhafte Identität bleibt für künftige lokale Bauten erhalten. Keine Hochschulzugänge durch den Agenten gelesen und keine Sicherheitsdialoge bedient.

**Moodle-Aktualisierung mit Warnung (30.09.2026):** Der rein lesend und ohne Inhalte ausgegebene lokale Betriebsstatus bestätigt eine vorhandene Moodle-Verbindung und einen abgeschlossenen Lauf mit Warnung bei der zusätzlichen Änderungsprüfung, keinen Anmeldefehler. Der Aktualisieren-Knopf hat bisher jeden Status außer success als kompletten Fehlschlag ausgegeben. Heute, Einrichtung und die einfache Systemansicht unterscheiden jetzt Erfolg, Abschluss mit Hinweisen und Fehler. Warnungen bleiben sichtbar und bekommen aufklappbare Erklärungen ohne interne Funktionsnamen/Kurskennungen; echte Fehler behalten die Verbindungsprüfung. Die Moodle-Warnung wird nicht unterdrückt, die reguläre Inhaltsabfrage bleibt erhalten. Zwei Browserabläufe prüfen Erfolg, Warnung mit aufklappbarem Hinweis und echten Fehler sowie dieselbe Anzeige im System. Typecheck, gezieltes ESLint, Übersetzungen und Produktions-Build bestanden. Mac-Paket gebaut, signaturgeprüft, installiert und geöffnet; installierte Dienstdatei stimmt per SHA-256 mit dem Paket überein. Nutzer hat die Schlüsselbund-Freigabe bestätigt; /health der installierten App antwortet mit HTTP 200.

**Moodle-Anmeldung nach Dienstneustart (30.09.2026):** Vorher reproduziert: eine gerade gestartete Anmeldung erhält nach Neuerstellung des lokalen Dienstes sofort HTTP 409. Kurzlebige, an Hochschule und Basisadresse gebundene Prüfsummen liegen jetzt atomar und mit privaten Dateirechten im lokalen Anmeldezustand. Keine Passports, Rückmelde-URLs oder Tokens werden darin gespeichert. Bis zu fünf laufende Vorgänge bleiben höchstens 15 Minuten gültig; ein Erfolg schließt alle offenen Vorgänge ab. Wiederholungen derselben erfolgreich gespeicherten Verbindung werden auch nach Neustart und bei unterschiedlicher URL-Kodierung erkannt. Ein inzwischen ersetzter oder entfernter Token kann diesen Erfolg nicht wiederverwenden. „Anmeldefenster erneut öffnen“ startet eine frische Anmeldung. 25 betroffene Python-Tests einschließlich lokaler Session-/Schreibschutzregeln mit erfundenen Daten sowie alle neun Einrichtungsabläufe im Browser bestanden. Der Portal-Login-Test berücksichtigt die bereits eingeführte Abfrage der Mac-Fähigkeiten, statt diese als unerwarteten Aufruf zu werten. Ruff/mypy, Typecheck, gezieltes ESLint/Prettier, Produktions-Build und Mac-Paket bestanden. Mac-App signaturgeprüft, installiert und geöffnet; Dienstdatei stimmt per SHA-256 mit dem Paket überein. Nutzer hat die Schlüsselbund-Freigabe bestätigt; der installierte Dienst antwortet auf /health mit HTTP 200. Die zuvor ausschließlich im Arbeitsspeicher gestartete Anmeldung muss nach diesem Update einmal neu begonnen werden. Kein echter Hochschulzugriff durch den Agenten.

**Mensa-Karte nur vor der Mittagspause (30.09.2026):** „Heute in der Mensa“ verschwindet ab Beginn der eingestellten Mittagspause (Standard 12:00), auch bei bereits geöffneter Heute-Seite. Das bisherige Zeitfenster bis zwei Stunden nach Pausenbeginn entfällt. Der eigene Speiseplan bleibt jederzeit erreichbar. Geprüft: drei betroffene Vitest-Tests, Typecheck, gezieltes ESLint/Prettier und ein Browserablauf für automatisches Verschwinden ab Pausenbeginn, Neuladen und weiterhin erreichbaren Speiseplan. Produktions-Build und Mac-Paket gebaut, signaturgeprüft und unter /Applications installiert/geöffnet. Installierte Dienstdatei stimmt per SHA-256 mit dem Paket überein; macOS-Schlüsselbund-Freigabe bleibt nutzerseitig.

**Moodle-Rückmeldung unter macOS (30.09.2026):** Die native App wartet während einer Schlüsselbund-Freigabe weiter, statt nach 60 Sekunden einen Fehlschlag anzuzeigen. Wiederholt zugestellte Rückmeldungen werden innerhalb desselben Anmeldevorgangs serialisiert und liefern nach Erfolg dasselbe öffentliche Ergebnis; erneutes Starten verwirft diesen Zustand. Nur ein Hash bleibt kurzzeitig im Arbeitsspeicher, kein Token in Logs oder Rückmeldungen. Ungepolsterte Base64-Rückmeldungen werden vor der Übergabe an moodle-dl normalisiert. Die Oberfläche zeigt den laufenden Verbindungscheck und unterscheidet abgelaufene Anmeldung, Schlüsselbundfehler und Dienstausfall. Prüfung: 20 betroffene Python- und 13 Rust-Tests, Ruff/mypy, TypeScript und gezieltes ESLint bestanden. Der Symlink-Sicherheitstest verwendet unabhängig von der Länge des macOS-Temporärpfads feste Ordnernamen. Ein Browserablauf mit erfundenen Rückmeldungen für Wartehinweis, deaktivierte Verbindungsaktion, Schlüsselbundfehler, Ablauf und Erfolg bestanden. Mac-App gebaut, signaturgeprüft, installiert und geöffnet; installierte Dienstdatei stimmt per SHA-256 mit dem geprüften Paket überein. Nutzer hat die Schlüsselbund-Freigabe bestätigt; der installierte Dienst antwortet danach mit HTTP 200 auf /health. Echte Moodle-Anmeldung führt ausschließlich der Nutzer durch.

**Ernährungspräferenz in der Mensa (30.09.2026):** Die Mittagspausen-Einstellungen speichern auf diesem Gerät „Alles“, „Vegetarisch“, „Vegan“ oder „Vegetarisch + Fisch“. Passende Gerichte stehen im Speiseplan und auf Heute zuerst; Kennzeichnung mit Ernährungssymbol und zusätzlichem Stern. Vegan passt auch zur vegetarischen Auswahl. Alle anderen Gerichte bleiben sichtbar. Die Einordnung verwendet ausschließlich die expliziten Symbole des offiziellen SWO-Speiseplans, keine Vermutungen anhand von Namen oder fehlenden Allergenen. Fehlende/widersprüchliche Angaben bleiben ungekennzeichnet. Alte Einstellungen und Offline-Menüs bleiben nutzbar; ältere öffentliche Menü-Caches erhalten die Kennzeichnung beim nächsten erreichbaren Abruf. Geprüft: 17 Mensa-Python-Tests, drei Vitest-Tests, Ruff, mypy, Typecheck, ESLint, Übersetzungen, OpenAPI, Produktions-Build sowie bisheriger Mensa-/Mail-Ablauf und neuer Browserablauf für Speicherung, Sortierung, Sterne und Heute. Desktop/390 px Light/Dark visuell geprüft. Die Schema-Prüfung nutzt jetzt ausschließlich ein isoliertes Beispielprofil ohne `.env`, Keychain oder Studiendaten; ein zusätzlicher Regressionstest bestätigt das.

**Portalseiten auf macOS erfassen (30.09.2026):** Das bisher nur auf Windows verfügbare Auslesen nutzt nun Tauris plattformübergreifende Callback-Brücke. macOS erfasst und anonymisiert die geöffnete Seite direkt oder sammelt mehrere vom Nutzer geöffnete Seiten. Die Oberfläche ermittelt die unterstützten Fähigkeiten beim lokalen Dienst; automatische Rundgänge werden ausschließlich bei vorhandenem nativen Schreibschutz angeboten. Die native Schicht verweigert ungeschützte Navigation/Klicks und das Erfassen von Passwortformularen. Auch der PRIMUSS-Import unterstützt auf dem Mac die geöffnete Seite und meldet den Umfang als teilweise. Geprüft: 25 gezielte Vitest-Tests, elf Rust-Tests, Typecheck, ESLint, Übersetzungsabgleich, Produktions-Build und drei Browserabläufe für das Sammeln/Speichern, Windows-Rundgang und macOS-Einzelseite. Ein nativer WKWebView-Test gegen die öffentliche Startseite bestätigt tatsächliches Auslesen, Passwortfeld-Ausschluss, geschlossenes Fenster und gesperrte Rundgänge. Keine echten Hochschuldaten verwendet.

**Desktop-Start nach verzögerter Freigabe (30.09.2026):** Ein Dienststart über 90 Sekunden wird nicht mehr als Portkonflikt gemeldet. Solange der eigene Dienst läuft, wartet das Fenster weiter und öffnet die Oberfläche automatisch nach einer verspäteten Schlüsselbund-Freigabe. Bei längerem Start erscheint ein sachlicher Hinweis auf eine mögliche macOS-Freigabe; ein belegter Port vor dem Dienststart bleibt ein eigener Fehler. Beim Beenden oder Abbruch des Dienstes endet auch die Startüberwachung. Geprüft: elf Rust-Tests einschließlich verspäteter Bereitschaft, Dienstabbruch und Beenden während des Wartens. Keine Hochschulzugriffe in den Tests.

**myCampus im Hintergrund (30.09.2026):** Der vorhandene Hintergrundimport hat einen gemeinsamen, nicht offline gespeicherten Status für alle Ansichten. Eine kleine Anzeige begleitet den laufenden Abgleich über Seitenwechsel hinweg, bestätigt den Abschluss kurz und verlinkt bei Fehlern die Verbindung. Die bisherige Wartezeit-Meldung im Einrichtungsformular entfällt; beim Abschluss werden geöffnete Inhalte automatisch aktualisiert. Auch der automatische Import nach der Anmeldung nutzt diesen Status. Die Einrichtung lässt sich während des myCampus-Imports abschließen. Geprüft: Typecheck, ESLint, Übersetzungsabgleich, gezielte Vitest-Tests, Produktions-Build, acht bestehende Einrichtungsabläufe und drei neue Browserabläufe mit Fake-Daten für Seitenwechsel, Aktualisierung, Fehler und Abschluss der Einrichtung bei laufendem Import. Screenshots auf Desktop und 390 px in Light/Dark sowie reduzierte Bewegung geprüft. Der Importablauf und das Datenbankschema bleiben unverändert.

**Moodle-Anmeldefenster auf macOS (30.09.2026):** Anmeldefenster werden ausdrücklich angezeigt und fokussiert; ein vorhandenes Moodle-Fenster wird erneut verwendet. Nur das Hauptfenster bleibt beim Schließen im Hintergrund. Ein Moodle-Rücksprung schließt das Login-Fenster erst nach bestätigter Übernahme durch den lokalen Dienst; fehlgeschlagene Rücksprünge melden sich ohne Token oder Anmeldeadresse direkt am Moodle-Button. Die Oberfläche zeigt Öffnen und Fehler statt vorzeitig ein geöffnetes Fenster zu behaupten. Geprüft: acht Rust-Tests (einschließlich fragmentierter HTTP-Antwort und abgewiesener Anmeldung), sieben gezielte Vitest-Tests, Typecheck, ESLint, Übersetzungsabgleich, Frontend-Build und acht Einrichtungs-Browserabläufe mit Fake-Daten. Der ältere Dashboard-Test erhielt passende leere Kurs-/Mensa-Antworten für die inzwischen hinzugekommenen API-Abfragen. Die echte Hochschulanmeldung führt Marc selbst aus.

**Entity Schema (28.09.2026):** Ein versionierter Katalog beschreibt neun studienbezogene Objekttypen, ihre öffentlichen Felder, Fähigkeiten und sieben Beziehungstypen. REST stellt Schema, Listen und sichere Einzelfeld-Projektionen bereit; MCP kann den Vertrag nach der bestehenden Freigabeprüfung lesen, ohne Studiendaten offenzulegen. Die Handbuchseite wird aus demselben Katalog erzeugt. Ein gezielter API-Test mit erfundenen Daten, Ruff und mypy bestanden. Schreibende Entity-Operationen sind bewusst nur als Beziehungen verfügbar; importierte Hochschulobjekte werden nicht generisch verändert.

**Universal CLI (28.09.2026):** `unios schema` und `describe` lesen den gemeinsamen Vertrag; die bisherigen KI-Formate und Befehlsbeschreibungen bleiben erreichbar. `entity list/get` lesen öffentliche Felder über den lokalen Host. `relate` und `unlink` bieten `--dry-run`, `--yes` und `--json`; Änderungen laufen durch den bestehenden Host- und Schreibgeneration-Check. Vier gezielte CLI-Tests mit Fake-HTTP, Ruff und mypy bestanden.

**Universal Relationship Graph (28.09.2026):** Die bestehenden Kanten nutzen nun die gemeinsame Schema-Registry für Typen, Suche und Beschriftung. Getrennte API-, Service- und Repository-Schichten prüfen Ziele, verhindern Selbstverknüpfungen sowie Kreise bei `prerequisite` und `part_of`, und liefern eingehende Kanten als Rückverweise. Die Oberfläche gruppiert Beziehungen, öffnet die Suche erst auf Wunsch und zeigt den Graphen auch bei gespeicherten Prüfungen und aktiven Übungen. Die CLI kann öffentliche Objekte durchsuchen und ihre Beziehungen lesen. Geprüft mit gezielten Python-Tests, Ruff, mypy, TypeScript, ESLint, Frontend-Build und einem Browserablauf mit Fake-Daten. Eine frei navigierbare visuelle Netzwerkkarte ist nicht Teil dieses Pakets.

**Fokussierte Kartenstapel (28.09.2026):** Die Karteikartenübersicht zeigt die Stapel und öffnet jeden Stapel auf einer eigenen Lernseite ohne Seitenleiste, Importsteuerung oder Statistik. In der Sitzung erscheinen Frage, nach dem Aufdecken zusätzlich die Antwort, vier Bewertungen und ein knapper Fortschritt. Tastaturbedienung und Offline-Puffer bleiben erhalten. Geprüft mit Frontend-Typecheck, ESLint, Produktions-Build und dem gezielten Playwright-Ablauf mit erfundenen Karten auf Desktop und Mobilgerät.

**Desktop-Freigabe weitergeführt (28.09.2026):** Der Windows-Bau erzeugt nun NSIS-Setup und MSI; ein MSI wurde lokal gebaut, Installation und Update auf einem frischen Gerät sind offen. Die Release-Vorbereitung legt MSI zusätzlich zum NSIS-Updatepaket ab und lehnt eine vom Tauri-Bau abweichende Versionsnummer ab. Die macOS-Action bereitet einen temporären Developer-ID-Schlüsselbund und App-Store-Connect-Notarisierung vor; bei vollständig hinterlegten Secrets prüft sie App-Signatur und DMG-Ticket, ohne Secrets baut sie nur ad hoc signierte interne Pakete. Ein echter signierter/notarisierter Mac-Bau und der Release-Updateweg stehen mangels Apple-Schlüsselmaterial und Mac-Runner-Lauf aus. Geprüft: lokaler MSI-Bau, gezielter Staging-Test mit erfundenen Paketen, Ruff, mypy und Shell-Syntax. Details: [DESKTOP_PACKAGES.md](DESKTOP_PACKAGES.md).

**Zweitgerät und Schema-Schutz (28.09.2026):** Der gebündelte Dienst lässt einen zweiten lokalen Datenstand im Standby starten, sofern dessen Schema zur installierten App passt; zuvor brach er ohne Schreibstaffelstab ab. Ein Standby führt keine Migration aus. Ein unbekanntes oder neueres Schema stoppt schon vor dem lokalen Host-Start und verändert den geteilten Staffelstab nicht. Eine ältere Standby-Datenbank bleibt bis zur Migration durch den aktiven Host gesperrt. Drei gezielte Desktop-Tests mit erfundenen Daten, Ruff und mypy bestanden. Die echte Übernahme und das Verhalten bei verzögertem Syncthing sind damit weiterhin nicht abgenommen.

**Schreib-Generation in der produktiven API (28.09.2026):** Bei aktivierter Geräteanmeldung verlangt die API für normale Schreibanfragen nun eine aktuelle Staffelstab-Generation; fehlende und alte Generationen werden abgewiesen. Browser, Offline-Warteschlangen und CLI senden den Wert mit. Der einmalige Moodle-Protokollrückruf sowie separat authentifizierte Anki-Agent- und MCP-Routen behalten ihren eigenen Sicherheitsweg. Der Browser-Fake-Server deaktiviert die Geräteanmeldung für direkte Fixture-Einträge; ein gezielter Test mit produktiver Einstellung prüft den neuen API-Gate. Geprüft: 22 gezielte Python-Tests, Ruff, mypy, TypeScript, ESLint, Frontend-Build und fünf Notiz-Browserabläufe. **Grenze:** Eine veraltete lokale Staffelstabkopie bei absichtlich verzögertem Syncthing kann durch diese Prüfung allein nicht ausgeschlossen werden; die echte Zweitgeräte-Abnahme bleibt notwendig.

**Alpha-Feedback und Diagnose (28.09.2026):** Einstellungen bieten Problembericht, Verbesserungsvorschlag und Diagnoseexport. Jede Seite verlinkt einen Bericht mit ihrem Pfad. Berichte und Diagnosen werden als JSON nur lokal heruntergeladen; es existiert noch kein Empfänger oder automatischer Versand. Die Diagnose-API liefert ausschließlich App- und Schema-Version, Betriebssystem, Connector-Versionen, Host-Generation/-Modus, Sync-Status und statische Fehlercodes; keine Notizinhalte, PDFs, Personennamen, Token oder Pfade. Das Desktop-Paket nimmt UniOS-Paketmetadaten für die Versionsanzeige auf. Geprüft: gezielter Datenschutz-Backend-Test, Ruff, mypy, TypeScript, ESLint, Frontend-Build und ein Browserablauf mit Fake-Daten. Der echte Testerversandweg und Prüfung der fertigen Installer bleiben offen.

**Release- und Übernahmekompatibilität (28.09.2026):** Release-Staging gleicht die Version von Tauri und Python ab und legt `release-info.json` mit App- und Schema-Version samt Prüfsumme ab. Eine geplante oder automatische Host-Übernahme prüft das Schema des tatsächlich gestagten Snapshots vor Installation; ein Gerät mit anderem Schema darf den Staffelstab nicht übernehmen. Der Test mit einem gültig gehashten, aber für die App zu neuen Snapshot bestätigt den Abbruch ohne Austausch der lokalen Datenbank. Simulierte Übergabetests bestanden; der echte Zwei-Geräte-Lauf bleibt offen. Die installierte App liegt außerhalb der synchronisierten Nutzerdaten.

**Aktueller Windows-Bau (28.09.2026):** Nach den Änderungen an Feedback und Schema-Schutz wurden NSIS-Setup und MSI erneut erfolgreich gebaut. Der gebündelte Dienst bereitete ein isoliertes Beispielprofil vor und antwortete auf `/api/feedback/diagnostics` mit `app_version=0.1.0` und `schema_version=fa25d6e7f809`. Die Installation beider Pakete auf einem frischen Windows-Gerät und ein signiertes Update sind weiterhin offen.

**Abnahmegrenzen dieser Roadmap (28.09.2026):** Marc hat derzeit keinen Zugriff auf das MacBook und noch keine Apple-Developer-ID-Schlüssel; echte Mac/Windows-Schlaf- und Syncthing-Szenarien sowie notarisiertes DMG bleiben offen. Docker Desktop ist installiert, aber ein Startversuch lieferte weiterhin keinen erreichbaren Linux-Engine-Dienst; der Container-Connector-End-to-End-Test ist nicht bestanden. Das automatische Schreiben eines Standby-Notizentwurfs zum aktiven Host fehlt weiterhin. Feature-Freeze mit externen Testern und ein Tutor für echte Vorlesungsdaten beginnen erst nach diesen Freigaben. Lokal gebaute Pakete sind Prüfarbeitsstände, kein öffentlich freigegebenes Release.

**Desktop-Pakete (28.09.2026):** Ein PyInstaller-Sidecar bündelt den lokalen Dienst und die gebaute React-Oberfläche; Tauri startet ihn im Benutzerkontext und bleibt beim Schließen des Fensters im Hintergrund. Eine neue Datenbank erhält den lokalen Host automatisch. Der Einrichtungsassistent zeigt Hochschule, offiziellen Moodle-Login und echten ersten Abgleich nacheinander. Der Moodle-Rücksprung wird als Desktop-Deep-Link verarbeitet. Auf Windows wurde ein NSIS-Installer gebaut; der gebündelte Dienst beantwortete `/health` und `/api/setup/status` mit einem isolierten Beispielprofil. Auch Ubuntu 24.04 lieferte ein DEB und AppImage; der Linux-Dienst beantwortete beide Endpunkte mit einem frischen Beispielprofil. Zwei gezielte Einrichtungs-Browserabläufe und acht Python-Tests bestanden. Eine manuelle Build-Matrix erzeugt Windows-Setup, macOS-DMG für beide Architekturen sowie Linux-DEB und AppImage auf den nativen Systemen. Signierte Auto-Updates und ihre Oberfläche sind vorbereitet, werden aber erst mit Schlüsselmaterial aktiviert. Die öffentliche Freigabe, Betriebssystemsignierung, echte Geräteprüfung, Ubuntu-22.04- und macOS-Bauläufe stehen aus; GitHub Actions war zuletzt abrechnungsbedingt blockiert. Details: [DESKTOP_PACKAGES.md](DESKTOP_PACKAGES.md).

**Handbuch:** Die bisher flachen Hilfe- und Entwicklerseiten wurden in einzelne Themen aufgeteilt. Das statische Portal bietet Bereichsnavigation, Breadcrumbs, Inhaltsverzeichnis, Vor/Zurück und seitenübergreifende Suche. Die API-Referenz wird aus dem eingecheckten OpenAPI-Schema generiert. Quellseiten und Build-Anleitung liegen unter [handbook](handbook/README.md); echte Portal- und Geräteabläufe bleiben als manuell zu prüfen gekennzeichnet. Geprüft: reproduzierbarer Build, interne Links und Anker, Ruff, mypy, JS-Syntax sowie Desktop- und Mobilabläufe mit lokalem Browser.

**Addon-Plattform:** Auf Marcs Wunsch ist die deklarative Addon API v1 umgesetzt. Connectoren bleiben auf externe Datenquellen begrenzt. Der lokale Katalog, Manifest-Fingerprint, getrennte Installation/Freigabe/Aktivierung, serverseitige Rechte und vom Core gerenderte Slots sind implementiert. Eingebaute Beispiele zeigen einen Fokus-Timer, Kurse auf Heute und Lernblöcke. Fremder Programmcode und ein Online-Store bleiben außerhalb von v1. Geprüft: Rechte- und Persistenztests mit Fake-Daten, vollständiger Python-Lauf (437 bestanden, 2 übersprungen), Ruff, mypy, 54 Frontend-Tests, Typecheck, Lint, Build, OpenAPI- und Handbuchabgleich sowie zwei Browserabläufe für Freigabe, Entzug und Widget-Anzeige. Der vollständige Playwright-Lauf und ein Docker-Smoke für dieses Paket stehen noch aus; Grenzen stehen in [EXTENSIONS.md](EXTENSIONS.md).

**Microinteraction & Feedback Polish Pass:** Notizen, Schnellerfassung sowie Host- und Benachrichtigungseinstellungen zeigen Speichern, Erfolg und Fehler direkt am Auslöser. Eingaben sind während des Speicherns gesperrt; veraltete Erfolgshinweise verschwinden bei einer neuen Bearbeitung. Navigation und Dokumentsteuerung reagieren dezent auf Hover und Druck, bei reduzierter Bewegung ohne Ladeanimation. Peek-Drawer und mobiles Inbox-Blatt gleiten mit gedämpftem Hintergrund ein und aus. Erfolgreich eingeordnete Einträge zeigen kurz eine Bestätigung und schließen dann die Listenlücke; bewertete Karten wechseln mit einem kleinen Aus- und Einblenden. Bei reduzierter Bewegung entfallen diese Übergänge. Ein Absturz der Startseite bei unvollständigen älteren Wochenübersichten ist behoben. Geprüft: 54 Frontend-Tests, Typecheck, Lint, Build und gezielte Browserabläufe mit Fake-Daten für alle betroffenen Ansichten.

## Wissenskreislauf: acht Erweiterungen (26.09.2026)

**1/8 Studientag:** Die Tagesansicht bündelt Stundenplan, neue Unterlagen, bearbeitete Notizen, offene PDF-Fragen, Schnellerfassungen, Anki-Wiederholungen und Übungen nach Berliner Kalendertag. Persönliche Tagesnotiz und tatsächlich behandelter Stoff pro Kurs sind versioniert und vor veralteten Änderungen geschützt. Die Seite ist über Navigation und „Heute“ erreichbar. Geprüft mit einem Backend-Test über die Mitternacht in Berlin, Ruff, mypy, TypeScript, ESLint, Frontend-Build und einem Playwright-Ablauf mit lokalem Fake-Server. Die Datenbankmigration wurde nur mit erfundenen Testdaten ausgeführt; am echten Bestand erst nach geprüftem Snapshot.

**2/8 Eingang und Web Clipper:** Webseiten oder markierte Textstellen lassen sich über einen Browserknopf und die PWA-Teilen-Funktion vorbefüllt öffnen, einem Kurs zuordnen und lokal speichern. Der Server ruft fremde Webseiten dabei nicht selbst ab; er speichert den vom Browser übergebenen Text, bereinigt sensible URL-Parameter und indiziert die Inhalte für Online- und Offline-Suche. Eigene Texte, Datei-Uploads, offene Schnellerfassungen sowie vorhandene Mail- und GitHub-Einträge erscheinen im Eingang. Dateien werden unverändert im Drop-Ordner abgelegt; nach Kurszuordnung greift die vorhandene Extraktion. Geprüft mit zwei Backend-Tests, Ruff, mypy, TypeScript, Lint, Build und zwei Playwright-Abläufen mit Fake-Daten. Echte Bestandsdaten wurden nicht migriert.

**3/8 Rückverweise und unverknüpfte Erwähnungen:** Die Notizseite trennt eingehende `[[Wikilinks]]` von bloßen Titel-Erwähnungen in aktuellen Notizversionen und zeigt den Quelltext als Ausschnitt. „Verknüpfen“ ersetzt die erste freie Erwähnung durch einen Wikilink und erstellt dabei eine neue versionierte Markdown-Datei; veraltete Änderungen werden abgelehnt, mehrdeutige Titel nicht automatisch verknüpft. Codeblöcke und bestehende Wikilinks werden bei der Erkennung übersprungen. Geprüft mit einem gezielten Backend-Test über Erkennung, Versionierung und Codeblöcke, Ruff, mypy, TypeScript, Lint, Frontend-Build und einem Playwright-Ablauf mit Fake-Daten.

**4/8 Study Peek:** Wikilinks, Rückverweise, verwandte Notizen und Notiztreffer in der Suche zeigen bei Hover oder Tastaturfokus eine kompakte Vorschau. Auf Geräten ohne Hover öffnet der erste Tipp die Vorschau; aus der Karte lässt sich die Notiz öffnen. Die Karte zeigt Notiztext, Kurs und nur tatsächlich gemessene Anki-/Übungswerte eines gleichnamigen Lernthemas sowie passende offene PDF-Fragen. Ohne ausreichende Daten steht „Zu wenig Daten“. Geprüft mit einem Backend-Test über fehlende und vorhandene Messwerte, Ruff, mypy, TypeScript, Lint, Build und einem Browserablauf bis zum Öffnen der Vorschau.

**Als Nächstes:** Smart Collections, Regel-Builder, Tags/Metadaten und eigene Sprachmemos.

## Phase 1 – Fundament, Moodle, Grundoberfläche

**Status:** Von Marc abgenommen. Die Oberfläche wird nach dem aktualisierten Abschnitt 24 überarbeitet; diese Arbeit erfolgt vor den weiteren Phase-2-Paketen.

**Erledigt:** FastAPI, SQLite/Alembic, `moodle-dl`-basierter Moodle-Zugang, Sync mit Gruppenfilter, unveränderliche Dateiversionen und Sidecars, `rebuild-index`, Scheduler, Benachrichtigungen, Keychain, React/Vite-PWA, CLI, schreibgeschützter Standby, Snapshots, Backups und Dienstvorlagen. Die frühere HTMX/Jinja-Oberfläche wurde entfernt. GitHub-Repo und lokale Entwicklungsansicht sind eingerichtet. Die angepasste Startseite hat keine Kennzahlen-Kacheln; Heute, Kurse, Termine und Mehr bilden die Grundnavigation. Suche und Schnellerfassung sind überall erreichbar.

**Offen:** Visuelle Prüfung aller Hauptseiten und der beschriebene Nutzertest. Ein externes Backup-Ziel und Betriebsprüfungen auf weiteren Geräten stehen bei Marc aus.

**Getestet:** Phase 1 wurde mit Fake-Moodle, Datei- und Gruppenwechsel, Standby, Backup/Wiederherstellung, 158 Python-Tests, 34 Browser-Tests, statischen Checks, Screenshots und Lighthouse abgenommen. Der damalige plattformübergreifende CI-Lauf war grün. Für das neue Startseitenpaket bestanden 169 Python-Tests und vier gezielte Browser-Abläufe mit Fake-Daten und zwei Workern; TypeScript, ESLint, Vitest, Vite-Build, Ruff, mypy und OpenAPI waren grün.

## Phase 2 – Inhalte nutzbar machen

**Status:** In Arbeit. Der aktuelle Stand wird als versioniertes ZIP bereitgestellt; ein GitHub-Push setzt Zugriff auf das private Repository voraus.

**Erledigt:** Geplante Host-Übergabe mit Syncthing- und Snapshot-Prüfung. Textextraktion und FTS5-Suche mit Seitenfundstelle über Unterlagen und Lerntexte; dieselben Inhalte sind offline für neue Suchbegriffe durchsuchbar. iCal, Offline-Lesecache, Befehlspalette und Schnellerfassung mit Offline-Warteschlange. PDF-Viewer mit Fragen, Markierungen und Kommentaren in einem nur anhängenden JSONL-Protokoll, Textanker-Übertragung auf neue Versionen, Prüf-Liste, Offline-Puffer, Fragenexport und markierter PDF-Kopie. LibreOffice-Ansichten für PowerPoint und Word mit Download-Fallback, Kursfreitext und lesbarer Altbestand ohne eigenen Notiz-Editor. Modulschalter und einfache Systemansicht. Gegenseitige Verknüpfungen für Kurse, Materialien, Schnellerfassungen und frühere Notizen. Drop-Ordner mit Kurs- und Abschnittszuordnung, unveränderten Originalen, Versionierung, Textextraktion und Sidecar-Wiederaufbau. Optionaler Sonntagsüberblick mit Vorwoche, Fristen, Kartenstand und offenen Zuordnungen; Pushmeldungen enthalten nur neutrale Hinweise und einen Dashboard-Link.

**Offen:** Die Auswertung verknüpfter Fragen im Lernstand gehört zu Phase 4. Die automatische Ausfallübernahme und die Konfliktbehandlung müssen auf zwei eigenen Geräten geprüft werden. Dafür sind pro Gerät Tailscale Serve und eine eigene Health-Adresse einzurichten. Die Anki-Übertragung mit einem echten Profil und der neue Abgabe-Check mit einer eigenen Moodle-Aufgabe müssen von Marc geprüft werden. Die neuen Datenbankmigrationen und die Migration echter alter Markierungen dürfen erst nach Marcs geprüftem Snapshot erfolgen. Der Docker-Smoke-Test steht weiterhin aus, weil der Docker-Daemon auf diesem Windows-Gerät nicht startet (Docker Desktop beendet sich beim Start ohne nutzbaren Fehler); auf einem Gerät mit laufendem Daemon nachholen.

**Getestet:** 179 Python-Tests bestanden, 2 übersprungen; Ruff, mypy, Typecheck, Lint, Vitest, Build und OpenAPI grün. Gezielte Browserabläufe mit Fake-Daten für Material, Offline-Suche, Verknüpfungen und Drop-Import bestanden. Alte Dateiversionen, Sidecar-Wiederaufbau und FTS-Migration wurden mit Testdaten geprüft. Der vollständige Phasenlauf steht aus; stabile LibreOffice-Installation und persönliche Datenmigration erfordern Marcs Prüfung.

**Neues Arbeitspaket (25.09.2026):** Eine Kartenvorschlags-Warteschlange nimmt JSON-Antworten nur für vorhandene Materialversionen an, begrenzt Vorschläge pro Ressource und lässt Karten vor der Freigabe einzeln bearbeiten, gesammelt freigeben oder ablehnen. Material fremder Gruppen wird zurückgewiesen; der Kurs wird aus der lokalen Ressource bestimmt. Die Oberfläche ist unter „Mehr → Kartenvorschläge“ erreichbar. Ein durch Token geschützter Anki-Agent legt freigegebene Karten über das lokale AnkiConnect an, meldet Notiz-IDs zurück und übernimmt Bewertungen idempotent. Ein erneuter Lauf erkennt bereits erzeugte Notizen und Bewertungen. Der echte Anki-Desktop-Test fehlt noch. Unter „Mehr → KI-Paket“ gibt es einen ZIP-Export für extrahierte Kursmaterialien mit serverseitiger Freigabe pro Kurs und für Material und offene Fragen; fremde Gruppen bleiben ausgeschlossen. Pakete werden unveränderlich in der KI-Inbox gespeichert. Die Outbox prüft JSON-Kartenvorschläge automatisch oder auf Knopfdruck, archiviert Originale und Fehler und erkennt wiederholte Dateien. Weitere Paketvarianten und die spätere Durchführung von Übungsaufgaben fehlen. Für den PDF-Viewer gibt es in Dark Mode eine umschaltbare dunkle Papieransicht, eigenständig mit React-PDF umgesetzt. Der PDF-Code wird erst beim Öffnen eines Dokuments geladen; das Haupt-JavaScript-Bundle sank beim lokalen Build von 1.108 kB auf 467 kB (gzip: 339 kB auf 146 kB). Geprüft: zwei gezielte Python-Tests, der Migrations-Test, Ruff, mypy, Typecheck, ESLint, OpenAPI-Vertrag und Frontend-Build. Gezielte Browserabläufe für KI-Paket und Kartenvorschläge sowie die vier PDF-Browserabläufe bestanden mit lokalen Fake-Daten. Der vollständige Phase-2-Endlauf steht aus.

**Weiteres Arbeitspaket (25.09.2026):** KI-Pakete werden unveränderlich in `DATA_DIR/ai/inbox/` abgelegt. JSON-Antworten aus der Outbox werden alle fünf Minuten oder per Knopf Pydantic-validiert, serverseitig gegen Kursfreigaben geprüft, mit Original und knapper Fehlerdatei archiviert und durch einen Hash-Beleg idempotent übernommen. JSON-Dateien lassen sich auch über die Warteschlange auswählen. Ein optional installierbarer lokaler MCP-Server auf Basis des offiziellen Python-SDK v2 bietet freigegebene Kurse, Materialtext, Suche, Materialänderungen, optional Fristen, Anki-Stand und das Einreichen von Kartenvorschlägen an. Ein Host-Token, Kurs- und Kategorienfreigaben sowie ein Zugriffsprotokoll begrenzen die Werkzeuge. Der öffentliche Fernzugang mit OAuth und weitere Werkzeuge bleiben offen. Geprüft: gezielte Backend- und Migrationsprüfungen sowie ein Browserablauf für die JSON-Dateiauswahl; der vollständige Phasenlauf steht weiter aus.

**Nacharbeit (25.09.2026):** Die MCP-Suche akzeptiert optional eine Kurs-ID und liefert nur Treffer der neuesten Materialversion. Zwei gezielte MCP-Tests, Ruff und mypy bestanden. Eine echte MCP-Client-Verbindung und die Anki-Übertragung mit Marcs Profil sind weiterhin manuell zu prüfen.

**Fragenpaket (25.09.2026):** „Offene Fragen erklären“ erzeugt ein eigenes ZIP mit markierter Stelle, Textkontext, Frage und zugehörigem freigegebenem Material. Ein gesperrter Fragenbereich oder ein Kurs ohne offene Fragen liefert eine klare Fehlermeldung. Der gezielte Backend-Test und Browserablauf bestanden; Ruff, mypy, OpenAPI-Vertrag, Typecheck, ESLint und Frontend-Build waren grün. Der vollständige Phase-2-Endlauf steht weiter aus.

**Frage → Karte (25.09.2026):** Karten können mit `source_question_id` auf eine konkrete offene Frage verweisen. Der Import prüft Frage, Material und Seitenzahl; im Kurs erscheint die Anzahl verknüpfter Kartenvorschläge. Die Fragen-IDs stehen im KI-Paket. Geprüft: gezielter Python-Test, Ruff, mypy, OpenAPI-Vertrag, Typecheck, ESLint, Build und der Kartenvorschlags-Browserablauf. Eine Auswertung nach Lernstand und Reviews bleibt für Phase 4 offen.

**Abgabe-Check und Archiv (25.09.2026):** Im Kurs kann Marc für eine Moodle-Aufgabe den Status ausdrücklich abrufen. Die Abfrage verwendet nur lesende Moodle-Webservices und zeigt Entwurf, Einreichung, Bewertung, Feedback, Abgabeschluss, Verlängerung und soweit geliefert die Zahl ausstehender Gruppenbestätigungen. Ein Entwurf mit erforderlichem finalem Einreichen wird gewarnt. Bei erkannter Einreichung lädt die App die zugehörigen Moodle-Dateien, prüft Größe und SHA-256 und speichert sie mit Status und Zeitpunkt unveränderlich unter `DATA_DIR/uni/.../_Abgaben/`. Einzelne Prüfstände werden ebenfalls nur anhängend gespeichert. Fehlende oder unklare Moodle-Angaben erscheinen als Warnung; die App reicht nichts ein. Geprüft: zwei gezielte Python-Tests, ein Browserablauf mit Fake-Moodle, Ruff, mypy, Typecheck, ESLint, OpenAPI-Vertrag und Frontend-Build. Der vollständige Phase-2-Endlauf und die Prüfung mit Marcs eigenem Konto stehen aus.

**Automatische Ausfallübernahme (25.09.2026):** Der Standby-Dienst kann einen ausgefallenen Host nach wiederholter Prüfung übernehmen, auch während er läuft. Er verlangt einen überfälligen Herzschlag, einen in Tailscale als offline gemeldeten bisherigen Host, einen fehlgeschlagenen HTTPS-Health-Check, vollständigen Syncthing-Abgleich und den neuesten intakten Snapshot derselben Generation. Laufende Anfragen werden vor dem Austausch der lokalen SQLite-Datei beendet, die vorige Datei wird archiviert, die Staffelstab-Generation steigt und der Scheduler startet. Beim Dienststart erfolgt dieselbe Prüfung; `host acquire --after-failure` bietet sie bei gestopptem Dienst an. Ohne eigene Tailscale-Serve-Adresse bleibt diese Funktion gesperrt. Geprüft: 29 betroffene Host-Tests bestanden, zwei plattformbedingt übersprungen; Ruff und mypy waren grün, ebenso der bestehende Browserablauf der geplanten Übergabe mit Fake-Servern. Ein Ausfall mit zwei eigenen Geräten und die Doppel-Host-Konfliktpakete stehen aus.

**Schnellerer Übergabetest (25.09.2026):** Der einzelne Browserablauf startet jetzt drei statt neun lokale Fake-Dienste. Derselbe Test bestand mit der kurzen Konfiguration in 12,9 Sekunden statt zuvor 50,9 Sekunden; der vollständige Mehrgeräte-Lauf bleibt am Phasenende erhalten.

**Doppel-Host-Sicherung (25.09.2026):** Mutierende Dashboard-Anfragen werden lokal vor und nach dem Aufruf als Ereignis protokolliert. Bei erkanntem Verlust des Staffelstabs stoppt der alte Host das Schreiben und legt zuerst lokal, danach im synchronisierten Host-Ordner ein Paket mit Aktionen seit dem gemeinsamen Snapshot und einer geprüften SQLite-Kopie an. Falls die konsistente Kopie scheitert, bleiben die Rohdateien zur manuellen Bergung erhalten. Eine unterbrochene Veröffentlichung kann erneut versucht werden; ein beschädigtes Journal wird als unvollständig angezeigt. Bei gleichzeitigen gültigen Staffelstäben entscheiden Generation, danach Übernahmezeit und Gerätekennung; eine gültige unterlegene Syncthing-Lease-Kopie blockiert den Gewinner nicht. Die Systemseite zeigt Pakete und erlaubt das einzeln bestätigte Übernehmen ausgewählter idempotenter Aktionen. Andere Aktionen müssen anhand der Angaben und der gesicherten Datenbank manuell geprüft werden. Geprüft: 67 betroffene Host-Tests bestanden, zwei plattformbedingt übersprungen; Ruff, mypy, Typecheck, Lint, OpenAPI, Build und ein Browserablauf mit lokalen Fake-Daten waren grün. Die vollständige Erfassung aller Nutzeraktionen, weitere Replay-Arten und ein echter Test mit zwei Geräten stehen aus.

**Staffelstab-Wahl nach Syncthing-Konflikt (25.09.2026):** Wenn Syncthing den unterlegenen Eintrag als `lease.json` belässt, darf der aktive Gewinner seinen eigenen gültigen Konflikteintrag nach erneuter Wahl wieder zum Haupt-Staffelstab machen. Der verdrängte Eintrag wird vor der Korrektur unveränderlich unter `DATA_DIR/host/lease-resolutions/` archiviert. Dies funktioniert auch nach einem Dienstneustart. Ohne nachweisbaren eigenen Konflikteintrag bleibt das Gerät im Lesemodus. Geprüft: 70 betroffene Host-Tests bestanden, zwei plattformbedingt übersprungen; Ruff und mypy waren grün. Eine reale Syncthing-Kollision mit zwei eigenen Geräten steht noch aus.

**Konflikte im Alltag prüfen (25.09.2026):** Ein ungeprüftes Konfliktpaket erscheint jetzt als vorrangiger Hinweis auf „Heute“ und führt zur Systemseite. Die Paketliste wird während der Nutzung alle 30 Sekunden aktualisiert. Nach Sichtung aller aufgezeichneten Aktionen kann Marc die Prüfung ausdrücklich abschließen; dieser Beleg wird im gemeinsamen Paket abgelegt und bleibt auf anderen Geräten erkennbar. Die Sicherung selbst bleibt erhalten, der Hinweis auf „Heute“ verschwindet. Geprüft: sieben gezielte Backend-Tests, TypeScript-Build, ESLint, Ruff, mypy, OpenAPI und ein Browserablauf vom Startseitenhinweis über Einzelübernahme bis zum Abschluss. Die Vollständigkeit der Aktionen und eine reale Zwei-Geräte-Prüfung stehen weiterhin aus.

**Übungsvorschläge (25.09.2026):** Das KI-Paket kann nun ein Schema und eine Arbeitsanweisung für materialgebundene Übungsaufgaben ausgeben. JSON-Antworten gelangen per Datei, Text, Outbox oder lokalem MCP-Werkzeug in eine eigene Warteschlange. Quelle, Materialversion, Seitenzahl und Kursfreigabe werden serverseitig geprüft; fremde Gruppen sind ausgeschlossen. Fragen, Schwierigkeit, Musterlösung und Lösungsschritte lassen sich vor ausdrücklicher Freigabe bearbeiten oder ablehnen. Die Übungsvorschläge erzeugen keine Anki-Karten und starten noch keine Lernsession. Das KI-Modul ist in der Oberfläche standardmäßig ausgeblendet und unter Einstellungen aktivierbar. Der neue Datenbankschritt bewahrt ältere Outbox-Belege mit `exercise_count = 0`. Geprüft: sieben gezielte Backend- und Migrationsprüfungen, Ruff, mypy, OpenAPI-Vertrag und der gezielte Browserablauf mit lokalem Fake-Server. Ein echter KI-Rücklauf und die spätere Durchführung der Übungen stehen aus.

**Frühere Notizen nur lesend (25.09.2026):** Die alte API für das Anlegen und Ändern eigenständiger Markdown-Notizen wurde entfernt. Vorhandene Notizen und frühere Versionen bleiben über Dashboard und Suche lesbar und können weiterhin mit Schnellerfassungen verknüpft sein. Gezielt geprüft: vier Backend-Tests, Ruff, mypy, OpenAPI-Vertrag, Frontend-Typecheck, Lint, Build und der Browserablauf für frühere Notizen mit Fake-Daten. Eine Umstellung echter Bestandsdaten war dafür nicht nötig.

**PDF-Suche (25.09.2026):** Der Viewer durchsucht den Text des geöffneten PDFs lokal im Browser, zeigt Anzahl und Fundseiten, führt zur ersten Fundseite und bietet Vor-/Zurück-Navigation sowie einen Fortschritt bei längeren Dokumenten. Reine Bildscans ohne Text liefern keine Treffer. Der gezielte Browserlauf mit einer erfundenen zweiseitigen PDF bestand inklusive 390-px-Breite; Typecheck, ESLint und Frontend-Build waren grün.

**Kopierbares KI-Paket (25.09.2026):** Für einen Kurs lassen sich einzelne Ressourcen mit extrahiertem Text und ein Zeitraum nach dem Download-Datum ihrer neuesten Version auswählen. Derselbe serverseitig geprüfte Inhalt kann als ZIP oder bis 100 kB als Textfassung erzeugt werden; beides wird unveränderlich in der lokalen KI-Inbox abgelegt. Bei größeren Textpaketen verweist die API auf ZIP. Die Oberfläche zeigt den Text vor dem Kopieren. Fremdgruppen-Material, gesperrte Kurse und Kategorien bleiben auch für den neuen Weg ausgeschlossen. Geprüft: gezielter Backend-Test mit Freigaben, Zeitraum und Größenlimit, Ruff, mypy, Typecheck, ESLint, Frontend-Build und ein Browserablauf mit Fake-Daten.

**Kursübergreifendes KI-Paket (25.09.2026):** Ein Zeitraum kann jetzt über alle für KI-Material freigegebenen Kurse gewählt werden. Mindestens eine Datumsgrenze ist Pflicht. Material und Fragen werden nach Kurs- und Kategorienfreigabe gefiltert; fremde Gruppen, gesperrte Kurse und explizit angeforderte gesperrte Ressourcen bleiben ausgeschlossen. Manifest und Arbeitsanweisung kennzeichnen die Kurszuordnung. Gezielt geprüft: fünf Backend-Tests, Ruff, mypy, OpenAPI-Vertrag und generierte Typen, Frontend-Build und ein Browserablauf mit Fake-Daten. Der echte Inhaltsabgleich mit eigenen Kursen und der Phase-2-Endlauf stehen aus.

**Host-Aktionen außerhalb des Dashboards (25.09.2026):** Automatische und per CLI gestartete Sync-Läufe, die automatische Verarbeitung vorhandener KI-Outbox-Dateien sowie `rebuild-index`, `rebuild-annotations` und `migrate-annotations` erscheinen jetzt als datenarme Einträge im lokalen Aktionsprotokoll und damit im Doppel-Host-Konfliktpaket. Ein unklarer oder fehlgeschlagener Ausgang bleibt zur Prüfung sichtbar, weil zuvor bereits Änderungen gespeichert worden sein können. Die entsprechenden Dashboard-Aktionen werden weiterhin einmal durch ihre HTTP-Anfrage protokolliert. Die internen Einträge nennen nur den Vorgang und dienen der manuellen Prüfung anhand der gesicherten Datenbank; sie werden nicht automatisch nachgespielt. Gezielt geprüft: neun Outbox- und Host-Recovery-Tests, vier Gruppensync-Tests mit kurzem Windows-Testpfad, Ruff, mypy, Frontend-Typecheck/Lint/Build und der Konflikt-Browserablauf mit Fake-Daten. Weitere Schreibpfade und der Zwei-Geräte-Test bleiben offen.

**Vollständigkeit des Konfliktpakets (25.09.2026):** Ein neuer Host-Snapshot hält Länge und SHA-256-Prüfsumme des lokalen Aktionsprotokolls fest. Ein separat aktualisierter lokaler Journal-Kopf enthält eine fortlaufende Prüfkette über alle Einträge. Das spätere Konfliktpaket meldet die Aktionsliste nur dann als vollständig, wenn der damalige Protokollanfang unverändert ist, die aktuelle Prüfkette stimmt und die Einträge lesbar sind. Fehlende, gekürzte, teilweise geschriebene oder verwaiste Ergebniseinträge sowie ein fehlender Journal-Kopf werden als unvollständig angezeigt; ältere Snapshots ohne Prüfdaten gelten vorsichtshalber ebenfalls als unvollständig. Automatische Fristwarnungen, Warnungen bei ausbleibendem Sync und der Sonntagsüberblick erscheinen als eigene, nicht automatisch nachspielbare Vorgänge. Geprüft: betroffene Host-, Scheduler- und Übergabetests mit Fake-Daten, Ruff, mypy, Typecheck, ESLint, Build und ein Konflikt-Browserablauf. Ein realer Zwei-Geräte-Test und die Prüfung weiterer Schreibpfade stehen aus.

**Aktionen trotz verstellter Geräteuhr (25.09.2026):** Das Konfliktpaket bestimmt den Zeitraum seit dem gemeinsamen Snapshot jetzt anhand der gesicherten Byte-Position im lokalen Aktionsprotokoll. Ein nach dem Snapshot abgeschlossener Vorgang bleibt dadurch auch bei zurückgestellter Systemuhr sichtbar. Nicht abgeschlossene frühere Absichten bleiben zur vorsichtigen Prüfung enthalten; Einträge mit Ergebnis vor dem Snapshot werden ausgelassen. Bei fehlender oder beschädigter Positionsprüfung zeigt das Paket sämtliche lesbaren Vorgänge und kennzeichnet die Liste als unvollständig. Gezielt geprüft: Host-Recovery-Test mit zurückgestelltem Zeitstempel sowie Ruff und mypy. Der Zwei-Geräte-Test steht weiter aus.

**Ruhigerer PDF-Reader (25.09.2026):** Die bisher dauerhaft sichtbare rechte Spalte ist nun eine per Knopf öffnende Detailansicht; das PDF nutzt standardmäßig die verfügbare Breite und passt die Seite bei schmalen Fenstern ein. Eine manuelle Vergrößerung und „Seite einpassen“ bleiben verfügbar. Auf dem Desktop erscheint die Detailansicht seitlich, auf dem Handy als Blatt von unten. Sie enthält weiter offene Fragen, Markierungen, nicht zugeordnete Stellen, offline vorgemerkte Einträge und Verknüpfungen. Links auf eine konkrete Frage öffnen die Ansicht automatisch; „Stelle anzeigen“ und die erneute Zuordnung schließen sie für die Arbeit im PDF. Geprüft: TypeScript, ESLint, Build und vier gezielte Material-Browserabläufe mit Fake-Daten, einschließlich 390-px-Ansicht und eingepasster Seite.

**Backup im Konfliktpaket und per CLI (25.09.2026):** Der geplante und der manuelle restic-Lauf schreiben vor der ersten Dateiänderung einen datenarmen Vorgang ins lokale Host-Protokoll; Erfolg und Fehlschlag erscheinen getrennt im Konfliktpaket zur manuellen Prüfung. `unios backup` erstellt bei gestopptem Host-Dienst die Sicherung und liefert einen maschinenlesbaren Erfolgsstatus. Der Befehl verlangt den Staffelstab und zeigt keine Geheimnisse an. Geprüft: neun gezielte Backup-, CLI- und Standby-Tests mit Fake-Daten und kurzem Windows-Testpfad, Ruff, mypy sowie Frontend-Typecheck und ESLint. Weitere Schreibwege und der reale Zwei-Geräte-Test bleiben offen.

**Snapshot-Zeitfenster geschlossen (25.09.2026):** Der Protokoll-Anker wird nun vor dem Erzeugen der SQLite-Kopie festgeschrieben. Ein Vorgang, der während der Kopie abgeschlossen wird, erscheint damit später im Konfliktpaket, selbst wenn die Kopie ihn noch nicht enthält. Ein zusätzlich aufgeführter Vorgang ist vorsichtiger als ein verlorener. Der gezielte Zwischenfall-Test und die übrigen Host-Recovery-Tests mit Fake-Daten, Ruff und mypy wurden geprüft; die Prüfung auf zwei eigenen Geräten bleibt offen.

**Jede Konfliktänderung einzeln prüfen (25.09.2026):** Ein Konfliktpaket kann erst abgeschlossen werden, wenn jede aufgezeichnete Aktion auf dem neuen Hauptgerät übernommen oder nach Abgleich mit dem aktuellen Stand ausdrücklich einzeln als geprüft bestätigt wurde. Diese Bestätigung erhält einen eigenen unveränderlichen Beleg im Paket; sie eignet sich auch für Sync, Backup und andere nicht automatisch nachspielbare Vorgänge. Ein bloßes Öffnen aller Einträge reicht nicht mehr. Gezielt geprüft: 17 Host-Recovery-Tests, Ruff, mypy, Typecheck, ESLint, Build, aktueller OpenAPI-Vertrag und der Browserablauf mit einer automatisch übernehmbaren und einer manuell zu prüfenden Aktion. Der reale Zwei-Geräte-Test bleibt offen.

**MCP-Lesezugriffe im Host-Protokoll (25.09.2026):** Auch lesende MCP-Werkzeuge verändern durch ihr Zugriffsprotokoll die lokale Datenbank. Diese GET-Aufrufe werden daher vor der Verarbeitung als datenarme Aktionen erfasst, ohne Token und Suchparameter. Status- und Auditansicht bleiben lesend. Die Schreibweg-Inventur deckt damit Dashboard-Mutationen, MCP-Audit, Sync, KI-Outbox, Frist- und Wochenaufgaben, Backup sowie die vorhandenen CLI-Wartungsbefehle ab. Ableitbare Office-PDF-Vorschauen und Host-Lease-Dateien sind keine eigenständigen Nutzeränderungen. Geprüft: 20 gezielte Host- und MCP-Tests mit Fake-Daten, Ruff, mypy, Typecheck und ESLint. Der vollständige Phase-2-Endlauf und die reale Prüfung auf zwei Geräten stehen aus.

**Textanker bei mehrfacher Stelle (25.09.2026):** Bei einer neuen PDF-Version kann die Markierungsübertragung jetzt mehrere Vorkommen desselben Texts auf einer Seite anhand des gespeicherten Textkontexts unterscheiden. Bei Gleichstand oder wenn die PDF-Rechtecke nicht eindeutig den Textvorkommen zuzuordnen sind, bleibt die Markierung in der Prüfliste statt eine Position zu raten. Neun gezielte Materialtests mit erfundenen PDFs sowie Ruff und mypy bestanden. Auf Windows liefen die Tests mit `python -X utf8`, damit der Test selbst UTF-8-Ereignisse korrekt liest.

**Markierungsprotokoll vor Index-Wiederaufbau prüfen (25.09.2026):** `rebuild-index` bricht jetzt ab, wenn zu einem Datenbankeintrag das JSONL-Protokoll fehlt oder dessen letzte Revision älter als der Datenbankindex ist. Dadurch wird ein unvollständiges Protokoll nicht als wiederherstellbare Quelle ausgegeben und ein neuerer Stand nicht still zurückgesetzt. Die vorhandene Migration alter Revisionsdateien bleibt der Weg für fehlende JSONL-Protokolle und verlangt weiterhin einen geprüften Host-Snapshot. Geprüft: 15 gezielte Material- und Wiederaufbau-Tests mit Fake-Daten, Ruff und mypy.

**Vollständige Markierungen nur im Ereignisprotokoll (25.09.2026):** Die Migration `a742e10f8c31` entfernt Textkontext und PDF-Rechtecke aus `material_annotations`. Die Tabelle behält nur nachbaubare Listen- und Suchfelder, einschließlich markiertem Text und Kommentar für FTS5; vollständige Anker und die Änderungshistorie kommen aus den JSONL-Ereignissen. Vor der Schemaänderung vergleicht die Migration jeden vorhandenen Datenbankeintrag mit seinem vollständigen Journalstand und bricht bei fehlenden oder abweichenden Daten ab. Materialansicht, Fragenliste und KI-Paket verweigern bei verlorenem Journal den Rückgriff auf den Datenbanktext. `rebuild-annotations` erlaubt den Index-Wiederaufbau vor der Schemaänderung, auch aus dem bisherigen Schema. Die Migrationsreihenfolge nach geprüftem Snapshot steht in `MANUELL_TESTEN.md`. Geprüft: gezielte Material-, KI-, Anki-, Such-, Migrations- und CLI-Tests mit Fake-Daten, Ruff, mypy, OpenAPI-Vertrag, Frontend-Build und fünf Browserabläufe für Material und KI. Die echte Datenmigration und der Phase-2-Endlauf stehen aus.

**Phasenend-Lauf und Testnacharbeit (25.09.2026):** Die Hauptnavigation zeigt wieder genau vier Bereiche; „Mehr“ ist am Desktop separat in der Seitenleiste und mobil oben erreichbar. Der vollständige Browserlauf erreichte 54 von 55 erfolgreichen Abläufen. Der letzte Fall wählte nach einer Dateiversionierung zwei gleichnamige PDF-Zeilen; die korrigierte, ausdrücklich auf Version 1 begrenzte Suche bestand anschließend gezielt (drei Suchabläufe grün). Der vollständige Python-Lauf erreichte 219 bestandene, neun übersprungene und einen fehlgeschlagenen Test; dort wurde ein UTF-8-Protokoll unter Windows ohne Encoding gelesen. Der korrigierte Materialtest bestand gezielt. Vitest (3 Tests), Typecheck, ESLint, Build, Ruff, mypy und OpenAPI-Vertrag sind grün. Die vollständigen Läufe wurden nach den beiden reinen Testkorrekturen nicht erneut gestartet, um unnötige Wiederholung zu vermeiden. Screenshots aus den Browserabläufen liegen lokal im ausgeschlossenen `frontend/test-results/`; die persönliche Geräte- und Kontoprüfung, Lighthouse und Docker-Smoke bleiben für die Phase-2-Abnahme offen.

**Offene Fragen unter Lernen (25.09.2026):** Die vier Hauptbereiche enthalten nun auch „Lernen“. Dort erscheinen PDF-Fragen kursübergreifend mit Kurs, Material und Ursprungsseite; geklärte Fragen lassen sich einblenden, Fragen direkt abhaken oder wieder öffnen und die markierte Stelle im Viewer öffnen. Die API liest den Fragetext aus dem JSONL-Protokoll und öffnet für die Übersicht keine PDFs. Die Liste wird offline zwischengespeichert. Geprüft: drei gezielte Backend-Tests, Ruff, mypy, OpenAPI-Vertrag, Typecheck, ESLint, Build und ein Browserablauf mit Fake-Daten einschließlich Abhaken und PDF-Sprung. Lernstand und Kartentraining bleiben in den späteren Phasen.

**Rückweg für KI-Erklärungen (25.09.2026):** Das Paket „Offene Fragen erklären“ enthält nun `explanation_schema.json` und die Frage-IDs in der Anleitung. Antworten lassen sich unter „Mehr → KI-Erklärungen“ als JSON-Datei oder Text übernehmen oder über die überwachte KI-Outbox einlesen. Schema, Frage, Journal, Kurs- und Kategorienfreigaben werden serverseitig geprüft; Original und Fehlerdatei bleiben im Outbox-Archiv. Erklärungen werden erst nach ausdrücklicher Bearbeitung und Freigabe unter „Lernen“ angezeigt, ohne die Nutzerfrage zu überschreiben oder sie automatisch abzuhaken. Die neue Migration `b89d170c2f42` bewahrt ältere Outbox-Belege mit `explanation_count = 0`. Direkte URLs für „Lernen“ und „KI-Erklärungen“ funktionieren im Produktionsserver. Geprüft: gezielte KI-Paket-, Outbox-, Migrations- und URL-Tests mit Fake-Daten, Ruff, mypy, Typecheck, ESLint, Build und ein Browserablauf; echte Migration erst nach geprüftem Snapshot.

**Vollständiger Phase-2-Endlauf (26.09.2026):** Erster durchgängig grüner Phase-2-Endlauf mit Fake-Daten: 261 Python-Tests bestanden, 9 übersprungen (plattformbedingt), Ruff und mypy grün. Beim OpenAPI-Abgleich waren die generierten Frontend-Typen veraltet; `npm run api:generate` neu ausgeführt, danach Typecheck und Build erneut grün. Der vollständige Playwright-Lauf (31 Specs) deckte drei echte Testisolationsfehler auf, die nur beim gemeinsamen Lauf aller Specs gegen den einen dauerhaften Fake-Server auftreten, nicht bei gezielten Einzelläufen: `practice.spec.ts` klickte einen ungeschachtelten „Aufgabe üben“-Knopf, der bei mehreren gleichzeitig freigegebenen Übungen mehrdeutig wird (jetzt auf die Zeile der eigenen Frage eingegrenzt); `search.spec.ts` griff nach einer Dateiversionierung auf einen Zeilen- statt Versions-Locator zu und traf dadurch zwei „Im Material arbeiten“-Links derselben Ressource (jetzt auf die richtige Versions-Zeile eingegrenzt); `projects.spec.ts` hinterließ nach dem Abgabe-Vorschau-Test einen offenen `submission_attempts`-Datensatz, der den späteren `submission-flow.spec.ts`-Lauf für dieselbe Aufgabe blockierte, weil `/api/__test__/submission-write-reset` bisher nur den Fake-Moodle-Status zurücksetzte, nicht die echte Tabelle (Reset-Endpunkt löscht jetzt zusätzlich `submission_attempts`). Nach den drei Fixes bestand der volle Lauf zweimal hintereinander mit 66 von 66 Abläufen. Vitest, Typecheck, ESLint, Frontend-Build und OpenAPI-Vertrag waren grün. Lighthouse Accessibility erneut bei 100. Screenshots aller Hauptseiten in Hell/Dunkel und Desktop/390 px wurden neu erzeugt und stichprobenhaft geprüft, keine sichtbaren Überlappungen oder Technikbegriffe. Der Docker-Smoke-Test blieb offen: Docker Desktop startet auf diesem Gerät nicht (Daemon-Prozess beendet sich sofort wieder, kein Fehlerdialog); auf einem Gerät mit laufendem Docker nachholen. Einmalig trat bei `material.spec.ts` unter hoher Last (voller Lauf) ein 409 auf `/api/material/{id}` auf, das sich in zwei gezielten Wiederholungsläufen nicht reproduzieren ließ; möglich ist eine seltene Lastspitze bei der Journal-Prüfung in `annotations_for`/`_historic_position`. Kein Fix, da nicht zuverlässig reproduzierbar; bei erneutem Auftreten zuerst dort ansetzen. Alles Übrige aus der bisherigen „Offen“-Liste bleibt an Marcs eigene Geräte, Konten und den geprüften Snapshot gebunden und ist in `MANUELL_TESTEN.md` beschrieben.

## Phase 3 – Hochschulsysteme, Projekte, Abgaben

**Status:** In Arbeit. **Erledigt:** Vorbereitete Hochschulprofile und Fake-Server-Grundlagen; lokale Kursprojekte mit Moodle-Aufgaben, Frist, Mitgliedern, Links, To-dos und Notizen; lesende GitHub-Übersicht auf Knopfdruck mit lokalem Fine-grained Token; Projekt-Verknüpfungen, optionale Git-Spiegelung und lokale Suche im letzten gesicherten Commit auch über freigegebenes MCP; bestätigungspflichtiger Moodle-Dateiabgabeflow mit lokaler Fake-Abnahme; manuelle Noten- und ECTS-Ansicht mit getrenntem Was-wäre-wenn; lokaler sichtbarer Portal-Login-Helfer und GET-beschränkter Lesetransport; konfigurierbare PRIMUSS-Vorschau, proof-gebundene Prüfungsanmeldungen bei stabilem Portal-Schlüssel, getrennter Noten-/ECTS-Abgleich und Rückmeldeabgleich mit Frist und Statushistorie; manueller und geplanter lesender mycampus-Abgleich für Stundenplan, Veranstaltungen und News; öffentliche Coburger Semesterzeiten als zweite, allgemeine Fristenquelle; lokal geprüfter getrennter MCP-Fernprozess mit OAuth. **Offen:** Echte Abgabe-Abnahme mit Marcs Konto; Coburger Portal-Seitenstrukturen und Kontoabnahme, Mail und Prüfung des MCP-Fernzugangs mit einem eigenen HTTPS-Tunnel und KI-Client. Echte Seitenstrukturen sollen mit einem von Marc selbst ausgeführten Anonymisierungsbefehl gewonnen werden. **Getestet:** Gezielte Projekt-, Abgabe-, Noten-, Rückmelde-, mycampus- und MCP-Prüfungen mit Fake-Daten; noch kein vollständiger Phasenlauf.

**Projektbereich und Qualitätsprüfung (25.09.2026):** „Mehr → Projekte“ ist in den erweiterten Einstellungen einzeln aktivierbar und bleibt sonst ausgeblendet. Projekte können erstellt, bearbeitet, archiviert und wiederhergestellt werden; beim Ändern verhindert eine Revisionsprüfung das stille Überschreiben eines zwischenzeitlich geänderten Projekts. Moodle-Aufgaben dürfen nur aus dem gewählten Kurs stammen. Die Projektseite zeigt Kurs, Frist, Aufgaben samt Link zum Abgabe-Check, To-dos, Mitglieder, Links und Notizen. GitHub wird ausschließlich auf ausdrücklichen Knopfdruck mit `GET` von der festen API-Domain gelesen; die letzten 20 Commits, Issues, Pull Requests und Branches sowie daraus gezählte Mitgliedsaktivität werden angezeigt. Der Token bleibt in der privaten lokalen Konfiguration; für ausgewählte Repositories sind Contents, Issues und Pull requests jeweils mit Leserechten nötig. Ohne Token erscheint ein Einrichtungshinweis. Geprüft: drei gezielte Python-Tests einschließlich frischer Alembic-Migration und Mock-GitHub, Ruff, mypy, Typecheck, ESLint, Build und ein Browserablauf für Anlegen, To-do und Archiv mit erfundenen Daten. Die Projektseite wurde zusätzlich auf Desktop und 390 px aufgenommen und ohne horizontalen Überlauf geprüft. Ein Live-GitHub-Repo, reale Datenmigration und Abnahme mit echten Geräten sind offen.

**Phase-2-Qualität (25.09.2026):** Das Lighthouse-Skript läuft auf Windows mit Fake-Daten und speichert Berichte ausschließlich unter `frontend/test-results/lighthouse/`. Die Startseite erreichte 100 Punkte bei Accessibility. Ein gezielter Screenshot-Ablauf für die Hauptseiten in Hell/Dunkel und Desktop/390 px bestand; vier Aufnahmen wurden visuell geprüft, ohne sichtbaren Überlauf. Der alte PWA-Lighthouse-Modus wurde nicht ausgeführt. Docker CLI ist installiert, aber der Daemon lief auf diesem Gerät nicht; der Docker-Smoke steht aus. Persönliche Geräte- und Kontoprüfungen aus Phase 2 stehen ebenfalls aus.

**Projekt-Verknüpfungen und Git-Spiegelung (25.09.2026):** Projekte sind nun Ziele der generischen „Verknüpft mit …“-Suche; Kurs und Projekt zeigen den Link in beiden Richtungen. Archivierte Projekte bleiben über vorhandene Links erreichbar, werden aber nicht neu vorgeschlagen. Das ausgeschaltete Projektmodul blendet diese Links in der Oberfläche aus. Ein Projekt mit GitHub-Repository bietet zusätzlich „Repository sichern“: `git clone --mirror` beim ersten Mal und danach `git fetch` ohne Prune, nur nach ausdrücklichem Klick. Die Quelle ist auf `https://github.com/Eigentümer/Name.git` begrenzt; Git benutzt die lokale Anmeldehilfe, der API-Token wird nicht in Prozessargumente geschrieben. Jeder erfolgreiche Abruf erhält ein unveränderliches JSON-Manifest unter `DATA_DIR/projects/mirrors/snapshots/`, einen Datenbankeintrag und eigene Git-Referenzen, sodass frühere Commits erreichbar bleiben. Es gibt keinen Push-Aufruf. Getestet: acht gezielte Backend-Tests für Projekte, Links, Migration, Mock-GitHub und zwei Versionen eines lokalen Git-Repos; Ruff, mypy, OpenAPI, Typecheck, ESLint, Build sowie zwei Browserabläufe mit Fake-Daten sind grün. Eine echte private Git-Anmeldung und die Datenmigration auf Marcs Bestand sind noch nicht abgenommen.

**Lokale Repository-Suche (25.09.2026):** Nach einer Sicherung durchsucht die Projektseite den gespeicherten HEAD-Commit lokal mit Git und zeigt bis zu 30 Fundstellen mit Datei, Zeile und kurzem Text. Die Suche ruft GitHub nicht auf und beschränkt Laufzeit, Suchbegriff und Ergebnislänge. Der lokale MCP-Client kann Projekte auflisten und gesicherte Repositories durchsuchen, wenn die neue Kategorie „Projekt-Repositories“ ausdrücklich freigegeben ist; Kursfreigaben gelten zusätzlich. Der gezielte Backend-Test mit erfundenem lokalem Git-Repository prüft Treffer, fehlende Sicherung, standardmäßig gesperrtes MCP und gesperrte Kurse. Ruff, mypy, TypeScript, ESLint, Frontend-Build, OpenAPI-Abgleich und ein gezielter Browserablauf mit Fake-Daten sind grün. Eine echte private Git-Anmeldung und große Repositories sind noch nicht geprüft.

**Projekt-ZIP aus gesichertem Commit (25.09.2026):** Die Projektseite bietet nach einer Repository-Sicherung einen ZIP-Download des zuletzt protokollierten Commits. `git archive` arbeitet ausschließlich mit dessen geprüfter Objektkennung in der lokalen Spiegelung, ohne GitHub-Aufruf oder Checkout; die Ausgabe ist auf 100 MB begrenzt. Das ZIP kann anschließend im bestätigungspflichtigen Moodle-Abgabeflow gewählt werden. Ein gezielter Backend-Test prüft den ZIP-Inhalt und fehlende Sicherung; TypeScript, ESLint, Ruff, mypy, OpenAPI und der fokussierte Projekt-Browserablauf sind grün.

**Bestätigte Moodle-Dateiabgabe (25.09.2026):** Unter „Einstellungen → Mehr Einstellungen“ ist „Abgabe über die App“ zunächst ausgeschaltet. Nach Aktivierung lassen sich an einer Moodle-Aufgabe Dateien auswählen und gegen die aktuell gelesenen Moodle-Grenzen für Anzahl, Dateigröße, erlaubte Endungen, Frist und bestehenden Status prüfen. Die App zeigt Kurs, Aufgabe, Datei-Hexwerte, verbleibende Zeit und ob Moodle einen Entwurf oder eine Einreichung erwartet. Eine vorhandene Einreichung und eine von Moodle gelieferte Eigenständigkeitserklärung benötigen jeweils eine eigene Bestätigung. Erst nach der zusätzlichen Gesamtbestätigung werden Dateien ohne Token in der URL in Moodles Entwurfsbereich hochgeladen, gespeichert und gegebenenfalls final eingereicht. Anschließend fragt die App den Status erneut ab, lädt die Dateien zur Hash-Prüfung zurück und aktualisiert das unveränderliche Abgabe-Archiv. Jeder gestartete Versuch wird in `submission_attempts` erfasst; unklare oder unterbrochene Ergebnisse werden nicht automatisch wiederholt. Fehlen eindeutige Moodle-Vorgaben, bricht der Flow vor dem Schreiben mit Verweis auf Moodle ab. Eine neue Abhängigkeit `python-multipart` ist für den Dashboard-Dateiupload direkt festgelegt. Die atomare Ablage benutzt kurze temporäre Dateinamen für Windows-Pfade. Geprüft: gezielte Fake-Moodle-Tests für gesperrten Standard, ausdrückliche Bestätigung, Erfolg, Uploadfehler, Hash-Abweichung und Wiederholungssperre; bestehende Status-/Archivtests sowie zwei Tests zur atomaren Ablage; Ruff, mypy, TypeScript, ESLint, Build, OpenAPI-Abgleich und ein Playwright-Ablauf. Eine echte Moodle-Abgabe wurde nicht ausgelöst; die Live-Anpassung der konkreten Moodle-API bleibt offen.

**Nachprüfung des Abgabeablaufs (25.09.2026):** Auch ein vorhandener Moodle-Entwurf verlangt nun eine eigene Ersetzungsbestätigung. Die Bestätigung beansprucht einen vorbereiteten Versuch mit einem atomaren Datenbank-Update; Antworten der Abgabe-API tragen `Cache-Control: private, no-store`. Der gezielte Fake-Moodle-Test mit vorhandenem Entwurf, Ruff, mypy, TypeScript, ESLint, Build und der angepasste Playwright-Ablauf bestanden. Die Anleitung für die kontogebundene Prüfung und die Migration `7b690dc715cf` steht in `MANUELL_TESTEN.md`.

**Manuelle Noten und ECTS (25.09.2026):** „Mehr → Noten und ECTS“ ist als eigenes, zunächst ausgeblendetes Modul erreichbar. Manuell erfasste Module enthalten ECTS, Status, Versuch, Note und optional ein selbst geprüftes Gewicht aus der Prüfungsordnung; ihre Herkunft bleibt sichtbar. Erreichte und geplante ECTS werden pro Semester und gesamt angezeigt. Der Schnitt nutzt nur benotete, bestandene Module und nur dann die eingetragenen Gewichte, wenn diese für alle berücksichtigten Module vorliegen; sonst ist er klar als einfacher ECTS-gewichteter Schnitt beschriftet. Hypothetische Noten für offene Module werden nur für die Was-wäre-wenn-Rechnung verwendet und nicht gespeichert. Bearbeitungen und Archiv/Wiederherstellung erzeugen eine Revisionshistorie, und die API-Antworten werden nicht offline gecacht. Die Migration `4e6c2d901ab7` und der Prüfschritt am echten Bestand stehen in `MANUELL_TESTEN.md`. Geprüft: ein gezielter Backend-Test für ECTS, Durchschnitt, Simulation, Revisionskonflikt und Archiv sowie ein Browserablauf mit erfundenen Modulen; Ruff, mypy, TypeScript, ESLint, Build und OpenAPI-Abgleich waren grün. PRIMUSS-Datenübernahme, die tatsächliche Prüfungsordnungsgewichtung und die Abnahme mit persönlichen Daten bleiben offen.

**Portal-Login-Helfer und Lesetransport (25.09.2026):** Der optionale Helfer unter `clients/login_helper` öffnet auf dem Host einen sichtbaren Playwright-Browser; Login und MFA macht Marc selbst. Er erfasst nur Cookies und Browser-Speicher des konfigurierten Portal-Hosts und hält die Session einschließlich einer möglichen PRIMUSS-Session-URL ausschließlich im sicheren OS-Schlüsselbund. Der neue Transport kann mit dieser Session nur HTML über GET vom konfigurierten HTTPS-Host lesen; fremde Weiterleitungen, andere Inhaltstypen und zu große Seiten werden ohne Wiedergabe der Session-URL abgewiesen. Das Portal-Extra ergänzt Playwright, bleibt für die Standardinstallation optional. Drei gezielte Tests mit erfundenen Sessions und einem Mock-Transport bestanden; Ruff und mypy sind grün. Ein tatsächlicher Login, die Übergabe von einem anderen Gerät, die Erkennung aller Login-Abläufe und die fachliche PRIMUSS-/mycampus-Auswertung stehen aus.

**PRIMUSS-Lesevorschau (25.09.2026):** Die Notenseite enthält nun eine Vorschau für Prüfungen, Anmeldestatus, Anmeldefristen und Notentexte. Der Abruf ist erst mit ausdrücklich konfigurierten CSS-Selektoren aktiv, arbeitet über den bestehenden GET-Transport und speichert die Vorschau nicht. `beautifulsoup4` ist für die HTML-Auswertung ergänzt; damit bleiben Selektoren im Hochschulprofil statt im Code. Unbekannte oder widersprüchliche Statusangaben bleiben „Unklar“; Datumswerte ohne Zeitzone werden nicht übernommen. Das Coburger Profil enthält noch keine geprüften Selektoren, deshalb ist die Vorschau dort derzeit gesperrt. Zwei gezielte Tests mit erfundenem HTML prüfen Parser, GET-Abrufe und ausbleibende Datenbankänderungen; Ruff, mypy, TypeScript, ESLint, Produktionsbuild und OpenAPI-Abgleich sind grün. Ein fokussierter Playwright-Ablauf mit Fake-Antworten prüft den sichtbaren Status und den unveränderten ECTS-Schnitt. Echte PRIMUSS-Seiten, Kontoabnahme, Screenshots als Anmeldungsnachweis, persistenter Abgleich und die Form der Seitenlinks sind offen.

**Lokaler Export anonymisierter Portalbeispiele (25.09.2026):** Nach Marcs eigenem sichtbarem Login kann der Helfer bis zu fünf selbst geöffnete Seiten im Browser erfassen und direkt als anonymisiertes ZIP außerhalb des Projekts speichern. Ein separater Offline-Befehl verarbeitet bereits selbst gespeicherte HTML-Dateien. Sichtbarer Text, URLs, Skripte, Formulare, Zeitwerte und originale CSS-Klassen/IDs werden entfernt; die Rückübersetzung der neutralen CSS-Kürzel bleibt ausschließlich im System-Schlüsselbund des Hosts. Die PRIMUSS-Vorschau löst solche Kürzel bei vorhandener Alias-ID lokal auf und bleibt ohne Zuordnung gesperrt. Das ZIP muss Marc vor dem Teilen selbst prüfen. Die Export- und Schlüsselbundtests nutzen nur erfundene HTML-Seiten; kein Hochschul-Login wurde ausgeführt. Ein anonymisiertes Coburger Beispiel liegt weiterhin nicht vor.

**Coburger Hochschul-Mail (25.09.2026):** Die [offizielle Hochschulseite](https://www.hs-coburg.de/studieren/start-ins-studium/deine-schritte-vor-studienbeginn/) verweist für das studentische Postfach auf Outlook im Web. Eine lesende API oder IMAP-Freigabe und deren Anmeldeverfahren sind dadurch noch nicht belegt. Das Profil bleibt deshalb ohne erfundenen IMAP-Host; die Mail-Anbindung ist weiter offen.

**PRIMUSS-Nachweisbild (25.09.2026):** Nach dem lesenden Prüfungsabruf öffnet Playwright dieselbe URL mit der gespeicherten Session, blockiert alle Methoden außer GET sowie fremde Hosts und deaktiviert JavaScript. Die im Browser sichtbaren Prüfungsstatus müssen den zuvor gelesenen Zeilen entsprechen; bei Abweichung endet die Vorschau ohne Erfolg. Ein passendes PNG wird einmalig unter `DATA_DIR/portal-proofs/primuss/` mit neutralem Zeitstempel und Zufallskennung geschrieben und über eine private `no-store`-Route angezeigt. Die reine Vorschau verändert keine Prüfungs- oder Notentabellen. Acht gezielte Fake-Tests für Transport, Browser-Regel, Dateinamen, Bildabruf und abweichenden Status sowie Ruff, mypy, TypeScript, ESLint, Produktionsbuild, OpenAPI-Abgleich und ein fokussierter Browserablauf bestanden.

**Prüfungsanmeldungen mit Historie (25.09.2026):** Wenn im Profil ein überprüfter stabiler `exam_key_attr` (`id` oder `data-*`) steht, kann ein ausdrücklich ausgelöster Abgleich die geprüften Prüfungen und ihren Anmeldestatus lokal speichern. Identitäten werden als Hash abgelegt, Statusprüfungen mit Zeit und Bildpfad angehängt. Eine eindeutige Anmeldefrist offener oder unklarer Prüfungen erscheint in iCal und „Termine“; nach bestätigter Anmeldung wird sie ausgeblendet. Wiederholte Prüfungen erzeugen Historie statt doppelter Prüfungszeilen. Der Fake-Test prüft den Wechsel von unklar zu angemeldet, ausbleibende doppelten Prüfungen, neutralen Bildnamen und ausbleibende Notenänderungen. Coburger Selektoren, Schlüsselstabilität, echte Kontoabnahme, Rückmelde- und Notenabgleich stehen aus.

**Getrennter PRIMUSS-Notenabgleich (25.09.2026):** Die Notenseite bietet einen eigenen Knopf für den lesenden GET-Abruf der Notenübersicht. Nur Zeilen mit eindeutigem `id`- oder `data-*`-Modulschlüssel, vollständigem Titel, rein numerischen ECTS und Note sowie exakt zugeordnetem Status werden übernommen; unbekannte Angaben werden zeilenweise ausgelassen. Doppelte Schlüssel und eine vollständig unlesbare Liste brechen den Abgleich ab. Der Schlüssel wird nur gehasht gespeichert. PRIMUSS-Module und ihre Revisionen bleiben von manuellen Modulen getrennt; unveränderte Zeilen erzeugen keine zusätzliche Revision. Fehlende Portalzeilen werden nicht als Löschung interpretiert. Semester und Prüfungsordnungsgewichtung werden nicht geraten. Das Coburger Profil enthält weiter nur offene Selektorwerte; der echte Abgleich ist dort bis zum selbst geprüften anonymisierten Beispiel gesperrt. Zwei gezielte Python-Tests mit erfundenen Seiten und lokalem Mock-Transport, die bestehenden Noten- und PRIMUSS-Tests, Ruff, mypy, TypeScript, ESLint, Frontend-Build, OpenAPI-Abgleich und zwei fokussierte Browserabläufe bestanden.

**PRIMUSS-Rückmeldung (25.09.2026):** Unter „Termine“ gibt es einen getrennten Rückmeldeabgleich nach selbst durchgeführtem Login. Er liest ausschließlich per GET. Ein stabiler Semester-Schlüssel (`id` oder `data-*`), Titel, Status und Frist werden über geprüfte Profil-Selektoren erkannt; nur exakt zugeordnete Portaltexte gelten als „offen“ oder „erledigt“. Unbekannter Status erscheint als „unklar“. Termine ohne Zeitangabe mit Zeitzone werden nicht übernommen; eine bisher bekannte Warnfrist bleibt bei später unklarem Datum erhalten. Der Erledigt-Status blendet sie aus. Jede Prüfung erhält einen lokalen Historieneintrag, während der Kalender nur die offene Frist enthält. Die generische Fristwarnung nutzt die eingestellten 7/3/1 Tage und neutrale Push-Texte. Das Coburger Profil enthält noch keine geprüften Rückmeldeselektoren; der echte Knopf bleibt gesperrt. Zwei gezielte Fake-Tests einschließlich frischer Alembic-Migration, Ruff, mypy, TypeScript, ESLint, Frontend-Build, OpenAPI-Abgleich und ein fokussierter Browserablauf bestanden. Öffentliche Fristen als Zweitquelle und die Prüfung mit Marcs Konto stehen aus.

**Erledigte Frist vor Warnversand (25.09.2026):** Der Benachrichtigungsversand prüft bei vorgemerkten Fristmeldungen erneut, ob die Frist noch aktiv ist. Eine nachträglich als erledigt gelesene Rückmeldung löst damit keine bereits vorgemerkte Pushmeldung mehr aus; sollte dieselbe Frist später wieder offen sein, bleibt die Vormerkung verfügbar. Der gezielte Fake-Rückmeldetest und zehn vorhandene Benachrichtigungstests bestanden; Ruff und mypy sind grün.

**Lesender mycampus-Abgleich (25.09.2026):** Unter „Termine“ kann nach dem selbst durchgeführten Login ein manueller GET-Abruf von Stundenplan, Veranstaltungen und News ausgelöst werden. Jede Teilseite wird nur bei vollständig geprüften Profil-Selektoren aktiviert. Zeilen ohne stabilen `id`- oder `data-*`-Schlüssel oder ohne eindeutigen Titel und Termin mit Zeitzone werden ausgelassen. Termine kommen in die bestehende Kalenderansicht und iCal; News haben eine eigene private Liste. Sitzungs-URLs und Portal-Links werden nicht gespeichert, Schlüssel nur als Hash. Identische Titel mit gleichem Startzeitpunkt werden in der Anzeige zugunsten des vorhandenen Moodle-Termins zusammengefasst; getrennte Moodle-Kurse bleiben sichtbar. Die Coburger Selektoren fehlen weiterhin, daher bleibt der echte Abgleich gesperrt. Zwei gezielte Fake-Tests einschließlich Migration, GET-Beschränkung, wiederholtem Abruf und Kalender-Duplikatprüfung, Ruff, mypy, TypeScript, ESLint, Frontend-Build, OpenAPI-Abgleich und ein fokussierter Browserablauf bestanden. Vollständige Coburger Seitenstruktur und Kontoabnahme sind offen.

**Geplanter mycampus-Abgleich (25.09.2026):** Sobald mindestens eine mycampus-Teilseite mit geprüften Selektoren konfiguriert ist, nutzt der schreibende Host den vorhandenen Sync-Takt mit denselben Ruhezeiten für einen GET-Abruf. Der manuelle Knopf und der Hintergrundlauf verwenden dieselbe Lese- und Speicherfunktion; ein Prozess-Lock verhindert gleichzeitige Abrufe. Der Hintergrundlauf wird im Host-Aktionsjournal erfasst. Erfolg, letzter Versuch und ein nötiger neuer Login erscheinen im Connector-Status; bei Fehlern wird höchstens eine neutrale Benachrichtigung pro Tag gespeichert. Fake-Test: wiederholter Hintergrundabruf ohne neue Dubletten und fehlender Login ohne Portal-Anfrage. Der reale Coburger Ablauf bleibt mangels anonymisierter Seiten und Kontoabnahme gesperrt.

**Öffentliche Coburger Semesterzeiten (25.09.2026):** Die [offizielle Seite](https://www.hs-coburg.de/semesterzeiten/) veröffentlicht Rückmelde- und Prüfungsanmeldezeiträume. Sie ist im Profil als öffentliche Zweitquelle eingetragen. Ein getrennter GET-Abruf liest nur vollständig erkennbare Datumsbereiche, speichert Anfang und Ende ohne erfundene Uhrzeit und zeigt die Quelle unter „Termine“ an. Enddaten kommen als ganztägige iCal-Hinweise hinzu; sie gelten ausdrücklich nicht als persönlicher PRIMUSS-Status und lösen derzeit keine automatischen Frist-Pushs aus. Der Host prüft höchstens einmal täglich und behält ältere Daten bei unklarer Seite. Migration `a583f6e2b941`, drei neue Fake-Tests für Parser, Transport, Migration, API und Scheduler sowie vier bestehende Scheduler-/mycampus-Tests, Ruff, mypy, TypeScript, ESLint, Build, OpenAPI-Abgleich und ein fokussierter Browserablauf bestanden. Der lesende Abruf der echten öffentlichen Seite erkannte am 25.09.2026 alle vier sichtbaren Zeiträume; ein dauerhafter Host-Lauf und der Abgleich mit dem persönlichen Konto stehen aus.

**MCP-Statuswerkzeuge (25.09.2026):** Der lokale MCP-Client kann nun `get_exam_status` und `get_submission_status` aufrufen. Prüfungsanmeldungen kommen aus dem letzten gespeicherten PRIMUSS-Status, Moodle-Abgaben aus dem letzten lokal archivierten Check; es wird dabei kein Portal neu abgefragt. Zwei neue Kategorien sind standardmäßig gesperrt und getrennt unter „Mehr → KI-Paket“ freigebbar. Kursfreigaben gelten zusätzlich. Antworten enthalten nur Status und Prüfzeit, keine Noten, Feedbacks, Dateien oder Nachweisbilder. Die neuen Werkzeuge und die vorhandene Tool-Liste wurden mit erfundenen Daten geprüft; Remote-MCP mit OAuth bleibt offen.

**Getrennter MCP-Fernzugang (26.09.2026):** Ein nur an `127.0.0.1:8001` gebundener Prozess stellt den vorhandenen MCP-Werkzeugkasten mit OAuth 2.1, Dynamic Client Registration, PKCE und einer PIN-Freigabeseite bereit. Der private Host bleibt auf Port 8000; sein Not-Aus wird bei jedem Fernaufruf geprüft. OAuth-Clients und Tokens liegen verschlüsselt in einem lokalen, nicht synchronisierten SQLite-Speicher. Das Host-Zugriffsprotokoll unterscheidet signierte Fernclient-Kennungen und lokale Programme; eine neue Migration ergänzt das Feld für bestehende Einträge mit `local`. Sechs gezielte MCP-Tests mit erfundenen Daten prüfen unter anderem Registrierung, fünf falsche PIN-Versuche, korrekte Freigabe, Code-Einmaligkeit, Token-Erneuerung, den geschützten `/mcp`-Aufruf, Not-Aus, Zugriffsprotokoll und Migration. Ruff, mypy, TypeScript, ESLint, Frontend-Build und der KI-Browserablauf bestanden. Ein echter Tunnel und echter KI-Client wurden nicht eingerichtet; nur Port 8001 darf später bewusst veröffentlicht werden. Mail-Integration und echte Portalstrukturen bleiben offen.

**Ausgewählte Uni-Mail als Fristquelle (26.09.2026):** Unter dem standardmäßig ausgeblendeten Bereich „Uni-Mail“ kann Marc eine selbst gespeicherte `.eml`-Nachricht ausdrücklich auswählen. Der Parser liest weder ein Postfach noch Anhänge, begrenzt die Größe und speichert nur Absender, Betreff, Empfangszeit und bei eindeutiger Formulierung ein mögliches Datum. Der Nachrichtentext wird verworfen; im offline gespeicherten Aktivitätsverlauf steht nur ein neutraler Hinweis. Ein Vorschlag erzeugt erst nach Marcs Eingabe von Titel, Datum und Uhrzeit eine Kalenderfrist. Doppelte Nachrichten werden erkannt, abgelehnte Vorschläge bleiben nachvollziehbar. Absenderregeln sind im Hochschulprofil vorgesehen, aber für Coburg noch leer und werden bei späteren automatischen Abrufen erzwungen. Zwei gezielte Backend-Tests, Ruff, mypy, TypeScript, ESLint, Frontend-Build und ein fokussierter Browserablauf mit einer erfundenen Mail einschließlich 390-px-Ansicht bestanden. Eine automatische Postfachverbindung ist weiterhin offen, bis das lesende Verfahren und die Regeln mit Marc geklärt sind.

**Projektstand als Abgabedatei (26.09.2026):** Verknüpfte Moodle-Aufgaben bieten auf der Projektseite jetzt den direkten Einstieg in den bestehenden bestätigungspflichtigen Abgabeablauf. Nach einer Repository-Sicherung kann der protokollierte Commit als ZIP direkt in die Dateiauswahl übernommen werden; der vom Host bestätigte Commit muss zum angezeigten Stand passen, und zu große ZIPs werden vor der Moodle-Vorabprüfung abgewiesen. Danach gelten unverändert Moodles Dateivorgaben, der sichtbare Hash, gesonderte Ersetzungs- und Erklärungshaken sowie die abschließende Bestätigung. Ohne Sicherung können Dateien weiterhin manuell gewählt werden. Ein gezielter Browserablauf mit Fake-Moodle und synthetischem ZIP bestand bis zur Voransicht, ohne die Sendebestätigung auszulösen; TypeScript, ESLint, Build, Ruff, mypy und der bestehende Git-Archivtest sind grün. Eine echte Abgabe und ein privates Git-Repository müssen mit Marcs eigenen Konten geprüft werden.

**Portal-Login-Nacharbeit (26.09.2026):** Ein bisher als Erfolg gewerteter PRIMUSS-Abruf war tatsächlich nur eine HTML-Meta-Weiterleitung von `www3.primuss.de` zur öffentlichen Startseite. Der Lesetransport behandelt fremde Meta-Ziele und leere HTML-Seiten nun als fehlenden beziehungsweise unklaren Login. Der Coburger Login-Helfer öffnet mycampus als Einstieg; Marc meldet sich dort selbst an und wechselt einmal über „Meine Dienste“ zu PRIMUSS. Danach sucht der Helfer eindeutig benannte Leseseiten auf demselben Host automatisch und anonymisiert sie. Unklare Links werden nicht abgerufen. Zu diesem Zeitpunkt waren eine echte PRIMUSS-Session und die fachlichen Selektoren noch offen; mycampus hat auf diesem Windows-Gerät weiterhin keine gespeicherte Session. Gezielte Fake-Tests für Weiterleitung und automatischen GET-Abruf bestanden.

**PRIMUSS-Menünavigation (26.09.2026):** Der sichtbare Helfer blockierte mit Terminal-`input()` die Playwright-Ereignisschleife; nach einer nicht blockierenden Wartephase gelang Marcs eigener Login im installierten Chrome. Eine echte PRIMUSS-Sitzung liegt nun im Windows-Schlüsselbund; ein GET-Lesecheck bestand. Die Startseite nutzt JavaScript und formbasierte Menü-POSTs, daher fand die reine GET-Suche nur eine Seite. Der Helfer darf jetzt ausschließlich die technisch geprüfte CGI-Menüform mit den Feldern `FH`, `Language`, `Nav`, `Portal`, `Session` und `User` für die eindeutig benannten Menüs „Prüfungen“ und „Studium“ auslösen; alle anderen Schreibanfragen bleiben blockiert. Ein Abruf mit der gespeicherten Sitzung erfasste ohne weitere Nutzerklicks drei anonymisierte Seiten (Start, Prüfungen, Studium). Die fachlichen Selektoren, Statuswerte und persönliche Abnahme sind weiterhin offen. Geprüft: gezielter Guard-Test, Portal-Tests, Ruff, mypy sowie technischer Live-Abruf ohne Ausgabe persönlicher Inhalte.

**GitHub-Prüftakt (26.09.2026):** Normale Pushes und Pull Requests prüfen Backend auf Ubuntu sowie OpenAPI, TypeScript, ESLint, Vitest und Frontend-Build. Der vollständige Lauf mit macOS, Windows, Docker und Browser bleibt über `workflow_dispatch` für Phasenenden verfügbar. Anlass: der bisherige fünfteilige Volltest bei jedem Push kostete viel Laufzeit. Ein GitHub-Lauf für die Portal-Navigation scheiterte zweimal bereits vor Runner-Zuweisung ohne ausgeführte Schritte oder Logs; lokale gezielte Prüfungen bestanden. Die Ursache des GitHub-Starts ist noch ungeklärt.

## Phase 4 – Lernsystem und KI-Automatik

**Status:** In Arbeit, Kernfunktionen fertig. **Erledigt:** Freigegebene Übungsvorschläge sind im Lernbereich als Aufgaben sichtbar; Antwort, Musterlösung, Fehlerart und Versuchshistorie wie zuvor. **Lernstand:** Jedes genehmigte Anki-Kartenvorschlag verknüpft sich jetzt mit demselben themenbasierten `learning_topics`-Eintrag wie Übungen; „Lernen" zeigt pro Thema Anki-Retention und Übungs-Trefferquote, unterhalb konfigurierbarer Mindestmengen erscheint „Zu wenig Daten" statt einer Zahl. **Lernblöcke vor Prüfungen:** rein regelbasiert schlägt der Host für schwache Themen (Retention/Trefferquote unter 70 % oder zu wenig Daten) eines Kurses mit bevorstehender Prüfung feste Lernblöcke vor; Annehmen/Verwerfen auf der Lernen-Seite, angenommene Blöcke erscheinen im bestehenden iCal-Feed. **Wochenübersicht:** kleiner Block „Diese Woche" zeigt Anki-Wiederholungen, Übungsversuche, offene freigegebene Übungen und aktuell schwache Themen. **Kostenrechner:** `config/ai_prices.yaml` mit Modellpreisen und Stand-Datum (90-Tage-Warnung bei Veralten), zeichenbasierte Tokenschätzung ausschließlich über bereits freigegebenes Material, keine Netzwerkanfrage; Anzeige unter „Mehr → KI-Paket" und `unios ai-costs`. **KI-Adapter (Stufe 3):** nur das Gerüst — Budget-Prüfung vor jedem (künftigen) Aufruf anhand der geschätzten Anfragegröße, monatlicher `ai_usage`-Zähler, austauschbare Adapter-Schnittstelle mit `NullAdapter`, der ohne eigenen Anbieter bewusst nichts sendet; standardmäßig aus, kein echter Anbieter angebunden. **Offen:** Auswertung nach Reviews/Lernfortschritt über die reine Retention/Trefferquote hinaus bleibt einfach; ein echter KI-Anbieter für den Adapter ist Marcs eigene Entscheidung und noch nicht gebaut. **Geprüft:** gezielte Backend-Tests für Lernstand, Lernblöcke, Kostenrechner und Adapter-Budget-Gate, vollständiger Python-Lauf, Ruff, mypy, Typecheck, ESLint, Vitest, Frontend-Build, OpenAPI-Vertrag und gezielte Browserabläufe für Lernstand und Lernblöcke bestanden. Der vollständige Phase-Endlauf mit allen Playwright-Specs steht am Ende dieses Arbeitspakets.

**RFC-3161-Zeitstempel für Abgaben (26.09.2026, Phase 3, optional):** Bei gesetzter `SUBMISSION_TSA_URL` (standardmäßig leer/aus) fragt das Archiv nach dem Speichern von `manifest.json` einen Zeitstempel über dessen Hash bei der konfigurierten Vertrauensstelle an (`rfc3161ng`, MIT-lizenziert) und legt Antwort und Status unveränderlich als `manifest.json.tsr` und `timestamp.json` daneben ab. Ein nicht erreichbarer oder abgelehnter Dienst wird nur als Warnung vermerkt und blockiert die Archivierung nicht. Die Abgabeseite zeigt Zeitpunkt und Vertrauensstelle bei Erfolg beziehungsweise eine neutrale Fehlermeldung. Geprüft: drei gezielte Backend-Tests (aus, erfolgreich, fehlgeschlagen) mit einem Test-Doppel statt eines echten Zeitstempeldienstes, bestehende Abgabe-Tests weiterhin grün, Ruff, mypy, Typecheck, ESLint und die bestehenden Abgabe-Browserabläufe. Eine echte Vertrauensstelle hat Marc noch nicht eingetragen; welche er nutzen möchte, bleibt seine Entscheidung.

## Phase 5 – Integrierter Lernmodus

**Status:** Kernablauf umgesetzt, Endabnahme offen. **Erledigt (26.09.2026):** Modus B verwendet `anki==26.9.3` für Collection, eigene Basic-/Cloze-Notiztypen, FSRS-Scheduler und `.apkg`-Import/Export mit Lernhistorie und Medien. Freigegebene Kartenvorschläge werden mit stabiler UniOS-ID übernommen; der Anki-Agent pausiert in Modus B. Die neue Seite **Mehr → Karteikarten lernen** enthält Tasten-/Touch-Bewertung (1–4), Kartenbrowser, Editor, Deck- und Sieben-Tage-Statistik. Die PWA puffert Bewertungen mit eindeutiger Kennung in IndexedDB und spielt sie beim Wiederverbinden ein; `ts-fsrs` zeigt dabei nur einen vorläufigen Termin, Anki auf dem Host ist maßgeblich. A → B prüft das ausgewählte Paket und importiert es nach einem automatischen Datenbank-Snapshot; B → A erstellt vor dem Wechsel einen Snapshot mit Collection und exportiert ein Paket. Host-Snapshots enthalten im Modus B die Collection als `.apkg` mit Prüfsumme; eine Host-Übernahme rekonstruiert Collection und Medienordner. AnkiWeb wird im Modus B nicht verwendet. **Geprüft:** Drei gezielte Backend-Tests zu Review-Idempotenz, Paket-Roundtrip, Moduswechsel, Snapshot/Handoff mit Bild sowie HTML-Bereinigung; bestehende Snapshot-/Handoff-Tests; Ruff, mypy, TypeScript, ESLint, Frontend-Build, OpenAPI-Vertrag und ein fokussierter Playwright-Ablauf für eine offline bewertete Karte mit Wiedereinspielung. **Offen:** Abnahme mit einer Kopie von Marcs eigener Anki-Sammlung und einem zweiten echten Host-Gerät; der vollständige Phasenendlauf inklusive Screenshots, Lighthouse und Docker-Smoke. Browserdaten erst löschen, wenn alle Offline-Bewertungen übertragen sind.

**Ergänzung:** Die App lädt beim Start und nach Wiederverbindung die fälligen Karten des Tages in den PWA-Cache und spielt ausstehende Bewertungen auch dann ein, wenn eine andere Seite geöffnet ist. Die Lernseite ist als eigener Chunk geladen, damit die Anki-Oberfläche den ersten App-Start nicht belastet. Die Lernseite wurde in Dark/Light auf Desktop und 390 px als Playwright-Screenshot geprüft; die Karte und der Antwortknopf sind auf dem Handy ohne Scrollen erreichbar. Importierte HTML-Karten werden vor der Anzeige bereinigt; im Lernbildschirm werden nur lokale Rasterbilder direkt angezeigt, alle Medien bleiben im `.apkg` erhalten.

## Phase 6 – Einrichtung und Veröffentlichung

**Status:** In Arbeit. **Erledigt:** Privates GitHub-Repo und Lizenzgrundlage; erste Installationsskripte für macOS und Windows mit Host-/Zuschauer-Wahl, uv, Node-Prüfung, Frontend-Build und Hintergrunddienst; browserbasierter Einrichtungsassistent für Hochschule Coburg, geprüften Moodle-Mobile-Token und optionalen ntfy-Testhinweis; deutsche Schnellstart-Anleitung und englische Kurzfassung; statischer Projektseitenentwurf und wiederholbares Tutorialvideo mit Fake-Daten. Der automatische Moodle-Rückruf ist mit Fake-Daten umgesetzt; echte Geräteprüfung steht aus. Das Muster-Audit der Git-Historie fand keine Secrets. **Offen:** Echte Prüfung des SSO-Rückrufs und Installation auf frischem Mac und Windows-PC, weitere Tutorials, Release, Pages-Deployment und vollständige Phasenabnahme. **Geprüft:** Drei gezielte Anki-Engine-Tests mit erfundener Collection bestanden; Setup- und Schlüsselbundtests 8 bestanden, 1 plattformbedingt übersprungen; Ruff, mypy, TypeScript, ESLint, Produktionsbuild, OpenAPI-Abgleich und ein fokussierter Browserablauf bestanden. Die Installationsskripte wurden nur auf Syntax geprüft; sie wurden nicht auf einem frischen Gerät ausgeführt.

**Portal-Sitzung wiederverwenden (26.09.2026):** Der Login-Helfer versucht bei erneutem Aufruf zuerst die im System-Schlüsselbund gespeicherte Sitzung. Beim PRIMUSS-Login über mycampus speichert er eine vorhandene mycampus-Erstsitzung zusätzlich, wenn der Browser dafür einen eigenen Cookie liefert. Passwortformulare und externe Weiterleitungen gelten als abgelaufener Login. Danach ist nur bei tatsächlich nicht mehr nutzbarer Hochschul-Sitzung ein erneuter eigener Login samt MFA nötig. Sechs gezielte Portaltests sowie Ruff und mypy bestanden. Eine echte mycampus-Sitzung lag bei dieser Änderung noch nicht vor; die Coburger fachlichen Selektoren bleiben offen.

**Projektseite und Tutorial (26.09.2026):** `docs/site/` enthält eine statische deutschsprachige Entwurfsseite nach der freigegebenen Referenz, mit als schematisch gekennzeichneten Geräteansichten und ohne externe Fonts oder echte Inhalte. Sie wurde bei 1440 und 390 px im Browser geprüft; bei 390 px kein horizontaler Überlauf. `scripts/tutorial_videos.py` erzeugt aus dem lokalen Fake-Server ein kurzes WebM der Hauptseiten; ein erstes Video mit ausschließlich erfundenen Daten liegt unter `docs/tutorial-videos/`. Die Veröffentlichung bleibt bis zum Repo- und Historien-Audit gesperrt. Ein Video fremder Oberflächen (ChatGPT, Tailscale) ist nicht enthalten und gehört laut Bauauftrag zu Marcs eigener Aufnahme.

**mycampus und Sitzungsspeicherung (26.09.2026):** Marcs eigener Login im sichtbaren Chrome gelang. Der erste Versuch scheiterte beim Windows-Schlüsselbund, weil die gesamte Browser-Sitzung zu groß für einen einzelnen Eintrag war; nach der Korrektur wird sie komprimiert, in kleine geprüfte Schlüsselbund-Einträge aufgeteilt und wieder geladen. Große CSS-Alias-Zuordnungen nutzen dieselbe begrenzte Teilgröße. Die echte mycampus-Erstsitzung liegt nun im Windows-Schlüsselbund; ohne neuen Login wurden drei anonymisierte Seiten (Studiengang, Veranstaltung, Start) erfasst. Ein Stundenplan-Link war dort nicht eindeutig erkennbar, und die Veranstaltungsseite zeigte keine geprüften Terminzeilen. Der Helfer speichert bei künftigen Logins zusätzlich Cookies des ausdrücklich erlaubten Hochschul-SSO-Hosts; diese Ergänzung ist mit Fake-Daten getestet, aber noch nicht mit einem erneuten echten Login bestätigt. PRIMUSS- und mycampus-Fachselektoren bleiben ungeprüft; eine Sitzung allein schaltet keinen Import frei. 13 gezielte Portaltests, Ruff und mypy bestanden.

**Automatischer Moodle-Rückruf (26.09.2026):** Der Installer registriert für den aktuellen Windows-Benutzer beziehungsweise auf macOS ein eigenes URL-Schema `marcunios`. Nach dem offiziellen Moodle-Mobile-SSO-Login nimmt ein lokaler Handler die Rückkehr entgegen, sendet sie an den laufenden Assistenten und öffnet die App. Der Assistent prüft den einmaligen Passport und den Token gegen Moodle, speichert ihn im System-Schlüsselbund und aktualisiert den Haken automatisch; die verdeckte manuelle Eingabe bleibt als Ausweichweg. Backend-Tests mit erfundenem Token, Ruff, mypy, TypeScript, ESLint, Produktionsbuild und der fokussierte Browserablauf mit Fake-Daten bestanden. Die Betriebssystem-Registrierung und der echte Moodle-Rückruf wurden noch nicht auf einem frischen Mac und Windows-PC ausgeführt.

**Release-Audit und Windows-Rückruf (26.09.2026):** Ein vollständiger privater Git-Spiegel wurde mit `scripts/audit_history.py` auf typische Schlüssel, Token und Session-URLs geprüft: 2.700 Objekte, 1.545 Dateiobjekte, keine Musterfunde. Marc bestätigte, dass das Profilbild in den vier Designreferenzen eine generierte Figur ist. Der Windows-URL-Handler verwendet nun einen absoluten Skriptpfad, damit der Browser-Rückruf unabhängig vom aktuellen Arbeitsordner startet; die Registrierung im aktuellen Windows-Benutzerprofil wurde geprüft. Ein echter Moodle-Rückruf und die Installation auf frischen Geräten stehen weiterhin aus. Einzelheiten stehen in `docs/PUBLISHING.md`.

**Einmaliger Phasencheck (26.09.2026):** Der vollständige Python-Lauf dauerte 3:34 Minuten und ergab 294 bestandene, 9 übersprungene und einen fehlgeschlagenen Test. Der Fehler betraf die bisher unterstützte `forcedapp`-Moodle-Rückkehr; die Kompatibilität ist wiederhergestellt, und der betroffene Test sowie der lokale Handler-Test bestanden anschließend. Die gesamte Suite wurde wegen des vereinbarten sparsamen Testrhythmus nicht nochmals gestartet. Projektweite mypy-Prüfung: 144 Dateien ohne Fehler nach Korrektur einer dynamischen `pydantic-settings`-Option. Ruff für die Produkt-, Client-, Skript- und Testordner, TypeScript, ESLint und Vitest sind grün. Der aktuelle Endstand ist damit gezielt verifiziert, ein komplett grüner Lauf für genau diesen Commit steht noch aus.

**Lizenznachweis (26.09.2026):** Die im Frontend gebündelte Geist-Schrift und der PDF.js-Worker erhalten ihre vollständigen OFL- beziehungsweise Apache-Lizenztexte im Build; die direkten Frontend-Laufzeitpakete sind in `THIRD_PARTY_NOTICES.md` mit dem lokalen Installationsstand erfasst. Der Produktionsbuild bestand, und die Geist-Lizenzdatei war im Ergebnis bytegleich zur Quelle. Eine abschließende Prüfung der transitiven Bestandteile im tatsächlichen Release-Paket steht aus.

**Arbeitsbereich nach Notion/Obsidian-Richtung (26.09.2026):** Warmes, ruhiges Hell und Graphit-Dunkel mit Dokumentflächen, kompakter Navigation und unverändert vier Hauptbereichen. Neue und alte Notizen können im Browser als Markdown bearbeitet werden; jede Fassung bleibt als eigene Datei mit YAML-Metadaten erhalten. Eindeutige `[[Wikilinks]]` erzeugen beidseitig sichtbare Verbindungen, auch wenn das Ziel später angelegt wird. Ein lokaler Begriffabgleich schlägt weitere Notizen mit Begründung vor; er ist ausdrücklich keine semantische KI. Eindeutig benannte neue Vorlesungsdateien erhalten nach erfolgreichem Sync eine idempotente Mitschrift-Vorlage. Die Befehlspalette zeigt direkte Suchtreffer, PDF-Funde springen auf die gefundene Seite; Fristen bieten Tabelle, Board, Zeitleiste und Kalender, Noten zusätzlich eine Semestermatrix. Ein Zeitrechner zeigt die Rechnung aus manuellen Angaben und angenommenen Lernblöcken. Installierte Hochschul-Konnektoren lassen sich über einen expliziten Entry Point und private Konfiguration einzeln aktivieren.

**Freigabe von Dokument-Fristen (26.09.2026):** Die Migration `d4e5f6a7b8c9` legt eine Prüfliste für eindeutig erkannte künftige Datumsstellen in Unterlagen an. Neue oder geänderte Kalenderfristen werden erst nach gesonderter Bestätigung mit überprüfbarem Titel und Uhrzeit übernommen; mehrdeutige Daten werden ausgelassen. Quelle, Seite und Textstelle bleiben im Vorschlag sichtbar, die bestätigte Frist verlinkt auf die Materialseite. Geprüft mit erfundenen Dokumenten: gezielte Backend-Tests für Neu/Änderung/Ablehnung und mehrdeutige Daten sowie der komplette Browserablauf mit Fake-Daten; die neue Migration lief in der frischen Fake-App. Notiz-, Konnektor-, Sync- und Browserabläufe wurden gezielt geprüft, Ruff, mypy, TypeScript, ESLint und Produktionsbuild sind grün. Der vollständige Phasenendlauf wurde für dieses Arbeitspaket nicht erneut gestartet.

**Installation auf diesem Windows-PC (26.09.2026):** Das lokale Installationsskript hat hier mit Produktionsabhängigkeiten, Frontend-Build, Host-Staffelstab, Datenbankinitialisierung, URL-Schema und Autostart-Aufgabe erfolgreich abgeschlossen; `/health` antwortete mit `ok`. Die korrigierte Node-Prüfung und das Warten auf die Gesundheitsantwort sind noch nicht auf einem frischen Windows-Gerät oder Mac geprüft. Ein echter Moodle-Rückruf, ntfy-Empfang, Anki-Migration der eigenen Sammlung, die Coburger PRIMUSS-/mycampus-Fachfelder, der Zwei-Geräte-Wechsel, Docker-Smoke, Pages-Deployment und Release bleiben offen. Für eine Migration einer vorhandenen persönlichen Datenbank gilt weiter: erst geprüfter Snapshot, dann Dienst stoppen und Alembic auf `head` bringen.

**Forumsuche und Fundstellen (26.09.2026):** Wenn Moodle zu einer Diskussion den Nachrichtentext liefert, speichert die App davon maximal 10.000 Zeichen als bereinigten Klartext und macht ihn in der lokalen Suche und Befehlspalette auffindbar. Die neue Migration `e5f6a7b8c9d0` ergänzt das Feld; bestehende Beiträge erhalten ihren Text erst beim nächsten Sync. Längere Fragen suchen nach bedeutungstragenden Einzelwörtern statt eine KI-Antwort zu behaupten; Ergebnisse zeigen die Quelle, PDF-Treffer öffnen die Fundseite. Die Offline-Suche enthält ebenfalls die lokal gespeicherten Forentexte. Sechs gezielte Python-Tests, mypy, TypeScript, ESLint und der Produktionsbuild bestanden. Die konkrete Coburger Moodle-Instanz und eine echte Nutzerfrage wurden dafür noch nicht geprüft.

**Komplette visuelle Neugestaltung (26.09.2026):** Nach Marcs Rückmeldung wurde die warme Zwischenfassung durch einen blauen, schieferfarbenen Studienraum ersetzt. Die Desktop-Navigation gruppiert Arbeitsbereich, Bibliothek und aktuelle Kurse; Heute hat eine kompakte Tageslage mit tatsächlichen API-Zahlen. Notizen nutzen einen geteilten Dokumentarbeitsplatz, Termine zeigen ihre Fristen vor dem technischen Quellenabgleich, Lernen ordnet Wochenstand, Karteikarten und Arbeitsbereiche neu, und der PDF-Reader erhält dieselbe Flächen- und Werkzeuglogik. Die Gestaltung ist eigenständig. `docs/DESIGN.md`, Tokens und interaktive Vorschau beschreiben das System. Produktionsbuild, TypeScript und ESLint bestanden; ein fokussierter Browserablauf mit erfundenen Kursen prüfte Kurse, Fristen, eine angelegte Notiz, den PDF-Reader und Lernen. Die persönliche Datenbank wurde nicht migriert; ihre Migration erfordert weiterhin Marcs geprüften Snapshot. Die visuelle Abnahme auf Marcs tatsächlichen Inhalten und der vollständige Phasenendlauf stehen aus.

**Notion-Seitenleiste als konkrete Referenz (26.09.2026):** Nach Marcs Link auf die Notion-Anleitung können Arbeitsbereich, Bibliothek und aktuelle Kurse unabhängig auf- und zugeklappt werden. Aktuelle Kurse haben Unterseiten für Materialien und kursgefilterte Notizen. Die Desktop-Leiste kann ausgeblendet, über `Strg/⌘+\\` umgeschaltet und zwischen 220 und 360 Pixeln in der Breite angepasst werden; der Browser merkt sich diese Einstellungen. Ein fokussierter Playwright-Ablauf mit erfundenen Kursen prüfte Unterseiten, Einklappen, Breite per Tastatur und Wiederherstellung nach Neuladen. TypeScript, ESLint und Produktionsbuild bestanden. Eine echte Konto- oder Datenmigration war dafür nicht nötig.

**GitHub-Abgleich:** Der vorherige Redesign-Commit `6e97a3c` liegt auf `main`. Dessen GitHub-Qualitätslauf scheiterte zweimal innerhalb weniger Sekunden für Backend und Frontend, jeweils ohne ausgeführte Schritte oder verfügbare Logs. Der Notion-Seitenleisten-Nachtrag ist deshalb gemäß dem Prüftakt in `AGENTS.md` vorerst nur lokal gebaut und geprüft; vor dem nächsten Push muss der Runner-Start des bisherigen Laufs geklärt oder ein ausführbarer Qualitätslauf bestätigt sein.

**Designkorrektur nach eigener Nutzung (26.09.2026):** Die App wurde mit ausschließlich erfundenen Kursen auf Desktop und 390 px als neuer Nutzer durchgeklickt. Der kleine blaue Text über jedem Seitentitel, die dominante Tagesfläche, große Zahlenkacheln, leere Kurskacheln und die vorangestellten Gruppeneinstellungen behinderten den Einstieg. Jetzt stehen Fristen und neue Inhalte oben; Kurse sind kompakte Zeilen; im Kurs folgen Unterlagen, Aufgaben und Notizen vor einklappbaren Werkzeugen und Gruppeneinstellungen. PDF-Dateinamen öffnen den Reader direkt, und „Mitschrift anlegen“ übernimmt Kurs und Quelle. Der PDF-Reader zeigt Seiten fortlaufend, rendert nur nahe sichtbare Seiten und aktualisiert die Seitenanzeige beim Scrollen; Suche, Sprung, Markierung und Export bleiben erhalten. Helles und dunkles Design, Handyansichten und der Reader wurden erneut als Browser-Screenshots geprüft; bei 390 px kein horizontaler Seitenüberlauf. Produktionsbuild, TypeScript, ESLint sowie acht gezielte Browserabläufe bestanden nach Korrektur einer durch gemeinsam genutzte Fake-Daten instabilen Screenshot-Erwartung. Der vollständige Phasenendlauf und die Abnahme mit Marcs tatsächlichen Inhalten bleiben offen. Der GitHub-Lauf des vorherigen Stands hat weiterhin keinen Runner-Start bestätigt; diese Änderungen liegen lokal.

**Dashboard, Kursgalerie, Notiz- und Dateiansicht (26.09.2026):** Die Startseite hat jetzt flache Abschnitte statt zweier Karten, die Kursliste nutzt eine Galerie mit dezenten Bannern, die Kursseite einen eigenen Überblick und Notizen ein breites Dokument mit kompaktem Index darüber. Der PDF-Reader behält die eigene Textsuche und verankerte Markierungen, zeigt fortlaufende Seiten und ergänzt sichtbare Zoom-Tasten sowie zusammengefasste Dateiaktionen. Die Gestaltung ist eigenständig umgesetzt. Ein Browserdurchgang mit Fake-Daten prüfte Start, Kurse, Kurs, PDF-Scrollen, Handy-Zoom, Notizerstellung und Dunkelmodus; bei 390 px kein horizontaler Seitenüberlauf. TypeScript, ESLint, Produktionsbuild und die zwei betroffenen fokussierten UI-Tests bestanden. Die Screenshots liegen unter `docs/design/screenshots/unios-workspace/`.

**Smart Collections (26.09.2026):** Unter „Sammlungen“ lassen sich typisierte Ansichten über vorhandene Lernthemen, Materialien, Fristen und offene PDF-Fragen speichern. Filter für Kurs, Zeitraum, messbaren Lernstand und eigene Gruppe sowie Sortierung und Liste/Tabelle/Karten/Board/Kalender sind vorhanden. Fehlende Lernmesswerte bleiben als solche sichtbar, statt geschätzt zu werden; fremde Gruppenmaterialien werden ausgeschlossen. Die Ansichten verwenden sichere feste Abfragen, Aktualisierungsschutz über Revisionen und ein Archiv. Geprüft: gezielter Python-Test, Ruff, mypy, TypeScript, ESLint, Produktionsbuild und ein Browserablauf einschließlich Neuladen und 390-px-Ansicht. Eine Datenbankmigration mit persönlichen Daten bleibt bis zum geprüften Snapshot zurückgestellt.

**Eigene Studienregeln (26.09.2026):** Der Rule Builder hat feste Auslöser für neue Materialien, nahende Fristen und gemessen schwache Lernthemen; Kurs und Schwelle/Zeitraum sind einstellbar. Ein trockener Lauf zeigt die Treffer ohne Änderung. Aktionen pinnen Treffer lokal auf „Heute“ und/oder erzeugen neutrale Hinweise ohne Kursnamen oder Inhaltsdaten. Aktivierte Regeln prüft der Host alle zehn Minuten; Ausführungen sind pro Regelgeneration und Objekt einmalig, im Verlauf sichtbar und lokale Pins können entfernt werden. Änderungen an Bedingungen starten eine neue Generation und entfernen alte Pins. Automatische Moodle-Abgaben sind nicht vorgesehen. Geprüft: gezielter Python-Test für Vorschau, Idempotenz, Regeländerung und Rücknahme; Ruff, mypy, TypeScript, ESLint, Produktionsbuild und ein Browserablauf auf Desktop und 390 px. Eine persönliche Datenbankmigration setzt weiter einen geprüften Snapshot voraus.

**Tags und Eigenschaften (27.09.2026):** Notizen, Materialien, Lernthemen, Fristen und PDF-Fragen können bis zu zwölf frei benannte Tags sowie Priorität, Prüfungsrelevanz, Schwierigkeit und Arbeitsstatus erhalten. Diese Metadaten liegen getrennt von versionierten Notizen und Originalmaterialien. Gespeicherte Sammlungen umfassen nun auch Notizen und können nach allen fünf Eigenschaften filtern; Arbeitsstatus steuert die Board-Gruppierung. Der Editor wartet auf den geladenen Stand, bevor Eingaben möglich sind, damit schnelles Tippen keine Werte überschreibt. Geprüft: zwei gezielte Python-Tests, Ruff, mypy, TypeScript, ESLint, Produktionsbuild und ein Browserablauf vom Notiz-Tag bis zur gefilterten Sammlung einschließlich 390-px-Ansicht. Persönliche Daten wurden nicht migriert.

**Voice Capture (27.09.2026):** Eigene kurze Sprachnotizen lassen sich am Mikrofon aufnehmen oder als Audiodatei wählen. Maximal fünf Minuten Aufnahme und 15 MB Upload; WebM, Ogg, M4A, WAV und MP3 werden lokal unter `DATA_DIR/voice/` gespeichert und im privaten Audio-Player abgespielt. Der Browser kann, wenn er ein deutsches lokales Sprachpaket unterstützt, während der Aufnahme transkribieren. Ein möglicherweise externer Browserdienst wird erst nach eigener Auswahl verwendet. Transkript, Kurs und Lernthema sind vor und nach dem Speichern korrigierbar; ein eindeutig im Text genanntes Lernthema wird vorgeschlagen. Das Transkript wird als Schnellerfassung mit Volltextindex angelegt und bei Korrekturen aktualisiert. Geprüft: gezielter Python-Test für Audio, Zuordnung, Revision und Suchtext; Ruff, mypy, TypeScript, ESLint, Produktionsbuild und ein Browserablauf mit simuliertem Mikrofon und lokaler Erkennung auf Desktop/390 px. Ein echtes Mikrofon und die Verfügbarkeit lokaler deutscher Spracherkennung müssen auf Marcs Geräten geprüft werden. Persönliche Daten wurden nicht migriert.
**Devlane-Anregung – isolierter Demo-Modus (27.09.2026):** `unios demo create` erstellt ein eigenständiges, markiertes Demo-Verzeichnis mit migrierter SQLite-Datenbank, drei erfundenen Kursen, sieben tatsächlich lesbaren PDF-Dateien, einer versionierten Mitschrift, Aufgabe und Frist, Prüfung und Note, Karte mit Reviews, schwachem Thema, Lernblock, Projekt, Hinweis und Aktivitätsverlauf. Erneutes Aufrufen ergänzt fehlende Demo-Objekte ohne Verdoppelung; ein bestehender nicht markierter Ordner wird abgewiesen. `unios demo serve` zeigt nur diesen Datensatz auf localhost und startet keinen Hochschul-Sync. Der gezielte Idempotenz- und Isolations-Test, Ruff, mypy und die CLI-Hilfe bestanden. Ein echter UI-Rundgang steht noch aus.
**Devlane-Anregung – Laufzeiteinstellungen (27.09.2026):** Sync-Intervall, Ruhezeit, Snapshot-Intervall, Fristwarn-Tage und geprüfte automatische Host-Übernahme liegen nun als validierte, revisionierte Einstellungen in SQLite. Die Werte werden beim Start vor dem Scheduler geladen und bei Änderung ohne Neustart auf den Host angewendet; Sync und Snapshot werden neu terminiert. Die Oberfläche unter „Einstellungen“ bearbeitet sie. Tokens, Webhooks und andere Secrets bleiben außerhalb der Tabelle in Keychain beziehungsweise geschützter Umgebung. Geprüft: gezielter API-Test für Speichern, Konflikt, ungültige Werte und erneutes Laden; Ruff, mypy und TypeScript. Persönliche Datenbank erst nach geprüftem Snapshot auf Migration `f8c9d0e1f2a3` bringen. Browserablauf steht noch aus.
**Devlane-Anregung – optionale Fähigkeiten (27.09.2026):** Der Systembereich zeigt den Zustand von Studienraum, Moodle, PRIMUSS, mycampus, Anki, Docker, Tailscale, Syncthing, KI/MCP und GitHub mit ehrlichen Stufen „bereit“, „prüfen“, „aus“ und „fehlt“. Die Anzeige verwendet nur lokale Konfiguration und letzten Connector-Status; installierte Werkzeuge werden nicht als erfolgreich verbunden ausgegeben. Ein fehlendes Anki-Paket oder ein nicht ladbares optionales Connector-Plugin verhindert den Start des Kernsystems nicht mehr. Ein gezielter Backend-Test startet die API mit beiden Ausfällen und prüft weiterhin die Kurs-API. Ruff, mypy und TypeScript bestanden; Browserprüfung steht noch aus.

**Devlane-Anregung – Eigenschaften (27.09.2026):** Materialien, Notizen, Aufgaben, Prüfungen, Projekte und Lernthemen zeigen ihre bekannten Stammdaten in einer einheitlichen, aufklappbaren Detailansicht. Tags und Eigenschaften sind bei allen sechs Objekttypen lokal bearbeitbar; Prüfungsdaten im Hochschulportal bleiben lesend. Die Notiz zeigt diese Details am Desktop in einer rechten Seitenleiste und auf schmalen Ansichten unter dem Dokument. TypeScript, ESLint und Produktionsbuild bestanden; der gezielte Browserablauf für Notizeigenschaften und Sammlung bestand mit erfundenen Daten auf Desktop und 390 px.

**Devlane-Anregung – Aktivität (27.09.2026):** Objekt- und Kursseiten erhalten eine Chronik mit Datum, konkretem Ereignis und gespeicherter Quelle. Sie liest vorhandene Sync-Änderungen, Material- und Notizversionen, Abgabeversuche, Prüfungsprüfungen, Notenwerte, Projekt- und Git-Stände sowie Anki- und Übungsereignisse. Der letzte Eigenschaftenstand erscheint ebenfalls; eine vollständige Historie früherer Eigenschaftsänderungen wird nicht vorgetäuscht. Die Angaben stammen aus vorhandenen Datensätzen, ohne neue Kopien persönlicher Inhalte anzulegen. Zwei gezielte Backend-Tests und der Browserablauf mit erfundener Notiz bestanden. Die früheren Vermerke „Browserablauf steht noch aus“ zu Laufzeiteinstellungen und Fähigkeiten sind überholt: Beide gezielten Browserabläufe bestanden.

**Plane-Anregung 1/8 – gemeinsamer Eingang (27.09.2026):** Der Eingang bündelt vorhandene Webseiten- und Textclips, Schnellerfassungen, eigene Dateien, Mail, Moodle-Material und -Aufgaben sowie Sprachnotizen. Prüfentscheidungen liegen getrennt von den Originalen in `intake_decisions` (Migration `f9d0e1f2a3b4`): neu, zu prüfen, angenommen, abgelehnt, später und Duplikat. Ein angenommener Eintrag braucht einen Kurs und kann zusätzlich einem vorhandenen Thema, Material, einer Aufgabe oder einem Projekt zugeordnet werden. Verschobene Einträge erscheinen nach Ablauf wieder offen; bei möglichem Fristbezug sind höchstens zwölf Stunden erlaubt. Abgelehnte Inhalte bleiben erhalten. Neue Webclips erscheinen erst nach dem Annehmen in der globalen Suche. Die Dateiannahme ersetzt den bestehenden sicheren Import nicht; die Oberfläche führt dafür zur Datei-Importseite. Geprüft mit erfundenen Daten: gezielte Intake- und Inbox-Tests, Ruff, mypy, TypeScript, ESLint, Build und zwei Browserabläufe auf Desktop/390 px. Vor Migration persönlicher Daten weiterhin erst Marcs geprüfter Snapshot. Offen in dieser Plane-Reihe: Punkte 2–8.

**Plane-Anregung 2/8 – bereichsübergreifende Ansichten (27.09.2026):** Die bestehenden Sammlungen bieten nun „Alle Inhalte“ über Lernthemen, Materialien, Fristen, PDF-Fragen und Notizen. Bis zu acht typisierte ODER-Zeilen kombinieren pro Zeile Inhaltstyp, Kurs, Status, Quelle, Tag, maximalen Lernstand und eigene Materialgruppe mit UND; freie SQL-Ausdrücke werden nicht akzeptiert. Ergebnisse lassen sich nach Status, Kurs, Inhaltstyp oder Quelle gruppieren, neben der bestehenden Sortierung und den fünf Ansichtsformen. Gespeicherte Ansichten erhalten diese Einstellungen über Migration `f9e1f2a3b4c5`; bestehende Ansichten bekommen Status-Gruppierung und leere ODER-Filter. Nach Prüfung mit erfundenen Daten: zwei gezielte Python-Tests, Ruff, mypy, TypeScript, ESLint, Build sowie zwei fokussierte Browserabläufe bestanden. Ein spät eintreffender API-Initialwert überschreibt während des Bearbeitens keine neue Ansicht mehr. Persönliche Datenbank erst nach geprüftem Snapshot migrieren. Offen in dieser Plane-Reihe: Punkte 3–8.

**Plane-Anregung 3/8 – Aktivitätszeitleiste (27.09.2026):** Die bereits nach dem Devlane-Muster gebauten Chroniken auf Kurs-, Material-, Aufgaben-, Notiz-, Prüfungs-, Projekt- und Themenseiten zeigen gespeicherte Änderungen mit Zeitpunkt und Quelle. Ergänzt wurden die aktuellen Intake-Entscheidungen auf dem zugeordneten Kurs und Zielobjekt. Die Chronik kennzeichnet ausdrücklich den *aktuellen Entscheidungsstand*, weil die Intake-Tabelle keine vollständige Historie aller früheren Statuswechsel enthält. Zwei gezielte Python-Tests, Ruff und mypy bestanden; der bestehende Browserablauf für die Objektchronik war im vorherigen Paket geprüft. Offen: Punkte 4–8.

**Plane-Anregung 4/8 – Lernzyklen (27.09.2026):** Für Prüfungen in den nächsten mindestens 21 Tagen werden aus tatsächlich schwachen bzw. noch ungemessenen Themen bis zu drei zeitlich begrenzte Phasen vorgeschlagen: Wissenslücken, Anwenden und Wiederholen. Die Karten- und Übungsziele zählen verfügbare echte Einträge, begrenzt auf 120 bzw. 25 pro Phase. Der Fortschritt zählt nur Reviews und Versuche innerhalb des jeweiligen Zeitfensters; ohne vorhandene Karten oder Übungen wird keine Prozentzahl erfunden. Vorschläge können angenommen oder verworfen werden und bleiben bei erneutem Abruf stabil. Wird der Prüfungstermin geändert, weist die Oberfläche auf den veralteten Zeitraum hin und blockiert dessen Annahme. Migration `f9f2a3b4c5d6` ergänzt `study_cycles`; persönliche Daten erst nach geprüftem Snapshot migrieren. Zwei gezielte Backend-Tests, Ruff, mypy, TypeScript, ESLint, Build und der fokussierte Browserablauf für Lernzyklus und bestehenden Lernblock bestanden. Offen: Punkte 5–8.

**Plane-Anregung 5/8 – Lernmodule (27.09.2026):** Bestehende `learning_topics` können nun einem `study_modules`-Eintrag ihres Kurses zugeordnet werden (Migration `fa03b4c5d6e7`). Die Lernansicht gliedert sich in Kurs → Modul → Thema; Module lassen sich anlegen und umbenennen, Themen zwischen „Ohne Modul“ und passenden Modulen verschieben. Die Modulübersicht fasst nur vorhandene, ausreichend gemessene Anki- und Übungswerte gewichtet zusammen; ungemessene Themen werden mitgezählt, aber nicht als Prozent geschätzt. Ein Merge von Themen übernimmt eine vorhandene Modulzuordnung und ersetzt alte Thema-IDs in vorgeschlagenen Lernzyklen. Geprüft: Modul-, Lernstand- und Merge-Tests mit erfundenen Daten, Ruff, mypy, TypeScript, ESLint, Build und ein Browserablauf für Anlegen und Zuordnen. Eine zuerst fehlerhafte SQLite-Migration wurde vor Abschluss korrigiert und im Browserlauf erfolgreich von leerer DB bis zum aktuellen Schema ausgeführt. Persönliche Datenbank erst nach geprüftem Snapshot migrieren. Offen: Punkte 6–8.

**Plane-Anregung 6/8 – semantische Beziehungen (27.09.2026):** Die bestehenden Verknüpfungen können jetzt als „verknüpft“, „Voraussetzung für“, „erklärt“, „ist Übung zu“, „Duplikat von“ oder „bereitet vor auf“ gespeichert werden. Gerichtete Beziehungen behalten ihre Richtung; am Gegenobjekt erscheint die passende Gegenformulierung. Lernthemen, Aufgaben, Prüfungen und Übungen sind nun ebenfalls suchbare Ziele. In der Lernübersicht öffnen sich Beziehungen je Thema erst bei Bedarf, damit die Seite nicht für jedes Thema zusätzliche Daten lädt. Die Datenbankstruktur der bisherigen Links bleibt kompatibel; keine Migration nötig. Drei gezielte Backend-Tests, Ruff, mypy, TypeScript, ESLint, Build und der Browserablauf für gerichtete Anzeige und Entfernen bestanden. Offen: Punkte 7–8.

**Plane-Anregung 7/8 – Schnellansichten (27.09.2026):** Aufgaben und Fristen öffnen aus „Heute“ und aus den vier Terminansichten eine wiederverwendbare Seitenansicht. Sie zeigt lokal gespeicherten Kurs, Fälligkeit und Quelle, bei Aufgaben auch den letzten *gespeicherten* Abgabeversuch sowie vorhandene semantische Beziehungen. Ein Knopf führt bei Bedarf zur vollständigen Aufgabe; Escape, Schließen-Knopf und Klick auf den Hintergrund verlassen die Schnellansicht ohne Seitenwechsel. Die bereits vorhandene Notizvorschau bleibt nutzbar. `DeadlineView` liefert dafür die schon vorhandene `assignment_id`; keine Datenbankmigration. Geprüft: gezielter API-Test mit erfundener Aufgabe, Ruff, mypy, TypeScript, ESLint, Build und ein Browserablauf auf „Heute“ und „Termine“. Offen: Punkt 8.

**Plane-Anregung 8/8 – Lernanalyse (27.09.2026):** „Lernanalyse“ zeigt insgesamt und pro Kurs neue PDF-Versionen der letzten sieben Tage, davon tatsächlich im Reader geöffnete, neu angelegte Notizen, Reviews, Übungsversuche, offene PDF-Fragen sowie anstehende Fristen und Prüfungen. Ein 14-Tage-Diagramm zeigt erfasste Lernarbeit; die Anki-Retention wird bei genügend Daten mit den vorigen 14 Tagen verglichen. Der Lernstand mittelt nur ausreichend gemessene Themen und zeigt die Abdeckung separat. Für eine nicht gemessene Quote steht „Zu wenig Daten“. Die Migration `fa14c5d6e7f8` ergänzt den Zeitpunkt der ersten erfolgreichen PDF-Öffnung; frühere Lesevorgänge und Lernzeit sind unbekannt und werden nicht rückwirkend geschätzt. Der gezielte API-Test, Ruff, mypy, TypeScript und ein Browserablauf einschließlich PDF-Öffnung und 390-px-Ansicht bestanden. Persönliche Datenbank erst nach Marcs geprüftem Snapshot migrieren. Alle acht Plane-Anregungen sind damit als lokale Arbeitspakete umgesetzt; die Gesamt- und Geräteabnahme des Produkts ist davon getrennt noch offen.

**OCR und Beziehungen (27.09.2026):** Gescannten PDF-Seiten ohne auslesbare Textebene bietet der Reader nun eine bewusst gestartete lokale Texterkennung an. Pro Anfrage werden fünf Seiten mit PyMuPDF/Tesseract verarbeitet und als Text im vorhandenen Suchindex gespeichert; Original-PDFs werden nicht verändert, und der normale Sync wartet nicht auf OCR. Ein erfolgloser Versuch wird pro Seite vermerkt, um Wiederholungsschleifen zu vermeiden. `unios ocr <versions-id>` nutzt denselben Dienst. Tesseract und die Sprachpakete sind auf diesem Entwicklungs-PC noch nicht installiert; API und UI wurden mit erfundenem PDF und Test-Doppel geprüft. Migration `fa25d6e7f809` benötigt vor Nutzung mit persönlicher Datenbank einen geprüften Snapshot. Die semantischen Beziehungen verstehen zusätzlich `part_of`/„ist Teil von“ mit korrekter Gegenrichtung. Geprüft: vier gezielte Python-Tests, Ruff, mypy, TypeScript, ESLint, Build und fokussierter OCR-Browserablauf.

**Öffentliche UniOS-Struktur (27.09.2026):** Der sichtbare Name und der Python-Paketname lauten nun UniOS. Die bisherige lokale Datenbank, Keychain-Dienstnamen, Speicher-IDs und das Moodle-Rückrufschema behalten ihre technischen Namen, damit bestehende Installationen weiter funktionieren. Neue Installationen starten mit dem neutralen Profil `generic`, bestehende Installationen ohne explizite Profilangabe bleiben bei Coburg. Der Einrichtungsassistent erlaubt ein Profil ohne Moodle; Coburg bleibt als Referenzprofil verfügbar. Die zentrale Registry führt Profile und geprüfte Connector-Paketversionen. Connector API v1 definiert Fähigkeiten, exakte Domains, Secret-Aliase und ein versioniertes Datenmodell. Exakte Paketversion, Profilbindung und lokal freigegebener Manifest-Fingerprint werden vor dem Python-Import geprüft. Die alte Entry-Point-Gruppe ist deaktiviert. **Review und Freigabe sind keine Sandbox:** Ein geladener Python-Connector läuft weiterhin im Host-Prozess; unüberprüfter Community-Code bleibt gesperrt. `unios connectors list/approve/revoke`, `unios profiles list` und die schreibgeschützte Registry-Ansicht unter System → Erweitert sind vorhanden. `unios api` ruft lokale API-Endpunkte mit JSON, Upload und Binärausgabe auf; Schreibmethoden erfordern `--yes`. Die Startseite zeigt die nächsten Schritte und nur bei integriertem Anki-Modus eine tatsächlich ermittelte Kartenzahl. Spezialbereiche liegen unter „Mehr“. Geprüft: 15 fokussierte Python-Tests, Ruff, mypy, TypeScript, ESLint, Build und vier gezielte Browserabläufe mit erfundenen Daten. Eine persönliche Datenbankmigration und der echte Tesseract-Lauf bleiben offen.

**Connector-Sicherheitsausbau (27.09.2026):** Die normale Community-Laufzeit verlangt ein Image mit festem SHA-256-Digest. Der Core startet es ohne Netzwerk, Host-Mount oder Schreibzugriff, mit Ressourcenlimits und vermittelt HTTPS-GETs nur an freigegebene Domains. Der bisherige Python-Entry-Point braucht nun einen separaten, standardmäßig ausgeschalteten Entwicklermodus. System → Hochschule und der Einrichtungsassistent können veröffentlichte Profile wählen; Änderungen werden nach Neustart aktiv. System → Erweitert bietet für Container Installation, Manifest-Freigabe, Eingabe deklarierter Secrets in den sicheren System-Schlüsselbund, Aktivierung und Entzug. Die Registry prüft Profilbindungen und geänderte Paketversionen; eine Community-PR-Vorlage nennt Quelle, Lizenz, Berechtigungen, festen Digest und Fake-Server-Nachweise. Der Fähigkeitennamenkatalog ist erweitert; zusätzliche Daten- und Schreibverträge sind noch nicht implementiert. 24 gezielte Python-Tests, Ruff, mypy, TypeScript, ESLint, Build, OpenAPI-Abgleich und drei fokussierte Browserabläufe mit erfundenen Daten bestanden. Der Beispiel-Worker wurde in einem eigenen lokalen Prozess durch den JSON-Kanal geprüft. Ein echter Docker-Lauf gelang nicht: Docker Desktop beendete sich nach dem Startversuch und die Linux-Engine-Pipe blieb nicht erreichbar. In der Registry ist noch kein veröffentlichtes Container-Image vorhanden. Signaturen und unabhängige Build-Attestierung bleiben offen.

**UI/UX-Polish (27.09.2026):** Vor den Änderungen wurden UniOS mit Fake-Daten auf Desktop/390 px und die aktuellen Patterns von Plane, Devlane, Obsidian, Notion und Home Assistant verglichen; Entscheidungsmatrix und Regeln stehen in `UI_PRINCIPLES.md` und `DESIGN_SYSTEM.md`. Die Desktop-Navigation zeigt fünf Alltagsbereiche, mobil vier Tabs inklusive „Mehr“. „Heute“ nennt eine konkrete nächste Lernhandlung und verlinkt neue Dateien direkt auf das Kursmaterial (PDF in zwei Schritten); Aufgaben bleiben als Peek in der Seite. Kursmaterial und Aufgaben stehen vor Verlauf und Werkzeugen. Lernen beginnt mit Karten, Übung oder nächster Aufgabe; leere Lernzyklus-Karten blockieren den Einstieg nicht. Eingang zeigt die Triage sofort und reduziert sichtbare Entscheidungen auf Zuordnen/Später/Ignorieren. Der PDF-Reader scrollt unverändert durch Seiten, zeigt im Dark Mode standardmäßig die Originalseiten und bündelt Ansicht/Export/Mitschrift. Sammlungen beginnen mit Vorlagen und Ergebnissen; Filter sind nachgeordnet. „Mehr“ ist gruppiert, die abgeschlossene Einrichtung ist erneut erreichbar, Connector-Fähigkeiten erscheinen in Alltagssprache und Paketdaten unter „Technische Details“. Die Anki-Seite zeigt keinen „Modus B“ oder Engine-Begriff mehr im normalen Einstieg. Es wurden keine fremden Komponenten, CSS oder Assets übernommen und keine große neue Funktion ergänzt. TypeScript, ESLint, Produktionsbuild und 13 von 14 betroffenen Browserabläufen bestanden im Sammellauf; der eine neue Klickpfad-Test erwartete nur `/learning`, obwohl bei fälligen Karten korrekt `/study` geöffnet wird, und bestand nach Korrektur einzeln. Der Screenshot-Audit prüfte 11 Ansichten plus PDF in Hell/Dunkel bei 1440 und 390 px ohne horizontalen Seitenüberlauf. Lighthouse Accessibility meldete 100 Punkte; die CLI beendete sich danach auf Windows mit `EPERM` beim Löschen ihres temporären Chrome-Ordners, der JSON-Bericht wurde gespeichert. Alle Browserdaten waren erfunden; echte Hochschul- und persönliche Daten wurden nicht verwendet.

**UI-Polish-Nachrunde (27.09.2026):** Der dauerhafte Text „Lokal & privat“ wurde aus der Topbar entfernt. Lernüberblick und Karteikarten zeigen jetzt denselben Bereichswechsel; der Lern-Tab bleibt auch auf `/study` aktiv. Eingangseinträge öffnen auf 390 px ihre Zuordnung als Blatt, während die Liste ruhig und an ihrer Position bleibt. Die Hochschulwahl hat Suche und scrollbare Profilkarten mit den laut Registry vorgesehenen Diensten; die Anzeige behauptet keine aktive Verbindung. Das kleine UniOS-Zeichen erhält eine gefaltete Ecke als zurückhaltenden Wiedererkennungswert. Das Peek-Muster für spätere Material-, Prüfungs- und Themendetails steht in `DESIGN_SYSTEM.md`; entsprechende neuen Detail-APIs wurden nicht als bloße Polishing-Maßnahme gebaut. TypeScript, ESLint, Build und die acht betroffenen Browserprüfungen bestanden; nach einer korrigierten Testauswahl wurde der mobile Zuordnungsablauf einschließlich Speichern separat erneut geprüft. GitHub Actions bleibt unabhängig vom Code blockiert: GitHub meldet eine fehlgeschlagene Kontozahlung oder ein zu niedriges Ausgabenlimit, bevor ein Runner-Schritt startet.

Die letzte 390-px-Sichtung zeigte eine leere Übungskarte. Der Lernüberblick verwendet deshalb für seinen Übungs-Einstieg die tatsächlich vorhandene freigegebene Übungsliste und lässt den Abschnitt bei null Einträgen weg. Der finale Build und beide Klickpfad-/Screenshot-Audits bestanden erneut; die Lern- und Karteikartenansicht wurden in Hell auf 390 px und die Desktop-Topbar visuell geprüft.

**Notiz-Editor und GitHub-Startseite (27.09.2026):** Notizen haben eine kompakte Markdown-Werkzeugleiste, Tastenkürzel für Fett/Kursiv, Bausteine über `/`, Titelvorschläge nach `[[`, Tabellen und Codeblöcke sowie einen Schreib-/Vorschauwechsel. Kleine `.md`- und `.txt`-Dateien lassen sich als Text einfügen; Bilder und andere Dateien führen zum Eingang, weil noch kein eigener Notiz-Anhangspeicher existiert. Eigenschaften sind im Notizkontext zunächst eingeklappt. Die Repository-Startseite erklärt das Produkt, zeigt drei neue Screenshots mit ausschließlich erfundenen Daten, führt durch eine isolierte Demo und benennt den Alpha-Status. Die Gestaltung orientiert sich an der klaren GitHub-Präsentation von Plane; Text und Bilder sind eigene Arbeit. TypeScript, ESLint, Produktionsbuild und acht fokussierte Browserabläufe bestanden. Die einheitliche Schnellansicht für weitere Objekttypen und die Kursseite unter echtem Semesterbetrieb bleiben spätere UX-Arbeit.

**README-Galerie und Dokumentationsentwürfe (27.09.2026):** Die README zeigt jetzt acht aktuelle Ansichten mit erfundenen Daten aus dem Fake-Server-Audit beziehungsweise der isolierten Demo: Heute hell/dunkel, Kurs, PDF-Leser, Notiz, Lernen sowie Heute und Eingang auf 390 px. Unter `docs/site/` liegen getrennte, mobil nutzbare Entwürfe für Studierendenhilfe und Entwicklerdokumentation mit eigener Navigation, Seitensuche, Demo-Schnellstart, API-/CLI-Einstieg, Connector-Vertrag und ehrlichem Alpha-Status. Drei Vorschaubilder machen die Entwürfe im Repository überprüfbar. Die Informationsarchitektur wurde anhand der Plane-Hilfe und Plane-Entwicklerdokumentation entworfen; CSS, Text und Grafik sind eigene Arbeit. Der Screenshot-Audit mit erfundenen Daten bestand. Beide Entwurfsseiten wurden in Chrome auf Desktop und 390 px visuell geprüft; Anker, Suche, Mobilmenü und horizontaler Überlauf wurden gezielt kontrolliert. GitHub Pages ist weiterhin nicht veröffentlicht; die Freigabevoraussetzungen stehen in `PUBLISHING.md`.

**Alpha-Begrüßung (27.09.2026):** Vor der ersten Einrichtung erscheint ein ruhiger Hinweis, dass UniOS noch in Entwicklung ist und normal im Studienalltag benutzt werden soll, ohne gezielt Fehler suchen zu müssen. Ein Klick führt zum bestehenden Dreischritt-Setup. Der Hinweis wird pro Browserprofil lokal als gesehen markiert; bei einem späteren Aufruf der abgeschlossenen Einrichtung erscheint er nicht. Es werden dafür keine persönlichen Daten an einen Dienst gesendet. TypeScript, ESLint, Produktionsbuild und beide fokussierten Setup-Browserabläufe einschließlich Reload und 390-px-Screenshot bestanden. Die mobile Ansicht liegt unter `docs/design/screenshots/alpha-welcome-handy.png`.

**UniOS-Namensbereinigung (28.09.2026):** Sichtbare Produkttexte, PWA-Kurzname, Anki-Notiztypen für neue Karten, README und Dokumentationslinks verwenden UniOS. Die GitHub-Adresse lautet nun `EinfachMxrc/unios-app`. Bestehende technische Kennungen für Schlüsselbund, lokale Browserdaten, Kalender-IDs, Demo-Marker, Betriebssystemdienste und den Moodle-Rückruf bleiben aus Kompatibilitätsgründen erhalten; sie werden nicht als Produktname angezeigt. Bereits vorhandene Anki-Notiztypen werden in persönlichen Sammlungen nicht automatisch umbenannt.

**Notiz-Entwürfe und Host-Abgleich (28.09.2026):** Bestehende Notizen sichern jeden Eingabeschritt synchron als lokalen Browser-Entwurf; nach 1,2 Sekunden Ruhe wird bei geprüftem Host eine neue unveränderliche Version angelegt. Neue Notizen behalten ihren Text bis zum Anlegen ebenfalls lokal. Nach Neuladen oder Wiederaufwachen prüft die Oberfläche den Host erneut und vergleicht Entwurf, Ausgangsversion und aktuelle Version. Unabhängige Änderungen werden automatisch verbunden; überlappende Änderungen verlangen eine Auswahl. Bei Wahl der Host-Fassung bleibt der eigene Text als lokal wiederherstellbarer Entwurf erhalten. Schreibanfragen aus der Web-App tragen die geprüfte Staffelstab-Generation, die API weist veraltete Generationen ab; die Notiz prüft den Staffelstab zusätzlich unmittelbar vor dem Datenbank-Commit. Die kleine BSD-lizenzierte `diff`-Abhängigkeit (bereits zuvor transitiv installiert) dient nur dem konservativen Zeilenabgleich. Geprüft: sechs gezielte Python-Tests, drei Merge-Tests, Ruff, TypeScript, ESLint, Build, fünf Notiz-Browserabläufe und ein Gerätewechsel-Browserablauf mit erfundenen Daten, darunter Schlaf-/Versionswechsel und echter Konfliktdialog. **Grenze:** Die lokalen Entwürfe liegen im Speicher des jeweiligen Browser-Ursprungs; sie wechseln nicht automatisch von der lokalen Standby-Adresse zur Tailscale-Adresse eines anderen Hosts. Eine automatische Weiterleitung von Standby-Schreibanfragen zu diesem Host ist noch nicht implementiert. Zwei echte Geräte und abruptes Zuklappen bleiben vor einer Garantie gegen Datenverlust zu prüfen; Browser-Speicher ist keine erzwungene SSD-Synchronisierung.

**Abhängigkeitswartung (28.09.2026):** Python-Sperrdatei gegen PyPI aktualisiert, darunter `icalendar` 7.3.0, SQLAlchemy 2.1.1, Playwright 1.63.0, Uvicorn 0.54.0 und Ruff 0.16.9. Im Frontend sind TanStack Query 5.104.0, `diff` 9.0.0 und Vitest 5.0.2 aktualisiert; Node-Typen passen nun zur in CI und Docker verwendeten Node-22-Laufzeit. TypeScript bleibt bei 5.9.3, weil `openapi-typescript` 7.13.0 Version 5 voraussetzt; `@vite-pwa/assets-generator` bleibt bei 1.0.4, weil `vite-plugin-pwa` 1.3.0 Version 1 voraussetzt. Die Paketregister melden für `jsdom` und Vitest widersprüchliche `outdated`-Angaben; ihre aktuellen `latest`-Tags sind 30.1.1 und 5.0.2. Geprüft: 22 gezielte Python-Tests einschließlich Kalender/Portal und Add-ons, Ruff, mypy, Frontend-Typecheck, ESLint, 57 Vitest-Tests und Produktionsbuild. Ein zusätzlicher voller Python-Lauf stoppte früh an einem temporären Windows-Dateifehler in einem Add-on-Test; die komplette Add-on-Testdatei bestand unmittelbar danach. Der volle Python-Lauf ist für diese Wartung daher nicht bestätigt.

**Smart Capture, adaptive Lernplanung und KI-Schnittstelle (28.09.2026):** Kurze Texte und vorhandene Sprachtranskripte werden lokal und konservativ auf Aufgaben, Kurse und Fristen geprüft. Eindeutige Aufgaben erzeugen eine verknüpfte lokale Aufgabe; unklare Zuordnungen bleiben im Eingang. Offene Fokusblöcke werden bei verschobenen Prüfungen und verändertem Lernstand neu geplant, angenommene Blöcke bleiben stabil. Neue Altklausuren erscheinen im passenden Lernkontext. Die KI-Übungsstrecke unterstützt nun überprüfte Multiple-Choice-Fragen; der MCP-Server liefert für freigegebene Kurse einen Wochenüberblick mit Quellenverweisen und offenen Aufgaben. Die Anki-Synchronisation war bereits bidirektional vorhanden und wurde hier nicht neu gebaut. Fremde Design-Referenzbilder wurden entfernt; UI-Tokens, Screenshots und Regeln tragen eigene UniOS-Namen. Geprüft: 22 von 24 betroffenen Python-Tests im ersten Sammellauf, die zwei Fehler wurden korrigiert und einzeln bestanden; sechs kritische Abläufe danach erneut bestanden. Ruff, mypy, TypeScript, ESLint und Produktionsbuild bestanden. **Grenzen:** Browserseitige lokale Spracherkennung hängt vom verfügbaren deutschen Sprachpaket ab; hochgeladene Audiodateien werden ohne Transkript gespeichert. Eine serverseitige Whisper-Engine ist noch nicht gebündelt. Echte Hochschul-, Anki- und Geräteabnahmen bleiben offen.

**Desktop-App und Portal-Anmeldung (29.09.2026):** Die Desktop-App startet ohne Terminalfenster (App, Dienst und dessen Hilfsprogramme), zeigt sofort einen Startbildschirm und hat ein Symbol im Infobereich zum Öffnen und Beenden. Die Moodle-Anmeldung öffnet ein eigenes App-Fenster, das die Rückkehradresse `marcunios://` selbst abfängt; externe Links öffnen im Standardbrowser. In der Einrichtung gibt es den Schritt „Weitere Dienste“: myCampus und PRIMUSS öffnen in einem eigenen Fenster (PRIMUSS direkt auf der öffentlichen Anmeldeseite der Hochschule), Passwort und Handy-Code gibt Marc nur dort ein, UniOS übernimmt nur die Cookies der Portal-Hosts in den System-Schlüsselbund. Neu: „Beispielseiten für den Datenabruf erstellen“ liest die im Fenster geöffnete Seite (WebView2, nur Windows) und schreibt bis zu fünf Seiten anonymisiert als ZIP in `Dokumente\UniOS-Beispielseiten`; Texte, Namen, Adressen und Formulare werden entfernt, die Zuordnung bleibt im Schlüsselbund. Daraus entstehen die Selektoren für Blog, News, Stundenplan, Prüfungen und Noten; bis dahin bleibt der Datenabruf für Coburg gesperrt. Behoben: lange Windows-Pfade (`\?\`-Präfix) wurden als Ausbruch aus dem Uni-Ordner gewertet und brachen den gesamten Moodle-Sync ab; eine einzelne nicht speicherbare Datei wird jetzt übersprungen und als Warnung gemeldet, ein abgebrochener Sync blockiert die Wiederholung nicht mehr. Zusatzmaterial anderer Gruppen steht unter den Unterlagen; im PDF-Leser bleibt die ausgewählte Stelle beim Kommentieren markiert. Offen: Mail-Anbindung, echte Portal-Seitenstrukturen, Test des Seitenlesens (WebView2) und der Anmeldefenster mit echtem Hochschul-Login.

**Desktop-Nachbesserung (29.09.2026):** Der Release-Build markiert `unios-desktop.exe` als Windows-Fensterprogramm; der vorher installierte Build war als Konsolenprogramm markiert und startete einen Terminalprozess. Der Desktop-Build registriert keinen PWA-Service-Worker mehr und entfernt beim ersten Start alte Worker-/Cache-Dateien für die lokale Oberfläche. Externe Links aus der App gehen an den Standardbrowser. Die UniOS-Seite darf das Mikrofon nach Nutzeraktion anfragen (`microphone=(self)`); Kamera und Standort bleiben gesperrt. macOS bekommt Systemtexte für Mikrofon und Spracherkennung. Die Snapshot-Prüfung lehnt weiterhin Links, falsche Prüfsummen und beschädigte SQLite-Dateien ab, akzeptiert aber die Windows-App-Container-Umleitung eines regulären Datenpfads. Im installierten Windows-Build geprüft: Start ohne Terminalprozess, Hauptansicht mit Kursen, myCampus-Anmeldefenster, Quellcode-Link im Standardbrowser, Mikrofonaufnahme starten und stoppen ohne Speichern sowie PDF-Anzeige und Scrollen. Die gezielten Snapshot- und Header-Sicherheitstests bestanden. Echter Hochschul-Login und macOS/Linux bleiben auf diesem Windows-PC ungeprüft.

**Hochschulimporte und Desktop 0.1.1 (29.09.2026):** Nach der myCampus-Verbindung erscheint die durchsuchbare Studiengangauswahl. Eine Auswahl startet den Import. Dieser folgt verschachtelten Studiengangseiten und der Nachrichten-/Veranstaltungspaginierung; weitere Campusbereiche werden begrenzt rekursiv gelesen. Maximal 300 Seiten insgesamt, 100 Studiengangseiten und 40 Unterseiten je allgemeinem Bereich; erreichte Grenzen werden als Warnung gemeldet. Studiengangtexte und Dokumente erhalten lokale Dateiversionen und bleiben getrennt von allgemeinen Campusunterlagen. Der neue PRIMUSS-Import archiviert eindeutig lesende Seiten und Dokumente als eigene Unterlagen; er sendet keine Formulare, betätigt keine Prüfungsanmeldung und interpretiert keine ungeprüften Noten-/Statusfelder. Grenzen: 60 Seiten, 60 Dokumente, 100 MB Dokumentdaten pro Lauf. Nicht verfügbare und ausgelassene Bereiche werden gemeldet. Eine vollständige Abdeckung der echten Portale ist damit noch nicht nachgewiesen.

Moodle-Aufgaben behalten jetzt ihren bereinigten Beschreibungstext. Zusätzlich zum offiziellen Fälligkeitsfeld werden eindeutige Texttermine mit Uhrzeit erkannt. Relative Angaben wie „am zweiten Tag“ werden nicht als Datum erfunden, sondern erscheinen in „Abgaben mit offenem Datum“. Ein bestätigter lokaler Termin und die Abgabeart bleiben bei erneutem Sync erhalten; veraltete Bestätigungen werden abgewiesen. Bei persönlicher Abgabe wird die Moodle-Abgabeprüfung in der Kursansicht ausgeblendet. Die neue additive Datenbankmigration verwendet die vorhandene geprüfte Snapshot-Sicherung vor dem Update.

Die Desktop-App enthält `faster-whisper` samt festem mehrsprachigem Base-Modell. Deutsche Audios werden nach dem Stoppen lokal transkribiert, ohne Abhängigkeit vom Browser-Sprachpaket. Modell und Drittanbieter-Lizenzen werden gebündelt. Browser-Kontextmenü, Entwicklertools und Browser-Speichertastenkürzel sind im Hauptfenster gesperrt. Die Bewegung der gesamten Seite beim Seitenwechsel und die dauerhafte Sidebar-Unschärfe wurden entfernt. Startfehler durch einen bereits belegten lokalen Port beziehungsweise einen früh beendeten Dienst werden sichtbar gemeldet.

Geprüft: 41 gezielte Python-Prüfungen; nach dem erweiterten Speichern der Studiengangseiten die acht betroffenen Speicher-/Fristen-/PRIMUSS-Prüfungen erneut, zuletzt die vier Fristen-/PRIMUSS-Prüfungen nach konservativerer Abgabeart-Erkennung. Drei fokussierte Browserabläufe für lokale Transkription, Fristbestätigung und Aufnahme/Korrektur/Speicherung bestanden; der bestehende myCampus-News-/Terminablauf bestand separat. Ruff, betroffene Python-Typprüfung, Frontend-Typecheck, ESLint, OpenAPI-Abgleich, Produktionsbuild und Windows-Rust-Build bestanden. Der gebündelte Windows-Dienst beantwortete im isolierten Profil die Sprachstatus-API mit `available=true` und transkribierte eine künstliche deutsche Testaufnahme erfolgreich (rund 0,8 Sekunden auf diesem PC). Reale Hochschul-Anmeldungen, vollständiger Portalabruf und neue macOS-/Linux-Pakete bleiben separat zu prüfen.


**Echte Windows-Abnahme und Portal-Nacharbeit (29.09.2026):** Windows 0.1.1 installiert und am nativen Fenster geprüft: Rechtsklick öffnet kein Browser-Kontextmenü; der laufende Prozess startet WebView2 und den Fensterdienst ohne Terminal. Die vom Nutzer bestätigte Projektauftrag-Frist wurde über die lokale API auf 30.09.2026, 14:45 Uhr Europe/Berlin, persönliche Abgabe, gesetzt und erscheint in der Terminansicht. Der echte myCampus-Abruf zeigte Drupal-BigPipe-Inhalte und einen Redirect in einem noscript-Block. Der reine GET-Reader setzt die übermittelten HTML-Fragmente zusammen, führt keine JavaScript-/AJAX-Befehle aus und folgt keinem noscript-Fallback oder verzögerten Refresh. Die Hauptnavigation wird getrennt vom Kontomenü erkannt. Damit wurden im echten Portal 59 Studiengänge gelesen. PRIMUSS leitet die bisher gespeicherte Sitzung wieder an den Hochschul-Login weiter; das wird jetzt als erneute Anmeldung gemeldet. Ein fehlgeschlagener erster Seitenabruf wird nicht mehr als erfolgreicher Import mit null Einträgen gemeldet. Geprüft: 26 Portal-, API- und Dateispeicherprüfungen im kurzen Windows-Testpfad und betroffene Typprüfung bestanden; ein vorheriger Lauf scheiterte bei vier Speicherprüfungen ausschließlich an überlangen Windows-Testpfaden. Vollständiger myCampus-Inhaltsabruf und erneuter PRIMUSS-Login bleiben bis zur nachfolgenden realen Prüfung offen.

**Echte myCampus-Dokumentstruktur:** Die Informatik-Seite stellt 20 Dokumente als verlinkte Drupal-Felder bereit, nicht als einzelne article-Karten. Der Import erkennt sie nun mit Kategorie, Datum, Größe und direktem Download; die PDF-Endung wird bei Download-Routen ohne Dateiendung aus dem sichtbaren Dateityp übernommen. Ein echtes PDF wurde erfolgreich mit der gespeicherten Sitzung gelesen. Der äußere Studiengang-Artikel wird nicht als zusätzliche Dokument-/News-Karte gezählt. Alle Pager werden gelesen, einschließlich Drupals mehrteiliger Werte wie `page=,1`. Gewählter Studiengang und seine Unterseiten werden vor dem allgemeinen Campus-/Nachrichtenarchiv gelesen, damit alte News das Seitenbudget nicht aufbrauchen. Die 29 betroffenen Extraktions-/Importprüfungen und Python-Typprüfung bestanden.

**Installierter Endstand und echter Datenabruf:** Der endgültige Windows-Installer wurde lautlos im bestehenden Profil installiert und die installierten Dienstdateien gegen den fertigen Build per SHA-256 abgeglichen. Die vom Nutzer gewählte Einstellung ist Bachelor Informatik. Der installierte Dienst erkannte 59 Studiengänge und führte den echten myCampus-Import erfolgreich aus: 300 Seiten, 79 Termine, 483 News, 46 Dokumente und 27 archivierte Seiten; 635 Einträge insgesamt, 73 lokal lesbare Dateiversionen, keine übersprungenen Inhalte/Downloads. Der Import meldet korrekt das erreichte Seitenlimit; eine vollständige Erfassung aller historischen Archivseiten wird nicht behauptet. Die bestätigte persönliche Abgabe bleibt nach Neustart und erneutem Moodle-Abgleich erhalten und wird auch auf Heute als eine anstehende Aufgabe angezeigt. PRIMUSS wurde im eigenen App-Fenster geöffnet; die echte persönliche Prüfung wartet auf den Nutzer-Login, weil die zuvor gespeicherte Sitzung abgelaufen ist. macOS/Linux und die echte Zwei-Geräte-Abnahme bleiben ungeprüft.

**Kursalltag und Eingang (30.09.2026):** Die Kursseite startet mit der nächsten Aufgabe und einer kompakten Übersicht. Eigene Reiter trennen Übersicht, nach Moodle-Abschnitten gruppierte und durchsuchbare Unterlagen, Aufgaben und Notizen; ältere Dateiversionen liegen unter Mehr. Lange Kurstitel bleiben lesbar und erzeugen keine breitere Kursnavigation. Ein dauerhaft gespeicherter Kursstatus erlaubt Inaktiv/Reaktivieren; aktive Kurslisten und automatische Tagesjournal-Prompts blenden inaktive Kurse aus, während Unterlagen, Aufgaben und bereits geschriebene Rückblicke erhalten bleiben. Moodle-Dateien und -Aufgaben sind im Eingang standardmäßig bereits zugeordnet; explizite spätere Nutzerentscheidungen bleiben erhalten. Ein Download zählt nicht mehr als besuchte Veranstaltung. Kursnotizen sind freiwillig, zunächst eingeklappt und können bei Bedarf manuell hinzugefügt werden. Der Hinweis auf neue Unterlagen wird beim Öffnen des Verlaufs auf diesem Gerät dauerhaft quittiert, unabhängig von weiterhin sichtbaren Aufgaben. Vier gezielte Python-Prüfungen und vier Browserabläufe mit erfundenen Daten bestanden, inklusive Wiederladen, Unterlagensuche, Inaktiv/Reaktivieren und freiwilliger Journalnotiz. TypeScript, ESLint, betroffene Ruff-/mypy-Prüfungen und Produktionsbuild bestanden; Desktop-/Mobilansichten in Dark/Light wurden angesehen. Windows-App-Update 0.1.2 ist lautlos installiert und am nativen Fenster geprüft: die neue Kursübersicht zeigt den bestätigten Projektauftrag um 14:45 Uhr zuerst. Der Mathe-Vorbereitungskurs ist inaktiv, seine 20 Unterlagen bleiben erhalten. Kein Moodle-Eintrag verlangt eine erneute Zuordnung. Nach Neustart bleiben eine anstehende Aufgabe, keine automatische Journalaufforderung und keine Gruppenzuordnungsfrage zum inaktiven Kurs. Die installierte Dienstdatei stimmt per SHA-256 mit dem Build überein; Diagnose meldet App-Version 0.1.2 und Schema fd58a9102c3d. Der Paketbau erneuert künftig die Paketmetadaten vor dem Bündeln. macOS/Linux und die echte Zwei-Geräte-Abnahme bleiben ungeprüft.

**Verpflichtende Studiengangwahl (30.09.2026):** Der Einrichtungsablauf fragt direkt nach der Hochschulwahl nach Studiengang und Abschluss. Hochschulprofile mit myCampus verwenden die echte, durchsuchbare Portalliste nach der persönlichen Anmeldung; andere Profile bieten eine freie Eingabe ohne Informatik-Vorauswahl. Moodle-Einstieg, erster Moodle-Abgleich und Abschlussknopf werden erst nach gespeicherter Studiengangwahl angeboten. Auch die Abschluss-API verweigert eine Einrichtung ohne Studiengang. Die myCampus-Auswahl ist dieselbe, die den vorhandenen Dokumentimport steuert; keine zweite unabhängige Einstellung. Bereits gespeicherte, zum Portal passende Auswahl wird übernommen. Freie Angaben sind an das Hochschulprofil gebunden und werden beim Profilwechsel zurückgesetzt. Sechs gezielte Python-Prüfungen, betroffene Ruff-/mypy-Prüfungen, TypeScript, ESLint, OpenAPI-Abgleich und Produktionsbuild bestanden. Alle sieben betroffenen Browserabläufe bestanden, der BWL-Katalogablauf nach Korrektur einer alten Testannahme über den standardmäßig geöffneten myCampus-Reiter separat. Desktop hell und 390 px dunkel wurden mit erfundenem BWL-Katalog angesehen. Windows-Pakete 0.1.3 für EXE/MSI sind fertig. Das EXE-Update ist lautlos installiert, die Dienstdatei stimmt per SHA-256 mit dem Build überein. Die laufende App meldet 0.1.3; der Einrichtungsstatus bleibt abgeschlossen und bestätigt weiterhin die vorhandene Auswahl Bachelor Informatik. Das native Fenster wurde nach Neustart angesehen. Es wurden keine Zugangsdaten eingegeben und keine neue Hochschulsitzung angelegt.


**Kurse, Hochschulunterlagen und Verbindungen (30.09.2026, 0.1.4):** myCampus-Studiengangsammlungen und PRIMUSS-Archive werden nach ihrer Quelle von Lehrveranstaltungen getrennt. Sidebar, Kursseite, Kursauswahl in Notizen/Eingang, automatische Kontextzuordnung, Studienjournal und Lernstatistik verwenden Lehrveranstaltungen; Archivmaterial bleibt gespeichert und durchsuchbar. Der neue Bibliotheksbereich „Hochschulunterlagen“ zeigt die bisherigen Sammlungen einschließlich alter Semester, mit Filter, PDF-Reader, Download und Originalquelle. Frühere Kurslinks zu solchen Sammlungen führen dorthin. Moodle-Kurssuche liest Beschreibungen, Kategorien und bestehende Einschreibungen. Unterstützt Moodle die nötigen Webservices, werden angebotene Selbsteinschreibungen geprüft und erst nach „Jetzt einschreiben“ ausgeführt. Ein ausdrücklich genannter Beschreibungsschlüssel kann manuell übernommen werden; er wird weder persistiert noch geloggt. Nicht unterstützte Webservices führen zur offiziellen Moodle-Seite. „Heute“ und die Verbindungseinstellungen bieten Moodle-Aktualisierung; eine bestehende Verbindung kann erneut angemeldet werden. PRIMUSS liest nun gerenderte, gleichadressige JavaScript-Menüs sowie Frames und Dokumentlinks. Der Browser erlaubt dafür keine Form-POSTs; fehlende, begrenzte oder blockierte Bereiche werden als Teilabruf gekennzeichnet. Rohes HTML wird aus dem Aktionsjournal entfernt. Strukturierte Noten/Prüfungsstatus werden weiterhin nur mit geprüften Feldzuordnungen interpretiert.

Gezielte Prüfung: elf Python-Tests, zwei Vitest-Tests für die Portalnavigation, sieben Browserabläufe mit erfundenen Hochschuldaten (Kursabgrenzung, Einschreibung/Bestätigung, Aktualisierung/Neuanmeldung, PRIMUSS-Teilabruf und bestehende Kursalltagsabläufe); betroffene Ruff-/mypy-Prüfungen, TypeScript, ESLint, OpenAPI-Abgleich und Frontend-Build bestanden. Desktop- und Mobilansichten wurden angesehen. Eine tatsächliche Einschreibung im Hochschulsystem wurde nicht ausgelöst. Der vollständige PRIMUSS-Abruf, macOS/Linux und die echte Zwei-Geräte-Abnahme bleiben offen.

**Installierte Prüfung 0.1.4:** EXE/MSI gebaut; bestehende Windows-App lautlos aktualisiert, die installierte Dienstdatei per SHA-256 gegen den endgültigen Build geprüft und die native App neu gestartet. Diagnose meldet 0.1.4 und aktiven Host. Die echte Kurs-API liefert zwei aktive Moodle-Kurse; zwei Sammlungen aus myCampus/PRIMUSS sind separat unter Hochschulunterlagen vorhanden. Die echte lesende Moodle-Suche liefert 17 Treffer mit 17 Beschreibungen, die angebotene Selbsteinschreibung eines Suchtreffers ist über die API verfügbar. Keine reale Einschreibung ausgeführt. Die native Kursansicht zeigt die getrennte Bibliotheksnavigation, zwei aktuelle Kurse und die neue Moodle-Suche.


**Anpassbare Seitenleiste (30.09.2026, 0.1.5):** „Seitenleiste anpassen“ ist unten in der Desktop-Navigation und unter „Weitere Bereiche“ erreichbar. Bereiche können per Ziehen oder Pfeilknöpfen sortiert, zwischen Arbeitsbereich und Bibliothek verschoben, ausgeblendet und aus dem Katalog vorhandener UniOS-Bereiche wieder hinzugefügt werden. Kursverknüpfungen lassen sich einzeln sortieren/ausblenden oder insgesamt verbergen. Verknüpfungen werden nicht mit Daten oder deaktivierten Funktionen verwechselt; fehlende deaktivierte Funktionen führen zu den bestehenden Einstellungen. Eine leere Konfiguration bleibt gültig. Standard wiederherstellen bietet einen dauerhaften Rückweg. Die mobile Navigation verwendet die ersten drei gewählten Arbeitsbereich-Einträge plus Mehr. Änderungen gelten sofort, werden auf diesem Gerät gespeichert und bleiben bei Seitenwechsel und Neustart erhalten. Fehler beim Speichern behalten die vorige Auswahl und zeigen eine Fehlermeldung. Die Ziehbedienung verwendet Pointer-Ereignisse mit direkter Zielerkennung und visueller Einfügemarkierung; sie hängt nicht vom nativen Datei-Drop-Handler der App ab. Pfeilknöpfe und Gruppenauswahl bleiben für Tastatur und Touch verfügbar.

TypeScript, gezieltes ESLint und Produktionsbuild sowie drei lokale Browserabläufe bestanden: Sortierung/Ziehen, Gruppenwechsel, Ausblenden/Hinzufügen, Kursverknüpfungen, Wiederladen und Standard; leere Konfiguration und 390-px-Ansicht; fehlgeschlagenes Speichern ohne falsche Erfolgsmeldung. Desktop hell und Mobil dunkel wurden visuell angesehen. Windows-EXE/MSI sind fertig; das endgültige Update ist lautlos installiert und die Dienstdatei per SHA-256 mit dem Build abgeglichen. Die laufende App meldet 0.1.5 und denselben Datenbankschemastand. Das anfänglich nur im Browser funktionierende HTML5-Ziehen wurde nach der nativen Prüfung auf Pointer-Bedienung umgestellt; die drei gezielten Abläufe bestanden danach erneut. Im installierten Windows-Fenster wurde Lernen erfolgreich an die erste Stelle gezogen und die Änderung als gespeichert bestätigt. Die temporäre Test-Reihenfolge wurde zurückgesetzt; der Anpassungsdialog bleibt für den Nutzer geöffnet. macOS/Linux sind für dieses Arbeitspaket noch nicht geprüft.


**Mensa und offizielles Hochschulpostfach (30.09.2026, 0.1.6):** Eine eigene Mensaseite bietet die beiden offiziellen Coburger Standorte, Datumsauswahl und Studierendenpreise aus dem öffentlichen SWO-Feed. Hochschuladressen/Standorte stehen im Profil; andere Hochschulen bekommen keine Coburg-Vorgaben. Mittagspause und Vorlauf werden auf diesem Gerät gespeichert. Vorläufiger Standard: 12:00 Uhr, 60 Minuten Vorlauf; 90/120 Minuten sind wählbar. Auf Heute erscheint die Karte ab der eingestellten Vorlaufzeit bis zwei Stunden nach der Pause; ein laufender Uhrzeittakt aktualisiert sie auch ohne Seitenwechsel. Der Speiseplan wird bereits beim Öffnen von Heute vorgeladen und stündlich aufgefrischt. Mensa, Speiseplan und Mittagessen sind jederzeit in Suche/Schnellsuche und Weitere Bereiche erreichbar und können in die anpassbare Seitenleiste aufgenommen werden. Öffentliche Menüs werden lokal mit Datum zwischengespeichert; Fehler zeigen einen gekennzeichneten alten Stand oder einen Fehler, leere Feed-Antworten werden nicht als erfundene Gerichte oder bestätigte Schließung ausgegeben. Keine Datenbankmigration.

Uni-Mail bietet den bestätigten Outlook-Link im separaten nativen Fenster. Das Fenster bekommt keine UniOS-IPC-Rechte; Passwörter/MFA und Microsoft-Sitzungen werden nicht ausgelesen oder als Connector-Token übernommen. Ein erneuter Aufruf fokussiert das bereits offene Postfach. Uni-Mail kann aus dem Bereich in die Seitenleiste aufgenommen werden. Dieser Zugang ist Webmail, kein automatischer E-Mail-Import. Automatischer Microsoft-Graph-Abruf bleibt von einer eigenen, durch die Hochschule zugelassenen App-Registrierung abhängig; die bestehende gezielte EML-Fristenprüfung bleibt verfügbar.

Gezielte Prüfung: drei Python-Tests für Datumsprüfung/Deduplizierung, Offline-Cache/Backoff und Profilabgrenzung; ein Vitest-Test für Campuszeitzone und exakte Vorlaufgrenze; zwei Browserabläufe für Suchtreffer, Einstellungen/Neuladen, Heute-Timing, Mobilansicht sowie Mailfenster-Aufruf/Seitenleistenverknüpfung. TypeScript, betroffenes ESLint/Ruff/mypy, OpenAPI-Abgleich und Frontend-Build bestanden. Desktop/Mobil visuell geprüft. Der öffentliche Feed für 01.10.2026 liefert sechs gültige Gerichte; 30.09.2026 liefert derzeit keine. Reale Outlook-Anmeldung und Zugriff nach Hochschul-MFA bleiben vom Nutzer durchzuführen; kein automatischer Mailabruf als getestet behauptet.


**Installierte Prüfung 0.1.6:** Windows-EXE/MSI gebaut und die vorhandene App lautlos aktualisiert. Die installierte Dienstdatei stimmt per SHA-256 mit dem Build überein; Diagnose meldet App 0.1.6 bei unverändertem Schemastand fd58a9102c3d. Die native Mensaseite zeigt die zwei offiziellen Standorte, die vorläufige Pausenzeit 12:00/Hinweis 11:00 und den leeren heutigen Feed korrekt. Die installierte Plan-API liefert die sechs veröffentlichten Gerichte für 01.10.2026. Uni-Mail wurde über die normale Oberfläche in der Seitenleiste aktiviert. „Outlook öffnen“ öffnet erfolgreich das eigene native Fenster; eine bereits bestehende Microsoft-Sitzung zeigt das echte Hochschulpostfach, ohne erneute Passwort-/MFA-Eingabe. Keine Nachricht geöffnet, geändert, versendet oder exportiert; keine Tokens/Sitzungsdaten ausgelesen. Das Postfach bleibt für den Nutzer geöffnet. Automatischer E-Mail-Import ist weiterhin nicht eingerichtet. macOS/Linux wurden für dieses Paket nicht ausgeführt.


**Kursarbeitsplatz überarbeitet (30.09.2026, 0.1.7):** Die doppelte große Aufgaben-/Zählerfläche entfällt. Ein kleinerer, umbrechender Titel, eine gemeinsame Ansichtsnavigation und ein kompakter Einstieg mit Neuer Notiz und Kurseinstellungen ersetzen die bisherige Kopfzone. Auf dem Desktop stehen zuletzt hinzugefügte Unterlagen links und kurze Aufgabenkarten/Notizen rechts. Die Vorschau behält die Reihenfolge der neuen Dateiversionen; die vollständige Unterlagenansicht bleibt abschnittsweise sortiert und durchsuchbar. Mobil stehen Aufgaben vor Unterlagen und Notizen. Ankündigungen belegen nur Platz, wenn tatsächlich welche vorhanden sind. Semester und Aktiv-/Inaktiv-Status bleiben in Kurseinstellungen erreichbar.

Aufgaben öffnen dieselbe Schnellansicht wie andere Aufgabenlinks, mit einer breiteren, scrollbar lesbaren Detailansicht. Frist, Abgabeart und Bestätigungsstatus stehen vor dem vollständigen Text; Terminbearbeitung, Eigenschaften und Verlauf sind separat aufklappbar. Vor-Ort-Abgaben bekommen keinen Online-Abgabecheck. Escape/Schließen und Rückkehr zum angeklickten Eintrag funktionieren; direkte sowie archivierte Aufgabenlinks bleiben erreichbar. Ein bestehender Fehler in der Terminbearbeitung wurde behoben: UTC-Termine ohne Zeitzonensuffix werden für die Prüfung des bisherigen Wertes normalisiert, statt vom Server abgewiesen zu werden. Keine Datenbankmigration.

Prüfung: TypeScript, gezieltes ESLint, Frontend-Build und sechs gezielte Browserabläufe mit erfundenen Daten bestanden (Kursstatus, Suche, Eingang, kompakte Aufgabe mit tatsächlicher Terminänderung/Neuladen, direkte und archivierte Links). Dark/Desktop, Light/Mobil und breite Aufgabendetails wurden visuell angesehen. Windows-EXE/MSI gebaut; vorhandene App lautlos aktualisiert und installierte Dienstdatei per SHA-256 gegen den Build geprüft. Die laufende App meldet 0.1.7 bei unverändertem Schemastand fd58a9102c3d. Im installierten Windows-Fenster wurden die echte Kursübersicht, die kompakte Aufgabenkarte und die breite lesbare Detailansicht geöffnet und angesehen; Escape führt zurück zur Übersicht. Keine echte Frist geändert und keine Hochschulabgabe ausgelöst. Die überarbeitete Kursübersicht bleibt geöffnet. macOS/Linux für dieses Paket noch nicht ausgeführt.


**Moodle-Materialtitel statt technischer Dateinamen (30.09.2026, 0.1.8):** Moodle-Dateiaktivitäten übernehmen den sichtbaren Aktivitätstitel einschließlich dekodierter HTML-Zeichen. Ordnerinhalte behalten ihre individuellen Dateinamen. RemoteResource trennt Anzeigetitel und Dateiname; Downloadprüfung, Ablage, MIME-Erkennung und Textextraktion verwenden den Dateinamen. Der Kurs zeigt Titel, PDF-Reader und Suchergebnisse folgen demselben gespeicherten Namen. Unter Mehr bleibt der Quelldateiname sichtbar und in der Unterlagensuche suchbar. Dokumentaktionen prüfen die Originaldateiendung. Vorlesungsnotizen erkennen klare Vorlesungstitel auch ohne Endung anhand der Quelldatei.

Eine reine Titel-/Abschnittsänderung schreibt aktuelle Metadaten, lädt vorhandene unveränderte Dateien nicht erneut herunter und erstellt keine neue Dateiversion. IDs, gespeicherte Dateipfade und Quellen bleiben erhalten; die Anpassung vorhandener Titel erfolgt beim nächsten regulären Moodle-Abruf. Keine Datenbankmigration. ResourceView ergänzt den aus der Quelladresse abgeleiteten Dateinamen; OpenAPI und generierte Typen sind aktualisiert.

Gezielte Prüfung: 26 Moodle-/Sync-Tests (einschließlich Titeländerung ohne Download oder neue Version, Ordnerdateien und bestehender Dateiprüfungen), ein Browserablauf für Titel/Originaldateiname, beide Suchbegriffe und PDF-Aufruf; betroffenes Ruff/mypy, TypeScript, ESLint, API-Abgleich und Frontend-Build bestanden. Windows-EXE/MSI gebaut. Der NSIS-Updateversuch endete mit Exitcode 2; die beiden vorhandenen Programmdateien wurden anschließend durch den geprüften Build ersetzt und per SHA-256 verglichen. Die laufende App meldet 0.1.8 bei unverändertem Schemastand fd58a9102c3d. Der normale Moodle-Abruf hat die vorhandenen Materialtitel übernommen; die installierte Kursübersicht und Unterlagenansicht zeigen die sichtbaren Aktivitätstitel. Es wurden keine Titel aus Dateinamen geraten. Der Moodle-Änderungsabruf meldet weiterhin eine Warnung, die der bestehende Aktualisieren-Button irreführend als Fehlschlag darstellt; der Titelabruf und die Speicherung waren erfolgreich. Keine Hochschulabgabe ausgelöst. Unterlagenansicht bleibt geöffnet. macOS/Linux für dieses Paket nicht ausgeführt; vollständige Installer-Updateprüfung bleibt wegen des NSIS-Abbruchs offen.


**Audiowiedergabe von Sprachnotizen (30.09.2026, 0.1.9):** Die ausgelieferte Content-Security-Policy hatte keine media-src-Regel; die lokale Blob-Adresse der Aufnahme fiel deshalb unter default-src self und wurde vor der Wiedergabe blockiert. media-src erlaubt jetzt ausschließlich self und blob: für gespeicherte lokale Audiodateien und die Vorschau. Andere Quellen-, Verbindungs- und Schutzregeln bleiben unverändert. Keine Datenbankmigration und keine Änderung an vorhandenen Aufnahmen.

Gezielte Prüfung: Eine tatsächlich mit MediaRecorder kodierte synthetische Tonaufnahme scheiterte vor der Korrektur beim play()-Aufruf. Derselbe Browserablauf mit der vom Backend gelieferten Sicherheitsrichtlinie besteht jetzt: Vorschau abspielen, Fortschritt prüfen, speichern, Seite neu laden, gespeicherte Aufnahme erneut abspielen. Der bestehende Aufnahme-/Transkript-/Bearbeitungsablauf besteht ebenfalls (2 Browserprüfungen); 5 betroffene Audio-/Sicherheitsprüfungen, Ruff/mypy, TypeScript/Frontend-Build und gezieltes ESLint bestanden. Windows-EXE/MSI erfolgreich gebaut. Die vorhandenen Programmdateien wurden ohne sichtbares Terminal aktualisiert und gegen die Build-Dateien per SHA-256 geprüft; vor dem Neustart war keine Aufnahme oder ungespeicherte Sprachnotiz in der geöffneten App. Die laufende App meldet 0.1.9 bei unverändertem Schemastand fd58a9102c3d; die tatsächlich ausgelieferte Voice-Seite enthält media-src self/blob und weiterhin connect-src self. Keine echte Aufnahme angelegt, verändert oder exportiert. Die bekannte NSIS-Updateproblematik aus 0.1.8 wurde in diesem Audiopaket nicht erneut getestet. macOS/Linux für dieses Paket nicht ausgeführt.

**Seitenleisten-Anpassung, Stundenplan-Abo und lesende Mail-Verbindung (30.09.2026, 0.1.10):** Der Anpassungsdialog komprimiert seine Inhaltsgruppen bei geringer Höhe nicht mehr; Kurszeilen bleiben innerhalb ihres Rahmens und der Inhalt scrollt. Die Tauri-App aktiviert Autostart nicht länger bei jedem Start erneut. Ein persönlicher HTTPS-/webcal-Kalender lässt sich unter Termine abonnieren. Der vollständige Link liegt ausschließlich im OS-Schlüsselbund; Antworten, Metadaten und Termine enthalten keine Session-URL. Kalenderimporte berücksichtigen Serien, Ausnahmen, verschobene/abgesagte Termine und Zeitzonen. Heutige Vorlesungen erscheinen auf Heute, die nächsten sieben Tage unter Termine. Fehlerhafte Feeds erhalten den letzten erfolgreichen Stand; Abo beenden entfernt nur dessen importierte Termine. Bestehendes Schema bleibt unverändert.

Uni-Mail erhält eine separate Microsoft-Graph-Verbindung per öffentlichem Client und Gerätecode. UniOS verlangt nur delegiertes Mail.Read und offline_access; Tokens werden in begrenzten, überprüften OS-Schlüsselbund-Blöcken gespeichert. Bis zu 1.000 Nachrichten der letzten 30 Tage werden gelesen, ohne sie als gelesen zu markieren oder zu versenden. Absender, Betreff, Eingangszeit und unbestätigte Fristvorschläge werden importiert; Nachrichtentexte werden nur vorübergehend ausgewertet, Anhänge nicht geladen. Wiederholter Import erzeugt keine Duplikate und erhält bestätigte/ignorierte Zustände. Hintergrundabruf läuft nur auf dem aktiven Host außerhalb der Ruhezeit; die Oberfläche aktualisiert neue Ergebnisse regelmäßig. Die bestehende Webmail-Anmeldung ist ausdrücklich keine Graph-Freigabe. Der Nutzer hat bestätigt, dass noch keine eigene Microsoft-App-Registrierung vorhanden ist: echter Mailabruf bleibt bis Registrierung, Hochschulfreigabe und persönlicher Anmeldung offen.

Gezielte Prüfung: neun Python-Tests für Schlüsselbund-Größen, Kalenderausnahmen, stabile IDs, fehlerhafte Feeds, Redirect-Sperre, OAuth-/Token-Erneuerung, Graph-Paginierung, Leserechte/Deduplizierung und Host/Ruhezeit bestanden. Fünf Browserabläufe für Abo/Heute/Fehler/Mobilansicht, Mailcode/Import/Fristbestätigung sowie Sidebar-Sortierung/Leerzustand/Speicherfehler bestanden. Ruff, betroffenes mypy, TypeScript, ESLint, Übersetzungs-/OpenAPI-Abgleich und Produktionsbuild bestanden. Desktop/Mobil visuell angesehen. recurring-ical-events samt x-wr-timezone ergänzt die vorhandene iCal-Bibliothek; Versionen gesperrt und LGPL-Lizenzdateien im Desktop-Paket. Tatsächliche Windows-Installation und persönlicher PRIMUSS-Link werden separat unten dokumentiert; macOS/Linux für dieses Paket noch nicht ausgeführt.

**Windows-Installation und offene Einrichtung (0.1.10):** Windows-EXE/MSI fertig gebaut. Die bisherige Installation wurde ohne sichtbares Terminal per geprüftem Deinstallations-/Installationsprogramm aktualisiert; beide Programme meldeten Exitcode 0. Der installierte Dienst stimmt per SHA-256 mit dem Build überein, der UniOS-Autostarteintrag ist nicht vorhanden. Der App-Start wurde ausgelöst; die anschließende native Bedienung wurde durch Escape beendet. Der persönliche PRIMUSS-Link ist deshalb noch nicht eingetragen, das Stundenplan-Abo ist nicht aktiv. Microsoft-App-Registrierung und echte Mail-Freigabe fehlen weiterhin. Die vorhandene MCP-Schnittstelle ist für diese beiden neuen Quellen noch nicht erweitert; eine echte GPT-Work-Verbindung ist nicht abgenommen.

**GitHub-Prüfstatus vor Upload:** Der Qualität-Lauf zum vorherigen Commit 877aeb4 startete keine Prüfschritte. GitHub meldet fehlgeschlagene Kontozahlungen beziehungsweise ein zu niedriges Ausgabenlimit. Die vorstehend aufgeführten lokalen Prüfungen sind bestanden; externe CI-Abnahme bleibt bis zur Freigabe durch GitHub offen.

### 01.10.2026 – Lokale Work-Verbindung, UniOS 0.1.11

Der Nutzer hat die lokale Verbindung auf diesem PC priorisiert. Die installierte App kann unter Mehr → KI-Paket eine MCP-Verbindung ohne manuelle `.env`-Bearbeitung einrichten. Ein zufälliger Schlüssel bleibt im OS-Schlüsselbund; die kopierbare Client-Konfiguration enthält nur Programmpfad, Argumente und UniOS-Datenordner. Gespeicherte Bereichs-/Kursfreigaben bleiben erhalten, Abschalten wirkt ohne Neustart und über Neustarts hinweg. Fehlender/beschädigter Schlüsselbund sperrt die Verbindung. Bestehende manuelle Konfigurationen bleiben unterstützt.

Der gebündelte Dienst unterstützt `uniosd mcp` über stdio. Auf Windows werden geerbte Pipes im fensterlosen Programm wiederhergestellt; kein Konsolenfenster, kein weiterer Host, keine Datenbankmigration und kein Staffelstab durch den Brückenprozess. PyInstaller bündelt die Client-Module und das vorhandene MCP-SDK. Derselbe Modus ist für macOS/Linux vorbereitet, auf diesen Plattformen hier noch nicht ausgeführt.

Neue Werkzeuge `get_timetable` und `get_mail_hints` prüfen eigene, standardmäßig gesperrte Bereichsfreigaben sowie Kursgrenzen. Kalenderdaten enthalten UTC-Zeitangaben und keine persönlichen Feed-/Quell-URLs. Mail-Werkzeuge geben nur importierte Metadaten und mögliche Termin-Hinweise weiter, keine Nachrichtentexte, Anhänge oder Login-Daten. Die Verbindung ersetzt kein Stundenplan-Abo oder eine Microsoft-Anmeldung. Neue Freigaben und Einrichtung sind deutsch/englisch verfügbar. Die Fehlerdiagnose für die KI-Verbindung protokolliert nur Exception-Typ und Funktionspositionen; SQLite-Beschäftigung erhält einen klaren 503-Fehlercode ohne SQL-Parameter oder Zugangsdaten.

Gezielte Prüfung: 18 Python-Tests über Verbindung, Freigaben, Widerruf, Fehlerbehandlung und Desktop-Start bestanden; ein Browserablauf für Einrichtung, Abschalten, Wiedereinschalten und Bereichsfreigaben bestanden. Ruff, betroffenes mypy, TypeScript, ESLint, Übersetzungs- und OpenAPI-Abgleich bestanden. EXE/MSI 0.1.11 gebaut. Nativer stdio-Handshake mit leerem Testordner bestand: 16 Werkzeuge, keine Datenbank/Lease erzeugt.

Auf dem Nutzer-PC wurde die Installation ohne Terminal aktualisiert (Installations-/Deinstallationscode 0, installierter Backend-Hash entspricht Build, Autostart fehlt). UniOS wurde geöffnet und der lokale Eintrag `unios` über die offizielle Codex-MCP-Konfiguration registriert, ohne Token im Eintrag. Beim ersten laufenden Dienst traten einzelne interne Fehler auf; nach Aktualisierung/Neustart gelangen zwei aufeinanderfolgende native Protokollprüfungen mit Kurs-, Stundenplan- und Mail-Werkzeugen gegen den echten lokalen Host. Dabei wurden keine Studieninhalte ausgegeben und keine Bereichsfreigaben verändert. Die genaue Ursache der vorherigen sporadischen Fehler ist nicht belegt; bei Wiederholung steht jetzt eine datensparsame Fehlerdiagnose bereit.

Ein erster Modellaufruf im neu gestarteten lokalen Work-Chat ist noch durchzuführen; der bereits laufende Chat hat den neuen MCP-Eintrag noch nicht geladen. Browser-/Handy-Fernzugang war nicht beauftragt. Microsoft-App-Registrierung und echte Mail-Anmeldung bleiben weiterhin separat offen. Die persönliche Stundenplan-Einrichtung wurde in diesem Paket nicht geändert. GitHub-CI ist weiterhin wegen der zuvor gemeldeten Kontoeinschränkung nicht abgenommen.

### 01.10.2026 – Moodle-Aktualisierung während des Start-Abgleichs (0.1.12)

Der Scheduler startet außerhalb der Ruhezeiten einen automatischen Abgleich. Ein gleichzeitig gestarteter manueller Lauf erhält bereits bisher HTTP 409 „Sync läuft bereits“. Die Oberfläche hat diesen erwarteten Zustand als fehlgeschlagene Aktualisierung dargestellt. Ein neuer lesender Status-Endpunkt meldet die echte Prozesssperre und die Kennung/den Status des letzten Laufs, ohne Inhalte oder Fehlerdetails aus Hochschulquellen. Ein nach Prozessabbruch übrig gebliebener Datenbankeintrag gilt nicht als laufender Abgleich.

Heute, Setup und beide Systemansichten verwenden denselben Moodle-Knopf. Die Oberfläche beobachtet den Hintergrundlauf, sperrt doppelte Starts, behandelt auch den gleichzeitigen Scheduler-Start zwischen Statusabfrage und Klick und lädt nach Abschluss die Ansichten neu. Tatsächlich fehlgeschlagene Läufe/Anfragen bleiben als Fehler sichtbar; Hinweise bleiben gesondert dargestellt. Keine Änderung an Sync-Intervall, Ruhezeiten, Hochschulzugängen oder Datenbankschema.

Gezielte Prüfung: zwei Python-Tests für konkurrierenden Hintergrund-/Manuallauf und abgebrochenen Lauf bestanden. Ein Browserablauf prüft Start-Abgleich, den 409-Wettlauf, Abschluss und einen echten 503-Fehler. Ruff, betroffenes mypy, TypeScript, ESLint sowie OpenAPI-Abgleich bestanden. Beim lokalen Dienst meldete der letzte Lauf vor der Installation `warning`; die konkrete frühere Anzeige des Nutzers lässt sich rückwirkend keinem einzelnen HTTP-Aufruf zuordnen. Der Darstellungsfehler beim konkurrierenden Start wurde reproduziert und behoben.

EXE/MSI 0.1.12 gebaut und die Windows-Installation still aktualisiert, nachdem kein laufender Abgleich mehr vorlag. Installation/Deinstallation jeweils Exit 0; installierter Backend-Hash entspricht dem Build, Autostart fehlt weiterhin. Native App wieder geöffnet. Der neue Status-Endpunkt antwortete im echten lokalen Dienst mit HTTP 200 und `running=true` während des automatischen Start-Abgleichs. Hierbei wurden ausschließlich Statusangaben ausgegeben; kein zusätzlicher manueller Hochschulabruf gestartet. Ein abgeschlossener echter Start-Abgleich wurde in dieser Prüfung nicht abgewartet.

### 01.10.2026 – Eigener VPS mit nativen App-Clients (0.1.13)

Auf ausdrücklichen Nutzerauftrag wurde der Serverbetrieb umgesetzt und die vorhandene Windows-Installation übernommen. Direkter HTTPS-Zugang über den vorhandenen Reverse-Proxy ersetzt für diesen Aufbau Tailscale; der vorbereitete Tailscale-Container bleibt gestoppt. Der VPS ist dauerhaft einziger Host. Die native Tauri-App liefert ihre gebündelte React-/TypeScript-Oberfläche weiter lokal aus; ihr Dienst startet im Clientmodus keine Datenbank, Migration, Host-Lease oder Scheduler. Neue Installationen beginnen mit einer Serverkopplung; bestehende lokale Installationen wechseln erst nach geprüfter Datenübernahme.

Der Client tauscht einen kurzlebigen Code über geprüftes HTTPS gegen einen widerrufbaren Geräteschlüssel im OS-Schlüsselbund. Die lokale Brücke prüft Loopback-Host, Peer und Origin, verwirft fremde Cookies/Proxy-Header und Weiterleitungen, erhält Versions-/Fencing-Header sowie Datei-Range-Semantik und gibt kein Token an das Frontend. Ungepaarte API-/Dateianfragen erhalten 401, lokale Health bleibt für Offline-Start verfügbar. Cache-/Notizentwürfe können nicht still an einen anderen Server gebunden werden. Der vorhandene Offline-Autosave und Drei-Wege-Abgleich bleiben aktiv. Lokale CLI-Befehle mit direktem Zugriff auf die zurückgelassene Datenbank sind im Clientmodus gesperrt; REST-basierte Befehle bleiben nutzbar.

Headless-Zugangsdaten liegen im ausdrücklich aktivierten Fernet-Schlüsselbund mit separat provisioniertem Hauptschlüssel, UID-/Dateirechteprüfung, atomarem Schreiben und Lock. Kein Klartext-Fallback. Das Dockerimage verwendet gesperrte Python-/Frontend-Abhängigkeiten und enthält die bereits vorhandenen optionalen Voice-/KI-/MCP-/Portal-Laufzeiten, Chromium sowie deutsche/englische OCR-Sprachpakete. Diese Extras ermöglichen die vorhandenen Funktionen auf dem Headless-Server; keine neue allgemeine Backend-Technologie. Der Dienst läuft unprivilegiert mit schreibgeschütztem Root-Dateisystem, ohne zusätzliche Capabilities oder Docker-Socket, mit persistentem Datenvolume und Loopback-Port. Proxyänderung wurde vor Reload validiert und gesichert; bestehende Website bleibt erreichbar. Der API-Pfad ist eine native Clientverbindung; Browser-PWA unter diesem Präfix ist nicht abgenommen.

Übernahme: vor Export geprüfter Snapshot und SQLite-Backup, anschließend authentifizierte AES-GCM-Übertragung in geordneten Blöcken mit Abschluss-/Hash-/Integritätsprüfung. Kein OS-Keychain-Dump, keine `.env`, alten Gerätesessions oder Logs. Der reale Bestand umfasst 835 geprüfte Dateien plus eine separat verschlüsselt ergänzte Studiengangsauswahl. Originale auf Windows bleiben erhalten. Zwei Plattformfehler wurden vor Veröffentlichung abgefangen: Windows-Textmodus beim Zufallsschlüssel und Archiv-Hardlinks; zusätzlich wurde das Staging ins Zielvolume verlegt, um atomare Renames zu erlauben. Ein tatsächlicher PDF-Abruf deckte alte Windows-Pfadtrenner auf. Nach erneut geprüftem Snapshot wurden 162 Datenbankverweise portabel umgestellt. Import und zukünftiger Sync behandeln Pfade nun entsprechend; Originaldateien wurden nicht geändert.

Geprüft: gezielte Python-Prüfungen für verschlüsselten Schlüsselbund, nicht autorisierten Zugriff, einmalige Codes, Server-Host-Sperren, Cacheidentität, Proxy-Streaming/Weiterleitungsabwehr und nicht destruktive Übernahme; zuletzt sieben Übernahme-/Manipulations-/Pfadfälle mit erfundenen Daten bestanden. Zwei Browserabläufe für Kopplung/Erneuerung und bestehenden Offline-Notizfluss bestanden. Ruff, betroffenes mypy, TypeScript, ESLint, Übersetzungs- und OpenAPI-Abgleich bestanden. Docker-Smoke mit erfundenem Bestand lieferte Health 200 und ungepaart 401. Im produktiven Container Sprachmodell geladen, Chromium mit erfundener Seite gestartet und OCR-Sprachpakete verfügbar. Eine synthetische WAV-Aufnahme wurde über den installierten Client verarbeitet (200, kein echtes Nutzeraudio). Materialabruf durch den installierten Client liefert PDF-Signatur und Teilantwort 206 mit 1024 Bytes. Da keine gespeicherten Sprachmemos vorlagen, wurde kein reales Audio-Memo als abgespielt behauptet.

Windows-EXE/MSI 0.1.13 gebaut und die physische Installation lautlos aktualisiert: Installation/Deinstallation jeweils Exit 0, Backend-Hash entspricht Build, kein Autostart. App geöffnet; installierter Client meldet Server-Topologie und produktives Schema `fd58a9102c3d`. Die vorhandene native Work-/MCP-Brücke besteht weiterhin über stdio: 16 Werkzeuge, freigegebener Kursabruf gegen den VPS erfolgreich; Stundenplan-/Mail-Werkzeuge beachten unveränderte Freigaben. Der Server-MCP-Schlüssel wird dabei nicht auf das Gerät kopiert; seine freigegebenen Daten bleiben durch Bereichs-/Kursprüfung und Gerätewiderruf geschützt.

Realer Moodle-Abgleich vom VPS abgeschlossen: sechs Kursdatensätze, 96 Ressourcen gelesen. Im ersten Lauf wurden vier erzeugte Moodle-Textseiten wegen der von Moodle absichtlich mit null angegebenen Dateigröße übersprungen. Für `page` → `index.html` unter `/mod_page/content/` wird diese Größenangabe jetzt als unbekannt behandelt; echte gespeicherte Dateien behalten ihre Größenprüfung. Sechs gezielte Fälle für diese Unterscheidung, Moodle-Fehlerantworten und erlaubte/verbotene Weiterleitungen sowie Ruff und betroffenes mypy bestanden. Die Korrektur wurde auf dem VPS installiert. Der nächste reale Abgleich (Lauf 16) endete mit `success`: alle vier Textseiten als Dateien gespeichert, null Sync-Warnungen. Diese Prüfung bestätigt den Moodle-Abgleich, nicht die nachfolgenden anderen Hochschulquellen.

Portal-Sitzungen und Studiengangsauswahl sind übernommen. Ein vollständiger frischer myCampus-/PRIMUSS-Abruf und die strukturierte PRIMUSS-Noten-/Prüfungsübernahme bleiben gesondert zu prüfen; die zugehörigen Profilselektoren sind weiterhin nicht vollständig konfiguriert. Im übernommenen Bestand existiert kein aktives Stundenplan-Abo und kein automatischer Outlook-Abruf. Hochschul-MFA kann weiterhin eine persönliche Neuanmeldung verlangen. Ein automatisches Backup außerhalb des VPS, reale Mac-/Linux-Clientabnahme und der echte Zwei-Geräte-Schlaf-/Offline-Test bleiben offen. Betriebsanleitung: [SERVER.md](SERVER.md).

### 01.10.2026 – Native Startprüfung nach Serverumzug korrigiert

Der Nutzer meldete ein dauerhaftes Startbild. Der lokale Client war gesund (Health 200), aber die native Rust-Prüfung sendete `Host: 127.0.0.1` ohne Port. Die absichtlich strikte Client-Allowlist akzeptiert `127.0.0.1:8000`; der alte Probeaufruf lieferte reproduzierbar 400, während derselbe Aufruf mit Port 200 lieferte. Die Sicherheitsprüfung bleibt unverändert. Die native Probe verwendet jetzt die vollständige Zieladresse mit Port, prüft Schreib-/Lesefehler und begrenzt die Antwortgröße. Der Schlüsselbund-Hinweis erscheint ausschließlich auf macOS; Windows/Linux erhalten den passenden lokalen Starthinweis.

Vier gezielte Rust-Fälle für vollständigen Host/Port, erfolgreichen/abgewiesenen Health-Status, verzögerte Freigabe und beendeten Dienst bestanden. Dieselbe kompilierte Probe erkannte anschließend den tatsächlich installierten Serverclient als bereit. Nur die native Hülle benötigt einen Neubau; Server und gebündelter Python-Dienst wurden für diese Startkorrektur nicht verändert.

Windows-EXE/MSI mit der korrigierten Hülle gebaut. Die Windows-Installation wurde lautlos erneuert (Deinstallation/Installation jeweils Exit 0, unveränderter Backend-Hash passt, Autostart weiterhin aus). Das installierte native Programm entspricht dem Neubau bis auf die drei erwarteten Bytes des NSIS-/MSI-Bundlemarkers. App neu gestartet; Health und authentifizierte Server-API melden 200, dieselbe kompilierte native Startprüfung meldet bereit. Serverkopplung bleibt erhalten. Die Meldung im ursprünglichen Startbild war damit ein Fehler der nativen Startprüfung, kein Beleg für einen blockierten Schlüsselbund oder einen ausgefallenen VPS. Eine visuelle Abnahme des nativen Fensters ist über die derzeit verfügbaren Werkzeuge nicht erfolgt.

### 01.10.2026 – Materialtitel in der Suche

Die Suche berücksichtigte ausschließlich extrahierten Dokumenttext. Ein vorhandener Moodle-Anzeigename wurde deshalb nicht gefunden, wenn er nicht im PDF stand; zusätzlich unterschieden sich deutsche Umlaute und ihre ASCII-Schreibweisen. Die Dokumentensuche berücksichtigt jetzt auch Ressourcenanzeigenamen und setzt ä/ae, ö/oe, ü/ue sowie ß/ss für diese Titelsuche gleich. Neueste Dateiversionen werden bevorzugt, Kurs-/Semesterfilter bleiben wirksam. Vorhandene Seitentreffer desselben Versionsstands werden ohne künstlichen zweiten Treffer zur ersten Seite nach vorne gestellt. Titeltreffer funktionieren auch ohne extrahierten Text. Kein Datenbankumbau und keine Änderung am Offline-Suchindex oder der nativen Hülle.

Gezielt geprüft: zwei Python-Fälle für bisherige Volltextsuche und neue Titel-/Umlautsuche mit Scans, Filtern, Versionsauswahl und Seitentreffern bestanden; Ruff und betroffenes mypy bestanden. Ein Browserablauf mit erfundenem Moodle-Material sucht einen Titel, der nicht im Dokumenttext vorkommt, und öffnet den PDF-Reader erfolgreich. Die Korrektur wurde als Serverpaket 0.1.13-r6 installiert. Der konkrete vom Nutzer gemeldete Begriff mit Umlaut und abschließendem Leerzeichen liefert über den installierten Client genau den erwarteten Materialtreffer; dessen PDF ist mit gültiger PDF-Signatur und Teilantwort 206 abrufbar. Keine neue App-Installation erforderlich. Ein bereits angezeigter leerer Suchstand muss neu geladen werden.

### 01.10.2026 – Mailweiterleitung auf den VPS, UniOS 0.1.14

Neue Alternative zur nicht verfügbaren Microsoft-App-Registrierung: eigener, ausschließlich empfangender Postfix-Maildir auf dem VPS. Die native Uni-Mail-Seite zeigt das konfigurierte Weiterleitungsziel, Importzustand, manuellen Abruf und Pause/Fortsetzen; die direkte Microsoft-Anbindung bleibt eine eingeklappte Alternative. Authentifizierte Mail-API, alle fünf Minuten ein begrenzter automatischer Import durch den aktiven Server, unveränderte bestätigungspflichtige Fristvorschläge. Originale samt Anhängen bleiben privat auf dem VPS; die Datenbank speichert nur bestehende Mailmetadaten. Nach Datenbank-Commit werden Originale verschoben, nicht gelöscht. Crash-Wiederholung ist durch den Hash dedupliziert. Kein neuer Schema-Schritt und keine neue App-Abhängigkeit.

Cloudflare: dedizierter DNS-only-A-Eintrag und MX für den UniOS-Mailhost angelegt und durch DNS sowie sichtbare Cloudflare-Tabelle verifiziert. Bestehender IONOS-Mailbetrieb der Hauptdomain erhalten. Öffentlich vertrauenswürdiges TLS-Zertifikat für den neuen Empfänger ausgestellt; Port 80 nur während der Zertifikatsprüfung geöffnet und wieder geschlossen. Der tägliche eigene Zertifikatscheck verwendet dieselbe zeitlich begrenzte Freigabe nur bei nötiger Erneuerung. SMTP akzeptiert genau das eigene Postfach, verlangt TLS und erlaubt kein Relay oder Mailversand. Lokale SMTP-Prüfung auf dem VPS: TLS 1.3, Klartext-MAIL 530, Fremdempfänger 554, unbekannter lokaler Empfänger 550, eigener Empfänger 250. Maildir-Ordner UID/GID 10001 und Modus 700 bestätigt; Mail-API ohne Gerätesession 401.

Gezielte fünf Python-Tests für Weiterleitung und bestehende Fristübernahme bestanden. Ein Browserablauf mit erfundener MIME-Mail im echten Fake-Server-Maildir prüft Import, Deduplizierung, keinen automatisch bestätigten Termin sowie Pause/Fortsetzen; bestanden. Betroffenes Ruff/mypy, Frontend-Typecheck/ESLint, i18n, OpenAPI und generierte API-Typen bestanden. Frontend und Windows-EXE/MSI gebaut. Produktiver Server 0.1.14-r2 gesund; native Installation 0.1.14 lautlos aktualisiert (Upgrade Exit 0, Backend-Hash passt) und als eigenes Fenster gestartet. Der separate vorherige Deinstallationsversuch lieferte Exit 2; der anschließende Upgrade-Ablauf war erfolgreich. Installierter Client erreicht die neue Mail-API und meldet weiterhin das bisherige Schema fd58a9102c3d. Keine GitHub-Veröffentlichung in diesem Paket.

**Offen:** Öffentlicher TCP-25-Zugang wurde von zwei externen Prüfstandorten und diesem PC nicht erreicht. Der lokale Listener und UFW-Freigabe sind vorhanden; die zusätzliche Provider-Firewall muss geprüft werden. Der Nutzer wurde um die IONOS-Anmeldung gebeten; Zugriff auf das Cloud Panel liegt noch nicht vor. Deshalb bleibt der Mailstatus absichtlich ready=false/connected=false; keine echte Outlook-Zustellung oder fertiger Empfang behauptet. Erst externe STARTTLS-Abnahme, dann Freigabe im Serverstatus und persönliche Outlook-Weiterleitung mit beibehaltener Kopie aktivieren. Betrieb und Abnahme: MAIL_FORWARDING.md sowie MANUELL_TESTEN.md. Ältere Nachrichten werden durch eine Weiterleitung nicht automatisch übernommen.

### 02.10.2026 – Zusammenführung, Desktop-Altstart und Entity Actions (0.1.15)

MacBook-Commit `a0c6e4d` (Scrollposition beim Laden von PDF-Seiten erhalten) mit den sechs bisher lokalen Server-/Mail-/Work-Korrekturen zusammengeführt. Ein Konflikt im Fake-Server wurde durch Erhalt beider unabhängigen Test-Endpunkte gelöst. Der Scroll-Fix mit festen Seitengrößen und ausgeladenen entfernten Canvases bleibt erhalten; PDF-Canvases sind zusätzlich auf DPR 2 begrenzt.

Der tatsächliche alte Windows-Autostart war die Scheduled Task `Marc Uni OS`, die `deploy/windows/start-uni-os.ps1` und die Quellumgebung startete. Vor Änderung exportiert, danach deaktiviert und gestoppt; die zugehörige alte Python-Prozesskette beendet. Vor Start der nativen App war Port 8000 frei. Der Fehler `courses.is_active` gehörte zu diesem alten lokalen Server. Originaldaten wurden nicht geändert. Die Quellinstaller registrieren künftig nur noch mit ausdrücklichem `-EnableLegacyAutostart` eine Aufgabe; auch der ausdrücklich gewählte Altbetrieb startet das Python-Fenster verborgen.

Gemeinsame Registry mit `EntityActionDefinition`: Eingabeschema, Objekttyp, Fähigkeit, Bestätigung, Handler und MCP-Freigabe. Erste echte Aktionen: `course.set_activity`, `assignment.submission_status`, `resource.reextract`, `resource.index_status`, `resource.cancel_indexing`. REST/Schema, Universal-CLI, MCP und Reader-/Kursoberfläche verwenden denselben Dispatcher. Vorschau führt keinen Handler aus; fremde Eingabefelder und falsche Typen/Objekte werden abgewiesen. MCP ist zunächst ausschließlich für gespeicherten Abgabestatus und Indexfortschritt freigegeben, mit bestehenden Kategorie-/Kursrechten und Ausschluss fremder Kursgruppen. Es werden keine Abgaben vorgenommen und keine KI-Generierungen vorgetäuscht. Weitere vorgeschlagene Notiz-/Topic-/Prüfungsaktionen sind noch nicht registriert. Vertrag und generierte Referenz: `docs/ENTITY_ACTIONS.md`.

Dateien über 8 MiB sowie PDFs ab 80 Seiten verlassen den synchronen Indexpfad. Ein separater einzelner Hintergrundarbeiter erkennt committed, nicht indexierte neueste Versionen auch nach Neustart. Er öffnet PDFs direkt als versionierte Dateien, meldet Seitenfortschritt, begrenzt die Warteschlange auf 64, prüft Abbruch zwischen Seiten/vor Commit und die Host-Generation vor Veröffentlichung. Der bisherige Index bleibt bis zum atomaren Commit erhalten; Originaldateien und vorhandener OCR-Text bleiben bestehen. Office-/Textparser werden im Hintergrund verarbeitet, sind während ihres einzelnen Parseraufrufs aber nicht sofort abbrechbar. Status ist pro Prozess; Originale und Suchindex dauerhaft. Format-/Größengrenzen und Neustartverhalten sind dokumentiert.

Gezielt geprüft: 18 unterschiedliche Python-Fälle im betroffenen Action-/Schema-/MCP-/Extraktionsbereich, darunter 500 PDF-Seiten, unverändertes Original, Abbruch vor Commit, veraltete Host-Generation und KI-Rechte. Zehn Browserabläufe: Reader bis zur letzten Seite auf Desktop/Mobil, begrenzte Canvases auch bei 500 Seiten, PDF-Suche, bestätigte Registry-Aktion und bestehende Kursabläufe. Vier Rust-Startprüfungen; 187 gezielte Übersetzungs-/PDF-Suchprüfungen. TypeScript, ESLint, Übersetzungen, OpenAPI und SPDX geprüft; mypy für 403 Quelldateien bestanden. Im zuvor roten GitHub-Lauf echte Ursachen gefunden und lokal behoben: fehlende optionale `av`-/`numpy`-Module beim Basistypecheck und legitime gleiche Wörter `Vegan`/`Desktop` in der Übersetzungsheuristik. macOS-Signierhelfer greift plattformsicher auf `getuid` zu.

Windows-EXE/MSI 0.1.15 gebaut und physische Installation still aktualisiert (Exit 0, installierter Backend-Hash passt, Version 0.1.15). Native App direkt ohne Terminal geöffnet. Installierter Client meldet `mode=client`; authentifizierter VPS-Abruf bestätigt neun Entity-Typen, fünf Aktionen und Server-Topologie. Alte Scheduled Task weiterhin deaktiviert. Zwei `uniosd`-Prozesse gehören zum gefrorenen Begleitdienst (Loader/Kindprozess), nicht zu zwei lokalen Hochschul-Schedulern.

VPS 0.1.15-r2 gesund, ungepaarte API liefert 401. Vor Wechsel private SQLite-Backups mit Integritätsprüfung erstellt; kein neuer Schema-Schritt. Der erste neue Container scheiterte an durch restriktiven Archiv-umask entstandenen Quell-Dateirechten und wurde automatisch auf 0.1.14 zurückgesetzt. Dockerfile stellt nun ausschließlich Anwendungsquellen lesbar bereit; Nutzerdaten/Secrets bleiben privat. Korrigiertes Image vor dem produktiven Wechsel als unprivilegierter Benutzer mit schreibgeschütztem Dateisystem geprüft, danach erfolgreich gestartet. Andere VPS-Dienste unverändert.

Desktop-Matrix: `docs/DESKTOP_POLISH.md`. Reale macOS-/Linux-Abnahme, Schlaf/Resume, Multi-Monitor/DPI, Keychain und signierte Updates bleiben dort ausdrücklich offen. Die Matrix und Browserchecks ersetzen keine echten Gerätetests. Mailannahme über externen Port 25 und die übrigen bisherigen Hochschul-/Zwei-Geräte-Abnahmen bleiben unverändert offen.

Paketmeldungen vom Nutzer anschließend bearbeitet: oxlint 1.86.0, typescript-eslint 8.71.0, anthropic 1.11.0 und filelock 4.0.9. TypeScript 7.0.2 prüft und baut die App als separater nativer Compiler; die 5.9-API bleibt für ESLint/OpenAPI erhalten. Drei strengere Null-Prüfungen in Drop/Suche korrigiert. Node-Typen auf aktuellem Build-Major 22.20.5; PWA-Generator 2 bleibt wegen explizit inkompatiblem Plugin-Peerbereich zurückgestellt. Gründe und automatische Update-Ausnahmen: DEPENDENCY_UPDATES.md. Alle 327 Frontend-Tests sowie 20 Adapter-/Snapshot-Tests und 17 Action-/MCP-/Extraktionsfälle bestanden; npm-ci-Lockprüfung, Ruff, mypy und API-Typen bestanden.

RUSTSEC-2024-0429 tatsächlich im verwendeten Linux-Unterbau behoben: verifizierte GLib-0.18.5-Quellen mit exakt zwei Zeilen aus dem offiziellen Fix, als Cargo-Patch eingebunden. Alle übrigen Crate-Dateien bytegleich zum SHA-256-geprüften Original. Die drei optimierten offiziellen Iterator-Tests bestehen in einem isolierten Rust-1.90-Linux-Container. MIT-Lizenz und Herkunft erhalten; Lizenzdateien liegen auch im Desktop-Bundle. Eigener Linux-CI-Job prüft diese Fälle künftig. Ein reiner Versionsscanner kann den kompatiblen 0.18-Backport weiterhin melden; kein Hochsetzen auf eine vorgetäuschte 0.20-Version und kein Wegdrücken der Meldung.

GitHub-Upload `4f91258` einschließlich Mac-PDF-Commit auf main bestätigt. VPS 0.1.15-r3 nach erneutem privatem geprüftem Snapshot gesund; filelock 4.0.9 im produktiven Container verifiziert. Aktualisierte Windows-EXE/MSI still installiert und geöffnet, Client-Health und deaktivierte alte Scheduled Task erneut bestätigt. GitHub-Lauf 37013990860: Frontend und Linux-GLib-Backport bestanden. Backend-Tests sammelten nicht, weil das optionale anthropic-Paket in der CI fehlte; Backend-Testinstallation daher um `--extra ai` ergänzt. Die Adapter-/Snapshottests bestanden lokal mit genau dieser Abhängigkeit. Produktive KI bleibt optional.
### 04.10.2026 – Korrektur der vollständigen CI-Matrix

Der manuelle Lauf am Commit d7d2abb fand macOS-Parserfehler und Browser-Rennen.
Darwin unterstützt die verwendete Adressraumgrenze nicht zuverlässig: dort wird
nun der residente Speicher der eigenen Prozessgruppe alle 200 ms geprüft und bei
Überschreitung beendet. Dies ist eine überwachte Grenze mit möglicher kurzer
Überschreitung, keine Kernel-Sandbox. Linux behält RLIMIT_AS; Zeit-, CPU- und
Ausgabegrenzen bleiben bestehen. Mobile Quellenvorschauen schließen nicht mehr
beim Fokuswechsel auf ihren Link; Browser-Fixtures warten auf ausstehende Routen.
Lokal: 36 Parser-/Importtests und 34 betroffene Browserabläufe bestanden.
Die plattformübergreifende Matrix muss erneut laufen.


### 04.10.2026 – Navigation, Einstellungen und Komponenten aufgeräumt

Der bestätigte Aufräumauftrag ist als bestehender UI-Ausbau umgesetzt. Ein
Bereichskatalog beschreibt 37 Bereiche, Detailrouten, Modulbindung, Elternbereiche,
Beschriftungen und Icons. Routing, Seitenleiste, Mehr, Vorladen und Befehlspalette
verwenden diese Definitionen. Mail und Erweiterungen sind auch bei direkter URL
an ihr Modul gebunden. Angeheftete Notizen/Suche haben genau einen aktiven Besitzer.
Standard sind Heute, Kurse, Lernen, Notizen, Termine; mobil bleibt Mehr nur oben.
Bestehende Anordnungen bleiben erhalten, entfernte Hauptbereiche sind in Mehr
weiterhin erreichbar. Lernunterseiten bleiben im gemeinsamen Lernbereich.

Ein globales Neu-Menü erschließt Notiz, Schnellnotiz, Datei und Sprachnotiz.
Kurs/PDF-Pfade sind verlinkt; Kurs- und Lernregisterkarten scrollen horizontal,
zeigen Pfeile und halten das aktive Ziel auch bei Größenänderung sichtbar.
Einstellungen haben die fünf Abschnitte Allgemein, Darstellung, Erinnerungen,
Daten & Sync und Feedback. Sprache, Design und Bereiche stehen am Anfang;
Verbindung/Sicherung/Export liegen hinter Details. Deutsche Fachbegriffe sind
vereinfacht. Ein fehlender Moodle-Zugang gilt auf Heute nicht mehr als leerer
Bestand; die nächsten Schritte erscheinen mobil vor Stundenplan und Speiseplan.

Problem melden öffnet den Feedbackabschnitt. Der GitHub-Link ist ausdrücklich
ein vom Nutzer zu prüfender und abzusendender Entwurf; automatische Diagnosedaten
werden nicht in die URL übernommen. Ein Bericht kann separat mit optionaler
Diagnose heruntergeladen werden und meldet eindeutig, dass nichts versendet wurde.

Shell ist auf Sidebar, Topbar und useSidebarState verteilt; useTheme verwaltet
das Design gemeinsam. Alte marc-UI-Schlüssel werden nach unios kopiert, vorhandene
neue Werte haben Vorrang, Originale bleiben für ältere Clients erhalten. NotesPage
ist von 704 auf 200, InboxPage auf 281 und Shell auf 168 Zeilen reduziert;
NoteDocument/NewNote, IntakeRow, ReaderParts, ResourceChooser und studioCommands
trennen zugehörige Abläufe. Die langen Reader-/Editor-Koordinatoren bleiben
bewusst erhalten; sie sind durch gezielte Teilkomponenten entlastet.

Die sieben globalen CSS-Importe sind durch Designvariablen, eine explizite
Schichtenfolge und Komponenten-CSS für Navigation/Palette/Einstellungen ersetzt.
Verbleibende gemeinsame Layoutregeln sind gebündelt; die alten Quelldateien bleiben
zur Nachverfolgung erhalten und werden nicht zusätzlich importiert. Eine echte
Sichtprüfung fand eine von der Vite-Ladereihenfolge ausgelöste Kaskadenumkehr;
dieselbe Layer-Reihenfolge wird daher auch in vorab geladenen Komponenten erklärt.
Reader-Steuerungen haften unter der Kopfleiste. Direkte PDF-Seitensprünge setzen
die Position sofort, damit die Rückkehr nach einem schnellen Wechsel exakt bleibt.
Der Editor hält beim Verlassen auch die Auswahlposition fest.

Die Dokumentationsübersicht trennt Nutzerhilfe, Entwicklung und Betrieb bei
bestehenden Pfaden. Aktive Tests nutzen bereits tmp_path/Temporärverzeichnisse;
der Python-Gesamtlauf nutzte explizit System-Temp. Alte OneDrive-ZIPs und genannte
Campus-/Mensa-Testordner wurden weder gelesen noch gelöscht oder eingecheckt.
Die neue Galerie enthält 44 echte Browseraufnahmen mit ausschließlich erfundenen
Daten; alle elf Ansichten wurden hell/dunkel auf Desktop/Handy visuell geprüft,
die lange Einstellungsseite zusätzlich abschnittsweise.

Lokale Prüfungen: 849 Python-Tests bestanden, 12 plattform-/optional bedingte
Tests übersprungen. 427 Frontend-Tests, Ruff, mypy für 529 Dateien, TypeScript,
ESLint, OpenAPI-Abgleich, deutsche/englische Übersetzungen und Lizenzkennungen
bestanden. 99 gezielte Browserabläufe sowie 48 abschließende Abläufe bestanden.
Der abschließende isolierte Gesamtlauf bestand mit 265 Browsertests. Die
20 automatisierten Aufgaben sind als missions.json dokumentiert (p50 339 ms,
p95 685 ms einschließlich Navigation und Assertions am lokalen Fake-Server;
keine menschliche Bedienzeit und kein Geschwindigkeitsvergleich).
Lighthouse Accessibility 100; Lighthouse 11 PWA 100. Die GitHub-Plattform-/
Docker-Matrix wird nach dem gesammelten Upload erneut gestartet.
Ein früherer Gesamtlauf hatte zwei nicht reproduzierte leere Windows-Browseransichten;
Fehleraufzeichnung samt Screenshot ist für künftige Fehlschläge ergänzt. Die Ursache
ist damit nicht als behoben behauptet. Docker Desktop ist lokal nicht verfügbar.

Keine Migration am echten Bestand, kein VPS-Deployment und kein neuer Installer:
die veröffentlichten Alpha-Pakete bleiben 0.1.19. Grenzen und Herkunft der Galerie
stehen in docs/qa/navigation-cleanup-20261004/README.md.

### 05.10.2026 – Konkurrenzvorschlag geprüft, Schnellnavigation ergänzt

Alle 13 eingereichten Vorschläge sind in ENTRY_BARRIERS.md gegen den aktuellen
Code abgeglichen. Navigation und Gateway sind vorhanden; Projekte haben Todos,
eine allgemeine eigene Aufgaben-Domäne fehlt. Moodle-Import liefert keinen
Stundenplan ohne separate Kalenderverbindung. Die neue Standard-Betriebsart ist
noch nicht entschieden: Rückfrage zu lokalem Einstieg für neue Nutzer bei Erhalt
von Marcs bestehenden VPS-Bindungen offen. Keine Änderung am Serverbetrieb,
keine öffentliche Repository-Freigabe und kein aktivierter Updatefeed.

Strg+K zeigt zuletzt geöffnete Kurse, PDFs, Notizen und Projekte mit tatsächlichem
Titel. PDF-Einträge übernehmen die letzte gelesene Seite und sind dedupliziert;
Verlauf auf zwölf Objekte im RAM des Fensters begrenzt. Keine Suchtexte oder
beliebigen URL-Parameter gespeichert. Leeren und Bestandswechsel entfernen den
Verlauf; ausgeschaltete Module verbergen ihre Einträge. Die Palette hält ihren
offenen Zustand bei einem schnellen Seitenwechsel im gemeinsamen RAM-Kontext.
Strg+Links/Rechts nutzt die bestehende History; Editor, Formular und Dialog behalten
ihre Texteingabebefehle. Vier neue Aufnahmen hell/dunkel auf 1440/390 px gesehen.
Die deutschen und englischen READMEs zeigen eine konkrete Frage an freigegebenen
Kursstoff; keine unbelegte Beispielantwort oder erfundene Seitenquelle.

Alembic verwendet jetzt path_separator=os. Der Historienprüfer liest erst
Objektmetadaten; private oder übergroße Dateien werden gemeldet, nicht gelesen.
Synthetischer Regressionstest belegt die tatsächlichen Git-Inhaltsabfragen.
Technischer Mustercheck: 9.324 erreichbare Git-Objekte, 5.496 Dateiobjekte,
keine Fundstelle. Kein Beleg für sämtliche personenbezogenen Bildinhalte oder
unbekannte Secretformate; öffentliche Freigabe bleibt nach PUBLISHING offen.

Vorheriger Matrixlauf 37236972924 am ebf03fc: Linux-Backend, macOS-Backend,
Docker-Smoke, GLib und Windows-Backend samt Dienst-Smoke bestanden.
Browser: 263 bestanden, zwei Fehler. Einer war ein mehrdeutiger Überschrift-
Selektor (h1 und h2 Termine), jetzt auf h1 begrenzt. Die Touch-Vorschau cancelt
ausstehende Hover-Timer beim Öffnen/Schließen; erneute Berührung öffnet/schließt
die Vorschau und navigiert nicht nebenbei. Öffnen der Notiz erfolgt am expliziten
Link in der Vorschau. Der Test prüft fünf schnelle Öffnen-/Schließen-Zyklen sowie
die abschließende Navigation. Dies erklärt nicht automatisch die zuvor beobachteten
anderen leeren Browseransichten.

Lokale Paketprüfung: 430 Frontend-Tests, Typecheck, ESLint, DE/EN-Abgleich und Build
bestanden; 16 betroffene Browserabläufe bestanden, darunter beide CI-Fälle.
Acht Desktop-Vorbereitungstests und der neue Historien-Regressionsfall bestanden;
Ruff für den Prüfer/Test und mypy für den neuen Test bestanden. Die Korrektur muss
in GitHub erneut bestätigt werden. Der allgemeine Aufgabenbereich, die
Prüfungszentrale, Vorlesungsnotizen und ein gemeinsames Verknüpfungspanel sind durch
dieses Paket ausdrücklich nicht als fertig behauptet. Alpha-Installer bleiben 0.1.19.

Der erste anschließende Gesamtlauf: 265 Browserfälle bestanden, drei Fokus-Timer-
Fälle nach lokaler Mitternacht fehlgeschlagen. Echte Ursache: UTC-Starts aus SQLite
ohne Offset wurden im Timer als lokale Zeit gelesen und so dem Vortag zugeordnet,
während die Datumsanzeige bereits UTC normalisierte. dateFromApi vereinheitlicht
die bisherige Formatierungsnormalisierung und den Tagesfilter des Timers. Neuer
Unit-Test vergleicht naive UTC, Z und +02:00. Fester Browserfall um 00:30 Uhr Berlin
prüft drei entsprechend kodierte Blöcke und startet einen Timer. Alle vier Fokus-
Browserfälle bestanden anschließend; der Abschluss des Gesamtlaufs folgt unten.
Vollständige aktive Python-Suite: 850 bestanden, zwölf übersprungen (13:36 min),
keine Fehler. Ruff bestanden; mypy ohne Fehler in 520 Dateien. OpenAPI-Prüfung
sauber abgeschlossen; 1.409 eigene Textdateien auf SPDX geprüft. Bundlebudgets
und DE/EN-Abgleich auch nach der Datumskorrektur bestanden.

Zweiter Gesamtlauf: 268 bestanden, einmal fehlte die Hover-Vorschau eines
Wikilinks. Zehn unmittelbar anschließende Wiederholungen bestanden. Im Reader
wurde danach das redundante setContent nach initialer Editoranlage entfernt:
useEditor erhält den Inhalt bereits; ein zweites Ersetzen zerstört Link-Views
unter dem Zeiger. Tatsächlich geänderter Body wird weiterhin übernommen. Dies
belegt noch nicht allein die Ursache des sporadischen Aussetzers. Frontend erneut
430 Tests, Typecheck, ESLint und Build bestanden. Abschließender vollständiger
Browserlauf: 269 von 269 bestanden (10:12 min), einschließlich Desktop-/Touch-
Vorschau, Mitternachtsfall und Wiederherstellung von PDF, Suche und Notizeditor.

Lighthouse 13.5.0: Accessibility 100 am finalen Build. Der JSON-Bericht ist ohne
runtimeError gültig geprüft. Der Launcher scheiterte erst beim Entfernen des
noch gesperrten temporären Chrome-Profils unter Windows; kein App-Auditfehler,
keine manuelle rekursive Löschung. PWA-Manifest und Worker unverändert; letzter
Lighthouse-11-PWA-Nachweis 100 aus dem vorherigen Navigationspass. Docker-Smoke
lokal weiterhin nicht verfügbar; erneute GitHub-Matrix wird nach Upload gestartet.

## 05.10.2026 – Windows-Start und persönliche Stundenplangruppen

Windows installiert den Begleitdienst als PyInstaller-Onedir mit `_internal`
neben der EXE. Die Laufzeit wird nicht bei jedem Start neu entpackt. macOS und
Linux behalten vorerst das bisherige Format. `--startup-check` prüft Health und
gebündelte Oberfläche mit einem temporären leeren Client, ohne persönliches
Home, Vault oder Datenbank. Ein eigener Benchmark trennt Loader und Client.

Drei Loader-Messungen: bisher 5,43/4,67/7,46 s (Median 5,43 s), neue Laufzeit
0,451/0,169/0,167 s (Median 0,169 s). Der isolierte neue Client lag insgesamt bei
0,867/0,605/0,612 s. Keine Messung einer vollständig dargestellten GUI. Ein
Neustart der bisherigen installierten App erreichte Client-Health nach 6,846 s,
ein Fensterhandle nach 1,186 s. Neues Paket installiert, Begleitdienst, Python-DLL
und gebündeltes index.html gegen den Build gehasht. Installierter Client: Health
nach 2,494 s, Fensterhandle nach 1,340 s. Ein Vorher-/Nachher-Neustart, etwa 64 %
weniger Zeit bis Client-Health; keine allgemeine Garantie oder UI-Ready-Messung.
Die endgültige gefrorene Probe lag dreimal bei 0,737/0,620/0,617 s.

Termine → Kalenderverbindung verwalten erlaubt das Ausblenden von Zeitslots.
Identität: Fachname, lokaler Wochentag und Anfangszeit; unabhängig von Raum,
Termin-ID und Sommerzeit. Gilt für Heute, Termine, Studientag und persönlichen
iCal-Feed. Originaltermine und portable Exporte bleiben erhalten. Neue oder
verschobene Slots erscheinen zur Prüfung; keine verbindliche Einschreibung
oder Gruppenzuordnung durch die Hochschule. Institutionen sind getrennt.
Das Format ist für verschlüsselte Übernahmen zugelassen und synthetisch geprüft.

Paketprüfungen: 430 Frontend-Tests, Typecheck, ESLint, DE/EN-Abgleich bestanden;
mypy 523 aktive Dateien und SPDX bestanden. Vollständige Python-Suite: 854
bestanden, zwölf übersprungen (13:21 min). 23 gezielte Backendfälle plus zehn
Prozess-/Übernahmetests bestanden. Synthetischer Browserfall prüft Ausblenden,
Neuladen und Heute; vier Screenshots in Dark/Light, Desktop/390 px geprüft.
Der große Browserlauf kollidierte mit einem Desktop-Build, der denselben
Frontend-Ausgabeordner ersetzt; dessen PWA-/Asset-Fehler sind daher kein finaler
Web-Nachweis. Kalender-Test auf Termintext statt gleichnamiges Gruppen-Summary
begrenzt. Windows-Prozesstest veröffentlichte eine noch leere PID-Datei; die
Fixture veröffentlicht jetzt atomar. Abschlussläufe folgen ohne konkurrierenden
Build. Reader-Hover danach zehn Wiederholungen bestanden; im finalen Gesamtlauf
ebenfalls bestanden. Keine unbewiesene Produktkorrektur am Reader hinzugefügt.

Server-Fresh-State-Smoke bestanden. Dem vorherigen VPS-Image fehlten die vorhandenen
Migrationen ff95b0879404/ff96c1980515. Das echte Update benötigte daher die
Nutzerbestätigung der geprüften Sicherung vom 05.10., 13:15 Uhr. Bestätigung ist
eingegangen. VPS-Image `unios-server:0.1.19-slot-start-20261005` anschließend
bereitgestellt; Health bestanden. Vorgängerimage bleibt als Rückfall erhalten.
Die bestehenden zwei Migrationen sind Bestandteil dieses freigegebenen Updates.
Über die gekoppelte App die bestätigte Montagsgruppe 10:00 behalten und die drei
späteren Alternativen ausgeblendet. Erneute API-Abfrage und beide Wochen geprüft;
alle übrigen Zeitslots unverändert. Keine Hochschulanmeldung oder Einschreibung
vom Agenten bedient.

Lighthouse 13.5.0 am endgültigen Web-Build: Accessibility 100, gültiger JSON-
Bericht ohne runtimeError. Der Launcher scheiterte erst am gesperrten temporären
Chrome-Profil beim Aufräumen unter Windows; kein gemeldeter App-Auditfehler.
Alter Windows-Task „Marc Uni OS“ bleibt Disabled; installierte App läuft als
Client mit genau einem direkt zugehörigen Begleitdienst.

Abschluss: 270/270 Browserabläufe bestanden (11:06 min), einschließlich PWA,
Offline-Capture, Hover, Kalenderauswahl und sämtlicher visueller Hauptseiten.
OpenAPI-Vertrag und generierte Typen aktuell; Ruff aller aktiven Quellen sauber.
Messgerät: Windows x64, Ryzen 7 9800X3D, 16 logische CPUs, rund 31,1 GiB RAM.
Starts unter laufenden Test-/Bauarbeiten; unterschiedliche Cache-/Lastzustände
sind nicht vollständig kontrolliert. Daher 64 % nur als beobachteter Paarvergleich
bis Health, nicht als allgemeine Beschleunigung der vollständig sichtbaren App.

Installiertes MCP-Protokoll mit erfundenem Token, leerem temporärem Home und
unerreichbarer Testadresse geprüft: initialize und alle acht Gateway-Tools
erfolgreich, keine Abfrage persönlicher Daten. Die beim Update beendete alte
Codex-stdio-Verbindung meldet noch Transport closed; Codex muss einmal neu
geöffnet werden, damit sein Client die neue installierte Laufzeit startet.

Letzte Konsumentenprüfung: `smoke_demo --frozen` an den Onedir-Pfad angepasst.
Gefrorener Dienst mit frischem erfundenem Profil: PDF tatsächlich gerendert,
Karte aufgedeckt und Bewertung über die API gespeichert. Smoke bestanden;
Ruff/mypy des angepassten Prüfers ebenfalls bestanden. Kein neuer Runtime-Build
nötig, da nur der Prüfwerkzeug-Pfad korrigiert wurde.

## 05.10.2026 – DLL-Meldung beim Öffnen und Korrektur der CI-Prüfer

Nutzer meldet beim normalen Windows-App-Start einen LoadLibrary-Fehler für
`_internal/python313.dll`. Alle installierten Laufzeitdateien wurden gegen
den Onedir-Build gehasht: keine fehlenden oder unterschiedlichen Dateien.
Keine Defender-Erkennung oder ausstehende Windows-Dateiersetzung für UniOS
gefunden. Der Fehler ließ sich bei den anschließenden Starts nicht reproduzieren;
seine ursprüngliche Ursache ist damit noch nicht nachgewiesen.

Vorhandenes 0.1.19-Paket erneut installiert, App wieder geöffnet. Danach jeweils
ein frischer Prozessstart über Desktop-Verknüpfung, Startmenü und EXE mit
Arbeitsverzeichnis System32: Client-Health nach 1,782/1,689/1,672 s, jeweils
genau ein zur GUI gehörender Begleitdienst. Keine Kaltcache- oder UI-Ready-
Messung. Isolierter installierter Client-Probe: 0,685 s insgesamt; gefrorenes
MCP initialize/list_tools mit leerem Testprofil und erfundenem Token bestanden.
Beim Installieren wurden die laufenden UniOS-MCP-Prozesse geschlossen; bestehende
Codex-Verbindungen benötigen deshalb gegebenenfalls einen Codex-Neustart.
Keine Migration, keine Änderung persönlicher Daten oder des VPS.

Letzte GitHub-Matrix war rot: Der neue Startup-Privacy-Test setzte einen lokal
gebauten React-Ordner voraus, den die Backend-Jobs nicht erstellen. Er verwendet
jetzt ein explizites synthetisches Bundle. Der Browserlauf hatte eine Race zwischen
`route.fetch`/`route.fulfill` und Navigation bei `/api/system`. Der Fake-Server
liefert bereits den korrekten Moodle-Konfigurationsstatus; statt dieser unnötigen
Interception prüft der Test nun die echte Fake-API-Antwort. Keine Änderung am
ausgelieferten Produktcode. Neun Desktop-Pakettests, Ruff, mypy des Tests sowie
Frontend-Typecheck und ESLint bestanden. Browser-Abschluss folgt.
Der erste gezielte Browserlauf bestand 25 Abläufe, scheiterte aber beim Import
von fünf Dateiformaten am allgemeinen 10-s-Assertionlimit. Der Fall hat nun
ein eigenes 30-s-Abschlusslimit (60-s-Testlimit); Byte-Hashes und Downloadzahlen
werden unverändert geprüft. Finaler Lauf: 27/27 bestanden (3,4 min), einschließlich
beider Importfälle. Der Fünf-Format-Fall benötigte insgesamt 15,9 s. Der vorherige
volle Integrationslauf bleibt dokumentiert; hier wurden nur Prüfer geändert.

## 05.10.2026 – Konkurrierende SQLite-Schreiber beim Moodle-Import

Gemeldeten Autoflush-Fehler bei `UPDATE resources SET last_seen_at` mit zwei
unabhängigen WAL-Verbindungen und vollständig erfundenem Moodle reproduziert.
Vor der Korrektur scheiterten beide Fälle: normaler Sync und Portal-Dateiimport.
Der Resource-Savepoint begann als Leser; eine konkurrierende Änderung konnte
dessen Snapshot vor dem ersten UPDATE überholen. `no_autoflush` würde diesen
Konflikt nur verschieben. Siehe [SQLite-Isolation](https://www.sqlite.org/isolation.html)
und [SQLAlchemy-Savepoints](https://docs.sqlalchemy.org/en/21/dialects/sqlite.html).

Vor dem Resource-Savepoint wird jetzt an der frischen Transaktionsgrenze mit
`BEGIN IMMEDIATE` reserviert, nach Download/Parsing und nach erneuter Host-Prüfung.
Die Datei wird anschließend kurz und atomar veröffentlicht. Physisches äußeres
BEGIN sichert auch Rollback nach einem freigegebenen Savepoint. Produktions-
Verbindungen erhalten 30 s begrenzte Wartezeit für andere Schreiber; diese
Wartezeit allein würde einen veralteten Snapshot nicht reparieren. WAL und
Staffelstab-Fencing bleiben erhalten. Kein Schema-, Frontend- oder Dependency-
Wechsel; der VPS erhält die beiden geänderten Runtime-Module im neuen Image.

Sechs neue synthetische Regressionen bestanden: beide konkurrierenden Imports,
Schreibzugriff während Download, Rollback eines freigegebenen Savepoints und
Timeout für beide Produktions-Verbindungswege. Mit Resilienzfällen zunächst
sieben Fälle bestanden; neuer ausführlicher Satz sechs bestanden. Der Linux-
Image-Test verwendet leeren temporären Zustand, keinen Netzwerkzugriff und
keine echten Datenvolumes. Echte konkurrierende Änderungen in beiden Import-
Wegen, keine doppelten Versionen, Health/Web 200 und geschützte API 401 bestanden.
Alle Python-Quellen und Migrationen des Image-Baselines vor dem Bau verglichen;
danach gegen denselben Manifeststand mit genau zwei geänderten Modulen geprüft.

Ruff und mypy (524 aktive Quellen) bestanden; 430 Vitest-Fälle, Frontend-Lint,
Typecheck und OpenAPI-Typen bestanden. Der vollständige Pythonlauf zeigte zwei
Timeouts in Portal-Prüfern: fünf Sekunden reichten für Hintergrundimporte mit
mehreren isolierten Parsern nicht. Deren Abschlusslimit ist jetzt 30 s; Fehlerstatus
und Inhalte bleiben geprüft. Alle zehn betroffenen Portal-Fälle danach bestanden
(106 s insgesamt). Vollständiger Browserlauf und restliche Pythonfälle laufen;
Serveraktivierung folgt nach Abschluss der Prüfungen. Bisheriger GitHub-Stand
5ee678d war grün. Neue Freigabe für eine DB-Migration ist nicht nötig, weil keine
Migration geändert oder hinzugefügt wurde.

Abschluss der Integrationsprüfungen: Python 858 bestanden, zwölf übersprungen,
zwei Portal-Timeouts aus der alten, zu kurzen Testwartezeit (22:36 min); alle zehn
betroffenen Portal-Fälle mit korrigiertem Abschlusslimit danach bestanden.
Browser 269 bestanden, ein Diagnose-Timeout unter paralleler Last (15,3 min);
derselbe unveränderte Syncthing-Fall isoliert bestanden (29,9 s im Fall, 2,5 min
mit Fake-Dienststart). Keine unbewiesene Produktänderung an dieser Diagnose.
Dies ist gezielte Korrektur/Nachprüfung, kein zweiter komplett grüner Gesamtlauf.
Keine Screenshots oder Alpha-Installer geändert.

VPS-Image `unios-server:0.1.19-sqlite-lock-20261005` nach erneuter Prüfung aller
Runtime-/Schema-Dateien und isoliertem Offline-Smoke aktiviert. Vorgänger bleibt
als `unios-server:before-sqlite-lock-20261005` verfügbar. Daten- und Schlüssel-
Mounts sowie vorhandene Edge-/Runner-Verbindung beibehalten. Server und gekoppelter
Client gesund. Vor dem Wechsel war kein Sync aktiv; der normale Startup-Abgleich
startete danach selbstständig und ist erfolgreich abgeschlossen. Nur den
Sync-Status über die gekoppelte App beobachtet; keine echten DB-Dateien, Inhalte,
Schlüssel oder UniOS-Logs gelesen.

**Release-Abnahme 0.1.20, Plattformkorrektur (07.10.2026):** Der Nutzer hat den
gebündelten GitHub-Upload, das Windows-Update und das VPS-Update beauftragt und
nach kurzer Pause die vollständige Fertigstellung erneut bestätigt. Stand
`ea26bc5` ist hochgeladen; Installer und VPS-Kandidat wurden gebaut. Der isolierte
Server-Smoke bestätigt Version 0.1.20, Schema ff98c7da0320, React 200 und
ungekoppelte API 401; ausschließlich synthetischer Zustand in tmpfs.

Die GitHub-Abnahme meldet zwei konkrete Plattformfehler: der leere zusätzliche
422-Response übernimmt eine zwischen Python 3.12/3.13 geänderte HTTP-Phrase;
70 Emoji in einem Notiz-Dateinamen überschreiten unter Linux 255 UTF-8-Bytes.
Der Response hat jetzt eine feste Beschreibung ohne Vertragsänderung. Kurs- und
Titelpfade der Notizen behalten ihre Zeichengrenze und zusätzlich maximal
200 UTF-8-Bytes vor ID/Versionssuffix; volle Titel bleiben in Index und Markdown.
Notizlesen benutzt wie das Schreiben native Windows-Langpfade. Der erweiterte
Bestandsfall prüft volle Unicode-Kurs-/Notiztitel, bytebegrenzte Pfade und Lesen
über die API. 19 betroffene Tests mit Python 3.12 bestanden (29,23 s); Ruff,
mypy, SPDX sowie OpenAPI mit Python 3.12 und 3.13 bestanden. Der erste erweiterte
Lauf deckte den Windows-Langpfad beim Lesen auf; die Korrektur ist im grünen
Folgelauf enthalten. Komplette GitHub-Matrix, neu gebaute Pakete und Aktivierung
sind noch ausstehend und werden separat dokumentiert.

**Release-Abnahme 0.1.20, mobile Einrichtung (07.10.2026):** Kandidat `947bf59`
wurde als GitHub-Entwurf hochgeladen, tatsächlich von GitHub heruntergeladen und
auf Windows installiert. Alle 2839 Backend-Payload-Dateien und 68 ausgelieferten
Web-Assets stimmen mit dem Paket überein; isolierter Start und synthetische
MCP-Initialisierung bestehen. Das passende VPS-Image läuft gesund mit Schema
ff98c7da0320. Geprüfter Snapshot unmittelbar vor Aktivierung: 05:05:41 UTC;
Daten-/Schlüssel-Mounts und Kopplung erhalten, normaler Startup-Sync erfolgreich.

Die vollständige GitHub-Abnahme dieses Kandidaten besteht unter macOS (1019
Fälle, acht Skips), Ubuntu (1017 Fälle, zehn Skips; Coverage 83,59 Prozent),
Docker Compose und GLib. Windows läuft noch. React 672 Fälle bestanden;
Browser 317 bestanden, zwei Fehler. Ein inaktiver PDF-Textpuffer verursachte
einen mehrdeutigen Testselektor; alle betroffenen Selektoren sind nun auf die
aktive Ebene begrenzt. Die mobile Einrichtung lief nur ohne myCampus-Verbindung
auf 406 px über. Lokal in beiden schmalen Breiten reproduziert, durch begrenztes
Grid/Karte und umbrechende Aktionen behoben. Keine neue Datenmigration.

Alle 16 betroffenen Browserfälle bestanden ohne Skip/Retry (75,31 s), ebenso
Web-Build, Lint und Typecheck. Ein neuer Fall prüft beide Themes bei 320/390 px;
vier neue Vollseitenbilder einzeln geprüft und unter
`docs/qa/release-portability-20261007` erhalten. Historische QA unverändert.
Die endgültigen Pakete werden nach dieser Korrektur erneut gebaut; öffentliche
Freigabe folgt erst nach vollständiger GitHub-Matrix desselben Quellstands.

**Auslieferung 0.1.20 abgeschlossen, lange CI nicht abgewartet (07.10.2026):**
Der Nutzer verlangt jetzt ausdrücklich den sofortigen Abschluss. Quellrevision
`e54c37fdd93f7e7219eacdfb578d46eff3156250` ist auf GitHub. Windows-NSIS/MSI und
Serverpaket wurden aus genau diesem Stand neu gebaut. Der NSIS-Installer wurde
tatsächlich von GitHub zurückgeladen, SHA-256 geprüft und mit Exit 0 installiert.
Alle 2839 Laufzeitdateien stimmen mit dem Bau überein; alle 294 statischen
Oberflächendateien erfolgreich ausgeliefert. Native App geöffnet, isolierter
Start und synthetische MCP-Initialisierung bestanden. Kopplung erhalten.

VPS-Image `unios-server:0.1.20-alpha2-layout-final`, Digest
`sha256:419414f336f086a959c9d65b62700a9f837a68d6bbc5e49e9aaa81e6cb94221b`,
aktiv und gesund. Version 0.1.20, Schema ff98c7da0320, HTTPS-Health 200,
ungekoppelte API 401 und normaler Startup-Sync erfolgreich geprüft. Dieser
Layoutwechsel enthält keine neue Migration; vorherige Kandidaten bleiben erhalten.

Vollständige GitHub-Abnahme am selben Stand:
https://github.com/EinfachMxrc/unios-app/actions/runs/37577907697.
Fünf Bereiche bestanden: Linux 1017 Tests/zehn Skips, macOS 1019/acht,
Coverage 83,59 Prozent, Frontend 672, Browser vollständig 320, Docker und GLib.
Der Windows-Gesamtlauf läuft noch im Hintergrund. Die Warteschleife wurde auf
Nutzerwunsch beendet; kein vollständiger grüner Windowslauf behauptet.

Einzelnes Paket `UniOS-0.1.20-complete-update.zip` enthält beide Windows-Installer,
Serverpaket, vollständigen Quellcode einschließlich Mac-Bau und Prüfnachweise.
ZIP SHA-256: `62585a255a22b092df3908c99a393779ac89e68ae309a287724ed6f3a5f01079`.
Die GitHub-Veröffentlichung bleibt als Entwurf, bis die vollständige Matrix
bestanden ist. PC und Server sind bereits erfolgreich aktualisiert; keine neue
macOS-/Linux-Desktopinstallation behauptet. Fortschrittsdoku ändert keinen
Produktcode und keinen Release-Tag.

**Freigabe Alpha 2 nach vollständiger Windows-Abnahme (07.10.2026):** Die
Windows-Abnahme ist inzwischen abgeschlossen: 1018 Tests bestanden, neun Skips
(3464,62 s), anschließend Windows-Service-Smoke mit Oberfläche und Host-API 200.
Alle sechs Jobs der vollständigen Matrix `37577907697` erfolgreich an exakt
`e54c37fdd93f7e7219eacdfb578d46eff3156250`. Der vorhandene Release-Gate
`validate_jobs` und alle acht GitHub-Datei-Digests wurden vor Freigabe geprüft.

Release veröffentlicht: https://github.com/EinfachMxrc/unios-app/releases/tag/v0.1.20.
Prüfberichte und Gesamt-ZIP enthalten jetzt die vollständige Abnahme. Aktuelles
ZIP SHA-256: `44491392a4f344a0cd60ec7d907816a2ba87faea72656dce01dc0314e443707d`.
Die frühere Fassung mit offenem Windowslauf bleibt lokal als historischer
Download erhalten. Installer und Server-Image unverändert: dieselbe bereits
installierte und gestartete Version 0.1.20. Keine neue Migration oder erneute
Installation erforderlich. Nur Downloadhinweise und Freigabenachweise ergänzt.

**0.1.22 umgesetzt und installiert (09.10.2026):** Marc hat die
konkrete Analyse/Roadmap, den vollständigen Einbau sowie GitHub-Paket, Download,
PC-Installation und Serverupdate bestätigt. Eigene Implementierung auf
Quellrevision `6f3f39ae3b5e0f966fd8dac9733efd218e175947`: Arbeitswoche und
größere Kalender-Zeitgriffe, direkte Kurs-/PDF-Mitschrift, responsiver 60/40-Split,
Fortsetzen auf Heute, Mathefavoriten/Verlauf/Tastatur einschließlich sicherem
Escape/Cursor, persönlicher Aufgabenstand mit CAS/Undo, Prüfungsterminvergleich
mit bestätigter atomarer Neuplanung sowie native letzte Kartenbewertung/Undo
mit dauerhaften UUID-Belegen und Offline-Upload-Rennen. Bestehende Entwürfe,
Quellenidentität, Writer-/Generation-Grenzen und Handoff wurden mitgeprüft.

Vollständige lokale Abnahme: 1053 Pythonfälle bestanden/12 Skips, 790 Frontendfälle,
379 Browserabläufe bestanden/0 Skips/0 Retries. Kritische Tastatur-/Dialogabläufe
zusätzlich 15/15 mit je drei Wiederholungen. Ruff/mypy, Lint/Typprüfung,
OpenAPI/API-Typen und 67 de/en-Namespaces bestanden. Alle acht Chunkbudgets und
PWA-Offlinebudget eingehalten; 287 Precache-Dateien, 18.060.939 Byte roh,
5.076.349 Byte gzip. Zwölf Lighthouse-Snapshots auf fertig gerenderten
Quellen-/Heute-/Kalenderansichten Hell/Dunkel/1440/390: mindestens 97/100
Accessibility. Selbst und unabhängig geprüfte Bilder liegen im neuen QA-Paket;
historische Testbilder erhalten. Alle 2275 Quell-ZIP-Dateien exakt dem Git-Archiv
zugeordnet, alle 1235 Serverarchiv-Dateien dem Git-Blob; keine privaten Inhalte
oder alten generierten Testverzeichnisse enthalten.

NSIS/MSI neu gebaut, NSIS tatsächlich von GitHub zurückgeladen und SHA-256
verglichen; Installations-Exit 0, ProductVersion 0.1.22. Alle 2891 Programmdateien
und 290 UI-Dateien bytegleich. Zwei isolierte installierte Starts bestanden,
Median 0,8005s; bestehende Kopplung und Client-/Server-Hoststatus erhalten.
Server `unios-server:0.1.22-workspace-6f3f39ae3b5e` aktiv/healthy, Image-ID
`sha256:0cd1c8d2355aab2ce3eed5db731d06a4dc2af71295942b682ababdc1314f22f9`.
Synthetischer Docker-Smoke, HTTPS200/private API401, Mounts und vollständige
Deploymenttopologie bestanden. Schema ff98c7da0320; keine neue Migration.
Nach neuer Review-/Undo-/Snapshot-Nutzung kompatibel vorwärts reparieren,
kein pauschales Downgrade auf 0.1.21. Technische Auslieferungsbelege und
Gesamtpaketmanifest: `docs/qa/workspace-update-20261009`.

GitHub-Plattformmatrix 37934023250 am exakten Quellstand wurde vor Jobstart
wegen Kontozahlung/Ausgabenlimit abgewiesen. Privater 0.1.22-Release bleibt
Entwurf; kein umgangener Release-Gate, neues signiertes Autoupdatefeed oder
Mac-/Linux-Desktoppaket. MacBook-/Safari-Gesten und tatsächliches Mitschrifttempo
bleiben Gerätetests. Die bestehenden Sharp/source-map-js-Advisories betreffen
geprüfte Build-/Testpfade, kein betroffener App-Consumer nachgewiesen;
die Abhängigkeiten werden deshalb nicht als behoben dargestellt.

Das einzelne Gesamtpaket `UniOS-0.1.22-complete-update.zip` ist vollständig auf
GitHub und von dort in Marcs Downloads-Ordner zurückgeladen. 712.185.802 Byte,
SHA-256 `85ac3988fd106d091bd88308b94ff1d551d52befae4ab56fcbcf8a7aa1b337fe`.
Alle 16 GitHub-Assetdigests entsprechen den geprüften lokalen Dateien;
Gesamt-ZIP-Mitglieder, Komponentenmanifest und Downloadhash stimmen überein.
Abschließender Doku-Commit ergänzt ausschließlich die Abnahme-/Betriebsbelege;
Installer-/Server-Quellrevision und Releaseentwurf bleiben unverändert.

### Seiten- und Zweckprüfung · 09.10.2026

Auf Nutzerauftrag alle 49 Routen / 48 unterschiedlichen Seitenkennungen von
0.1.22 erneut beurteilt. Ergebnis und vollständige Entscheidungen stehen in
`docs/qa/page-purpose-audit-20261009/README.md` und `page-decisions.md`, ergänzt
durch Kern-, Lern- und Organisationsreview sowie globale Zustandskarte.
Die fünf Hauptbereiche bleiben sinnvoll; vorgeschlagen sind ein fortlaufender
PDF-/Mitschrift-Arbeitsplatz, gemeinsames kursbezogenes Üben, kompakte
Vorschlagshistorie, gemeinsame Erfassung und kontextuelle Verwaltungswege.
Jeder Vorschlag enthält Pain-Point, Komponentenlogik und Implementierungsschritte.

104 Browserbesuche auf 1440/390px mit ausschließlich erfundenen Daten: alle
Routen und drei zusätzliche Arbeitszustände erreicht, keine unbehandelten
JavaScriptfehler oder horizontalen Überläufe. Alle Module nur für Inspektion
aktiviert, Standardnavigation weiterhin fünf Hauptpunkte. Frühe ungültige
Deck-/Projektziele sowie Testselektoren wurden korrigiert und als Testbedingungen
dokumentiert; gültige Kartensession und Ohne-Frist-Projektansicht nachgeprüft.
Reader-Seite12 bleibt im kontrollierten Folgelauf korrekt; frühe Seite1-Bilder
sind keine bestätigte Readerpositionsstörung. Unter synthetischer Belastung
200 Aufgaben: Lernstart 27.891px und Übungsvorschläge 133.068px/1.002 Formularfelder.

Dynamisch bestätigt: neuere Coding-/Eingangs-/Karteneditorentwürfe durch
verspätetes ACK verworfen, Sammelfreigabe ignoriert sichtbare Kartenkorrektur,
Kursfilter verfälscht Übersicht, Kursreader-Seitenabgleich verlagert Fokus auf H1
und Projektfrist verwendet Gerätezone statt Campuszone. Projekt mit Frist
zusätzlich POST201 → frischer GET500; unabhängige In-Memory-SQLite-Reproduktion
mit tatsächlichem Router/ORM/DTO bestätigt Ursache und bereits committed
Archive/Restore trotz500. Fünf Kontroll-/Fehlerfälle reproduziert, QA-Skript
Ruff-grün. Vorhandener Projekt-Lifecycle-Kontrolltest: 1 bestanden; keine Frist im
Testpayload, daher keine Abdeckung dieses neuen Falls. Weitere Dirty-Refetch-,
Journal-, Deep-Link- und Antwortreihenfolgefälle ausdrücklich Sourcebefunde.

Diese Arbeit ist eine Analyse mit synthetischen QA-Belegen. Produktcode,
Installation und Server unverändert; Fehlerbehebung und Redesign nicht als
erledigt dargestellt. Mitschrifttempo, echte Mac-Gesten und reale Hochschulwege
nicht neu gemessen. Eigene temporäre Prüfdienste anschließend beendet.

### Umsetzung der offenen Seitenaudit-Befunde · 09.10.2026

Produktmetadaten für 0.1.23 vorbereitet. Die bestätigten Entwurfs-/ACK-,
Refetch-, Projektfrist-, Filter-, Deep-Link- und Reviewfehler sind in eigenen
Implementierungen korrigiert. PDF und Vollnotiz führen eine erste bestätigte
Mitschrift unter derselben UUID mit vorhandener Revision/CAS weiter. Große
Übungs-, Vorschlags- und Jotslisten sind begrenzt; Sammelfreigabe gilt ausdrücklich
für sichtbare unveränderte Karten. Einstellungen, Notizwechsel, Fristen und
Kalenderdetails wurden nach dem geprüften Komponentenrezept vereinfacht.

Gezielte synthetische Regressionen und Typecheck/Lint bestehen; die vollständige
Integration läuft. Ein anfänglicher Windows-TZ-Testaufbau wurde durch echte
Browser-Zeitzonenfälle ergänzt und von der instabilen Worker-Zonenbehauptung
befreit. Ein Anki-Journal-Pfadfehler bei langen Windows-Testpfaden wurde zusätzlich
reproduziert und wird vor Auslieferung korrigiert. Noch keine neue Installation,
keine neue Plattformfreigabe oder Serveraktivierung behauptet. Fortschritt und
verbindlicher Umfang: docs/qa/page-purpose-fixes-20261009/README.md.

**Audit und Redesign (11.10.2026):**
Pinch-Zoom im PDF-Leser rendert während der Geste nur noch eine Compositor-Matrix
statt pro Frame Sitzungsspeicher, React-Render und Neulayout aller Seiten;
ein Breitenwechsel pro Geste, Ankerwiederherstellung vor dem Paint. Tastaturzoom,
Cmd/Strg+Shift+B für die Mitschrift daneben und „Zitiert in“ (Notizen, die eine
PDF-Seite zitieren, abgeleitet aus vorhandenen Quellenlinks, keine Migration).
Einzige Token-Datei mit neutralem Höhenmodell; 427 Zeilen totes CSS, zwei
überschriebene Token-Blöcke, acht ungenutzte Typen und zwei tote Python-Funktionen
entfernt. Backend 1.084 Tests, Frontend-Unit- und Leser-E2E grün; native
MacBook-Trackpad-Messung steht aus.
