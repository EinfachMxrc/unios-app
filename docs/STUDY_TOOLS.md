<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Schnell mitschreiben und Stoff verarbeiten

Die Werkzeuge gehören zu Version 0.1.21. Die ältere Veröffentlichung 0.1.20
enthält dieses Paket noch nicht; die native App muss ebenfalls aktualisiert werden.

## Mit der Tastatur anfangen

Im Notizeditor, im Markdown-Feld und neben dem PDF einen Befehl **am Anfang
eines Absatzes bzw. einer Zeile** tippen. Enter oder Tab öffnet das Werkzeug.
Tab wechselt Felder, Strg/⌘+Enter fügt ein; Esc bricht ab. Danach steht der
Cursor wieder in der Mitschrift. Über **Lernwerkzeuge** sind alle Helfer auch
ohne einen gemerkten Befehl erreichbar. Zusätzliche Optionen bleiben eingeklappt.

| Eingabe | Wirkung |
| --- | --- |
| Strg/⌘+Shift+M oder `/math` | Visuell eine Formel schreiben |
| `/bruch`, `/wurzel`, `/grenzwert`, `/ableitung` | Formelvorlage sofort öffnen |
| `/matrix`, `/vektor`, `/schritte`, `/system`, `/faelle` | Vorlage als eigenen Matheabsatz öffnen |
| `/gleichung` | Freie Formel als eigenen Absatz |
| Strg/⌘+Shift+Leertaste | Lernwerkzeuge öffnen |
| `/bin`, `/hex`, `/zahlen` | Zahlensysteme; `/hex` beginnt mit Basis 16 |
| `/wahrheit`, `/kv`, `/dnf`, `/knf` | Gewünschte Logikansicht öffnen |
| `/diagramm`, `/baum` | Verbindungen tippen, Diagramm erhalten |
| `/ueben` | Frage mit zunächst verdeckter Lösung |
| `/statistik`, `/quelle`, `/projekt`, `/codeablauf` | Weitere Bausteine einfügen |

### Mathe ohne Befehle auswendig zu lernen

`/bruch` → Zähler → Tab → Nenner → Strg/⌘+Enter. Im Formelfeld gehen außerdem
`/`, `^`, `_` und `sqrt` für Bruch, Potenz, Index und Wurzel. Eine Vorlage
lässt sich über **Vorlage suchen** finden; Enter setzt den ersten Treffer ein.

40 Vorlagen decken unter anderem Grenzwerte, Ableitungen, partielle Ableitungen,
Summen, Produkte, Integrale, Gleichungssysteme, Fallunterscheidungen, Vektoren,
mehrzeilige Rechnungen, Mengen, Quantoren, komplexe Zahlen, Wahrscheinlichkeit
und Modulo ab. **Matrixgröße wählen** erlaubt 1–8 Zeilen und Spalten sowie
runde oder eckige Klammern. Innerhalb einer Matrix ergänzt Alt/Option+Tab eine
Spalte und Alt/Option+Enter eine Zeile. Tab wechselt Platzhalter. Einfügen
bleibt gesperrt, solange noch leere Platzhalter vorhanden sind.

**LaTeX bearbeiten** öffnet den Quelltext. Gespeichert wird `$…$` im Satz bzw.
`$$…$$` als Block; bestehende Formeln sind erneut editierbar. MathLive darf
äquivalente Schreibweisen normalisieren. Seine Tastaturkürzel `dx`, `ii`, `jj`
und `ee` werden auch in der KaTeX-Anzeige verstanden.

Die Formeleingabe steht ebenso in Übungsantworten und in Frage, Lösung und
Hinweis des neuen Übungsbausteins bereit. Dessen Lösung ist bei jedem Öffnen
verdeckt und wird erst mit **Lösung zeigen** angezeigt.

Unterstützt wird der geprüfte MathLive-/KaTeX-Matheumfang mit maximal 4000
Zeichen je Formel. Ganze TeX-Dokumente, zusätzliche TeX-Pakete, TikZ und
symbolisches Lösen sind eigene Aufgaben. Unbekannter vorhandener Quelltext
bleibt erhalten; ein nicht darstellbarer Ausdruck wird nicht als neue Formel
eingefügt.

## Zahlen und Logik

