<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Produktauftrag: 15 Punkte

Am 02.10.2026 ausdrücklich vollständig beauftragt, einschließlich Addons und Marketplace.
Bestehende Implementierungen werden erweitert. Abnahme zählt nur mit ausführbarem Verhalten;
Roadmap, Dokumentation und Fake-Server ersetzen keine echten Geräte-/Kontotests.

| Reihenfolge | Paket | Stand |
| --- | --- | --- |
| 1 | Unified Views: Quellen, Filter, Sortierung, Gruppen, Layout, sichtbare Felder | Umgesetzt; lokale Abnahme bestanden |
| 2 | Entity Schema: vollständige Feldtypen, Referenzen und Schreibrechte | Umgesetzt; lokale Abnahme bestanden |
| 3 | Datenportabilität: JSON, Markdown, Originale, CSV, ICS | Umgesetzt; lokale Abnahme bestanden |
| 4 | Restore-Drill: frisches Ziel, vollständiger Bestand, Versionsprüfung | Umgesetzt; lokale Abnahme bestanden |
| 5 | Suche: strukturierte Operatoren und Volltext | Umgesetzt; lokale Abnahme bestanden |
| 6 | Command Palette: gemeinsame Entity Actions und Alltagsaktionen | Umgesetzt; lokale Abnahme bestanden |
| 7 | Tastatur: Navigation, Aktionen, Öffnen und Schließen | Umgesetzt; lokale Abnahme bestanden |
| 8 | Undo für lokale versionierte Änderungen | Implementiert; Notizen, Intake, entfernte Beziehungen und Themen-Merge |
| 9 | Entity History und Aktivitäten | Implementiert; vorhandene Fakten und lokale inverse Änderungen |
| 10 | Notification Center mit Lesen und Stummschalten | Implementiert; Meldung, Kurs, Kategorie und global |
| 11 | Hintergrundjobs: Fortschritt, Abbruch, Wiederholen | Implementiert; Index, OCR, Campus-Sync, Snapshot und KI |
| 12 | Ausführbare isolierte Addons v2 | Implementiert; echte WASM-Ausführung im begrenzten Prozess |
| 13 | Connector Marketplace mit transparenten Rechten | Implementiert; realer Registry-Katalog und Container-Freigabeflow |
| 14 | Barrierefreiheit | Implementiert; Tastatur, Schriftgröße, Kontrast und reduzierte Bewegung |
| 15 | Gemessene Performance-Budgets und Regressionen | Implementiert; Browser, Heute-API und Bundle-Grenzen in CI |

## Bereits festgestellte Grenzen

MacBook-Zugriff fehlt laut Nutzer; reale Mac↔Windows-, Sleep/Resume- und Keychain-Abnahmen
bleiben offen. Apple Developer ID/Notarisierung und Windows-Signierzertifikate fehlen.
Kein automatischer Zugriff auf echte Hochschulkonten. Unbekannte Daten bleiben unbekannt.
Ein geprüftes Backup ist Voraussetzung für jede produktive Datenbankmigration.

## Paket 1–7: Nachweise

- Views, Schema, Export/Restore: gezielte pytest-Läufe bestanden; vollständiger fiktiver Bestand mit echten Anki-Dateien wiederhergestellt.
- Suche: Filter werden vor dem Limit angewandt; ungültige Operatoren werden abgelehnt. Kein semantisches Modell vorgetäuscht.
- Playwright: fünf Abläufe bestanden (Ansichten, Filter/Persistenz, PDF-Suchseite, Registry-Aktion und Tastatur).
- Restore übernimmt ausschließlich in frische Ziele. Unbekannte/future Schemarevisionen werden abgewiesen; ältere bekannte Revisionen benötigen den normalen Startup-Migrationspfad.

## Paket 8–15: Verhalten und Grenzen

