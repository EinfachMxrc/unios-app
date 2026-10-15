<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Messbare Performance-Budgets

`npm run e2e:focused -- performance.spec.ts` prüft fünf Stichproben je Ablauf
gegen den lokalen Fixture-Server. P95 ist bei fünf Werten der größte Wert.
Die Ergebnisse werden als `performance.json` im Playwright-Bericht gespeichert.

| Ablauf | Obergrenze |
| --- | ---: |
| Neue Browsernavigation bis Heute-Daten sichtbar | 3000 ms |
| Interne Navigation bis Heute-Daten sichtbar | 1500 ms |
| Heute-API, vollständige Antwort einschließlich JSON | 500 ms |
| Suche bis tatsächlicher PDF-Treffer sichtbar | 1000 ms |
| PDF öffnen bis Canvas und Text der Fundseite sichtbar | 3000 ms |
| Ctrl+K bis Palette sichtbar | 300 ms |

`node scripts/check-bundle-budget.mjs` prüft nach dem Build feste gzip-Budgets:
Hauptchunk 220 KiB, PDF-Ansicht 250 KiB, PDF-Worker 450 KiB. Die CI führt diese
Prüfung und den Browser-Messlauf aus. Grenzen werden nicht automatisch erhöht.

Sekundäre Ansichten laden erst beim Öffnen. Strukturierte Suchanfragen rufen
keine zusätzlichen Legacy-Suchen auf. Die Anki-Ansichtsabfrage verwendet für
höchstens 30 Sekunden einen begrenzten Cache; Collection-/WAL-Änderungen
invalidieren ihn unmittelbar. Antworten werden kopiert, damit Aufrufer den
Cache nicht verändern können.

Diese Messung ersetzt keinen nativen Kaltstart-Test und keinen großen Bestand
auf Zielhardware. Windows, macOS und Linux benötigen weiterhin einen gemessenen
Installationsstart sowie reale 500-Seiten-/300-MB-Abnahmen. Die bestehende
Reader-Abnahme prüft virtualisiertes Scrollen und gemischte Seitenformate.
