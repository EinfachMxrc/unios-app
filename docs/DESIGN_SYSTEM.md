<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# UniOS Oberflächensystem

UniOS zeigt Studierenden zuerst ihre nächste Handlung. Verwaltungs- und Infrastrukturinformationen folgen erst im passenden Detailbereich. Die Variablen in `frontend/src/styles/theme-tokens.css`, die CSS-Schichten in `frontend/src/styles/application.css`, die gemeinsamen Layoutregeln in `frontend/src/styles/workspace-layout.css` und die Komponenten `Shell`, `Panel`, `Empty`, `Loading`, `Failure` und die Radix-Dialoge bilden die Implementierung.

## Hierarchie

1. **Seite:** ein `h1` und optional ein kurzer Kontextsatz.
2. **Nächster Schritt:** maximal eine dominante Aktion im sichtbaren Einstieg.
3. **Arbeitsinhalt:** kompakte Abschnitte mit verständlichen Titeln und Zeilen statt einer KPI-Wand.
4. **Eigenschaften und Verlauf:** sekundär, bei Bedarf aufklappbar oder als Peek.
5. **Technik:** Einstellungen → System → Erweiterte Ansicht; Connector-Paketdaten zusätzlich unter „Technische Details“.

## Tokens

| Zweck | Wert und Einsatz |
| --- | --- |
| Schrift | Geist Variable; normale Zeile ca. 0,84 rem, Metadaten 0,72–0,78 rem, Seitentitel 2,05–2,55 rem am Desktop und 1,9–2,1 rem mobil. |
| Abstand | 4/8/12/16/24/32 px. Zeilen erhalten mindestens 40 px Höhe, mobile Aktionen mindestens 44 px. |
| Flächen | `--app-bg` für die Arbeitsfläche, `--app-surface` für Dialoge/Formulare, `--app-surface-alt` für dezente Hervorhebung. Keine Schatten ohne Grund. |
| Trennung | `--app-border` für ruhige Linien; Karten meist 7–9 px Radius, Eingaben 6–8 px. |
| Farbe | `--app-text`, `--app-muted`, `--app-blue` für Aktionen. Statusfarben nur bei echter Warnung/Fehler, nicht als Dekor. Alle Farben haben Hell/Dunkel-Varianten. |
| Fokus | Sichtbarer `--ring`-Umriss. Icons brauchen Text oder einen zugänglichen Namen. |

## Muster

- **Navigation:** Desktop zeigt Heute, Kurse, Termine, Lernen, Eingang. Mobil zeigt Heute, Kurse, Lernen, Mehr; die Suche bleibt in der oberen Leiste. Notiz/Schnellerfassung ist in höchstens zwei Interaktionen erreichbar. Lernüberblick und Karteikarten teilen denselben Bereich und zeigen denselben Bereichswechsel.
- **Primäraktion:** ein gefüllter Button. Zweitaktionen sind Link/Outline, seltene Aktionen in „Mehr“ oder einem beschrifteten `details`. Löschen/Freigabeentzug braucht Bestätigung.
- **Peek:** Aufgaben und Fristen öffnen in einem Drawer, der die vorherige Liste erhält. Mobil wird daraus ein Bottom Sheet. Details werden beim Öffnen geladen. Material, Prüfungen und Themen sollen bei späteren Detailansichten dieselbe Öffnen/Schließen-, Fokus- und Zurück-Sprache nutzen.
- **Eingang:** Auf dem Handy öffnet ein Tap auf den Eintrag die Zuordnung als Bottom Sheet. Die Liste bleibt sichtbar und verliert beim Schließen ihre Position nicht.
- **Hochschulwahl:** Suche und Ergebnis-Karten statt einer langen Auswahlliste. Namen und vorgesehene Verbindungen erklären das Profil, ohne eine aktive Verbindung vorzutäuschen.
- **Identität:** Das gefaltete „U“ kennzeichnet UniOS, bleibt aber klein. Die Inhaltsflächen bleiben ruhig; Markenfarbe dient der Orientierung, nicht als Dekoration.
- **Listen:** Titel zuerst, darunter Quelle/Kurs/Zeit als Metadaten. Filter als einfache Ansichts-Tabs; komplexe Bedingungen nur unter „Filter und Ansicht anpassen“.
- **PDF:** Dokumentfläche und Scrollen bleiben im Fokus. Seite und Suche stehen fest am Lesebereich; Zoom/Farben unter „Ansicht“, Downloads und Mitschrift unter „Mehr“.
- **Zustände:** Loading mit Skeleton, Empty mit konkreter Einstiegshandlung, Error mit nächstem Versuch, Offline als sachlicher Hinweis. Keine rohen HTTP-, Python- oder API-Pfade für normale Nutzer.
- **Sprache:** „Kurse lesen“ statt `courses.read`, „Dieses Gerät kann deine Daten gerade nur lesen“ statt Lease-Begriffen. Technische Codes bleiben in „Technische Details“.

## Abnahme pro geänderter Ansicht

Desktop und 390 px, Hell und Dunkel prüfen; keine horizontale Dokumentbreite über dem Viewport. Tastaturfokus und Escape für Dialoge prüfen. Ladesituation, leerer Zustand, Fehler und Offline-Hinweis auf konkrete Folgehandlungen prüfen. Bestehende Playwright-Flows mit Fake-Daten müssen erhalten bleiben.
