<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Navigation und UI-Aufräumen – 04.10.2026

44 Aufnahmen der gebauten React-App mit ausschließlich erfundenen Daten des
lokalen Fake-Servers. Elf Ansichten, jeweils hell/dunkel und 1440/390 Pixel breit;
Viewport-Höhe 1000 Pixel, vollständige Seitenaufnahme. Feste Navigationsleisten
bleiben im Bild an ihrer ursprünglichen Viewport-Position. Die Bilder sind keine
Mockups, enthalten keine echten Hochschuldaten und wurden visuell geprüft.
Die lange Einstellungsseite wurde zusätzlich in lesbaren Ausschnitten kontrolliert.

| Ansicht | Desktop hell | Desktop dunkel | Handy hell | Handy dunkel |
|---|---|---|---|---|
| Heute | [Bild](today-light-1440.png) | [Bild](today-dark-1440.png) | [Bild](today-light-390.png) | [Bild](today-dark-390.png) |
| Kurse | [Bild](courses-light-1440.png) | [Bild](courses-dark-1440.png) | [Bild](courses-light-390.png) | [Bild](courses-dark-390.png) |
| Lernen | [Bild](learning-light-1440.png) | [Bild](learning-dark-1440.png) | [Bild](learning-light-390.png) | [Bild](learning-dark-390.png) |
| Termine | [Bild](deadlines-light-1440.png) | [Bild](deadlines-dark-1440.png) | [Bild](deadlines-light-390.png) | [Bild](deadlines-dark-390.png) |
| Suche | [Bild](search-light-1440.png) | [Bild](search-dark-1440.png) | [Bild](search-light-390.png) | [Bild](search-dark-390.png) |
| Programmieren | [Bild](coding-light-1440.png) | [Bild](coding-dark-1440.png) | [Bild](coding-light-390.png) | [Bild](coding-dark-390.png) |
| Wissen anwenden | [Bild](assessment-light-1440.png) | [Bild](assessment-dark-1440.png) | [Bild](assessment-light-390.png) | [Bild](assessment-dark-390.png) |
| Einstellungen | [Bild](settings-light-1440.png) | [Bild](settings-dark-1440.png) | [Bild](settings-light-390.png) | [Bild](settings-dark-390.png) |
| Mehr | [Bild](more-light-1440.png) | [Bild](more-dark-1440.png) | [Bild](more-light-390.png) | [Bild](more-dark-390.png) |
| Notizeditor | [Bild](note-light-1440.png) | [Bild](note-dark-1440.png) | [Bild](note-light-390.png) | [Bild](note-dark-390.png) |
| PDF | [Bild](pdf-light-1440.png) | [Bild](pdf-dark-1440.png) | [Bild](pdf-light-390.png) | [Bild](pdf-dark-390.png) |

## Verhaltensprüfung

Der [Aufgabenbericht](missions.json) dokumentiert 20 bestandene automatisierte
Abläufe des vollständigen Laufs mit 265 Browsertests. Die Zeitwerte schließen
Navigation und Assertions am lokalen Fake-Server ein; sie messen weder
menschliche Bedienzeit noch eine Verbesserung gegenüber früheren Versionen.

## Reproduzieren

Nach dem Produktionsbuild in `frontend/`:

```powershell
$env:QUALITY_GALLERY_DIR='navigation-cleanup-20261004'
npm run e2e:focused -- quality-gallery.spec.ts
```

Ohne diese Variable landet die Galerie in `frontend/test-results/quality-gallery`;
alte dokumentierte Bilder werden damit nicht beim normalen Testlauf überschrieben.

Geprüft wurden Abstände, Typografie, Farben, Überlauf, mobile Tab-Navigation,
Kopfleiste, PDF-Bedienelemente und die fünf Einstellungsabschnitte. Weitere
Verhaltensprüfungen und Ergebnisse stehen im [Fortschritt](../../PROGRESS.md) und
im [Architekturbericht](../../NAVIGATION_CLEANUP.md). Browserbilder ersetzen keine
native Prüfung von macOS/Linux, Schlüsselbund, Schlafmodus oder Updates.

Dies ist der Entwicklungsstand nach Alpha 0.1.19. Die bisherigen veröffentlichten
Installer enthalten diese Änderungen noch nicht.
