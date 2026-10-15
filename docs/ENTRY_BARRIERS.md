<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Einstieg und Studienabläufe – Abgleich vom 05.10.2026

Der eingereichte Konkurrenzvergleich ist ein Arbeitsvorschlag. Der folgende Stand
ist gegen UniOS-Quellcode und die bestehende Alpha geprüft. Externe Releasezahlen,
Sterne, Lizenzdetails oder Funktionsbehauptungen über andere Produkte sind hier nicht erneut
verifiziert und bilden keine Abnahmekriterien. Es wird kein Fremdcode übernommen.

## Einstieg zuerst

Der bisherige Nutzerauftrag verlangt für Marcs Geräte einen zentralen VPS. Eine
neue Standard-Betriebsart darf bestehende Gerätekopplungen weder ersetzen noch
stillschweigend einen zweiten schreibenden Datenbestand starten. Die Rückfrage
lautet deshalb: neue Nutzer lokal, bestehende VPS-Geräte weiterhin am Server?
Bis zur Antwort bleibt die Betriebsart unverändert.

Ein lokaler Standard erfordert mehr als einen anderen Startbildschirm:

- Frischinstallation: eigener Datenordner, geprüftes Schema, Einrichtung der
  Hochschule; keine Serveradresse und kein Koppelcode als Voraussetzung.
- Gekoppelte Installation: Client anhand der vorhandenen Bindung starten;
  Serverausfall führt zur vorhandenen Offline-Ansicht, niemals zu einem lokalen
  Ersatzbestand. Die fehlende lokale Datenbank ist bei einem Client normal.
- Demo: eigener synthetischer Bestand; Verlassen kehrt zum vorherigen Modus zurück.
- Server später: eigener, bestätigter Übernahme-/Kopplungsablauf; bestehende Daten
  nicht automatisch umschreiben oder zusammenführen.
- Frische Windows-/macOS-/Linux-Geräte praktisch prüfen. Browser- und Sidecar-Tests
  belegen keine Installer-, Schlüsselbund- oder Updateabnahme.

Startentscheidung heute: [desktop/backend.py](../desktop/backend.py),
Bindung: [Client-Service](../app/client/service.py),
Einrichtung: [SetupPage](../frontend/src/pages/SetupPage.tsx).

## Die 13 Vorschläge gegen den tatsächlichen Stand

| Punkt | Stand | Konkreter nächster Schritt / Grenze |
|---|---|---|
| 1 · Lokal ohne eigenen Server beginnen | Lokaler Backend-Modus vorhanden; neue native Profile starten derzeit den Client-Einstieg | Standardänderung nach Klärung; bestehende VPS-Bindungen erhalten |
| 2 · Öffentliche Downloads | Repository ist privat, damit sind auch Release-Downloads zugangsbeschränkt | Gesamte Historie und persönliche Inhalte nach [PUBLISHING](PUBLISHING.md) prüfen; öffentliche Sichtbarkeit getrennt freigeben |
| 3 · Signierung und Updates | Signaturprüfung, Kanalregeln, Staging und UI vorbereitet; Alpha 0.1.19 hat keinen aktiven signierten Feed | GitHub enthält zum Prüfzeitpunkt keine hinterlegten Secret-/Variablennamen; Update-Schlüssel, Windows-Zertifikat, Apple Developer ID/Notarisierung und echter Update-Drill nötig; eine Dateiprüfsumme ersetzt keine Signatur |
| 4 · Einfache Navigation | Fünf Hauptbereiche und zentraler Bereichskatalog umgesetzt | Im nächsten Installer ausliefern; angepasste Seitenleisten bleiben erhalten |
| 5 · Erster Kurs schnell verfügbar | Hochschule/Studiengang, persönliche Moodle-Anmeldung und Erstimport vorhanden; getrennte Demo vorhanden | Mit fremden Erstnutzern messen. Moodle importiert keinen iCal-Link; Stundenplan und Portale brauchen jeweils ihre Einrichtung. Kein garantierter Zwei-Minuten-Import |
| 6 · Prüfungszentrale | Prüfungen, Lernblöcke, Themen, Karten und Probeklausuren vorhanden, auf verschiedene Ansichten verteilt | Bestehende Prüfungs-/Lernansichten verbinden; Datum/Stoff nur aus bestätigten Quellen, fehlende Zuordnung sichtbar lassen |
| 7 · PDF direkt zum Lernen | Markierung, Frage, Material-/Notizbezug und Lernwerkzeuge vorhanden | Kartenanlage aus einer Auswahl prüfen und vereinfachen; keine richtige Antwort automatisch aus bloßem markiertem Text behaupten |
| 8 · Erinnerungen zeigen | Erinnerungseinstellungen, Fristen und Benachrichtigungen vorhanden | Nutzen erklären und echte Zustellung getrennt vom bloßen UI-Badge prüfen; bei lokalem Betrieb läuft kein Sync mit ausgeschaltetem Gerät |
| 9 · Kursstoff mit Quellen fragen | MCP Gateway v2 mit Suche, gezieltem Abruf, Budgets und Freigaben vorhanden | Konkrete Nutzerfrage in beiden READMEs und Search/Fetch-Beispiel unten ergänzt; Ausgabe kann nur freigegebene, indexierte Quellen zitieren |
| 10 · Eigene Aufgaben neben Moodle | Projekte haben persistente Todos; keine eigenständige allgemeine Aufgaben-Domäne | Getrennte eigene Aufgaben mit Revision/Archivierung, gemeinsame Projektion mit unveränderten Moodle-Abgaben, Statusfilter, Ansichten; keine Hochschule-Abgabe beim Abhaken senden |
| 11 · Vorlesungsnotiz | Notizen mit Kurs/Material, Kalender mit gespeicherten Veranstaltungen vorhanden; direkter Erstellablauf fehlt | Veranstaltung und Datum übernehmen; Kurs-ID nur bei belegter Zuordnung, sonst Nutzer wählen lassen; Doppelklick/Wiederholung idempotent behandeln |
| 12 · Schnellnavigation | Kontextwiederherstellung vorhanden; zuletzt geöffnete Objekte und Strg+Pfeile in diesem Paket ergänzt | Keine Prozentbeschleunigung aus Bedienzeiten ableiten; Tabs später separat bewerten |
| 13 · Gemeinsames Verknüpfungspanel | LinkedItems bei Kurs, Material, Notiz, Projekt und Prüfung; NoteReferences bei Notizen | Gemeinsame Objekt-Seitenfläche ohne doppelte Listen; mobil als erreichbare Detailansicht und Rechte pro Ziel beachten |

