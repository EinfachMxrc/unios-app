<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Lernaufgaben und Coding Tutor (0.1.18)

Unter **Lernen → Üben** stehen Auswahlfragen, freies Erklären, begrenzte symbolische
Mathematik, Code-/Schrittreihenfolge, mündliches Erklären, Zuordnung und Zahlenantworten.
**Lernen → Programmieren** öffnet den Monaco-Editor für Java, Python und JavaScript.
Aufgaben, unveränderliche Versuche und übernommenes Tutor-Feedback sind eigene Entities.

## Bedienung

- Coding: Kurs, Sprache und Lernziel wählen; selbst schreiben und **Tests starten**.
  Strg/⌘+Enter startet denselben Ablauf. Hilfsdateien, lokale Entwurfswiederherstellung,
  serverseitige Versionsprüfung, Abbruch und Vergleich mit früheren Versuchen sind enthalten.
- Üben: eigene Aufgabe als Vorschlag anlegen und übernehmen. Erwartete Antworten bleiben
  zunächst verborgen. Ein bewusstes Ansehen der Prüfregeln zählt als Lösungshilfe.
- Im PDF unter **Mehr → Diesen Abschnitt prüfen** den Seitenbereich wählen. Notizen bieten
  denselben Einstieg. Work wird ausdrücklich beauftragt; es startet kein Hintergrundagent.
- Probeprüfung: übernommene Aufgaben ohne vorherige Hinweise auswählen, Dauer festlegen.
  Antworten werden einmal abgegeben, Hinweise und Ergebnisse bleiben bis zur Abgabe gesperrt.
  Laufende Prüfungen sind nach Navigation wieder erreichbar. Nach Ablauf sind weitere Antworten
  gesperrt; die Prüfung kann weiterhin abgegeben werden.
- Mündlich: aufnehmen oder Audio hochladen, Sprache wählen, Transkript prüfen, abgeben.
  Audio ist lokal abspielbar. Für gespeicherte Antworten wird das geprüfte Transkript verwendet;
  die Aufnahme bleibt nur in dieser Sitzung und wird nicht als dauerhaftes Voice-Memo gespeichert.

## Prüfer und Grenzen

Neue Laufzeitabhängigkeiten: Monaco 0.57.0 liefert die lokale IDE, Dateiansichten und
den Versionsvergleich; SymPy 1.14.0 prüft die vom eigenen begrenzten AST-Parser
erzeugten Polynome. Beide arbeiten ohne Cloud-Aufruf. Lizenzen liegen unter
`docs/licenses/` und werden in Serverimage und Desktoppaket mitgeliefert.

| Typ | Tatsächliche Prüfung |
| --- | --- |
| Coding | Sieben versionierte Array-/Rekursionsvorlagen; echte Ausführung auf getrenntem Judge0; öffentliche, verdeckte, Eigenschafts- und größere Eingaben. |
| Auswahl, Zuordnung, Reihenfolge | Exakter Vergleich mit den vom Nutzer übernommenen Erwartungen. Mehrere gültige Reihenfolgen sind noch nicht modelliert. |
| Zahlen | Exakte rationale Zahl; Brüche und Dezimalzahlen mit Punkt. |
| Mathe | Eine Variable x, rationale Koeffizienten, Polynome bis Grad 6; Äquivalenz, Ableitung, vollständige reelle Nullstellen bei Grad 1/2. Keine freie Python-Auswertung, Funktionen, allgemeinen Beweise oder Regelbenotung. |
| Freitext und mündlich | Antwort gespeichert; ausdrücklich angefordertes Work-Feedback als überprüfbarer Vorschlag. Keine automatisch erfundene objektive Punktzahl oder Aussprachebewertung. |

Coding-Mutationstests prüfen drei bekannte Fehler **im vertrauenswürdigen Testorakel**;
sie verändern oder kompilieren keinen Lernenden-Code. Laufzeitlimits sind absolute Grenzen,
keine behauptete Messung einer asymptotischen Komplexitätsklasse. Java/Python erhalten Syntaxfarben;
ein vollständiger Java-/Python-Language-Server ist nicht enthalten. JavaScript nutzt Monacos Worker.

