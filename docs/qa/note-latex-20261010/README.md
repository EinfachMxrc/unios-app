<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# LaTeX und zuverlässiger Schreibfluss in Notizen

Prüfung vom 10.10.2026. Alle Daten und Bilder sind synthetisch. Geprüft wurden
Notizeditor, Markdown, Notizleser, PDF-Mitschrift, PDF-Randkommentare und die
gemeinsam genutzten Mathewerkzeuge in Lern- und Fokusansichten. Persönliche
Notizen und lokale Hochschuldaten wurden nicht gelesen.

## Bedienung

Im Editor genügt die direkte Eingabe, ohne vorher ein Werkzeug zu öffnen:

| Zweck | Eingabe |
| --- | --- |
| Formel im Satz | `$x^2$` oder `\(x^2\)` |
| Große Gleichung in eigenem Absatz | `$$\frac{1}{2}$$` oder `\[\frac{1}{2}\]` |
| Bruch, Wurzel und Summe innerhalb der Formel | `\frac{a}{b}`, `\sqrt{x}`, `\sum_{i=1}^{n} i` |

Das schließende Zeichen wandelt die vollständige Eingabe in die Formel um.
Mehrzeilige Blöcke mit separaten Öffnungs- und Schlusszeilen funktionieren
beim Import und beim Tippen mit Enter. Formeln bleiben rückgängig machbar und
im Editor anklickbar. Strg/⌘+Shift+M öffnet den vorhandenen Formeleditor mit
Vorlagen; Tab wechselt dort zwischen den Feldern. Die kompakte Hilfe
„LaTeX direkt tippen“ ist standardmäßig zugeklappt.

In Markdown und der PDF-Mitschrift bleibt die eingegebene Quelle sichtbar;
Vorschau beziehungsweise Lesen zeigt die Formeln. PDF-Randkommentare haben
zusätzlich die aufklappbare passive Vorschau „Kommentar mit Formeln ansehen“.

## Befunde und Umsetzung

| Nutzerproblem | Bedienkonzept | Implementierung |
| --- | --- | --- |
| Vollständige Klammer-LaTeX-Syntax und einzeilige Gleichungen bleiben unformatiert. | Dieselben vier Schreibweisen in den Notizansichten; keine Vorab-Auswahl erforderlich. | Gemeinsame Tokenizer in `mathSyntax`, Inline- und Block-InputRules in `mathExtensions`; ursprüngliches LaTeX und Matrixzeilen bleiben erhalten. |
| Absichtlich escaped Dollarzeichen werden nach einer Bearbeitung als Formel geladen. | Dollarzeichen verhalten sich weiter wie normaler Text. | Passiver Ein-Zeichen-Knoten erhält `\$` beim Markdown-Roundtrip, mit enger Delete-/Backspace-Unterstützung und Undo. |
| Schnelles Strg/⌘+Pos1 nach Fokus springt sporadisch zurück ans Ende. | Eine gewählte Schreibposition bleibt für die nächste Taste gültig. | Explizite Auswahl für Mod-Home/End synchronisiert Editorzustand und DOM; Shift erweitert die Auswahl. Initiale Cursorwiederherstellung übersteuert keinen bereits fokussierten Editor. ProseMirrors installierte Fokusheuristik erklärt den reproduzierten alten Fehler. |
| Nach dem Wechsel aus Vorschau oder Lesen bleibt der Fokus auf dem Schalter. | Sofort an der bisherigen Schreibposition weitertippen. | Fokus nur nach ausdrücklichem Moduswechsel; Markdown-Auswahl wird gespeichert und bei Rückkehr wiederhergestellt. |
| Dateiimport kann während des Einlesens neu getippten Text überschreiben. | Neuere Eingaben bleiben erhalten; bei Änderung wird der Import klar abgebrochen. | Ursprünglicher Einfügebereich und Text werden geprüft; Lesefehler, Längenlimit und Verlassen des Editors werden behandelt. |
| Viele Tabellenspalten zerlegen Überschriften in einzelne Buchstaben. | Natürliche Spaltenbreite und eigener Scrollbereich. | Automatische Tabellenbreite, Mindestbreite je Zelle, normaler Wortumbruch; nativer Wrapper ist per Tab und Pfeiltaste erreichbar. |
| Breite Formeln und Code verdrängen den Notizbereich. | Innerhalb der Notiz scrollen, normale Sätze umbrechen. | Begrenzte Formelbreite und eigene horizontale Scrollbereiche; Codeeinrückung bleibt erhalten. |
| „Bearbeiten“ wird mobil bei großer Schrift abgeschnitten. | Kursbezeichnung und Aktionen dürfen mehrere Zeilen verwenden. | Flex-Wrapping und begrenzte Aktionsbreite im Notizkopf, auch in schmalen Splitbereichen. |