- **Rückgängig:** Notizen erhalten eine neue Fassung, Intake eine neue Revision. Entfernte Beziehungen werden erneut validiert. Themen-Merge bewahrt die vorherigen Referenzen, Lernblöcke und Eigenschaften; nach neuer Arbeit am beteiligten Bestand wird die Wiederherstellung verweigert. Kein Undo für externe Moodle-Abgaben. Die Übersicht liegt unter Aktivität; Notiz und Eingang bieten direkte Buttons.
- **Verlauf:** Notizversionen, PDF-Markierungen, Materialien, Abgaben, Noten, Übungen, Kartenreviews, Eigenschaften, lokale Zuordnungen und Beziehungen werden aus vorhandenen Fakten zusammengestellt. Diese Anzeige ist keine manipulationssichere Audit-Infrastruktur.
- **Meldungen:** `/notifications` trennt ungelesen, alle und stumm. Neue Dateien, Mail-Hinweise und fällige Karten werden aus gespeicherten Daten aktualisiert. Lesen oder Stummschalten verändert keine externe Quelle. Die bestehende Fristen-/Sync-Benachrichtigung verwendet dieselbe Speicherung.
- **Aufträge:** `/jobs` speichert Zustände und Fortschritt. Wiederholen erzeugt eine neue ID. Neustarts markieren alte Aufträge als unterbrochen. Abbruch ist kooperativ an Schritt-/Seitengrenzen; bereits gespeicherte Ergebnisse bleiben erhalten. Ältere synchrone API-Endpunkte bleiben kompatibel. KI benötigt weiterhin explizite Datenfreigaben und kann Kosten verursachen.
- **Addons:** API v1 bleibt deklarativ. API v2 führt SHA-256-geprüftes WASM ohne WASI/Imports im separaten Prozess aus, mit begrenzter Laufzeit, Fuel und Speicher. Ausgabe ist Text; das Paket erhält nur die freigegebenen öffentlichen Felder. Manifeständerungen verlangen erneute Freigabe. Beispielpaket: `examples/addons/isolated-tool.unios-addon.json`. Details: [ADDONS_V2.md](ADDONS_V2.md).
- **Marketplace:** `/marketplace` zeigt tatsächliche Hochschulprofile und Connector-Manifeste, API-/Paketversion, Maintainer, Quelle, Domains, Fähigkeiten, Secret-Namen und Fingerprint. Container können installiert, freigegeben, aktiviert und widerrufen werden. Das Python-Beispiel ist als Entwicklerreferenz gekennzeichnet. Es gibt keine erfundene Liste produktiver Community-Integrationen. Signaturen sind noch nicht verifiziert; Details: [CONNECTOR_MARKETPLACE.md](CONNECTOR_MARKETPLACE.md).
- **Zugänglichkeit:** Skip-Link, Fokusmarkierungen, persistierte Schriftgröße bis 150 %, hoher Kontrast und reduzierte Bewegung. Browser-Abnahme prüft 200 % Schrift und beide Themes. Echter Screenreader-Betrieb und native Betriebssystem-Kontraste bleiben manuelle Geräteabnahmen.
- **Performance:** Fünf Stichproben je Ablauf, feste P95-Grenzen und gzip-Budgets; keine nachträglich angepassten Schwellen. Sekundäre Ansichten werden bei Bedarf geladen. Details: [PERFORMANCE_BUDGETS.md](PERFORMANCE_BUDGETS.md). Keine Behauptung über nativen Kaltstart oder reale Großbestände auf unbekannter Hardware.

Die Datenbankrevision lautet `ff81dc435f60`. Vor einer produktiven Migration muss der Nutzer gemäß `AGENTS.md` einen geprüften Snapshot erstellen. Windows/macOS/Linux-Installer, Signierung, reale Konten und der echte Multi-Device-Lauf sind eigenständige Freigabegates.

## Abschließende lokale Abnahme (02.10.2026)

- Vollständiger Python-Lauf: **623 bestanden, 12 übersprungen**.
- Frontend: **327 Unit-Tests und 169 Playwright-Tests bestanden**.
- Ruff, mypy (429 Quelldateien), TypeScript, ESLint, Produktions-Build, OpenAPI-Abgleich, 54 Übersetzungsbereiche, SPDX und Connector-/Profilvalidierung bestanden.
- Neue Hauptseiten in Light/Dark bei 1440 und 390 px geprüft; **Lighthouse Accessibility 100**.
- Feste Browser-Performance-Grenzen bestanden. gzip-Bundles: Einstieg 166.351 Byte, Materialseite 194.879 Byte, PDF-Worker 376.093 Byte; jeweils unter dem dokumentierten Budget.
- Die lokale Docker-Linux-Engine ist nicht erreichbar. Der manuelle Qualitätsworkflow prüft den echten Compose-Smoke sowie Backend auf Linux, macOS und Windows. Diese CI-Abnahme ist getrennt vom bestandenen lokalen Lauf.

Der Stand enthält auch den aktuellen PDF-Scroll-Fix aus GitHub. Die neuen Pakete sind kein bereits installiertes oder produktiv migriertes Release; echte Geräte, Screenreader, Signierung und persönliche Konten sind nach [MANUELL_TESTEN.md](MANUELL_TESTEN.md) abzunehmen.

Der erste CI-Lauf bestätigte Frontend und Performance-Budgets sowie den GLib-Sicherheitsbackport. Er fand zusätzlich einen plattformabhängigen Typzugriff auf `CREATE_NO_WINDOW` und einen veralteten unauthentifizierten Docker-Smoke. Beide sind korrigiert: plattformneutrale Typprüfung, explizite Abweisung ungekoppelter Bridge-Anfragen und normale lokale Geräteanmeldung im Container. Der anschließende Lauf bestätigte Backend auf Linux/Windows, Windows-Dienst und echten Docker-Backup-/Restore-Smoke. Ein macOS-Dateinamentest prüft nun die unveränderliche Dateiidentität statt des unter langen Pfaden gekürzten Anzeigenamens. Die Signierprüfung ergänzt eine nur für den Wegwerf-CI-Runner geltende Zertifikatsfreigabe und stellt die Suchliste nach einem privaten Build wieder her. Beide echten macOS-Signier-/ACL-Tests bestanden im isolierten Lauf 37045313311. Reale Geräteabnahmen bleiben separat offen.

Die anschließende visuelle Prüfung und ihre aktuellen Testnachweise stehen in [VISUAL_AUDIT.md](VISUAL_AUDIT.md). Sie umfasst alle Routentypen in beiden Themes auf Desktop und Handy, die korrigierte Kalender-/Mensa-/Mailgestaltung sowie die gemeinsamen Formularfelder. Es wurde keine produktive Migration oder neue Installation vorgenommen.
