<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# UniOS: Regeln für die Oberfläche

UniOS führt Studierende von einer konkreten Handlung zur Quelle. Die Oberfläche zeigt zuerst, was heute neu, fällig oder sinnvoll zu lernen ist. Technische Zustände erscheinen nur, wenn sie eine Entscheidung erfordern.

| Bereich | Erste sichtbare Information | Zweite Ebene |
| --- | --- | --- |
| Heute | Nächste Aufgabe, neue Unterlagen, nächster Lernschritt | Aktivität und Statistik |
| Kurs | Nächste Veranstaltung, Material, Aufgabe, Notiz | Verlauf und Verwaltung |
| Lernen | Fortsetzen, fällige Karten, Übung, Fokuszyklus | Planung und Fortschritt |
| Eingang | Offene Einträge und eindeutige Hauptaktion | Zuordnung, Aufschub, Duplikat |
| Material | Scrollbares Dokument mit Suche und Markierungen | Export, Versionen und Metadaten |
| Einstellungen | Hochschule und Verbindungen | Systemzustand und Diagnose |

## Gestaltung

- Die Farben, Abstände und Oberflächen stehen in [`design/design-tokens.json`](design/design-tokens.json) und [`frontend/src/styles/theme-tokens.css`](../frontend/src/styles/theme-tokens.css). [`application.css`](../frontend/src/styles/application.css) legt die aktiven CSS-Schichten fest; [`workspace-layout.css`](../frontend/src/styles/workspace-layout.css) enthält gemeinsame Layoutregeln.
- Pro Ansicht gibt es eine dominante nächste Handlung. Weitere Aktionen stehen in einem benannten Menü oder Detailbereich.
- Überschrift, Abschnitt, Zeile, Metadaten und Status benutzen eine konsistente Textskala. Große leere Karten vermeiden.
- Die Hauptwege funktionieren bei 390 Pixeln ohne horizontales Scrollen. Tastaturfokus und Fehlermeldungen bleiben sichtbar.
- Leere Zustände nennen den nächsten möglichen Schritt. Offline und fehlende Schreibrechte werden in Alltagssprache erklärt.
- Smart Capture, Fokuszyklen und Anki zeigen ihre Ergebnisse im Kurskontext. Connectoren, Synchronisation und Agentenstatus bleiben unter Einstellungen → System.

Die Screenshots unter [`design/screenshots/unios-workspace/`](design/screenshots/unios-workspace/) zeigen den lokalen Demo-Modus mit erfundenen Daten. Sie dokumentieren die eigene App und enthalten keine fremden UI-Abbilder.
