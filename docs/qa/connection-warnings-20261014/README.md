<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Verbindungswarnungen, 0.1.25

Die vier Screenshots zeigen die neue Warnanzeige mit ausdrücklich erfundenem
Fehlertext. Alle Daten stammen aus lokalen Fake-Servern. Hell/Dunkel bei
1440 px und 390 px wurden visuell geprüft; Titel, Grund und Verbindungspfad
sind lesbar, ohne horizontalen Überlauf. Eine myCampus-Warnung wird nicht
mehr als Moodle-Warnung beschriftet.

13 gezielte Browserabläufe prüfen Fehlerzuordnung, pausiertes Moodle,
unbekannte Zustände ohne Fehlermeldung sowie erneuerte Anmeldungen und die
bestehenden Import-/Moodleabläufe. Zwei neue Frontendtests prüfen die
Warnungsaktualisierung nach nativer Anmeldung und inaktive Query-Caches.
Pythonfälle prüfen den Authentifizierungswechsel, verspätete Workerfehler,
gesperrte Unterseiten und tatsächlich abgelaufene Einstiegsseiten.

Vollständiger endgültiger Stand: 1.290 Pythonfälle bestanden, zwölf Skips;
1.409 Frontendfälle und alle 514 Browserfälle bestanden. Ruff, mypy, Typecheck,
Lint, OpenAPI, i18n, Build, Lizenzkennungen und isolierter Docker-Smoke bestehen.

Produkt- und Windows-Bauquellen sind exakt
`f7a32cdb234c3cead860bf97c4219d198ab20f4b`, auf GitHub unter v0.1.25. Server
und Windows-PC sind aktualisiert. Öffentlicher Healthcheck und nativer Client
sind gesund; die private API bleibt ohne Kopplung bei HTTP 401. Alle 2.825
Programmdateien sind nach Hash und physischem Pfad geprüft, isolierter
Dienststart und bestehende Serverkopplung bestehen. Die native App antwortet.
Alle sieben GitHub-Assets sind vollständig hochgeladen und gegen ihre
SHA256 geprüft. GitHub Actions startet wegen des Kontozahlungs-/Ausgabenlimits
keine Jobs; der Release bleibt ein Entwurf ohne neue signierte Autoupdatefreigabe.

Der technische Auslieferungsbeleg steht in [verification.json](verification.json).
Echte Hochschulsitzungen werden nicht für Tests benutzt. Marcs manuelle
Prüfung ist in docs/MANUELL_TESTEN.md beschrieben.