Lernstand zählt reale Versuche, Hilfe, Fehler und selbst angegebene Sicherheit. Sehr sichere
Fehlantworten und schwache Themen bekommen höhere Übungspriorität. Subjektive Antworten werden
nicht in die objektive Erfolgsquote gemischt. Das Auswertungsfenster ist auf 1.000 Versuche begrenzt.
Probeprüfungen gewichten Aufgaben gleich; ohne hinterlegte Notengrenzen wird keine Note erfunden.

SQL, Aussagenlogik, Diagramme, Concept Maps und weitere fachbezogene Prüfer sind zusätzliche
Ausbaustufen. Die Registry behauptet dafür keine funktionsfähigen Renderer oder Prüfer.

## Work / Agent Gateway

Die acht Gateway-Werkzeuge bleiben unverändert. Aktionen benutzen dieselbe Registry für
REST, CLI und MCP. **KI → Freigaben → Lernaufgaben, Versuche und Tutor-Feedback** ist zunächst aus.
Kursfreigaben gelten zusätzlich. OAuth benötigt für Vorschläge ausdrücklich `coding:propose`
(dieser Scope umfasst auch Assessment-Vorschläge); vorhandene reine Lesetokens erhalten ihn nicht.

`jobs()` liefert ausdrücklich angeforderte Coding-/Assessment-Feedbackpakete sowie Abschnittsanfragen.
`act()` unterstützt:

- `course`: `coding.create_practice`, `coding.next_practice`, `coding.progress`,
  `assessment.create`, `assessment.source_context`, `assessment.progress`.
- `coding_task` / `assessment_task`: die jeweilige `describe`-Aktion.
- `coding_attempt` / `assessment_attempt`: `feedback_context` und `submit_review`.

Work liest den angegebenen Abschnitt über `assessment.source_context`, schlägt sechs Aufgaben mit
`source` und `request_id` vor und beachtet den gespeicherten Inhaltsstand. Nach sechs Vorschlägen
verschwindet die Anfrage aus der offenen Warteschlange. Geänderte oder kursfremde Quellen werden
abgelehnt. PDF-Bereiche enthalten höchstens 40 Seiten und 16.000 Textzeichen; Notizen liefern den
indizierten aktuellen Text. Zusätzliche Notiz-/Unterlagenfreigaben bleiben erforderlich.

Work kann keine Testläufe starten, Prüfungen abgeben, Hinweise freischalten oder deterministische
Ergebnisse ändern. Freigaben und Übernahmen sind Nutzeraktionen. Quellen, Aufgaben, Code und
Antworten sind Daten, keine Agent-Anweisungen. Die Vorschläge müssen fachlich geprüft werden;
ein Quellenhash beweist ihre Zuordnung, nicht die Richtigkeit einer generierten Frage.

## Daten und Veröffentlichung

Migrationen `ff93fe657182` und `ff94af768293` legen Aufgaben, Entwürfe, Versuche,
Feedback und Prüfungen an. Der Quellenindex speichert nur aktive Aufgaben; erwartete Antworten
und Musterlösungen werden dort nicht veröffentlicht. Laufende Prüfungsantworten bleiben aus
MCP-Suche und Lernstand ausgeblendet. Nach Abgabe werden sie zum Indexieren vorgemerkt.

Vor einem Update am echten Bestand gilt weiterhin **AGENTS.md: Marc erstellt und prüft einen
neuen Snapshot**. Ein bestandener Testlauf mit Fixtures ersetzt diese Sicherung nicht.

Runner-Betrieb: [RUNNER.md](RUNNER.md). Persönliche Hochschul-/Mikrofon-/Geräteprüfungen
bleiben von den automatisierten Fixture-Tests getrennt.
