<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Alpha-Härtung · 04.10.2026

Ausschließlich erfundene lokale Daten; keine Hochschulanmeldung, privaten Dateien
oder Live-Server-Updates. Python 3.13.5, Windows 11, AMD64 Family 26 Model 68,
16 logische CPUs (AMD Ryzen 7 9800X3D), 31,1 GiB vom System gemeldeter RAM.
Parallel liefen unabhängige Tests; kein isolierter Hardware-
Benchmark oder Vorher/Nachher-Vergleich.

## Pipeline

`scripts/pipeline_benchmark.py --documents 55 --script-pages 500 --output …`
erzeugt echte Text-PDFs, importiert Originale durch `SyncEngine`, indiziert das
große Skript durch `IndexJobs`, veröffentlicht den Corpus und verwendet produktive
Snapshot-/Restore-Staging-Funktionen in einem getrennten Fake-Home.

| Messung | Ergebnis |
| --- | --- |
| Dateien / Seiten / Originalgröße | 56 PDFs / 775 Seiten / 438.438 Bytes |
| Import inklusive kleiner PDF-Extraktion | 48,49 s |
| Hintergrundindex des 500-Seiten-Skripts | 1,39 s |
| Corpus-Erstveröffentlichung | 46,64 s / 776 Chunks |
| Snapshot mit Prüfung | 0,15 s |
| Restore-Staging / Integrität | 0,04 s / `ok`, 56 Fassungen und 776 Chunks |
| 15 feste natürliche Suchformulierungen | Recall@5/20 = 1, MRR = 1 |
| Suche kalt p50/p95 | 2,26 / 2,81 ms |
| Kursliste | 50 von 56 Materialien, keine vollständige Versionshistorie |

[Rohdaten](pipeline.json). Kleine generierte Dateien und einfache Inhalte beweisen
weder große reale Dateigrößen noch natürliche Trefferqualität über tausende
Studienunterlagen. Keine manuelle Relevanzbewertung, externen Nutzer oder native
Recovery. Restore prüft eine getrennte Stagingkopie, Integrität und Mengen,
nicht eine frische installierte App.

`scripts/ocr_benchmark.py` prüft lokale deutsche/englische Tesseract-Daten und
misst bei Verfügbarkeit eine erzeugte reine Bild-PDF durch den OCR-Service.
Hier **nicht verfügbar**, deshalb kein OCR-Latenzwert. [OCR-Status](ocr.json).
Fake-OCR-Tests ersetzen diesen Nachweis nicht.

## Visuelle und funktionale Abnahme

44 Browseraufnahmen: elf Hauptabläufe, Hell/Dunkel, 1440/390 px,
`quality-gallery.spec.ts`. Synthetische Missionen messen echte Browserinteraktionen
mit lokalen Fakes inklusive Navigation und Assertions; keine Usabilitystudie.
Alle 44 Aufnahmen selbst visuell geprüft. Die feststehende Navigation in langen
Ganzseitenbildern wird von Chromium einmal am ursprünglichen Viewport abgebildet;
das ist keine zweite Navigationsleiste im Produkt.

Bestanden: vollständiger Python-Lauf mit 845 Tests, zwölf übersprungen;
elf ergänzende gezielte Tests inklusive Paketfreigabe und Windows-Prozessbaum;
425 Vitest-Tests und vollständiger Playwright-Lauf mit 257 Tests;
abschließend zwölf Kurs-/Katalog-/Kontextfälle am letzten Build bestanden.
Ruff, mypy (529 Quelldateien), TypeScript, ESLint, OpenAPI und Übersetzungen grün.
Lighthouse Accessibility 100; Lighthouse 11 PWA 100 (Legacy-PWA-Prüfung).
Die aktuellen Bundlegrößen liegen innerhalb der festgelegten Grenzen.

Die [20 automatisierten Missionen](missions.json) haben keine Fehler oder
Abbrüche: p50 304 ms, p95 1.014 ms. Enthalten sind lokale Navigation,
Interaktionen und Assertions; kein Vergleich zur vorherigen App-Version und
kein Nachweis menschlicher Bearbeitungszeit.

Docker lokal mangels laufendem Daemon nicht ausführbar. Native Geräte,
Signierung, externe Woche und reale Hochschul-/Work-Verbindungen bleiben
in [Release-Abnahme](../../RELEASE_READINESS.md) offen.
