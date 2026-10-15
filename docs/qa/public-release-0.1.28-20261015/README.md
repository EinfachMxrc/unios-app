<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Öffentlicher Release 0.1.28 – Prüfnachweise

Ziel: `EinfachMxrc/unios-app`. Die zehn beim Start offenen Dependency-PRs
#1–#10 sind als echte Merge-Eltern im Release-Zweig enthalten. Private
Git-Historie wird nicht importiert; die vorhandenen Abschlussnachweise sind
als überprüfter Patch übernommen; persönliche Installations- und
Betriebsbelege sind davon ausgenommen.

## Abhängigkeiten

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

## Lokal tatsächlich geprüft

- Python: 1.344 bestanden / acht Plattform-Skips im Gesamtlauf ohne das
  macOS-Signiermodul, anschließend dessen Prüfung unvollständiger/zu offener
  Identitäten zusätzlich bestanden. Insgesamt 1.345 bestanden / acht Skips.
  Der einzelne reale macOS-Schlüsselbund-ACL-Test bleibt lokal offen; keine
  neue Identität auf diesem Mac vertraut. Die vorhandene GitHub-macOS-Prüfung
  benutzt eine kurzlebige erfundene Identität im separaten CI-Rechner.
- Ruff 0.17.0 und mypy 2.4.0 für 642 Quelldateien bestanden.
- Frontend: alle 1.429 Tests, Typecheck, ESLint, i18n-Prüfung und Build bestanden.
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
