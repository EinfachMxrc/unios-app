<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Aufgabenansicht: Code lesen und per Tastatur antworten

Marc hat am 10.10.2026 ausdrücklich die Verbesserung der abgebildeten
Aufgabenansicht bestätigt. Referenz ist eine Transferaufgabe mit einzeiligem
Java-Code und anschließender deutschsprachiger Fragestellung.

## Problem und Bedienung

Code lief im proportionalen Fließtext um und bekam weniger Platz als das
Antwortformular. Der große Übernahmehinweis verdrängte den eigentlichen Stoff;
gesperrte Antwortfelder erklärten die benötigte Übernahme nicht lokal.

Die Aufgabe erhält auf breiten Bildschirmen ungefähr 56 Prozent des Rasters,
auf schmalen Bildschirmen eine eigene volle Zeile. Code besitzt Monospace,
Einrückung, Syntaxfarben und einen eigenen horizontalen Scrollbereich.
Ein kompakter Vorschlagsstreifen bündelt Übernahme und ausdrücklich bestätigte
Prüfregeln. Das Antwortfeld umfasst zehn Zeilen; Sicherheit und Prüfen stehen
zusammen. Strg beziehungsweise Cmd + Enter benutzt native Formularvalidierung,
Enter bleibt ein Zeilenumbruch. Erfolgreiche Übernahme fokussiert den ersten
bedienbaren Formulareintrag. Regelmäßige Abfragen setzen den Fokus nicht erneut.

## Umsetzung und Grenzen

- `AssessmentQuestion` zeigt passive Prosa, Inlinecode, Fettdruck, eingezäunten
  Code und begrenztes KaTeX mit zugänglichem MathML. Allgemeine Markdownlisten
  und Überschriften bleiben Klartext. Kein vollständiger Notizrenderer und
  keine interaktiven Lernbausteine in der Aufgabenstellung.
- Ein konservativer Darstellungslexer erkennt vorhandene Java-Deklarationen
  mit eindeutig anschließender Frage. Einzeiliger, balancierter Code erhält
  ausschließlich Layout-Whitespace. Zeichenketten bleiben atomar; Kommentare,
  vorhandene Zeilenumbrüche, Unicodeescapes, unvollständiger Code, mehr als
  64 Verschachtelungen oder über 20.000 Zeichen werden nicht umformatiert.
  Unklare Legacy-Inhalte bleiben Klartext. Aufgaben und Prüfer werden dabei
  nicht umgeschrieben; andere Programmiersprachen können Code-Fences verwenden.
- Syntaxdarstellung nutzt vorhandenes lowlight; Formeln verwenden den bereits
  begrenzten lokalen Renderer. Keine neue Abhängigkeit oder Schemamigration.
- Übernahme, Prüfregel- und Lösungsbestätigung behalten ihre vorhandenen
  API-Payloads und die Kennzeichnung unterstützter Versuche. IME-Eingabe,
  wiederholte Tasten und parallele Anfragen starten keine Doppelabgabe.
- Eine Prüfungs-URL wartet auf die passende Prüfung. Fehlende/fehlerhafte
  Prüfungsdaten und Aufgaben außerhalb der Prüfung erzeugen keinen normalen
  Übungsarbeitsbereich. Abgegebene und geschlossene Prüfungen bleiben gesperrt.
- HTML, Bildsyntax und unbekannte `unios-recall`-Fences sind Text beziehungsweise
  gewöhnlicher Code. Sie erzeugen keine Bildabrufe oder eigenen Lösungsbuttons.

## Abnahme

Typecheck, vollständiges ESLint, de/en-Abgleich über 67 Namespaces und
49 gezielte Vitestfälle bestanden. Finaler PWA-Build bestanden. Der erste
Buildversuch wurde durch einen lokalen Sandbox-Unterprozessfehler (EPERM)
abgebrochen; anschließend wurde der Build mit erlaubtem Unterprozess erfolgreich
ausgeführt. Buildprotokolle liegen getrennt unter
`.tmp/assessment-view-20261010/`.

Finale Browserabnahme: alle 13 Fälle in einem Lauf bestanden (12 Aufgabenfälle
und ein benachbarter Lernstatusfall, 29,1 Sekunden). Vier Bilder der
Vorschlagsansicht in Hell/Dunkel bei 1440 und 390 Pixeln sowie zwei Bilder mit
breiter Matrix und langer Codezeile bei 390 Pixeln selbst geprüft. Keine
Seitenverbreiterung; Code lässt sich auch mit fokussiertem Pfeil-Rechts scrollen.

Der erste Browserlauf bleibt mit 7/13 bestanden dokumentiert: fünf Abbrüche
betrafen den exakten Labeltext-Suchweg nach dem Füllen einer kontrollierten
Textarea. Der Test benutzt nun den tatsächlichen zugänglichen Textboxnamen.
Ein weiterer Fall deckte echten Inline-Matrixüberlauf auf; begrenzte Rasterspuren
und Absatzbreite beheben diesen. Screenshots beenden Farbtransitionen vor der
Aufnahme, sodass Kontraste nicht in einem Übergangsbild beurteilt werden.
Ursprüngliche und finale Protokolle liegen getrennt unter
`.tmp/assessment-view-20261010/browser-1*` und `browser-final*`.

Es wurden ausschließlich synthetische Aufgaben, die lokale Fake-App und
Browser-Routen verwendet. Die ausgelieferte Version 0.1.23 wird durch diese
lokale Änderung nicht ersetzt. Kein neuer Server-/Windowsrelease behauptet.

## Bilder

- [Desktop dunkel](assessment-workspace-proposed-dark-1440.png)
- [Desktop hell](assessment-workspace-proposed-light-1440.png)
- [Handy dunkel](assessment-workspace-proposed-dark-390.png)
- [Handy hell](assessment-workspace-proposed-light-390.png)
- [Breite Inhalte dunkel](assessment-workspace-wide-dark-390.png)
- [Breite Inhalte hell](assessment-workspace-wide-light-390.png)
