<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Öffentlicher Release 0.1.28 – Prüfnachweise

## Endgültiger gemeinsamer Qualitätsstand

Commit `461f567e22ea73dba1b748de02b4e58271ecbd12`,
[vollständiger Lauf 38775534418](https://github.com/EinfachMxrc/unios-app/actions/runs/38775534418):
alle sechs Pflichtjobs erfolgreich. Linux 1.361 bestanden / zwölf Skips,
Coverage 84,53 %; macOS 1.363 / zehn Skips; Windows 1.364 / neun Skips und
Dienststartprüfung. Frontend 1.435 Tests und **530 Browserfälle in einem Lauf**
bestanden. Docker einschließlich Backup und Wiederherstellung, GLib, Typecheck,
Lint, i18n, OpenAPI und Bundle-Grenzen grün. [Lighthouse](pwa.json) erneut am
endgültigen normalen Web-Build: Accessibility 100, Legacy-PWA 100.

Alle 17 Dependency-PRs, PR #19 und PR #22 sind enthalten; der Freigabe-PR #23
ist zusammengeführt. Der [Paketlauf 38779476404](https://github.com/EinfachMxrc/unios-app/actions/runs/38779476404)
am selben Commit besteht für Windows x64 und Linux x64 einschließlich isolierter
Client-Startproben (2,976 s / 6,448 s inklusive Loader). Alle vier Installer
entsprechen den CI-SHA256-Belegen; beide Update-Signaturen samt signierter Version
0.1.28 sind offline geprüft. Der veröffentlichte
[Release v0.1.28](https://github.com/EinfachMxrc/unios-app/releases/tag/v0.1.28)
ist die neueste Ausgabe mit 13 Assets. GitHub-Asset-Hashes, öffentlicher Feed
und Prüfsummen-Datei wurden nach dem Upload abgeglichen. [Abschlussbeleg](release-verification.json).
Frische Geräteinstallation, native GUI und echte Hochschulkonten bleiben separat
manuell zu prüfen; kein öffentlicher macOS-Installer.

## Frühere Kandidaten und behobene Befunde

Vorheriger vollständiger Kandidatenlauf 38770630888: alle fünf Plattform-/Betriebsjobs
bestanden, Browser 528/530. Das Kursnamenformular nutzte nach Cache-Hydrierung
einen veralteten Vergleichswert; unberührte Formulare übernehmen jetzt frische
Serverwerte, eigene Eingaben behalten ihren ursprünglichen Konfliktvergleich.
Zwei Regressionen bestehen, die erste schlägt ohne Produktkorrektur fehl.
Der PDF-Test bestätigt das asynchrone Öffnen, bevor er den geöffneten Zustand
nach Rückkehr erwartet. Alle 16 betroffenen Browserfälle bestehen in zwei
aufeinanderfolgenden Läufen. Vollständige Matrix am neuen Commit und Pakete offen.

Vorheriger Kandidatenbefund: Lauf 38756486505 bestand Linux, macOS, Docker
und GLib, jedoch nur 526 von 530 Browserfällen. Drei KI-Fälle erforderten
das fehlende SDK im Browser-CI; ein Mitschriftfall fand einen veralteten
Editor-Rückruf, der den neuen Titel überschreiben konnte. SDK-Extra und
Feldänderungen mit neuesten Entwurfswerten sind korrigiert; ein gezielter
Regressionstest hält einen alten Editor-Rückruf fest. Windows kam nach der
Anki-Fixture-Korrektur bis zum Host-Übergabefall und scheiterte dort an einer
einsekündigen Testfrist. Die Ereignis-Wartefristen sind angeglichen, alle
Sperr-/Reihenfolgeprüfungen bleiben erhalten. Erneute vollständige Matrix
und echte Pakete stehen aus; historische grüne Teilstände unten ersetzen sie nicht.

Ziel: `EinfachMxrc/unios-app`. Die zehn beim Start offenen Dependency-PRs
#1–#10 sind als echte Merge-Eltern im Release-Zweig enthalten. Private
Git-Historie wird nicht importiert; die vorhandenen Abschlussnachweise sind
als überprüfter Patch übernommen; persönliche Installations- und
Betriebsbelege sind davon ausgenommen.

## Abhängigkeiten

Nach dem ersten Merge zusätzlich PRs #12–#18 aufgenommen: MathLive 0.111.1,
lucide-react 1.55.0, FastAPI 0.143.0, jsdom 30.1.2, Anthropic 1.13.0,
Radix UI 1.8.0 und Tauri-Frontend-API 2.12.3. Zusammen sind es 17
Dependency-PRs. MathLive korrigiert mehrere Rendering-Sicherheitsfehler;
[Upstream-Nachweis](https://github.com/arnog/mathlive/blob/30ad20a7a47ea43a2f6915808023202c78f37742/CHANGELOG.md).
Lizenztexte und Herkunft bleiben erhalten.

SQLAlchemy 2.1.4, filelock 4.1.1, Typer 0.27.3, Ruff 0.17.0, mypy 2.4.0,
Playwright 1.64.0, React-Vite-Plugin 6.1.2, typescript-eslint 8.71.1,
Prettier 3.9.10 und React Query 5.104.2.

Der Typecheck hat nach PR #4 zwei unterschiedliche QueryClient-Kerne erkannt:
React Query war aktualisiert, sein Persistenzpaket noch auf 5.104.0. Beide
Pakete sind nun gemeinsam auf 5.104.2 fixiert. `npm ls` bestätigt einen
geteilten, deduplizierten Query-Core 5.104.2. Keine neue Produktabhängigkeit.

## Weiterer Befund im Gesamtlauf

Der schnelle Tastaturablauf fand eine verzögerte Cursorwiederherstellung im
Markdown-Quelltext: Ein geplanter Animationsframe konnte hinter einen gerade
getippten Buchstaben springen. Die Auswahl wird jetzt gemeinsam mit dem neuen
kontrollierten Text im Layout-Commit gesetzt. Zwei gezielte Regressionstests
prüfen Einrücken in der Mitte und weiteres Tippen vor verzögerten Arbeiten.
Nach Playwright 1.64 wurde dessen neue lokale FFmpeg-Version für die Videotour
installiert. Das verändert keine Systemeinstellungen.

Die große Galerie wird nun je Theme und Bildschirmgröße in einem eigenen
Browserkontext mit frischem Fake-Bestand ausgeführt. Alle bisherigen Ansichten
bleiben enthalten. Ihre fünf Fälle bestehen ohne Retry. [Alle 529 Browserfälle](playwright-coverage.json)
sind im Gesamtlauf und den gezielten Korrekturläufen erfolgreich zugeordnet;
der ursprüngliche Gesamtlauf hatte zwei behobene Fehler und eine wiederholte
Galerie. Das ist kein vollständig grüner Einzellauf.

## Öffentlicher CI-Befund und Korrektur

Der erste öffentliche Lauf meldete ein zu großes Startpaket (355.137 gzip-Bytes,
Grenze 225.280). Aufgabenbeschreibungen importierten KaTeX und Syntaxhervorhebung
bereits beim App-Start. Ihre gemeinsame Anzeige lädt die Renderer nun erst beim
Anzeigen nach; währenddessen bleibt der Originaltext lesbar. Sämtliche bisherigen
Sanitierungs- und Darstellungsprüfungen bleiben erhalten; eine zusätzliche Prüfung
deckt nachgeladenen Inhalt, geänderte Texte und Inline-Labels ab. Die Größenlimits
werden nicht angehoben. Lokal: 223.576 gzip-Bytes für das Startpaket; Precache
18.552.995 rohe / 5.228.028 gzip-Bytes, jeweils innerhalb der Grenzen.

## Lokal tatsächlich geprüft

- Python: 1.344 bestanden / acht Plattform-Skips im Gesamtlauf ohne das
  macOS-Signiermodul, anschließend dessen Prüfung unvollständiger/zu offener
  Identitäten zusätzlich bestanden. Insgesamt 1.345 bestanden / acht Skips.
  Der einzelne reale macOS-Schlüsselbund-ACL-Test bleibt lokal offen; keine
  neue Identität auf diesem Mac vertraut. Die vorhandene GitHub-macOS-Prüfung
  benutzt eine kurzlebige erfundene Identität im separaten CI-Rechner.
- Ruff 0.17.0 und mypy 2.4.0 für 642 Quelldateien bestanden.
- Frontend: alle 1.430 Tests, Typecheck, ESLint, i18n-Prüfung und Build bestanden.
- 28 gezielte Paket-/Release-/Gate-Tests bestanden, einer plattformbedingt übersprungen.
- OpenAPI nach Versionswechsel neu exportiert, Typen neu erzeugt, Vertrag geprüft.
- Neun frische README-Screenshots gegen einen neu erzeugten isolierten Demo-Bestand
  aufgenommen und visuell geprüft; keine Browser-Ausnahmen. Alle Inhalte erfunden.
- [Lighthouse](pwa.json): Accessibility 100, Legacy-PWA 100, keine Laufzeitfehler.

Der technische Historien-Mustercheck prüft die öffentliche Ausgangshistorie
und die zehn Dependency-Zweige: keine erkannten Secret-Muster. Zwei bereits
öffentlich enthaltene PNGs im alten `page-purpose-audit-20261009` liegen über
seiner 4-MB-Grenze und wurden vom automatischen Inhaltscheck ausgelassen.
Das ist keine vollständige Secret- oder Bildinhaltsgarantie. Keine privaten
Datenpfade und keine privaten Git-Vorfahren werden neu übernommen.

Docker-Smoke, vollständige Plattformmatrix und native Windows-/Linux-Pakete
werden über die öffentlichen Workflows am genauen Release-Commit geprüft.
Ein gebautes Paket bleibt vom manuellen Nachweis auf einem frischen Gerät
getrennt. Ohne Developer-ID/Notarisierung kein öffentlicher macOS-Installer;
ohne signierte Pakete kein automatischer Updatefeed.

## Tatsächlicher öffentlicher Voll-Lauf am ersten Integrationsstand

Commit `3dbcee3630150d3f1a4b668f484d13bb87d43cc7`,
[Lauf 38740042373](https://github.com/EinfachMxrc/unios-app/actions/runs/38740042373):
Linux 1.342 bestanden / zwölf Skips, Coverage 84,47 % bei geforderten 80 %;
macOS 1.344 bestanden / zehn Skips; Docker und GLib erfolgreich. Alle 1.430
Frontendtests und **529 Browserfälle in einem vollständigen Lauf** bestanden.
Windows erreichte nach rund 34 Minuten 37 % ohne bis dahin gemeldete Testfehler;
wegen des nachfolgenden Dependency-Standes abgebrochen. Dieser Gesamtlauf ist
daher ausdrücklich nicht vollständig erfolgreich und gibt keine neuen Pakete frei.

Die globale pytest-Fixture kopiert nun ein einmal pro Worker angelegtes leeres
Schema in je eine eigene SQLite-Datei. Tabellen, Fremdschlüssel, FTS-Trigger,
Indizes und Durabilität bleiben erhalten; vorhandene Testdateien werden nicht
überschrieben. Zwei identische lokale Stichprobenfälle bestanden vorher und
nachher, der wiederholte Setup-Anteil sank von 0,13 auf 0,01 Sekunden. Kein
`-n auto`, keine übersprungenen Pflichtfälle und keine gesenkte Coverage-Grenze.
Die CI protokolliert künftig zusätzlich die 25 langsamsten Testphasen. Eine
Beschleunigung der vollständigen Windows-Prüfung ist noch nicht nachgewiesen.

Der Dependency-Nachlieferungsstand besteht lokal 1.430 Frontendtests,
Typecheck, Lint, OpenAPI, Ruff, mypy, Build und Bundle-Grenzen sowie 52 passende
Browserfälle für Formeln, Offline-Fonts, Tastaturbedienung und Lernwerkzeuge.
Der vollständige Pythonlauf nach Fixture-Optimierung besteht mit 1.344 Fällen
und acht Plattform-Skips. Zwei aufeinanderfolgende lokale Gesamtläufe dauerten
416,54 Sekunden vorher und 297,03 Sekunden nachher; die parallel laufenden
Browserprüfungen waren nicht identisch, daher ist dies kein kontrollierter
plattformübergreifender Benchmark. Die reale macOS-Schlüsselbund-ACL-Prüfung
bleibt lokal ausgenommen und wird im isolierten CI-Mac geprüft.

## Gemeinsamer Stand mit PR #19

Der inzwischen öffentliche PR #19 ist vollständig enthalten, einschließlich
Python 3.13, KI-Modellliste und Anki-Backup. Am kombinierten Stand bestehen
1.357 Backendfälle / acht Plattform-Skips, 1.430 Frontendtests, Typecheck,
Lint, Ruff, mypy, OpenAPI, Build, Bundle-Grenzen und 25 passende Browserfälle.
Danach wurde eine Demo-Regression korrigiert: weder gespeicherte KI-Schlüssel
noch Modelllisten dürfen in einer Demo gelesen werden; Änderungen an diesen
Verbindungen werden vor Speicher-/Netzwerkzugriff abgelehnt. 22 gezielte Fälle
einschließlich vier neuer Schutzprüfungen und Ruff/mypy für 647 Dateien bestehen.
Die neun README-Bilder wurden aus einer neuen CLI-Demo erneut aufgenommen und
einzeln visuell geprüft; keine Browser-Ausnahmen und ausschließlich erfundene Daten.

Der öffentliche Lauf von PR #19 fand zusätzlich das noch auf Python 3.12
basierende lokale Docker-Image; es ist jetzt auf die Mindestversion 3.13
angeglichen. Vollständige Plattformmatrix, Docker-Smoke und Paketbau müssen
am endgültigen gemeinsamen Commit neu erfolgreich abgeschlossen werden.
