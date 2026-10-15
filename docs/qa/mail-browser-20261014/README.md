<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Outlook-Browserimport, 0.1.27

Die importierte GitHub-Funktion erhält vor der Auslieferung die fehlende
native Scrollberechtigung. Mailzeilen werden von Navigation getrennt;
myCampus und PRIMUSS behalten ihre bisherigen Klickselektoren. Ein unbekanntes
Datum wird nicht als ungültiger Zeitstempel an die API geschickt. Der
Lesedurchgang bricht vor Login-/MFA-Seiten ab und meldet sein Limit als
unvollständig. Die Browser-POST-Sperre wird nicht gelockert.

Der neue Playwright-Ablauf nutzt ausschließlich erfundene Nachrichten und
eine synthetische native Brücke. Der Import läuft durch den tatsächlichen
Fake-App-Endpunkt. Er prüft Import, wiederholtes Einlesen ohne Duplikat,
Auswahl ausschließlich der Nachrichtenzeile, Aktivierung/Deaktivierung der
Schreibsperre und keine automatische Bestätigung einer Frist. Die vier
Screenshots zeigen Light/Dark bei 1440 und 390 px; die Seite läuft nicht
horizontal über. Fixed-Elemente in der Ganzseitenaufnahme entsprechen dem
aktuellen Scrollstand.

Gezielte Prüfung: zwölf Mail-Pythonfälle, 27 Frontendfälle, zwei Mail-
Browserabläufe, 20 native Windows-Tests bestanden. Vollständiges Frontend:
1.423 Fälle bestanden. Vollständiges Python: 1.298 bestanden und zwölf
übersprungen; vollständiges Playwright: 517 bestanden. Ruff, mypy,
Typecheck, Lint, i18n, OpenAPI-Vertrag und Build bestanden.

Server und Windows-App mit demselben Quellstand ee446f43d5d4 als 0.1.27
ausgeliefert. Server healthy, HTTPS-Health ok, private API ohne Kopplung 401;
synthetischer Docker-Smoke bestanden. NSIS-Installation erfolgreich,
2.825 installierte Programmdateien anhand physischer Pfade und Prüfsummen
verifiziert, isolierter Windows-Start und bestehende Serverkopplung bestätigt.
Keine neue Migration und kein direkter Zugriff auf private Profilverzeichnisse.
GitHub Actions 38630585711 war vor dem ersten Prüfschritt durch
Abrechnung/Ausgabenlimit blockiert; Pakete bleiben im Release-Entwurf.

Die echten Outlook-Selektoren und benötigten Microsoft-Leserequests wurden
nicht verifiziert. Wenn der Browser nur schreibende Requests zum Nachladen
anbietet, blockiert die vorhandene Sperre diese weiterhin. Ein leeres oder
unvollständiges Ergebnis bestätigt keine vollständige Mailübernahme.
