<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# UniOS Arbeitsbereich: Gestaltung

Der Arbeitsbereich bündelt Kurse, Notizen, Termine und Lernen in einer festen Navigation. Die Oberfläche soll wie ein persönlicher Schreibtisch wirken: klar lesbar, schnell zu überblicken und bei längeren Dokumenten ruhig. Die aktuellen Produktregeln stehen in [UI_PRINCIPLES.md](UI_PRINCIPLES.md).

## Referenzen und Entscheidungen

- [Notion](https://www.notion.com/help/navigate-with-the-sidebar): Die wiederkehrende Seitenleiste und klaren Dokumentflächen. Notizen haben einen kompakten Index über dem breiten Dokument. Die Ansichten für Fristen zeigen dieselben Daten als Tabelle, Board, Zeitleiste oder Kalender.
- [Obsidian](https://obsidian.md/): Die Nähe von Kursen, Notizen und verknüpften Quellen sowie ein ebenso sorgfältig gestalteter Dunkelmodus. `[[Notiztitel]]` bleibt Teil des vorhandenen Notizsystems.

## System

Die aktiven CSS-Schichten werden in `frontend/src/styles/application.css` festgelegt. `frontend/src/styles/theme-tokens.css` definiert die Tokens, `frontend/src/styles/workspace-layout.css` die gemeinsamen Layoutregeln; komponenteneigene Styles liegen bei ihren Komponenten. Eine kompakte Tokenübersicht steht in `docs/design/design-tokens.json`. Neue Komponenten verwenden diese Tokens. Die früheren unimportierten CSS-Quellen wurden entfernt; ihre Historie bleibt in Git erhalten.

| Element | Hell | Dunkel |
| --- | --- | --- |
| Hintergrund | `#fbfaf8` | `#1b1b1a` |
| Fläche | `#ffffff` | `#222221` |
| Text | `#252525` | `#eae9e6` |
| Navigation | `#f5f4f1` | `#222220` |
| Akzent | `#2b5870` | `#a4c6d6` |

Geist trägt Navigation, Bedienung und Dokumente. Abstände folgen überwiegend 8, 12, 16 und 24 Pixeln. Flächen haben feine Grenzen ohne Kartenschatten. Gedämpftes Blau markiert Auswahl und Handlungen.

## Ansichten

- **Heute:** Begrüßung und drei verlinkte Zahlen führen zu flachen Abschnitten für Fristen und Aktivität. Gruppenzuordnungen folgen nach dem Tagesinhalt.
- **Kurse:** Aktuelle Kurse stehen auch in der Seitenleiste; die Übersicht zeigt eine Galerie mit ruhigen Farbbannern und Semesterangabe.
- **Kurs:** Ein eigener Kursüberblick führt zu Unterlagen, Notizen und Aufgaben. Ein PDF öffnet sich direkt über seinen Dateinamen. Selten gebrauchte Werkzeuge sind einklappbar.
- **Seitenleiste:** Arbeitsbereich, Bibliothek und Kurse lassen sich unabhängig einklappen. Jeder aktuelle Kurs kann „Materialien“ und seine gefilterten „Notizen“ zeigen. Die Leiste ist zwischen 220 und 360 Pixeln breit, lässt sich am rechten Rand ziehen oder mit den Pfeiltasten anpassen und über die Schaltfläche oder `Strg/⌘+\\` ausblenden. Diese Einstellungen bleiben im Browser erhalten.
- **Termine:** Fristen und Ereignisse stehen vor technischem Quellenabgleich. Tabelle, Board, Zeitleiste und Kalender greifen auf dieselbe Antwort zu.
- **Notizen:** Ein kompakter Index steht über dem breiten Dokument; Lesen und Bearbeiten nutzen dieselbe Fläche. Der Titel erscheint im Lesetext einmal; Versionen und Dateipfad bleiben einklappbar.
- **Lernen:** Wochenstand und Karteikarten beginnen die Seite; Rechner und Arbeitsbereiche folgen in einer kompakten Anordnung.
- **PDF:** Seiten laufen beim Scrollen untereinander. Nur Seiten nahe am sichtbaren Bereich werden gerendert. Eine dauerhaft erreichbare Werkzeugleiste bündelt Suche, Seitensprung, Zoom und Einpassen. Auf dem Handy lässt sich für lesbaren Text vergrößern und horizontal im Dokument schwenken. Markierungen bleiben erhalten; die Seitenanzeige folgt dem Scrollen. Im Dunkelmodus kann die Papierdarstellung umgeschaltet werden.

Auf schmalen Bildschirmen ersetzt die untere Navigation die Desktopleiste. Fokusmarkierungen bleiben sichtbar; die Hauptseiten dürfen bei 390 Pixeln nicht horizontal scrollen. Eine eigenständige, interaktive Vorschau unter `docs/design/design-preview.html` zeigt einen älteren Entwurf ohne Backend oder echte Daten. Die App selbst und ihre Browser-Screenshots sind für die Abnahme maßgeblich. `frontend/scripts/design_walkthrough.mjs` führt mit dem lokalen Fake-Server durch Startseite, Kurs, PDF und Mitschrift und legt Desktop-, Dunkel- und Handyansichten dauerhaft unter `docs/design/screenshots/unios-workspace/` ab.
