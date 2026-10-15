<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Frontend und PWA

Die UniOS-Oberfläche ist eine React/TypeScript-App mit Vite. Die PWA spricht die lokale FastAPI-Schnittstelle des Hosts.

## Entwicklung

Der Frontend-Code liegt unter frontend/. Typecheck, Lint, Vitest und Build werden über npm-Skripte ausgeführt. Für geänderte Hauptabläufe gibt es Playwright-Tests mit Fake-Daten. Prüfe Desktop, 390-Pixel-Ansicht, helle und dunkle Variante sowie reduzierte Bewegung, wenn du eine Ansicht wesentlich änderst.

## Daten und Zustände

Die Oberfläche soll nur Werte anzeigen, die der Host tatsächlich kennt. Fehler, Speichern und Erfolg werden am Auslöser sichtbar; eine ausbleibende Hochschulantwort darf nicht als Erfolg erscheinen. UI-Regeln und Abnahme stehen im [Design-System](https://github.com/EinfachMxrc/unios-app/blob/main/docs/DESIGN_SYSTEM.md).
