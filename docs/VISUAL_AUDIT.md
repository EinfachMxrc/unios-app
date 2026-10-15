<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Visuelle Seitenprüfung, 02.10.2026

## Nachprüfung 03.10.2026, Version 0.1.16

44 Ansichten plus aufgeklappte Mail-Einrichtung erneut in Hell/Dunkel bei
1440 × 900 und 390 × 844 aufgenommen und als Kontaktübersichten selbst
angesehen. Zusätzlich: belegtes Raumangebot und leerer Heute-Stundenplan
in allen vier Varianten, insgesamt 188 Aufnahmen. Beide neuen Ansichten
zusätzlich in voller Größe geprüft. Testdaten bleiben erfunden; persönliche
Kursnamen, Loginfenster und echte Portalzustände waren nicht Teil dieser
Prüfung. Der Screenshot des Nutzers zeigte einen zuvor schlecht gelösten
Leerzustand: dieser wurde durch eine kompakte Stundenplanzeile ersetzt,
mit Abstand vor den folgenden Abschnitten. Ein Abruffehler bleibt sichtbar.

Acht gezielte Browserprüfungen bestanden, kein horizontaler Überlauf.
Lighthouse Accessibility auf der Heute-Seite: 100. Eine Screenshotprüfung
mit Testdaten ist keine Garantie für jede persönliche Datenmenge oder
für native macOS-/Linux-Fenster; die Geräteabnahme bleibt separat.

43 Ansichten einschließlich aller Routentypen, Notizeditor, Kurs-, Projekt-,
Material- und Addondetails sowie Lernsession wurden im Browser mit erfundenen
Daten geprüft. Je Ansicht: Hell/Dunkel bei 1440 × 900 und 390 × 844 Pixeln.
Zusätzlich wird die aufgeklappte Mail-Einrichtung aufgenommen. Die Screenshots
entstehen durch `frontend/e2e/ux-audit.spec.ts` unter `frontend/test-results/`.
Kontaktübersichten und die unteren Abschnitte langer Seiten wurden selbst
angesehen; auffällige Ansichten zusätzlich in voller Größe.

## Umgesetzte Korrekturen

- Gemeinsame Eingabefelder und vertikale Formulargruppen besitzen jetzt eine
  Gestaltung. Mehrzeilige Importfelder verwenden die verfügbare Breite, keine
  240-Pixel-Grenze von Auswahlfeldern. Fokus bleibt sichtbar.
- Direkt untereinander liegende Karten erhalten einen eigenen Abstand, auch
  in der aufgeklappten Mail-Einrichtung. Karten in Spalten behalten ihr Raster.
- Stundenplan: Uhrzeiten, Veranstaltung und Raum sind getrennt. Laufende Stunden
  tragen „Jetzt läuft“. Beendete Stunden verschwinden unter Heute und werden auf
  der Terminseite nur auf Wunsch wieder eingeblendet. Die Anzeige prüft die Zeit
  alle 30 Sekunden; UTC-Daten ohne Suffix werden wie im restlichen Frontend gelesen.
  Historische Tage bleiben ausdrücklich aufrufbar. Ohne Endzeit wird kein Ende erfunden.
- Der private Kalenderlink steht in einem eigenen beschrifteten Formular.
  Verbindungsverwaltung und Quellenverwaltung liegen in aufklappbaren Abschnitten.
  Offene Aufgaben, unklare Abgaben und Terminvorschläge bleiben direkt sichtbar.
- Mensa: Wochentag, Datumsauswahl, Vor/Zurück und Heute; Ernährung direkt im Kopf,
  automatisch gespeichert. Vegan filtert tatsächlich. Unbekannte Kennzeichnung
  gilt nicht als vegan. Hauptgerichte, Beilagen, Desserts und weitere Kategorien
  stammen aus getrennten, sequentiellen Abfragen der Quelle.
- Vorhandene Quellenfotos werden verzögert geladen. Keine Ersatzfotos oder
  erfundenen Gerichte. Der Bildabruf akzeptiert nur begrenzte JPEG/PNG/WebP-Dateien
  auf fest erlaubten SWO-Pfaden; keine beliebigen Hosts, Weiterleitungen oder SVGs.
  Mittagspausen-Einstellungen stehen aufklappbar am Ende des Speiseplans.
