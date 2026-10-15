<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Mathe und Logik schnell mitschreiben

Stand: 07.10.2026. Dieses Arbeitspaket erweitert den Quellstand; die bisher
installierte Veröffentlichung 0.1.20 enthält diese Werkzeuge noch nicht.

Das erweiterte Paket mit 40 Mathevorlagen, variablen Matrizen, Zahlensystemen,
DNF/KNF, KV-Gruppen, Diagrammen, verdeckten Lösungen, Statistik und
PDF-Bildausschnitten ist in [STUDY_TOOLS](STUDY_TOOLS.md) beschrieben.

## Formeln ohne LaTeX auswendig zu lernen

Im visuellen Notizeditor **Formel** wählen oder am Absatzanfang `/math` tippen
und Enter drücken.
**Gleichung** im Bausteinmenü setzt eine Formel als eigenen Absatz.
Im PDF unter **Markierungen & Fragen → Mitschrift** gibt es dieselben Werkzeuge
direkt über dem Notizfeld.

1. **Bruch** wählen, Zähler tippen, Tab drücken, Nenner tippen.
2. Mit **Formel einfügen** oder Strg/⌘+Enter übernehmen.
3. Weiter im Satz schreiben. Eine bestehende Formel im visuellen Editor anklicken,
   um sie erneut zu bearbeiten; Abbrechen verändert die Notiz nicht.

Vorlagen gibt es für Wurzeln, Potenzen, Indizes, Summen, Integrale, 2×2-Matrizen,
Mengen, Quantoren, griechische Buchstaben und Folgerung. Innerhalb des Feldes
funktionieren auch `/`, `^` und `sqrt` als Eingabehilfen. Die Bildschirmtastatur
öffnet sich über das Tastatursymbol im Formelfeld. Tab navigiert durch die
Platzhalter; Pfeiltasten bewegen den Cursor innerhalb der Formel.

**LaTeX bearbeiten** zeigt bei Bedarf den Quelltext. Das portable Format bleibt
`$…$` im Satz beziehungsweise `$$` auf eigenen Zeilen. MathLive darf äquivalente
LaTeX-Schreibweisen normalisieren, etwa `\frac12` für `\frac{1}{2}`. Formeln werden
mit KaTeX dargestellt, einschließlich MathML für assistive Technik. Bestehender
fehlerhafter oder nicht unterstützter Quelltext bleibt lesbar und editierbar.
Unvollständige neue Eingaben werden vor dem Einfügen angezeigt.

## 0/1-Tabellen automatisch erstellen

**Wahrheitstabelle** im Editor, `/wahrheit` am Absatzanfang oder das Werkzeug neben
dem PDF öffnen.
Einen logischen Ausdruck eingeben, zum Beispiel `(P + Q) · !R`.
Die Vorschau zeigt sofort alle Belegungen in der Reihenfolge 000, 001, …, 111.

| Bedeutung | Akzeptierte Eingabe |
| --- | --- |
| UND | `&`, `&&`, `*`, `·`, `⋅`, `∧`, `AND` |
| ODER | `\|`, `\|\|`, `+`, `∨`, `OR` |
| NICHT | `!`, `~`, `¬`, `NOT` |
| XOR | `^`, `⊕`, `XOR` |
| Weitere Gatter | `NAND`, `NOR`, `XNOR` |
| Folgerung | `->`, `=>`, `→`, `⇒` |
| Äquivalenz | `<->`, `<=>`, `↔`, `⇔` |

Klammern machen die Reihenfolge eindeutig. Ohne Klammern gilt NICHT vor UND/NAND,
XOR/XNOR, ODER/NOR, Folgerung, Äquivalenz. Folgerungen sind rechtsassoziativ.
Variablen sind Namen wie `P`, `Q` oder `Eingang_1`; Groß-/Kleinschreibung zählt.
`0`, `1`, `true`, `false` sind Konstanten.

**Zwischenschritte zeigen** ergänzt Teilausdrücke als Spalten. **Ergebnisse zeigen**
abschalten, wenn eine ausfüllbare Übungstabelle benötigt wird. Nach dem Einfügen
ist es eine gewöhnliche bearbeitbare Markdown-Tabelle. Höchstens sechs Variablen
erzeugen maximal 64 Zeilen; der Ausdruck darf bis zu 256 Zeichen enthalten.
Die zusätzlichen Zahlensystem- und DNF/KNF-/KV-Helfer sind über die
[Lernwerkzeuge](STUDY_TOOLS.md) erreichbar.

## Im langen PDF bleiben

**Seitenübersicht** neben der Seitensteuerung öffnet eine horizontale Vorschaureihe.
Zwei Finger scrollen darin; eine Vorschau springt zur betreffenden Seite.
Nur Bilder nahe dem sichtbaren Bereich werden gerendert. Der vorhandene
Trackpad-Zoom, die Seitensuche und Quellenmarkierungen verwenden weiterhin
die bestehenden Reader-Abläufe.

In **Mitschrift** wird am zuletzt gesetzten Cursor eingefügt. Markierter Text wird
ersetzt. **Vorschau** zeigt Formeln und Tabellen, während der bearbeitbare Text
erhalten bleibt. Entwurf, automatische Speicherung und Versionskonflikte laufen
weiter über die vorhandene Notizverwaltung. Die neuen Werkzeuge berechnen lokal;
Fonts liegen im App-Paket und werden von der PWA zwischengespeichert.

Eine Gleichheit mit handschriftlichem Unterrichtstempo ist noch nicht gemessen.

## Schneller Zugriff und Arbeitsbereich

Im Formeldialog markiert der Stern eine Vorlage als Favorit. Die zuletzt
eingefügten Vorlagen stehen ebenfalls direkt bereit. Suche etwa nach „fraction“,
„Bruch“ oder „matrix“; Pfeiltasten und Enter wählen die passende Vorlage.
Favoriten speichern nur Vorlagenkennungen, keine eigenen Formeltexte.
Im Mitschriftfeld öffnet auch `Formel: /bruch` mit Enter die passende Eingabe.
Abbrechen erhält den Text und setzt den Cursor wieder an die ursprüngliche Stelle.

**Arbeitsbereich öffnen** im Kurs oder PDF führt unmittelbar zu Quelle,
Mitschrift, Karten und Kursübungen. Ein angenommener Lernplan ist dafür nicht
erforderlich. Die Trennlinie zwischen Quelle und Mitschrift lässt sich ziehen
oder mit Pfeiltasten verändern; Doppelklick stellt die Standardaufteilung wieder
her. Unter 960 px werden die Bereiche einzeln angezeigt.

**Hier weitermachen** auf Heute stellt zuletzt geöffneten Kurs, PDF-Version,
Seite und Notiz bereit. Der begrenzte Verweis bleibt auf diesem Gerät erhalten;
beim Wechsel der Verbindung wird er entfernt. Entwürfe und Notiztexte verwenden
weiterhin die bestehende Notizverwaltung.

Der echte MacBook-/Safari-/Unterrichtstest ist in [MANUELL_TESTEN](MANUELL_TESTEN.md)
beschrieben.