Die Punkte 6, 10, 11 und 13 sind neue vollständige Arbeitspakete, keine durch einen
Readme-Text bereits erledigten Funktionen. Insbesondere wird ein neues Task-Modell
nicht in eine bestehende Moodle-Assignment-Tabelle gedrängt.

## In diesem Paket umgesetzt

- Strg+K zeigt zuletzt geöffnete Kurse, Dokumente, Notizen und Projekte. Dokumente
  behalten einen expliziten Seitenhandle; Notizen zeigen ihren tatsächlichen Titel.
- Verlauf mit Objekttitel und gefiltertem Handle im Arbeitsspeicher dieses
  Fensters, auf zwölf Objekte begrenzt. Suchabfragen und beliebige URL-Parameter
  werden nicht übernommen. Nach App-Neustart ist er leer. „Verlauf leeren“ und Wechsel des Arbeitsbestands leeren ihn.
- Ausgeschaltete Module verbergen auch ihre bisherigen Verlaufseinträge.
- Strg+Links/Rechts verwendet die bestehende Router-History und deren
  Wiederherstellung. In Formularen, Editor und Dialogen bleiben Textbefehle erhalten.
- Lernblöcke heute interpretieren UTC-Zeitwerte ohne Offset korrekt, auch nach
  Mitternacht; ein fester Browserfall prüft die Zeitzonengrenze.
- Alembic erhält `path_separator = os`; die Konfiguration verwendet den
  plattformeigenen Trenner ohne impliziten Fallback.
- Der Veröffentlichungsprüfer fragt Pfad und Größe vor Dateiinhalten ab. Private
  und übergroße Objekte sperren die Prüfung, ohne deren Inhalt zu lesen.

Keine Änderungen an Repository-Sichtbarkeit, Signierschlüsseln, echten Daten,
VPS-Betrieb oder installierten Alpha-Paketen.

## Such-/Quellenbeispiel

Nach bewusster Freigabe eines Kurses im Work-Dialog:

```text
search(query="Rekursion Basisfall", scope={"course": "Programmieren 1"},
       types=["material", "note"], top_k=5, budget=12000)
fetch(refs=[die zurückgegebenen Quellenhandles], max_tokens=4000)
```

Der Kursname ist ein Beispiel. Reale IDs oder eindeutige freigegebene Namen
verwenden. Quellenhandles aus der Suchantwort übernehmen, keine Seitenzahl
erfinden. Das aktuelle konservative Budget zählt UTF-8-Nutzlasten, keine exakt
gemessenen Modell-Tokens. [Agent-Gateway-Vertrag](AGENT_GATEWAY.md).

## Prüfung

Eigene Browserfälle prüfen das Wiederöffnen einer Notiz aus dem Verlauf, Leeren,
Zurück/Vor und den Erhalt von Tastenkürzeln in Eingabefeldern. Unit-Tests prüfen
Handle-Filter, Seitendeduplikation, Größenlimit und Löschen beim Arbeitsbereichswechsel.
Konkrete Ergebnisse stehen im [Fortschritt](PROGRESS.md).
Die [vier neuen Aufnahmen](qa/entry-barriers-20261005/README.md) zeigen die
Schnellpalette mit erfundenen Daten in beiden Designs auf Desktop und Handy.
