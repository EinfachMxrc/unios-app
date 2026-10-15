<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Interne Lernpfad-Links – 09.10.2026

## Verhalten

Ein normaler Klick auf eine Markdown-Lektion wurde von der Notizansicht bereits
intern behandelt. Der danach aufgerufene globale native `_blank`-Handler
ignorierte `defaultPrevented` und öffnete zusätzlich den externen Browser.
Dieser Handler respektiert nun die vorherige Behandlung. Die Notizansicht
erkennt außerdem gleichursprüngliche absolute Links und relative Assessment-/
Coding-Links; die Markdown-Erweiterung verwendet dieselbe Routenprüfung.
Fremde Ursprünge, Zugangsdaten in URLs, Backslashes und Steuerzeichen werden
nicht als interne Arbeitsbereichslinks akzeptiert. Modifier-Klicks behalten ihr
bisheriges Verhalten. Externe HTTP(S)-Quellen bleiben extern.

## Prüfung

- Typecheck und vollständiger ESLint-Lauf bestanden.
- 15 gezielte Vitest-Tests (`useNoteLinks.test.tsx`, `App.test.tsx`) bestanden.
- Nativer Frontend-Build mit `VITE_UNIOS_DESKTOP=true` bestanden.
- Playwright `desktop-note-links.spec.ts`: eine synthetische Lektion und je eine
  relative bzw. absolute Übung öffnen sich im selben Fenster; die native Bridge
  erhält dabei keinen `open_external_url`-Aufruf. Ein externer Quellenklick
  erreicht die Bridge mit der korrekten URL. Kein zusätzliches Browserfenster.
- Lokales UI-Update: alle 277 Dateien des Builds per SHA-256 verifiziert,
  50 geänderte/neue Assets eingespielt, Einstieg erst danach aktiviert. Die
  vollständige bisherige Oberfläche wurde zuvor kopiert und per SHA-256 geprüft.
- `GET http://127.0.0.1:8000/notes`: HTTP 200, `private, no-store`, ausgeliefertes
  HTML bytegleich zum Build. HTML-SHA-256:
  `74ff11f7a03ee61c074b3b0f29cd07d10e16f850935b64f5dc9b1fb46e8efc02`.

Der Test verwendet ausschließlich synthetische Daten. Kein Backend-/Schema- oder
Serverupdate, kein neuer Installer. Basisstand: `6f1cf7732bc20d6d0788cc04e9723bf4c64bf8e5`.
Bereits geöffnete Fenster laden die Korrektur erst beim Neuladen/Neustart.
Die automatische Bridge-Prüfung ersetzt keine Behauptung eines beobachteten
nativen Fensters: die echte Windows-Ansicht konnte im Kontrollversuch nicht
zuverlässig aufgenommen werden.

## Lokale Aktivierung und Rückkehr

`scripts/apply_local_note_link_fix.py` nimmt einen nativen Build, einen neuen
Backup-Pfad und einen Nachweispfad entgegen. Es verändert ausschließlich die
installierte Frontend-Oberfläche unter `%LOCALAPPDATA%/UniOS/_internal/frontend/dist`.
Bestehende Assets bleiben erhalten. Die Rückkehr erfordert nur das gesicherte
`index.html`, da alle bisherigen Assets erhalten sind. Die vollständige
UI-Sicherung und der Dateinachweis liegen außerhalb des Repos bei den lokalen
Aufgabenartefakten (`ui-vor-linkkorrektur-20261009`, `ui-linkkorrektur-nachweis.json`).