- Mail: Nachrichten und mögliche Fristen vor den Einrichtungsformularen.
  Weiterleitung, alternative Microsoft-Anbindung und Dateiimport bleiben unter
  „E-Mail-Verbindungen und Import“ erreichbar.
- Hintergrundaufträge und Connector-Katalog haben passende Formulare, Karten,
  lesbare Abstände und Umbruch für lange Bezeichner.
- Hochschulunterlagen und myCampus-Entdeckungsansicht stehen nicht mehr im
  Standardmenü „Mehr“. Die Hochschulunterlagen entfallen aus der Standardseitenleiste.
  Eigene angepinnte Bereiche, Inhalte und Suchtreffer bleiben erhalten.

## Bewertung nach Design-System-Prüfung

Die Punkte sind eine qualitative Einschätzung des geprüften Browserstands,
keine automatischen Qualitätswerte oder Garantie für jede Datenmenge.

| Dimension | Punkte / 10 | Befund und konkrete Stelle |
| --- | ---: | --- |
| Farben | 9 | Vorhandene Theme-Tokens statt neuer Palette; `frontend/src/App.css:903` |
| Schrift und Hierarchie | 9 | Tag, Veranstaltung und Nebeninformationen getrennt; `frontend/src/components/TimetablePanel.css:31` |
| Abstände | 8 | Ruhigere Formular- und Kartengruppen; `frontend/src/pages/MensaPage.css:24` |
| Komponenten | 9 | Gemeinsame Formularfelder und Textareas; `frontend/src/App.css:915` |
| Kleine Bildschirme | 9 | Alle 43 Ansichten ohne horizontalen Seitenüberlauf bei 390 Pixeln; `frontend/e2e/ux-audit.spec.ts` |
| Dunkles Farbschema | 9 | Alle Ansichten in beiden Themes angesehen; semantische Tokens in den neuen CSS-Dateien |
| Bewegung | 8 | Bestehende kurzen Übergänge und reduzierte Bewegung erhalten; Screenshots beenden Animationen für stabile Ansichten |
| Zugänglichkeit | 8 | Beschriftete Felder und sichtbarer Fokus; Lighthouse Heute 100. Echter Screenreader bleibt eine manuelle Abnahme |
| Informationsdichte | 9 | Mail- und Quellenverwaltung eingeklappt; Handlungsbedarf bleibt sichtbar; `frontend/src/pages/DeadlinesPage.tsx:149` |
| Details und Zustände | 8 | Fotos nur bei Quelle, unbekannte Kennzeichnung erklärt, laufende Stunden mit Text markiert; `frontend/src/components/TimetablePanel.css:81` |

## Nachweise und Grenzen

- Python-Gesamtlauf: 631 bestanden, 12 plattformbedingte Überspringungen.
  Zusätzlich drei portable Tests für begrenzte Signierbefehle und die Wiederherstellung
  der Suchliste bestanden. Zwei echte macOS-Keychain-/Signiertests bestanden im
  isolierten GitHub-Lauf [37045313311](https://github.com/EinfachMxrc/unios-app/actions/runs/37045313311).
- 331 Frontend-Unit-Tests; Typecheck, ESLint, Ruff, mypy (441 Dateien), Build,
  OpenAPI und Deutsch/Englisch-Abgleich bestanden.
- Browser-Gesamtlauf: 171 Abläufe, davon zunächst 167 bestanden. Vier Anpassungen
  waren notwendig (eingeklappte Einrichtung, sichtbare Terminvorschläge und gültige
  Projekt-Fixture). Alle vier bestanden anschließend im gezielten Lauf; insgesamt
  neun passende Kalender-, Mail-, Mensa- und Rundgangprüfungen bestanden.
- Lighthouse Accessibility: 100 auf Heute. Keine Behauptung einer Lighthouse-Messung
  jeder Unterseite. Alle gzip-Budgets aus `PERFORMANCE_BUDGETS.md` eingehalten.
- Bilder, echte Hochschulbestände, native Fenster und reale Geräte sind weiter
  nach `MANUELL_TESTEN.md` zu prüfen. Kein Zugang zu echten Hochschulkonten genutzt.
  Diese Codeänderungen sind kein bereits installiertes oder produktiv migriertes Release.