Bei `/bin` etwa `01011` eingeben: Binär, Oktal, Dezimal und Hex erscheinen
sofort. Ganze Zahlen bleiben auch über der JavaScript-Ganzzahlgrenze exakt.
Bruchteile erlauben Punkt oder Komma. `…` bedeutet, dass eine Darstellung
nach 24 Nachkommastellen abgeschnitten wurde. Intern wird als Bruch gerechnet.

**Weitere Optionen** ergänzt eine Bitbreite von 1–128, die Interpretation ohne
Vorzeichen bzw. als Zweierkomplement, Stellenwerte und leere Übungsergebnisse.
Werte außerhalb der Bitbreite werden abgewiesen, nicht still umgebrochen.

Wahrheitstabellen akzeptieren verschiedene UND-/ODER-/NICHT-/XOR-Notationen
und bis zu sechs Variablen. **DNF / KNF** erzeugt vollständige kanonische
Normalformen. **KV-Diagramm** zeigt zwei bis vier Variablen in Gray-Reihenfolge.
Mit Tab und Leertaste Einsen auswählen und **Gruppe übernehmen** wählen.
Gültige Gruppen und Randübergänge werden geprüft; die Anzeige sagt ausdrücklich,
ob alle Einsen abgedeckt sind. Das ist eine Gruppierhilfe, kein garantierter
automatischer Minimalformfinder. Eingefügte Tabellen sind normal editierbar.

## Diagramme und weitere Bausteine

Für einen Ablauf oder Begriffsbaum eine Verbindung je Zeile tippen:

```text
Problem -> Teilproblem
Teilproblem -> Lösung : prüfen
```

Einzelne Namen erzeugen Knoten. Vorlagen helfen bei Abläufen, Zuständen,
Klassenbeziehungen, Datenmodellen, Netzwerken und Wahrscheinlichkeitsbäumen.
Bis zu 20 Knoten und 32 Verbindungen werden als SVG dargestellt. Zyklen sind
möglich. **Baustein bearbeiten** ändert die Verbindungen später. Dies sind
schnelle Beziehungsskizzen, kein vollständiger UML-/ER- oder Canvas-Editor.

**Statistik** berechnet Anzahl, Mittelwert, Median, Minimum, Maximum sowie
Standardabweichung für Grundgesamtheit und Stichprobe aus bis zu 500 Werten.
Leerzeichen, Semikolon oder Zeilenwechsel trennen die Werte. **Binomialverteilung**
berechnet die Wahrscheinlichkeit für genau k Erfolge mit n bis 200; die
Annahmen stehen bei der Formel. **Quellenbeleg** ergänzt Titel, Autor, Jahr,
Seite und optional einen sicheren Link. **Projektprotokoll** setzt ausfüllbare
Abschnitte für Frage, Vorgehen, Ergebnis, Belege und nächsten Schritt ein.
**Code mit Ablauf** fügt Code und eine bearbeitbare Werte-/Schritttabelle ein;
Ausführung bleibt im bestehenden Bereich Programmieren.

## PDF-Stellen direkt übernehmen

Text auswählen → **In Mitschrift übernehmen** übernimmt Zitat, Version und
Seitenlink. **Bildausschnitt** übernimmt Grafiken oder schwierige Formeln als
PNG: Bereich ziehen oder die vier Prozentfelder mit der Tastatur einstellen,
dann Strg/⌘+Enter. Beim Quellenlink wird die ursprüngliche Stelle wieder markiert.
Die Original-PDF bleibt unverändert. Bilder verwenden die bestehende private
Medienablage und benötigen eine Verbindung zum schreibberechtigten Hauptgerät.
Bei einem Fehler bleibt die Mitschrift erhalten; der Ausschnitt kann erneut
übernommen werden.

## Speicherung und praktische Grenzen

Formeln und Tabellen verwenden die vorhandenen portablen Markdown-Formate.
Diagramme und verdeckte Lösungen werden in lesbaren Codeblöcken mit
`unios-diagram` bzw. `unios-recall` und einem JSON-Quelltext gespeichert. Andere
Markdown-Programme zeigen diesen Quelltext; die interaktive Darstellung erfolgt
in UniOS. Unlesbare Bausteine bleiben als Code erhalten. Keine neue Abhängigkeit,
kein externer Formelservice und keine Datenbankmigration sind erforderlich.

Der echte Test auf MacBook/Safari und ein Vergleich mit dem individuellen
Handschrift-Tempo stehen in [MANUELL_TESTEN](MANUELL_TESTEN.md). Windows-Chrome-
Automatisierung allein belegt kein menschliches Unterrichtstempo.
