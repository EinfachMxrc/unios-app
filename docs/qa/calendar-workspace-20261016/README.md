<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Kalender nach der gewünschten Referenz

Der Stundenplan verwendet eine Monatsnavigation links, ein größeres Zeitraster
mit pastellfarbenen Terminflächen und auf breiten Fenstern eine Tagesübersicht
rechts. Die Terminseite nutzt die verfügbare Fensterbreite. Die Umsetzung ist
eigener React-/CSS-Code; die Referenzgrafik wird nicht mit ausgeliefert.

## Verhalten

- Ab 1.101 Pixeln: Mini-Monat mit Monatswechsel, markierter Woche, ausgewähltem
  Datum und heutigem Tag. Pfeiltasten bewegen um einen Tag bzw. eine Woche;
  Pos1/Ende wählen Wochenanfang/-ende. Monatsgrenzen behalten den Tastaturfokus.
- Die Liste „Meine Termine“ blendet gleichnamige Veranstaltungen nach dem
  vorhandenen Titelsplitting gemeinsam aus oder ein. Farben entsprechen dem
  Raster. Die Auswahl gilt für diese geöffnete Kalenderansicht und schreibt
  keine Kalenderdaten auf den Server. Bei schmaleren Fenstern sind alle Termine
  wieder sichtbar; die Filterauswahl bleibt für die breite Ansicht erhalten.
- Ab 1.700 Pixeln: „Dein Tag“ mit Uhrzeiten, vollständigen Titeln und Orten;
  ein Klick öffnet dieselben Termindetails. Fokus kehrt nach dem Schließen zurück.
- Bei 390 Pixeln bleibt die Tagesagenda mit vollständigen Titeln, Uhrzeiten und
  Räumen erhalten. Arbeitswoche, Woche, Tag, Liste und große Ansicht bleiben
  verfügbar. Wochenendtage aus dem Mini-Monat öffnen direkt die Tagesansicht.
- Bearbeiten, Verschieben, beide Zeitgriffe, persönliche Anpassungen,
  Serienumfang, Fehlerrücknahme und Rückgängig verwenden die bisherigen APIs.

Bei der Browserprüfung wurde eine bestehende Lücke zwischen Änderungsantwort
und nachgeladenen Seriendaten sichtbar: Nach Rückgängig konnte ein schnell
geöffneter Editor seine Serienauswahl verlieren. Der Editor ergänzt jetzt die
nachgeladenen Angaben nur bei unveränderter Terminrevision. Entwurf und
Konfliktprüfung bleiben erhalten. Zwei Vitest-Fälle prüfen Entwurfserhalt und
das Ablehnen von Metadaten einer neueren Revision.

## Prüfstand

Abschließender Stand: 1.469 Vitest-Fälle in 182 Dateien bestanden, Typecheck,
ESLint, Übersetzungsprüfung (73 Namensräume) und Frontend-Build bestanden.
Alle 33 Browserfälle aus `calendar-workspace`, `calendar-apple`,
`calendar-workweek`, `calendar-editing`, `calendar-polish` und
`calendar-visibility` bestanden in einem Lauf (1,1 Minuten, keine Retries).
16 Lighthouse-Snapshots der gebauten Kalender-, Monats-, Detail- und
Formularansichten in Hell/Dunkel bei 1.440/390 Pixeln erreichen 96–100
Accessibility ohne Laufzeitfehler. Die verbleibenden Lighthouse-Hinweise
betreffen zugängliche Namen und überlappende Zeitgriffe; es wurden keine
Kontrastfehler gemeldet.
Alle Prüfungen verwenden lokale Fake-Dienste und erfundene Veranstaltungen.
Es gibt keine Änderung an API, Datenbankschema oder Abhängigkeiten.

Die Galerie `workspace-{light,dark}-{1920,1440,1024,390}.png` zeigt die gebaute
App. Die Kalender-, Monats-, Detail- und Formularansichten des abschließenden
Lighthouse-Laufs stehen unter `accessibility-final/`; `accessibility/` bewahrt
den ersten Kontrollstand. Die vollständigen Lighthouse-Berichte bleiben als
generierte lokale Artefakte unter `dist/research/calendar-lighthouse/`.

Die Screenshots wurden visuell auf abgeschnittene Inhalte, Farben, Hierarchie
und seitlichen Überlauf geprüft. Dichte Überlappungen kürzen Titel im Raster;
zugängliche Namen, Termindetails und die Tagesübersicht behalten den Inhalt.
Kein Backend-Gesamtlauf, keine vollständige projektweite Playwright-Suite und
keine erneute native Installation oder Serveraktivierung sind Teil dieses
Frontend-Arbeitspakets. Native Trackpad-Bedienung bleibt ein manueller Gerätetest.
