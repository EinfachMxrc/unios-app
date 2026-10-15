<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Navigation und UI-Struktur

## Ein Bereichskatalog

`frontend/src/components/sidebarCatalog.ts` beschreibt stabile Bereichs-IDs,
Routen einschließlich Detailansichten, Gruppen, Elternbereiche, Icons, übersetzte
Namen und die nötigen UI-Module. App-Routing, Vorladen, Seitenleiste, mobile Leiste,
Mehr und Befehlspalette leiten ihre Metadaten daraus ab. Neue Seiten erhalten
zusätzlich eine statisch importierbare React-Komponente in Apps Komponentenkarte.
Modulsichtbarkeit ersetzt keine API-Berechtigung.

Heute, Kurse, Lernen, Notizen und Termine sind die Standardnavigation. Gespeicherte
Anordnungen bleiben erhalten. Ausgeblendete Hauptbereiche sind unter Mehr weiterhin
erreichbar; abgeschaltete Module erscheinen dort nicht. Mehr ist mobil nur oben erreichbar. Lernunterseiten
liegen im gemeinsamen Lernbereich und bleiben über Registerkarten und die
Befehlspalette erreichbar. Mehr wiederholt diese Unterseiten nicht als weitere
Hauptbereiche. Hochschulunterlagen sind dort ein sekundärer Wissensbereich.

## Shell und Speicher

Shell verbindet Seitenzustand und Hinweise. Sidebar rendert die Navigation,
Topbar den Quellenpfad und globale Aktionen. useSidebarState verwaltet Breite,
Sichtbarkeit, Abschnitte und Kursgruppen. useTheme verwaltet das gemeinsame Design;
nur App aktiviert dessen Dokumenteffekt. Bestehende `marc-*`-UI-Präferenzen werden
beim ersten Lesen nach `unios-*` kopiert; die Originale bleiben für ältere Clients
erhalten. Neuere Einstellungen haben Vorrang. Notiz- und Codeentwürfe werden durch
diese UI-Migration nicht verändert.

Der gemeinsame Neu-Einstieg öffnet Notiz, Schnellnotiz, Datei oder Sprachnotiz.
Bereichsbezogene Aktionen, beispielsweise eine Notiz zur markierten PDF-Stelle,
bleiben direkt an ihrer Quelle verfügbar.

## Darstellung und Komponenten

`styles/application.css` und die vorab geladenen Komponenten legen dieselbe Reihenfolge
fest: theme, base, components, utilities, workspace, interactions, accessibility.
Dadurch können Tailwinds Basisregeln das Layout nicht nachträglich zurücksetzen. `styles/workspace-layout.css` bündelt die zuvor einzeln importierten globalen
verbleibenden gemeinsamen Layoutregeln. Designvariablen liegen zusätzlich in
styles/theme-tokens.css; Seitenleiste, Kopfleistenlayout und Befehlspalette haben
eigene Dateien innerhalb derselben workspace-Schicht. Mehrfach definierte Farbwerte
sind in theme-tokens.css auf den jeweils tatsächlich geltenden Wert zusammengeführt;
index.css hält Framework-Zuordnungen und Basiswerte in der base-Schicht;
Topbar, ScrollTabs und Settings besitzen eigene Komponentendateien. Alte globale
Quelldateien bleiben zur Nachverfolgung erhalten, werden von App aber nicht mehr
zusätzlich importiert. Die visuelle Browsermatrix kontrolliert die resultierende
Kaskade; die Zusammenführung allein behauptet keine neue Performance-Messung.

ReaderParts trennt PDF-Seiten und Anmerkungen vom Reader. NoteDocument kapselt
Autosave, Konflikte und Versionen; NewNote die Erstellung. IntakeRow kapselt die
Zuordnung im Eingang. ResourceChooser kapselt die KI-Quellenauswahl. studioCommands
trennt Block-/Slash-Kommandos und ProseMirror-Inspektion vom React-Editor.
PDF-Bedienelemente haften unter der Kopfleiste; direkte Seiten- und Suchsprünge
setzen die Scrollposition sofort, damit ein schneller Seitenwechsel keinen
unvollständigen Animationszustand im Navigationsverlauf speichert. Horizontale
Registerkarten halten das gewählte Ziel auch nach einer Größenänderung sichtbar;
die Pfeile erlauben anschließend das freie Blättern.

## Feedback

Problem melden springt zum Feedbackabschnitt. GitHub erhält einen Entwurf nur mit
der eingegebenen Beschreibung und dem Ziel, keine automatisch erhobene Diagnose.
Der Nutzer öffnet und sendet ihn selbst. Die Beschreibung im URL-Entwurf ist auf
2.400, das Ziel auf 600 Zeichen begrenzt. Der JSON-Download enthält den vollständigen
Bericht, optional mit ausdrücklich ausgewählter Diagnose; er ist keine Meldung.

## Prüfung

Regressionen prüfen fünf mobile Ziele, genau einen aktiven angehefteten Bereich,
Modulsperren auch bei direkter URL, Befehlspalette, Quellenpfade, Designmigration,
GitHub-Entwurf und den Willkommenshinweis. Große Datenbestände werden dabei nicht
auf echte Hochschulkonten umgestellt. Die vollständige Abnahme wird im Fortschritt
dokumentiert; unveränderte Alpha-Installer enthalten diese Entwicklung nicht.

## Testverzeichnisse und Bestandsdateien

Die aktiven Tests schreiben bereits über pytest-Temporärverzeichnisse (`tmp_path`),
nicht in die genannten alten Campus-/Mensa-Ordner. Der vollständige Lauf dieser
Phase verwendet zusätzlich einen expliziten `--basetemp` im Betriebssystem-Temp.
Alte Testordner und OneDrive-Archive wurden nicht gelesen, gelöscht oder eingecheckt.
Die Dokumentationsübersicht trennt Nutzerhilfe, Entwicklung und Betrieb, ohne
bestehende Links zu verschieben.
