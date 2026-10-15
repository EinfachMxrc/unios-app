<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Start, Navigation, Mensa und Kalender – 15.10.2026

Feature-Stand: `4f6251a8e61775ede8828e6a5809736904be9136`.
Server und signierte Mac-App sind installiert. Der Mac-Build enthält das neu
gebaute eingefrorene Backend einschließlich Frontend und die neue native
Beenden-Logik. [Technischer Installationsnachweis](installation.json).

## Prüfumfang

- 1.427 Frontendtests, Typecheck, ESLint, Ruff, mypy (642 Dateien), OpenAPI und
  Frontend-Build bestanden. Backend-Gesamtabdeckung in Teilgruppen nach zwei
  korrigierten älteren Test-Fixtures; sieben Plattform-Skips. Ein vorhandener
  macOS-ACL-Signiertest bleibt umgebungsbedingt offen: dafür müsste eine neue
  Wegwerfidentität im Betriebssystem vertraut werden. Keine Vertrauensregeln geändert.
- Playwright gegen lokale Fake-Dienste: alle 526 aktuell gesammelten Fälle
  in fortgesetzten Teilgruppen erfolgreich zugeordnet
  ([Abdeckungsnachweis](playwright-coverage.json));
  älteren Datums-Test auf sein Fixture-Datum fixiert. Die Prüfung einer langen
  Seitenleiste wartet nun auf das tatsächliche Layout statt nur auf DOM-Knoten.
  Keine Produktionslogik dafür geändert. Ein Formeleditor-Zeitlimit bestand im
  separaten Wiederholungslauf; die große Ansichten-Galerie bestand nach einem
  Wiederholungsversuch (als flaky ausgewiesen). Kein vollständig grüner Einzellauf.
- Seitenleiste: acht Bereiche einschließlich Uni-Mail über echte Klicks, danach
  Zurück/Vorwärts; auch Lazy-Loading und unabhängige Nutzerbewegung berücksichtigt.
- Mensa: gemischte erfolgreiche/fehlende/defekte Bildantworten, gleiche Kartenhöhen,
  Filter ohne erneute Bildanfrage oder DOM-Austausch; Cachegrenzen und Authentifizierung.
- Eigene Kursnamen mit unveränderter Quellidentität und Konfliktschutz; Aktivitätslinks
  mit Nachbarn und dreifachem Hinweis; beständige Aktivitätsfilter einschließlich Nur Inhalte.
- Kalender: Einzeltermin/dieser und folgende/ganze Serie, Einzelanpassungen,
  Konflikte, Undo, Sommer-/Winterzeit und iCal-Quellenauswahl.
- Zwei Rust-Release-Tests mit echten Supervisor-/Arbeiterprozessen bestanden.
  Signatur und alle sieben installierten Mac-Dateien stimmen mit dem fertigen
  Build überein. Frischer Start mit nativer App → Loader → lauschendem Arbeiter
  auf Port 8000 und Client-Health geprüft. Echter GUI-Quit/Reopen-Zyklus bleibt
  offen: Computersteuerung meldet „native pipe startup failed“.
- Isolierter Docker-Smoke ohne Netzwerk und ohne reale Bestands-Mounts bestanden;
  geprüfter Snapshot vor beiden Migrationen, unveränderte Server-Topologie,
  healthy und HTTPS ok, private API ohne Kopplung weiterhin 401.

## Sichtprüfung und Barrierefreiheit

Mensa und Benachrichtigungen in Hell/Dunkel bei 1440 px und 390 px:
[Screenshots](screenshots/). Kalenderwoche, Monatsübersicht, Termindetails und
Bearbeiten in denselben Kombinationen: [Kalender](calendar-a11y/).
Sichtprüfung: gleiche Fotoflächen, brauchbare Ersatzkarten, erreichbare Menüs,
lesbare Eingaben und Serienauswahl; keine horizontal abgeschnittenen Bedienelemente.
Die erfolgreiche Bild-Fixture ist ein einfarbiges Testbild, kein echtes Mensafoto.
Alle Bilder zeigen ausschließlich erfundene lokale Fixtures.

[Lighthouse-Kalenderbericht](calendar-a11y/lighthouse-summary.json): 16 Snapshots,
96–100 Accessibility. [Startseite/PWA](pwa-summary.json): Accessibility 100,
Legacy-PWA 100. Der Legacy-Lauf nutzt ausdrücklich Lighthouse 11.7.1.

## Reguläre Kalenderkorrektur

Der ausdrücklich gewünschte Dienstags-Nachmittag wurde über die gekoppelte
App-API auf 14:00–15:30 korrigiert. 13 bekannte Termine, nach Zeitumstellung
geprüft, andere Termine unverändert und Undo verfügbar. Der Nachweis enthält
keine Kursnamen, Termin-IDs, Kopplungsdaten oder persönlichen Hochschulinhalte.

Mail wurde nicht als funktionierend ausgewiesen: Microsoft ist nicht verbunden,
Weiterleitung vorbereitet aber nicht bereit; ein serverseitiger Playwright-
Mail-Leser ist nicht eingerichtet. Keine Anmeldung bei Hochschulsystemen.
