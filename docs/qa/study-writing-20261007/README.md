<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Mitschreib-Paket: Prüfbelege

07.10.2026, Windows, Node 24.19.0, Chrome. Ausschließlich lokale synthetische
Notizen und PDF-Fixtures; kein echtes Hochschulkonto oder Produktionsbestand.

| Prüfung | Ergebnis |
| --- | --- |
| Typecheck, ESLint, i18n | Bestanden; deutsche/englische Schlüssel konsistent |
| Vitest (77 Dateien) | 689 bestanden |
| Build/PWA | Bestanden; 335 Precache-Einträge, einschließlich lokaler MathLive-Fonts |
| Playwright, drei betroffene Specs | 37 bestanden, keine Skips/Retry, 1,1 min |
| Lighthouse 13.5.0, acht echte geöffnete Dialoge | Jeweils Accessibility 100; keine fehlgeschlagenen numerischen Audits |

Die Browserfälle prüfen Bruch mit erstem Tastendruck, Tab und Nenner, Bearbeiten/
Abbrechen, persistentes Markdown und Wiederdarstellung; Matrix über Slash am
Absatzanfang, vier Tastaturfelder, Strg/⌘+Enter und Undo/Redo; Wahrheitstabellen
und ungültige Ausdrücke; Cursor-Einfügen neben dem PDF und Entwurf nach Neuladen.
Im 120-Seiten-PDF bleiben weniger als 20 Vorschaubilder gerendert und Seite 120
ist erreichbar. Bestehende Such-/Markierungs-/Pinch-/Pan-/Split-Flows bestehen.
Die neue Formel-Eingabe erzeugt im Browsertest keine externen Netzwerkanfragen.

Die zehn Bilder zeigen Formeln und Logik in beiden Themes und Fenstergrößen
sowie die tatsächliche Zifferneingabe per sichtbarer Bildschirmtastatur bei 390 px.
Die zusätzlichen Reader-Bilder sichern den getesteten aktuellen Reader-Zustand,
ohne historische Belege zu überschreiben. Alle Bilder wurden visuell geprüft:
keine horizontale Seitenüberbreite, vollständige Aktionen, lesbare Formeln/Tabelle.
Die Tastatur ersetzt während des Öffnens die Vorlagen, damit das Eingabefeld sichtbar bleibt.

Reproduktion im Frontend nach `npm ci`, mit Node 24:

```text
npm run typecheck
npm run lint
npm run i18n:check
node node_modules/vitest/vitest.mjs run src --configLoader native
npm run build
npm run e2e:focused -- study-writing.spec.ts note-studio.spec.ts reader-workspace.spec.ts
```

Aus dem Projektroot:

```text
node scripts/audit_study_writing.mjs --fake-data
python scripts/check_spdx.py
```

Der Audit startet eigene Fake-Dienste auf 8194/4194 und beendet nur seine eigenen
Prozesse. Vollberichte liegen lokal unter `dist/research/study-writing-lighthouse`;
die kompakte [Messung](lighthouse-summary.json) enthält den Hash des geprüften Builds.
Chrome muss installiert sein; `CHROME_PATH` kann den Pfad vorgeben.

Diese Paket-Abnahme ersetzt keine neue vollständige Release-/Plattformmatrix.
Kein echter Safari-/MacBook-/Unterrichtsversuch oder Gleichheit mit Handschrift
behauptet.
