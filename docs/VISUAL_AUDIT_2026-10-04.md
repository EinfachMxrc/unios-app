<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Darstellungsprüfung vom 4. Oktober 2026

## Anlass und behobene Fehler

Der gemeldete Screenshot zeigte eine zweizeilige Kopfzeile. Die Glocke war
ein zusätzliches direktes Kind eines Rasters mit drei Spalten. Suche und
Aktionen mit festgelegten Spalten wurden dadurch in eine zweite Zeile gesetzt.

- Glocke in die gemeinsame Aktionsgruppe verschoben. Breadcrumb, Suche und
  Aktionen haben explizite Rasterbereiche in derselben Zeile.
- Kopfzeilenregeln aus vier sich überlagernden CSS-Dateien in
  `frontend/src/components/Shell.css` zusammengeführt.
- Mindestbreiten verhindern überlappende Aktionen direkt oberhalb des
  mobilen Umbruchs bei 901 px und breiter Seitenleiste.
- Benachrichtigungszahl ab 100 kompakt als `99+`; der genaue Wert bleibt im
  zugänglichen Titel erhalten.
- Die Startseitenabschnitte verwenden ihre verfügbare Breite für den
  Spaltenwechsel. Bei 901 px mit einer 360 px breiten Seitenleiste stehen sie
  untereinander, statt Überschriften und Inhalte in schmale Spalten zu pressen.
- Eingabefelder der Hochschul-/Studiengangseinrichtung erhalten dieselben
  sichtbaren Grenzen und Innenabstände wie andere Formulare.
- Schriftgrößen-Auswahl und Benachrichtigungsfilter verwenden die vorhandenen
  Formularstile; Filterbeschriftung und Aktionen haben getrennte Abstände.

## Tatsächlich betrachtete Ansichten

47 Seitenansichten plus aufgeklappte Mail-Einstellungen und PDF ergeben
49 Ansichten × zwei Farbschemata × zwei Fenstergrößen = 196 Screenshots.
Desktop: 1440 × 900 px. Handy: 390 × 844 px. Die Bilder wurden als Kontaktbögen
visuell durchgesehen; geänderte Formulare, neue Prüfungs-/Coding-/Importseiten,
Kopfzeilen und die Raumbelegungsansicht zusätzlich größer betrachtet.

| Bereich | Ansichten |
| --- | --- |
| Studium | Heute, Kurse, Kursdetail, Hochschulunterlagen, myCampus, Termine, Mensa, Räume |
| Wissen | Suche, Notizen leer, Notizeditor, PDF, Eingang, eigene Dateien, Sammlungen, Sprachnotizen |
| Lernen | Übersicht, Karteikarten, Lernsession, Prüfungsaufgaben, Coding, Übungen, KI-Erklärungen, Kartenvorschläge, Lernanalyse, Noten |
| Organisation | Projekte, Projektdetail, Smart Capture, Studientag, datierter Studientag, Wochenüberblick, Regeln |
| System | Einstellungen, Einrichtung, Willkommen, Import, System, Uni-Mail, Mail-Einstellungen, Benachrichtigungen, Aktivitätsverlauf, Aufträge |
| Navigation/Erweiterungen | Mehr, Erweiterungen, Erweiterungsdetail, Connector-Katalog, nicht gefundene Seite |

Lokale Bildübersicht: `../.tmp/visual-audit-final-20261004/index.html`.
Sie enthält ausschließlich erfundene Testdaten. Bilder in voller Größe lassen
sich durch Anklicken öffnen. Die Galerie ist kein Teil des ausgelieferten UI.

## Bewertung nach Design-System-Skill

Die Punkte sind eine manuelle Einschätzung der betrachteten Ansichten,
keine gemessene Barrierefreiheits- oder Nutzerstudie.

| Dimension | /10 | Befund und konkrete Behandlung |
| --- | --- | --- |
| Farben | 8 | Gemeinsame Oberflächenfarben; keine neue Palette. `Shell.css` nutzt vorhandene Tokens. |
| Schrifthierarchie | 7 | Überschriften und Nebeninfos unterscheidbar. Kleine technische Nebeninfos auf langen Systemseiten bleiben dichter. |
| Abstände | 7 | Kopfzeile vereinheitlicht; Formularabstände in `unios-workspace.css` berichtigt. |
| Komponenten | 7 | Die drei gefundenen ungestalteten Formulare in Setup, Settings und Notifications angepasst. |
| Größenwechsel | 8 | 320–2301 px, Seitenleiste sichtbar/verborgen; Startseitenraster nach verfügbarer Breite korrigiert. |
| Dunkelmodus | 8 | Alle 49 Ansichten in beiden Farbschemata kontrolliert. |
| Bewegung | 6 | Screenshots ohne Bewegung. Keine umfassende Animationsprüfung oder Änderung in diesem Paket. |
| Zugänglichkeit | 6 | Zugänglicher Glockentitel und vergrößerte Schrift geprüft. Kein neuer Lighthouse-/Kontrastnachweis; keine entsprechende Zertifizierung. |
| Informationsdichte | 6 | Hauptseiten ruhig; aufgeklappte erweiterte KI-/System-/Einstellungsseiten weiterhin umfangreich. |
| Detailgestaltung | 7 | Leere Ansichten und Formularzustände betrachtet; Fehlerkorrekturen in gemeinsamen Komponenten. |

## Automatische Nachweise

- Typecheck, ESLint, i18n-Prüfung und Produktionsbuild bestanden.
- 395 Frontend-Tests bestanden.
- 26 Playwright-Abläufe bestanden: Startseite, Räume, Einrichtung,
  Einstellungen, Seitenleiste und Seitenansichten.
- Nach der letzten Startseitenkorrektur vier betroffene Playwright-Abläufe
  erneut bestanden, einschließlich der vollständigen 196-Bilder-Runde.
- Header-Regression prüft 320, 390, 768, 900, 901, 1024, 1440 und 2301 px,
  jeweils mit/ohne Seitenleiste und 102 Benachrichtigungen. Außerdem Suche
  deaktiviert und Schriftgröße 150 Prozent.

## Grenzen

Die Prüfung deckt die genannten Zustände ab, nicht jede Kombination aus
persönlichen Daten, Popovers, Fehlermeldungen und Editorblöcken. Tests laufen
gegen lokale Fake-Dienste; Hochschul-Anmeldungen und Postfachinhalte wurden
nicht für die Prüfung verwendet. Raumbelegung wurde zusätzlich mit den
erfundenen bestätigten/ungeprüften/belegten Zuständen der Raumtests betrachtet.
Vollseitenbilder auf dem Handy können eine feststehende Navigation innerhalb
des langen Bildes zeigen; das ist eine Eigenheit der Vollseitenaufnahme.

Kein Datenbankschema, Serververtrag oder Sync-Verhalten wurde verändert.

## Installiertes Ergebnis

Das korrigierte lokale Windows-Paket 0.1.19 wurde am 04.10.2026 installiert
und die native App geöffnet. Installer: Exit 0. SHA-256 des installierten
Begleitdienstes stimmt mit dem Paket überein. 237 eingefrorene Frontend-Dateien
stimmen mit dem endgültigen Build überein. Die laufende App meldet
`/health: {status: "ok", mode: "client"}` und ihre ausgelieferten CSS-Dateien
enthalten den einzeiligen Header und das adaptive Startseitenraster.
Dieser Betriebsnachweis liest keine persönlichen App-Daten.
