<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Navigation und Ladeverhalten – 04.10.2026

## Änderungen

- Gemeinsame Suspense-Grenze für alle verzögert geladenen Seiten. Beim Wechsel
  bleibt die bisherige Oberfläche sichtbar. Ein direkter Kaltaufruf zeigt die
  App-Navigation mit Ladeplatzhaltern. Fehlgeschlagene Seitenmodule bieten einen
  Wiederholungsweg innerhalb der App.
- Hover, Tastaturfokus und Touch laden ausschließlich das betreffende Seitenmodul
  vor. Schwere eingebettete Editoren und PDF-Inhalte bleiben separat geladen.
  Ein langsamer Klick zeigt nach 120 ms eine schmale Fortschrittsanzeige.
- Bekannte Navigationsabfragen nutzen Antworten bis zu 30 Sekunden erneut;
  Benachrichtigungen zehn Sekunden, Moodle-Status fünf Sekunden. Query-Parameter
  bleiben Teil des Schlüssels. Unbekannte Endpunkte, Host-/Zugriffsprüfungen,
  laufende Aufgaben, Prüfungen und Runner-Checks haben keine zusätzliche Frist.
  Bestehendes Polling bleibt aktiv.
- Erfolgreiche Schreibzugriffe machen diese Antworten wieder veraltet. Explizite
  Aktualisierung und abgeschlossene Synchronisationen greifen sofort. Nach
  Wiederherstellung des Offline-Caches beim Neustart/F5 werden Serverdaten erneut
  geprüft; vorhandene Offline-Daten bleiben währenddessen verfügbar.
- Eine leere Karteikarten-Warteschlange löst keine drei überflüssigen
  Aktualisierungen aus. Tatsächlich übertragene Bewertungen aktualisieren die
  betroffenen Abfragen weiterhin.
- Der native HTTPS-Proxy führt seine Schlüsselbund-Leseprüfung außerhalb des
  Event-Loops aus. Fenster und Dateien bleiben bei einer wartenden Prüfung
  erreichbar. Die Gerätebindung wird weiterhin bei jedem Request geprüft;
  Zugangsdaten werden dafür nicht zusätzlich zwischengespeichert.
- Fehlende Server-Einstiegsrouten für Üben, Programmieren und weitere Bereiche
  sowie Karteikarten-Sitzungen sind ergänzt. Direkter Aufruf und F5 liefern die
  App-Oberfläche; API-Authentifizierung und Host-Prüfung bleiben aktiv.

## Messung

Windows, Chromium, lokaler Fake-Server, Produktionsbuild. Fünf Runden mit je
vier Wechseln: Überblick → Karteikarten → Üben → Programmieren → Überblick.
Die erste Übertragung der drei Seitenmodule wurde um 450 ms verzögert.
Gezählt werden API-Requests und Animationsframes ohne sichtbare `.app-shell`.

| Messgröße | Vorher | Nachher |
| --- | ---: | ---: |
| Frames ohne sichtbare App-Oberfläche | 111 | 0 |
| API-Requests im Ablauf | 175 | 34 |
| Kursliste | 21 | 1 |
| Benachrichtigungen | 21 | 1 |
| Moodle-Status | 21 | 1 |
| Karteikartenstatus | 16 | 1 |
| Median der 16 weiteren Wechsel | 27,3 ms | 21,9 ms |

Die Request-Zahl sinkt in diesem Ablauf um rund 81 %. Die Zeitwerte messen
Klick bis sichtbaren aktiven Tab, einschließlich Playwright-Aufwand, nicht die
vollständige Befüllung jedes Bereichs. Ein ungepufferter, langsamer erster Download
braucht weiterhin Zeit; die Oberfläche bleibt dabei nutzbar. Keine Messung mit
persönlichen Hochschuldaten oder dem echten Schlüsselbund. VPS-Latenz, WebView,
macOS und Linux können abweichen.

## Prüfungen

- 413 Vitest-Tests, Typecheck, ESLint und i18n-Prüfung bestanden.
- 27 Playwright-Tests: Navigation, intent-basiertes Vorladen, Tastatur, kalte
  Direktlinks, Fehlerbehandlung, Benachrichtigungen/F5, Heute, Header, Suche,
  Notiz-Rückgängig, PDF und Palette. Bestehende Browserbudgets bestanden.
- 21 pytest-Tests zu Client-Gerätebindung, Proxy, Direktlinks und Host-/Standby-Sperren;
  Ruff für betroffene Python-Dateien und mypy für `app` und `tests` bestanden.
- Lernseiten-Screenshots in Hell/Dunkel bei 1440 und 390 px visuell geprüft.

Die reproduzierbare Messung liegt in
`frontend/e2e/navigation-performance.spec.ts`; lokale Rohwerte und Screenshots
werden als Testartefakte gespeichert und nicht mit Nutzerdaten vermischt.