Beim bloßen Öffnen oder beim Wechsel der Ansicht wird keine neue Notizversion
geschrieben. Aktive Bearbeitung verwendet für Formelknoten die portable
Dollar-Schreibweise; der LaTeX-Ausdruck selbst bleibt erhalten. Code, Preise,
escaped Dollarzeichen und unvollständige Eingaben werden nicht als gültige
Formel behandelt. Bei unvollständiger importierter Klammer-Syntax gelten
weiterhin die normalen CommonMark-Escape-Regeln. Nicht unterstütztes oder
ungültiges LaTeX bleibt als bearbeitbare Quelle lesbar.

Der vorhandene KaTeX-Renderer behält `trust:false`, Größen- und
Expansionsgrenzen. Die Randkommentarvorschau aktiviert keine HTML-Inhalte,
externen Bilder, Links oder Lernwidgets und verändert den Kommentartext nicht.
Bestehende Notizfunktionen und interne Quellenlinks bleiben verfügbar.

## Abnahme

Alle **1.080 Frontendtests in 124 Dateien**, Typecheck, vollständiges ESLint,
67 de/en-Namespaces und der PWA-Build bestanden. Nach der letzten reinen
Testselektor-Korrektur bestand auch gezieltes ESLint für die Browserdateien.

**61 unterschiedliche Browserfälle** sind abgenommen: 60 bestanden im
gemeinsamen Lauf; ein älterer Fokusansicht-Test suchte noch nach einer
überschriebenen `h3` statt dem aktuellen Aufgabendokument. Nach Umstellung
dieses Selektors bestand derselbe Layouttest gezielt. Seine Breiten- und
Positionserwartungen wurden nicht abgeschwächt. Die vorher sporadische
Tastaturnavigation bestand zusätzlich acht Wiederholungen.

Die zehn neuen Browserfälle prüfen direkte Inline-/Blockeingabe, Import,
Originalquelle, Speichern und erneutes Öffnen, keine Schreibvorgänge beim
Öffnen, Undo/Redo, Formeleditor, Escape-/Preis-/Codefälle, echte Entf-/Backspace-
und Auswahl-Tasten, Markdown-Schreibposition, PDF-Mitschrift und Randkommentar.
Bestehende Abnahmen decken zusätzlich Vorlagen, interne Links, Offline-Formeln,
Bild-/Audioblöcke, Speicherkonflikte und PDF-Arbeit bis Seite 80 eines
synthetischen 120-Seiten-Dokuments ab.

Vier neue Bilder wurden nach der letzten UI-Korrektur in Hell/Dunkel bei
1280×720 und 390×844 erstellt und selbst geprüft. Die mobilen Bilder zeigen
150 % Schrift, Tabellenkeyboardscroll wurde bei 100/150 % geprüft. Formeln,
Code und Tabellen bleiben innerhalb ihrer Scrollbereiche; „Bearbeiten“ bleibt
vollständig im Kopfbereich. Vollseitenaufnahmen können die fixe mobile
Navigation mitten im Bild abbilden; das ist ein Aufnahmeeffekt.

Fünf aktuelle Bilder der bestehenden PDF-Abnahme sind hier zusätzlich als
`reader-*.png` versioniert und geprüft. Die früheren Prüfaufnahmen im Ordner
`reader-workspace-20261007` wurden nach dem Test unverändert wiederhergestellt.

Prüfergebnisse, Quellen- und Bildhashes stehen in `verification-final.json`.
Keine neue Abhängigkeit, Backend-/Schemaänderung, echte Datenmigration,
GitHub-Veröffentlichung, Windows-Installation oder Serververöffentlichung
gehört zu diesem lokalen Arbeitspaket.
