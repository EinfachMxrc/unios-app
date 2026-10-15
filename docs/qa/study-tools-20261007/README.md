<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Lernwerkzeuge: lokale Abnahme vom 07.10.2026

Dieses Paket setzt die im Studienausblick priorisierten Schreibhilfen um.
Es erweitert den lokalen Quellstand, keine neue Desktop-/Serververöffentlichung.
Alle Tests arbeiten ausschließlich mit erfundenen Fixtures und eigenen
temporären Fake-Diensten. Echte Originalunterlagen, `data/`, `local/`,
Schlüssel und Hochschulkonten wurden nicht verwendet.

## Reibung, Bedienung und Umsetzung

| Reibungspunkt | Bedienkonzept | Umsetzung |
| --- | --- | --- |
| Formelzeichen suchen, Syntax merken | Visuelles Feld, 40 suchbare Vorlagen, Tab, Strg/⌘+Enter | `MathEntryDialog`, `mathTemplates`, sichere KaTeX-Makros |
| Werte in 01011-Tabellen manuell berechnen | Ausgangsbasis wählen, sofort vier Basen; Bitbreite/Stellenwerte optional | `numberSystems`, BigInt-Brüche, gewöhnliche Markdown-Tabelle |
| Logikbelegungen/Normalformen mühsam übertragen | DNF/KNF und Gray-KV; Gruppen mit Tab/Leertaste prüfen | `logicForms`, `TruthTableDialog`, ohne eval |
| Konzepte und Abläufe zu langsam zeichnen | Pro Zeile `Start -> Ziel : Beschriftung`; sofortiges Diagramm | `studyModels`, React-SVG, editierbarer `StudyBlock` |
| Lösung wird beim Lernen zu früh gelesen | Frage und zunächst verdeckte Lösung; Mathe im selben Eingabefluss | `StudyHelperDialog`, `RecallView`, bestehender `PracticePanel` |
| Grafik oder schwierige Formel aus dem PDF abschreiben | Auswahl mit Pointer oder Prozentfeldern, Bild plus Quellenlink | `PdfClipTool`, vorhandene private Medien-API, `appendReaderBlock` |
| Notizfluss wird nach dem Einfügen unterbrochen | Fokus/Cursor wieder im Feld; Absatz nach Tabellen/Diagrammen | `StudyInsertTools`, `insertStudyMarkdown`, Enter abfangen vor MathLive |
| Quellen/Projekt/Code/Statistik neu formatieren | Ein gemeinsamer Werkzeugdialog, seltene Optionen eingeklappt | `StudyHelperDialog`, portable Tabellen und Vorlagen |

## Automatisch geprüft

- Alle **701 Frontendtests** in 78 Dateien bestanden; Typecheck, vollständiger
  ESLint-Lauf, de/en-i18n-Prüfung und Produktionsbuild bestanden.
- **54 betroffene Playwright-Fälle**, ohne Skip/Retry, Windows Chrome:
  `study-tools`, `study-writing`, `reader-workspace`, `note-studio`, `practice`.
  Neue Tastaturabläufe plus bestehende Notiz-, Medien-, Übungs- und Readerflüsse.
- Formel-Roundtrip, 3×2-Matrix, Platzhalter, mehrzeiliges LaTeX, MathLive-Aliasse,
  Undo, exakte große Zahlen, Zweierkomplement, DNF/KNF, KV-Gruppen,
  Diagrammbearbeitung, Lösung nach Reload verdeckt, Übungsantwort im Verlauf.
- PDF-Bildausschnitt: fehlgeschlagener Upload erhält den Text; Tastaturwiederholung
  speichert ein echtes PNG; Reload erhält die Mitschrift; Quellenlink zeigt das
  normierte Rechteck. Die Original-PDF wird nicht geändert.
- 120-Seiten-PDF: verankerter Pinch-Zoom, Panning, inertiale Swipe-Folge,
  Quellenauswahl und Split-Wechsel aus der bisherigen Reader-Regressionssuite.
- Mathe, Diagramm, KV und Reader in Dark/Light bei 1440 und 390 px abgebildet.
  Dialoge kompakter; Einfügen-Aktion bleibt sichtbar, kein Seitenüberlauf.
- Lighthouse **13.5.0**, **24 tatsächliche Dialog-Snapshots**, jeweils
  Accessibility **100**: Formel, KV, Zahlensysteme, Diagramm, verdeckte Lösung,
  PDF-Ausschnitt × Dark/Light × 1440/390 px. Details, Messzeit und Build-Hash
  stehen in [lighthouse-summary.json](lighthouse-summary.json).
- SPDX-/Herkunftsprüfung und `git diff --check` bestanden. Neue Dateien tragen
  AGPL-Kennung. Keine neue Dependency und keine Datenbankmigration.

## Nachvollziehbar erneut ausführen

In `frontend/`, unterstütztes Node 24 im PATH:

```powershell
npm run typecheck
npm run lint
npm run i18n:check
node node_modules/vitest/vitest.mjs run --configLoader native src
npm run build
$env:UNIOS_QA_DIRECTORY='docs/qa/study-tools-20261007'
npm run e2e:focused -- study-tools.spec.ts study-writing.spec.ts reader-workspace.spec.ts note-studio.spec.ts practice.spec.ts
```

Vom Repository-Stamm: `node scripts/audit_study_writing.mjs --fake-data
--expanded-tools`. Die eigenen Fake-Dienste benutzen 8196/4196. Belegte Ports
werden abgewiesen; nur eigene Prozesse werden beendet. Rohberichte bleiben
unter dem ignorierten `dist/research/`. Historische QA-Bilder bleiben erhalten.

## Grenzen der Abnahme

Das ist eine Abnahme dieses Frontendpakets, kein kompletter Phasen-/Release-
oder Plattformlauf. Native macOS/Safari, OS-Kürzel auf der eigenen deutschen
Tastatur, Screenreaderbedienung und persönliches Unterrichtstempo benötigen
den [echten Test](../../MANUELL_TESTEN.md). Vollständige TeX-Dokumente/TikZ,
symbolische Lösung, automatische globale KV-Minimierung und ein vollständiger
UML-/ER-Canvas-Editor gehören nicht zu diesem Paket. Diagramme/Übungen werden
außerhalb UniOS als lesbarer Codeblock erhalten.

[Bedienung und Grenzen](../../STUDY_TOOLS.md)
