<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Produktkritische Prüfung der Kernarbeit

Stand: UniOS 0.1.22, HEAD `05e56cfad86b110e2d1be505adad2b58e3ab6d2a`.
Geprüft wurden ausschließlich Quellcode und synthetische QA-Bilder. Keine echten
Dokumente, App-Daten, Zugangsdaten oder Produktdateien wurden verändert.
Die Prüfung verwendet den Product-Lens-Leitfaden zur Frage „Welchen Arbeitsschritt
erleichtert diese Seite?“ und die [gemeinsame Zustandskarte](state-map.md).
Datei:Zeile-Belege beziehen sich auf diesen Quellstand. Zeitangaben und tatsächliche
Mitschriftgeschwindigkeit wurden nicht gemessen.

## Haupturteil

Die fünf Hauptwege Heute, Kurse, Lernen, Notizen und Termine sind sinnvoll.
Die Kernprobleme liegen innerhalb der Arbeitsabläufe: mehrere Arten von Notiz,
zwei Einstiege in denselben Reader und ein Speichervorgang, der die vermeintlich
fortlaufende Mitschrift wieder in einen leeren Neuerstellungszustand versetzt.
Zusätzliche Seiten oder Werkzeuge würden diese Reibung derzeit vergrößern.

Die Seiten sollten nach ihrem Auftrag unterschieden werden:

| Seite | Auftrag | Urteil |
| --- | --- | --- |
| Heute | Den nächsten sinnvollen Schritt wählen und eine Arbeit fortsetzen | Behalten, weniger konkurrierende Prioritäten |
| Kurse | Das Fach wählen | Behalten, einfache Übersicht |
| Kursdetail | Materialien, Aufgaben und Notizen eines Fachs verwalten | Behalten; Arbeitsaktionen in den Fokusarbeitsplatz führen |
| Materialviewer | Eine konkrete Quellenversion lesen, markieren und zitieren | Als direkter Einstieg behalten; denselben Arbeitsplatz verwenden |
| Fokusarbeitsplatz | Quelle, fortlaufende Mitschrift und Wiederholung im Fach zusammenhalten | Behalten, als normalen Arbeitsort stärken |
| Notizen | Eigene dauerhafte Dokumente durchsuchen und bearbeiten | Behalten; dieselben Dokumente wie im Fokus verwenden |
| Schnellnotizen | Ungeordnete Gedanken sicher erfassen und später verarbeiten | Kontextuell; als kleine Eingangsliste in Notizen integrieren |
| Suche | Einen konkreten Inhalt über alle Ablagen hinweg finden | Behalten; Schnellpalette und Vollansicht als zwei Größen derselben Suche |
| Sammlungen | Wiederkehrende, gespeicherte Filter auf vorhandene Objekte | Optional; als gespeicherte Ansichten in Suche/Kurs/Lernen integrieren |

## Prüfszenario

Ein Erstsemester öffnet ein 120-seitiges Analysis-Skript auf Seite 12, schreibt
eine Erklärung und einen Bruch mit der Tastatur, übernimmt ein Zitat, speichert,
schreibt auf Seite 13 weiter und fragt sich später in einer Wiederholung ab.
Zwischendurch muss eine spontane Frage gesichert werden. Am nächsten Tag sollen
Quelle, Seite und dieselbe Mitschrift wieder offen sein. Eine Formel soll als
Werkzeug verfügbar sein, ohne dass ein neuer Ablageort gewählt werden muss.

Der schnelle Pfad lautet: Heute → Fortsetzen → Quelle/Mitschrift → in derselben
Notiz weiterarbeiten. Der derzeitige Pfad bricht nach dem ersten Anlegen einer
Mitschrift: Das Formular wird zurückgesetzt; zum Bearbeiten der gespeicherten
Notiz muss der Nutzer in einen anderen Modus oder in die globale Notizseite
wechseln. Die technische Speicherung ist davon getrennt und wird nicht als
Datenverlust dargestellt.

## 1. Heute

**Zweck und Urteil:** Tagesstart und Fortsetzen. Behalten. Die ruhige Hierarchie
der synthetischen Bilder funktioniert; die Seite braucht eine eindeutige
Handlungsempfehlung statt mehr Kennzahlen.

**Nutzer-Pain:** „Jetzt sinnvoll“ kann fällige Karten, ein schwaches Thema oder
eine Aufgabe nennen, während der große Button wegen einer gespeicherten Session
zu einem anderen PDF führt. Der Nutzer muss selbst unterscheiden, ob der Button
die Empfehlung ausführt oder nur die letzte Arbeit öffnet. „Schnelle Notiz“ führt
außerdem zu einem Jot und nicht zu einem dauerhaften Notizdokument.

**Beleg:** `Today.tsx:83–98` priorisiert die Lernempfehlung; `:120–126` priorisiert
beim Hauptbutton unabhängig davon den letzten Arbeitsplatz. `:128–133` bietet
zusätzlich Schnellnotiz und Studientag. `:331–345` rendert den Jot-Editor am Ende
der Seite. Das sind belegte Komponentenentscheidungen; die Bewertung der
konkurrierenden Handlungsziele ist ein Designurteil.

**Konzept und Komponentenlogik:** Zwei klar benannte Zustände: „Fortsetzen:
Analysis · Seite 12“ als Hauptaktion und „Heute empfohlen: 8 Karten wiederholen“
als direkt ausführbare Nebenaktion. Eine einzige globale Schnellaufnahme öffnet
einen kleinen Dialog am aktuellen Arbeitsplatz, statt zu einem Formular weit
unten auf Heute zu scrollen. Sie zeigt anschließend „In der Eingangsliste“ samt
eindeutigem Link. Studientag bleibt eine sekundäre Planungshandlung.

**Umsetzung:** In `Today.tsx:79–133` Empfehlung und Resume als getrennte Modelle
mit eigenem Ziel ableiten. `JotCapture` mit gemeinsamem Draftzustand in den
globalen Aufnahme-Dialog einbetten; `Today.tsx:331–353` zu Status/Link verdichten.
Den bestehenden begrenzten Resume-Handle in `lib/studyResume.ts:23–49` behalten.
Abnahme: Eine angezeigte Empfehlung öffnet genau das benannte Lernziel; eine
ungesicherte Schnellaufnahme bleibt beim Schließen und Wiederöffnen erhalten.

## 2. Kurse

**Zweck und Urteil:** Das richtige Fach finden. Behalten; kein zweites Dashboard.
Kursname, Semester und aktiver Zustand reichen für die Standardansicht.

**Nutzer-Pain:** Ein archivierter Kurs wird über „Alle Semester“/„Inaktive“
gefunden. Nach Öffnen und Rückkehr kann die Auswahl zurückgesetzt sein, weil
beide Filter nur lokalen Komponentenstate verwenden. Über mehrere Semester
hinweg fehlt eine kleine Kursnamensuche. Die Kursentdeckung ist dagegen eine
Einrichtungsaufgabe, die selten während einer Vorlesung gebraucht wird.

**Beleg:** `Courses.tsx:15–18` verwendet `useState`; `:21–26` enthält die zwei
Filter; `:38–46` führt ausschließlich in das Kursdetail. `:59` montiert die
Kursentdeckung. Die Rücksetzung beim Remount folgt aus dem State-Eigentümer;
die Suche und stärkere Zurückhaltung der Einrichtung sind Designvorschläge.

**Konzept und Umsetzung:** `Courses.tsx:15–18` auf die bestehende
`useWorkspaceState`-Logik oder explizite URL-Filter umstellen. Eine kleine
Namenssuche bei tatsächlich vielen Kursen anbieten. Einrichtung in einem
geschlossenen Abschnitt oder im leeren Zustand zeigen. Optional eine einzelne
„Fortsetzen“-Aktion pro kürzlich bearbeitetem Fach, mit begrenztem Handle und
ohne zusätzliche Aufgaben-/Karten-/Notizenkennzahlen. Abnahme: Nach Kursdetail
→ Zurück bleiben Semesterfilter und betrachtete Liste erhalten.

## 3. Kursdetail

**Zweck und Urteil:** Fachbezogener Katalog und organisatorische Übersicht.
Behalten. Aufgabe, Abgabe und Gruppensteuerung gehören hierhin; das Schreiben
selbst soll im Fokus stattfinden.

**Nutzer-Pain:** Dateititel und „PDF öffnen“ führen in den Einzelviewer, die
prominente Arbeitsplatzaktion dagegen zunächst in einen zusätzlichen Katalog.
„Neue Notiz“, „Notiz vorbereiten“, „Kursnotizen“ und der ältere Kursfreitext
führen zu ähnlichen, aber technisch unterschiedlichen Ablagen. Zudem kann ein
Materialfilter eine scheinbar leere Kursübersicht erzeugen.

**Beleg:** `CoursePage.tsx:179`/`:203` öffnen `/material`; `:280–281` öffnet den
Fokus; `:223–226`, `:283–285` und `:577–578` eröffnen neue Notizen. Der ältere
Freitext steckt in `CourseMaterialPanel`, eingebaut unter weiteren Werkzeugen
in `CoursePage.tsx:641–648`. Suche/Offset in `:51–67` wirken auch in anderen
Tabs. Die Übersicht nimmt aus dieser Antwort sechs lokal sortierte Materialien
(`:516–522`). `CatalogRepository.materials:53–70` filtert und paginiert davor
alphabetisch; `app/web/api.py:249` begrenzt standardmäßig auf 50.

**Browserbestätigter Filterfehler:** Der gemeinsame synthetische Probe
`course-search-leaks-into-overview` in
[behavior-probes.json](behavior-probes.json) meldet `bug_reproduced: true` bei
drei tatsächlich vorhandenen Ressourcen: Im Unterlagen-Tab einen Suchbegriff
ohne Treffer eingeben, anschließend auf den Übersichtslink wechseln. Die
Übersicht zeigt „Noch keine Unterlagen“ und am Unterlagen-Tab die Zahl 0
([Bildbeleg](screenshots/probe-course-filter-overview.png)). Eine erfolglose
Suche wird damit als fehlender Kursbestand dargestellt. Der Probe verwendet
das Suchfeld mit Rolle `searchbox` und die Tabs als Links; der frühere
Locator-Timeout ist durch diesen erfolgreichen Nachweis ersetzt.

**Konzept:** Eine Dateizeile hat eine Hauptaktion „Lesen & mitschreiben“, die mit
Quellenversion in den bekannten Fokusarbeitsplatz führt. Download und Historie
stehen unter „Mehr“. „Notizen“ zeigt die dauerhaften Dokumente; der ältere
Freitext wird als solcher beschriftet und später ausdrücklich in ein normales
Kursdokument überführbar. Gruppenwahl bleibt kontextuell im Material-Tab.

**Umsetzung:** `renderResources` in `CoursePage.tsx:157–234` mit einem zentralen
Arbeitsplatz-Ziel versehen; Hauptaktion und Versions-/Downloadaktionen trennen.
Materialtab-Filter dürfen die Übersicht nicht einschränken. Für „Jüngste
Unterlagen“ eine serverseitig nach Aktualität begrenzte Übersicht abrufen statt
die aktuelle alphabetische Listenseite nachträglich zu sortieren. Bei einer
Zusammenführung des Freitexts ursprüngliche Daten und Revisionen erhalten;
keine automatische Löschung oder stille Übernahme.

## 4. Materialviewer

**Zweck und Urteil:** Versionsgenaue Quelle lesen und verarbeiten. Behalten als
Direktlink; Oberfläche und Editor mit dem Fokusarbeitsplatz zusammenführen.
Die Wiederverwendung von `MaterialReader` ist bereits die richtige Architektur.

**Nutzer-Pain:** „Markierungen & Fragen“ enthält auch Mitschrift und Wiederholen.
Die zusätzliche Mitschriftaktion öffnet denselben Bereich mit anderem Tab.
Ein weiterer Button „Arbeitsplatz öffnen“ wechselt den Rahmen, obwohl Quelle,
Seite und Bearbeitung gleich bleiben. Der Nutzer muss lernen, welcher Einstieg
welche Darstellung und welchen Standardtab erzeugt.

**Beleg:** `MaterialPage.tsx:99–103` setzt unterschiedliche Startzustände für
eingebetteten und direkten Reader. `:579–600` erstellt denselben Werkzeugbereich;
`:636–666` zeigt Arbeitsplatz-, Markierungs- und Mitschriftaktionen.
`ReaderStudyTools.tsx:48–59` enthält die drei Tabs. Das sind funktionierende
Zugänge, keine drei getrennten Speicherimplementierungen.

**Konzept und Umsetzung:** Ein Werkzeugbereich „Quelle & Mitschrift“ mit Tabs
„Markierungen“, „Mitschrift“, „Abfragen“; der aktive Tab ist im Auslöser sichtbar.
Ein Direktlink `/material/:version?page=...` öffnet genau die Quelle im gleichen
Arbeitsrahmen, ohne erneute Quellenauswahl. Rahmeninformationen in
`MaterialPage.tsx:602–714` zu einer schmalen Kontextzeile verdichten. Bestehende
Reader-Seiten-, Split-, Versions- und Quellenbeleglogik erhalten. „Abfragen“
klar als ungeplante Eigenabfrage kennzeichnen; es speichert laut
`i18n/locales/de/material.ts:33` keine Lernbewertung und ersetzt Anki nicht.

**Wichtigste Änderung:** Die Mitschrift bindet nach dem ersten Anlegen ein
dauerhaftes Notizdokument und schreibt darin weiter. Heute arbeitet mit demselben
Handle weiter. „Neue Mitschrift“ ist danach eine ausdrückliche Nebenaktion.
Derzeit setzt `ReaderStudyTools.tsx:157–175` den bestätigten Entwurf zurück;
`:178–187` erstellt erneut über `saveSourceNote`, und `:209–223` bietet einen
Link zur gespeicherten Notiz an. `lib/sourceNoteSave.ts:126–144` führt einen
POST zur Neuerstellung aus. Das ist ein belegter Ablauf mit unpassender
Vorlesungsergonomie, kein behaupteter Verlust gespeicherter Texte.

Für den Umbau einen vorhandenen Note-/Revision-Editor im Reader adaptieren,
statt ein zweites Speichersystem einzuführen. Lokale Entwürfe, Writer-Grenze,
Versionskonflikte und ältere ACKs müssen dieselben Regeln wie `NoteDocument`
behalten. Abnahme: Speichern nach zehn Minuten → auf Seite 13 weiterschreiben
→ erneut speichern; dieselbe Notiz-ID, beide Abschnitte und beide Quellenlinks.

## 5. Fokusarbeitsplatz

**Zweck und Urteil:** Normaler Arbeitsort für ein Fach oder einen angenommenen
Lernblock. Behalten. Quelle, Seite und Kurs werden korrekt über begrenzte
Handles zusammengehalten; der Reader wird wiederverwendet.

**Nutzer-Pain:** „Quelle & Mitschrift“ und „Kursnotizen“ wirken wie zwei Arten von
Mitschrift. Nach Anlegen muss die eigene Notiz in einem anderen Modus bearbeitet
werden. „Kurskarten“ ist ein echter Seitenwechsel; die anderen Modi wechseln
innerhalb des Arbeitsplatzes. Im Notizenmodus fehlt eine direkte Neue-Notiz-
Aktion; der leere Zustand verweist zurück zur Quelle.

**Beleg:** `FocusWorkspacePage.tsx:95–115` ändert Route/Modus, `:152–156` mischt
interne Modusschalter mit dem Link zu `/study`. `:167–169` bettet denselben
Reader ein; `:182–195` wählt vorhandene Notizen und bietet bei Leere die Quelle
an. `:205–216` nutzt `NoteDocument` und prüft den Kurs. Die gesicherte Notiz
wechselt über `savedNoteHref` (`:112–115`) in den Notizenmodus.

**Konzept und Umsetzung:** Modus „Lesen & Schreiben“ mit Quellenauswahl und
einem Zielnotiz-Selektor; „Meine Notizen“ ist die Dokumentauswahl dieses Editors.
„Abfragen“ bündelt kontextuelle Eigenabfrage und einen klaren Einstieg in die
echte Kartenwiederholung. Den Seitenwechsel visuell kenntlich machen. Eine neue
leere Kursnotiz direkt aus dem vorhandenen Note-Create-Flow öffnen, auch wenn
das Fach noch kein lesbares Dokument hat. `choose` und `savedNoteHref` um einen
stabilen Notizhandle erweitern; keine fachlichen Daten im UI-Store duplizieren.

**Belegter Widerspruch:** Die Quellenauswahl in `:127–130` prüft `hasPdfView`.
`lib/materialView.ts:3–4` akzeptiert nur PDF/TXT. Der vorhandene Viewer unterstützt
laut `app/material/preview.py:35–42` zusätzlich PowerPoint/Word, sofern die
Konvertierung vorhanden ist. Statt diese Dateien stumm auszublenden, eine
gemeinsame Material-Fähigkeitsprüfung mit erkennbarer Vorschauverfügbarkeit
verwenden. Abnahme: Eine vorbereitete PPTX-Quelle ist sowohl im Kurs als auch
in der Fokusauswahl erreichbar; fehlende Konvertierung zeigt einen ehrlichen
Originaldownload.

**Browserbestätigter Fokusfehler:** `WorkspaceNavigation.tsx:12–21` erkennt beim
passiven Seitenabgleich nur Block/Zyklus, obwohl `reportPage` in
`FocusWorkspacePage.tsx:104–109` auch beim Kurs die Seite meldet. Der gemeinsame
synthetische Probe `course-passive-page-replace-focus` in
[behavior-probes.json](behavior-probes.json) meldet `bug_reproduced: true`:
Nach der Reader-Metadatenersetzung wechselt der Fokus von `TEXTAREA` zum `H1`
„Fokussiert lernen“. Kurs als gültigen passiven Reader-Kontext behandeln und
den Fokus beim Seitenabgleich erhalten. Der Probe stammt aus dem gemeinsamen
Browserlauf; hier wurde er lesend geprüft und nicht erneut ausgeführt.

**Timinggrenze der frühen Bilder, kein bestätigter Seitenfehler:** Die
Gesamtbilder [Desktop](screenshots/learningFocus-detail-1440.png) und
[Mobil](screenshots/learningFocus-detail-390.png) wurden offenbar vor der
asynchronen Positionswiederherstellung aufgenommen und zeigen noch Seite 1.
Der nachfolgende gezielte Probe `reader-initial-page-course` in
[behavior-probes.json](behavior-probes.json) wartet auf die Darstellung und
anschließend 250 ms: Der Readertext zeigt „Seite 12 von 120“, die URL enthält
weiter `page=12`, und `bug_reproduced` ist `false`. Das numerische Feld
`actual_page` ist wegen eines unpassenden Spinbutton-Selektors `null`; es ist
kein Nachweis einer fehlenden Seite. Text und URL bestätigen die korrekt
wiederhergestellte Seite. Den frühen Bildzustand daher nicht als Produktfehler
werten. Der separat bestätigte passive H1-Fokuswechsel bleibt bestehen.

## 6. Notizen

**Zweck und Urteil:** Dauerhafte eigene Dokumente. Behalten. Quelle-Mitschriften
und globale Notizen sollen dieselben Dokumente sein; „Deine Seiten“ braucht
keinen zusätzlichen fachlichen Objekttyp.

**Nutzer-Pain:** Auch bei einer direkt geöffneten Notiz stehen Kursfilter,
Suchfeld und mehrere Reihen Dokumentkarten vor dem Editor. Bei vielen Notizen
drängt dies den Inhalt nach unten, besonders mobil. „Zu den Kursen“ führt bei
einem kursgefilterten Dokument stets zur gesamten Kursliste.

**Beleg:** `NotesPage.tsx:77–164` rendert zuerst Aktionen und Index; `:175–183`
rendert erst danach das Dokument. `styles/workspace-layout.css:2065–2107`
verwendet eine vertikale Anordnung und umbrechende Indexkarten auch auf dem
Desktop. Der Editor-Fokus kann den Index bereits verstecken
(`components/editor/NoteStudio.css:479–485`); das ist eine vorhandene Basis.

**Visueller Beleg:** Bereits mit drei synthetischen Notizen beginnt der eigentliche
Text auf [Mobil](screenshots/note-editor-390.png) ungefähr 880 Pixel unter dem
Seitenanfang. Die Dokumentfläche beginnt auf
[Desktop](screenshots/note-editor-1440.png) ungefähr bei 425 Pixeln. Das ist eine
Bildbeobachtung, keine gemessene Bearbeitungszeit. Leere Verknüpfungs- und
Rückverweisbereiche sollten eingeklappt bleiben, bis sie Inhalt oder eine
bewusste Aktion haben. Der Willkommenssatz „Öffne links eine Notiz“
(`i18n/locales/de/notes.ts:220`, gerendert in `NotesPage.tsx:188`) widerspricht
der aktuellen Liste oberhalb des Editors. Nach dem Layoutentscheid eine
richtungsunabhängige Formulierung verwenden oder die tatsächliche Anordnung
korrekt beschreiben.

**Konzept und Umsetzung:** Desktop: schmale einblendbare Dokumentliste links,
Editor direkt sichtbar. Mobil bei `selectedId`: Dokument zuerst, Auswahlliste
über „Notiz wechseln“ als Dialog. Bestehende Filter/Offset weiter speichern,
statt das Fach beim Schließen zu verlieren. `NotesPage.tsx:78` kontextuell zum
aktuellen Kurs führen. Den vorhandenen Fokuszustand und Editor verwenden;
keine neue Editoroberfläche schreiben.

**Belegter Kontextfehler:** Die leere kursgefilterte Liste verlinkt in
`NotesPage.tsx:156–159` auf `/notes?new=1` ohne `course_id`. `NewNote.tsx:34`
wählt dann den ersten Kurs statt des zuvor gewählten Fachs. Die Leeraktion
soll `openNew` verwenden, das die Query erhält (`NotesPage.tsx:59–65`).
Abnahme: Leerer Kurs B → Neue Notiz → Kurs B vorgewählt.

## 7. Schnellnotizen

**Zweck und Urteil:** Gedanken ohne Ablageentscheidung aufnehmen. Als Funktion
behalten, als eigene gleichwertige Notizwelt kontextuell in Notizen integrieren.
Die Offline-Warteschlange hat einen eigenständigen technischen Nutzen.

**Nutzer-Pain:** Ein erfasster Gedanke kann einem Notizdokument zugeordnet
werden, ist dann aber noch nicht Bestandteil dieses Dokuments. Jede Zeile zeigt
zwei Zuordnungsfelder und einen Button; bei vielen Einträgen wirkt die Seite
wie Verwaltungsarbeit. Es fehlt ein eindeutiger Zustand „verarbeitet“ und die
Aktion „In Mitschrift übernehmen“.

**Beleg:** `JotsPage.tsx:36–41` schreibt nur die Zuordnung; `app/jots/store.py:80–92`
ändert `course_id` und `note_id`. `JotsPage.tsx:66–103` zeigt die Auswahl in jeder
Zeile. `:120` lädt einen Gesamtauszug; `:155–168` bietet weder Filter noch
Nachladen. `app/web/api.py:345–356` begrenzt stumm auf die neuesten 200 Jots.
Ältere Einträge sind damit in dieser Liste nicht durchblätterbar; globale Suche
kann bekannte Inhalte weiterhin finden. Es werden keine Daten gelöscht.

**Konzept und Umsetzung:** „Eingang“ innerhalb der Notizübersicht: ungeordnete
Gedanken, Fragen und Aufgaben mit wenigen Zeileninformationen. Zuordnung erst
beim Verarbeiten öffnen. Explizite Aktionen „Als Notiz“, „In bestehende Notiz
übernehmen“ und „Als Aufgabe“; Metadatenzuordnung nicht als Textübernahme
bezeichnen. Original-Jot und seine Beziehung bleiben erhalten. Die Übernahme
verwendet vorhandene Note-Revision-/Writer-Regeln und einen wiederholbaren
Schreibbeleg, damit kein Text doppelt angehängt wird. Paging/Filter in der API
und in `JotsPage` ergänzen, mit sichtbarer Gesamt-/Restzahl.

**Entwurfsrisiko:** `JotCapture.tsx:17–20` hält den noch nicht abgesendeten Text
nur im Komponentenstate. Heute „Schließen“ (`Today.tsx:341–345`) unmountet den
Editor; erneutes Öffnen beginnt leer. Bereits abgesendete Jots sind davon nicht
betroffen. Einen kleinen lokalen Capture-Draft mit eigener Identität halten;
erst nach bestätigtem Queue-Eintrag oder ausdrücklich „Verwerfen“ leeren.

## 8. Suche

**Zweck und Urteil:** Inhalte finden, nicht verwalten. Behalten. Die Schnellpalette
ist der Einstieg; die Vollansicht bietet viele Treffer, Filter und Offlinezustand.
Zwei Größen derselben Suche sind sinnvoll und müssen keine doppelten Seiten sein.

**Nutzer-Pain:** Im Treffer erscheint ein Textauszug; „Vorschau“ öffnet nochmals
denselben Auszug. „Kursnotizen“ und „Notizen“ im Typfilter bezeichnen verschiedene
Backendablagen, ohne dass dies für den Studenten verständlich ist. Resultate
werden in getrennten Typgruppen statt als durchgehende Relevanzliste gezeigt.

**Beleg:** `SearchPage.tsx:240` und `:245` verwenden exakt denselben `item.excerpt`;
`:140–142` bietet zwei Notiztypen. Der ältere Typ gehört laut
`app/search/repository.py:29` zu `course_scratchpads`, während Fokus „Kursnotizen“
die normalen Note-Dokumente lädt (`FocusWorkspacePage.tsx:87`). Die Typabschnitte
stehen in `SearchPage.tsx:229–367`. Schnellpalette und Seite verwenden dieselbe
API (`useCommandPaletteSearch.ts:26`, `SearchPage.tsx:37`); Enter kann zur
Vollansicht führen (`CommandPalette.tsx:139–144`).

**Konzept und Umsetzung:** Ein Treffer zeigt Titel, Kurs, Quellenart, Seite und
einen guten Auszug. Vorschau liefert zusätzliche Kontextzeilen oder einen
gerenderten Ausschnitt; andernfalls entfällt die redundante Vorschauaktion.
Ein Nutzerfilter „Eigene Notizen“ kann die beiden technischen Typen bündeln;
der ältere Freitext bekommt ein klares Herkunftslabel. Zentralen
`SearchResultItem` für Palette und Vollansicht nutzen; Ergebnisziele müssen
Version/Seite bzw. Notiz-ID bewahren. Globale Relevanzsortierung ist ein eigener
Backendvertrag und darf nicht aus ungleichen FTS-Werten nachträglich geraten
werden. Filter eher in einer schmalen Zeile mit aktivem Kurskontext anbieten.

Der technische Operatorhinweis steht derzeit vor dem Suchfeld
(`SearchPage.tsx:92`; [Mobilbild](screenshots/search-390.png)). Seine lange
Zeile mit `course:`, `type:`, `semester:` und Datumssyntax ist für eine leere
Einstiegssuche eine unnötige Lernaufgabe. Die vorhandenen normalen Filter
behalten; Syntaxhilfe bei „Suchoptionen“ oder einer aktiven Operator-Eingabe
öffnen. Das ist ein Designurteil, keine fehlerhafte Suchfunktion.

## 9. Sammlungen

**Zweck und Urteil:** Wiederkehrende Filter als gespeicherte Ansicht. Optional;
Filterbau in Suche/Kurs/Lernen integrieren. Als Expertentool behalten, bis die
normalen Arbeitsflächen die gespeicherten Ansichten übernehmen können.

**Nutzer-Pain:** „Prüfungsvorbereitung“, „Ungelesene Materialien“ und „Offene
Fragen“ konkurrieren mit Lernübersicht, Kursmaterialien und Suche. Fünf
Ansichtsformen und zahlreiche Filter vermitteln eine eigene Datenbank, obwohl
die Einträge nur Links auf vorhandene Objekte sind. Der Boardmodus gruppiert;
er ist kein Drag-and-drop-Workflow zum Ändern eines Status.

**Beleg:** `CollectionsPage.tsx:56–75` stellt zehn Vorlagen bereit; `:108–109`
öffnet vorhandene Objektziele. `:154–156` rendert Boardspalten ohne Mutation.
`:280–391` umfasst den Filterbau, `:385–388` die Ansichtswechsel mit explizitem
Anwenden. `:199–218` wählt nach neuem Seitenstart standardmäßig die erste
gespeicherte Ansicht; die konkrete Auswahl ist kein URL-Handle.

**Konzept und Umsetzung:** In den vorhandenen Listen „Ansicht speichern“ und
eine kleine Auswahl gespeicherter Ansichten anbieten. Ein gemeinsamer
`CollectionFilterEditor` öffnet bei Bedarf; Standard ist eine Liste mit sichtbaren
aktiven Filtern. Die Backendkonfiguration einschließlich Revision unverändert
verwenden. Ausgewählte Ansicht in URL/WorkspaceState sichern. Board nur für
einen echten bearbeitbaren Statusfluss anbieten oder eindeutig „Gruppierte
Ansicht“ nennen. Ein Sammlungs-Monatskalender ist eine gefilterte Übersicht und
ersetzt den bearbeitbaren Stundenplan nicht.

**Belegter Bedienungsfehler:** `CollectionsPage.tsx:179–181` zeigt je Tag nur
zwei Links und danach ein nicht bedienbares `<small>` mit „weitere“. Dritte und
weitere Treffer sind in dieser Ansicht nicht direkt erreichbar. „+N weitere“
als Button für eine Tagesliste implementieren; Fokus beim Schließen erhalten.
Der Datenbestand wird nicht gelöscht. Abnahme: Vier synthetische Termine am
gleichen Tag → alle vier über die Tagesliste mit Tastatur und Touch öffnen.

## Belegte Probleme und Designurteile getrennt

| Befund | Klasse / Belegstatus | Konsequenz |
| --- | --- | --- |
| Materialsuche verändert Kursübersicht und zeigt trotz drei Ressourcen „Noch keine Unterlagen“ / 0; „jüngste“ nur innerhalb aktueller alphabetischer Seite | Filterfehler durch Quellcode und gemeinsamen Browserprobe bestätigt; Offset/Aktualität durch Quellcode belegt | Übersicht unabhängig abrufen; echten Aktualitätssort verwenden |
| Passiver Seitenabgleich im Kursreader verschiebt den Fokus vom Textfeld zum Seitentitel | Quellcode und gemeinsamer synthetischer Browserprobe bestätigt | Kurskontext in passive Navigation aufnehmen; Fokus erhalten |
| Kursfreitext wird bei neuem API-data-Objekt gesetzt, auch bei ungesichertem Text | Quellcode bestätigt: `CourseMaterialPanel.tsx:30–32`; Refetchpfad `api.ts:119–124`; gezielte Browserbestätigung offen | Dirty-/Draftzustand schützen, Revision beim Speichern nicht still rebasen |
| Neue Notiz aus leerem Kursfilter verliert Fach | Quellcode bestätigt | Kursparameter erhalten |
| Office-Quelle fehlt in Fokusauswahl, obwohl Viewer sie grundsätzlich unterstützt | Quellcode bestätigt; Konvertierungsbereitschaft gesondert prüfen | Gemeinsame Materialfähigkeit und ehrlicher Verfügbarkeitszustand |
| Sammlungs-Kalender versteckt weitere Tagestreffer hinter nicht bedienbarem Text | Quellcode bestätigt | Bedienbare Tagesliste |
| Jots-Auszug endet still bei 200, ohne Nachladen | Quellcode bestätigt | Paging und Restanzeige |
| Ungesicherte Schnellaufnahme wird beim Schließen verworfen | Quellcode bestätigter Ablauf; Robustheits-/Designurteil zur erwarteten Erhaltung | Capture-Draft, ausdrücklich verwerfen |
| Fortlaufende Mitschrift wird nach Anlegen zu leerem Neuerstellungsformular | Quellcode bestätigter Ablauf; Produkturteil | Eine gebundene Notiz fortlaufend bearbeiten |
| Heute Empfehlung und Fortsetzen konkurrieren; Suche zeigt gleichen Auszug zweimal | Belegte Komponenten, Designurteil zur Hierarchie/Doppelung | Eindeutige Aktionen, informative Vorschau |

## Sichtprüfung des aktuellen Gesamtwalks

Persönlich geprüft wurden die 18 Bilder der neun Kernseiten sowie zwei Bilder
einer geöffneten Notiz, jeweils mit 1440 und 390 Pixeln Breite. Quelle ist der
aktuelle synthetische Walk in [browser-walk.json](browser-walk.json). Diese
20 Datensätze melden keinen horizontalen Überlauf, keine erfassten Fehler und
keine Alerts. Die ruhigen Kurskarten, die Kursmaterialliste und der direkte
PDF-Reader funktionieren visuell. Das ist keine Aussage über jedes gefüllte
Listenlimit, alle Menüaktionen oder echte Trackpad-Gesten.

Die Bilder bestätigen vor allem Hierarchieprobleme: In Heute wird die Zahl der
geplanten Karten prominent wiederholt, während die Hauptaktion zur zuletzt
geöffneten Quelle führt. Im Notizeditor verdrängt der Index den Text. Sammlungen
zeigt mobil zehn Vorlagen vor dem eigentlichen Arbeitsbereich
([Bild](screenshots/collections-390.png)); gespeicherte Ansichten passen besser
an die vorhandenen Listen. Suche zeigt die Syntaxhilfe vor der Eingabe. Diese
Beobachtungen stützen die obigen Designurteile, ohne zusätzlichen Seitenbedarf
zu begründen.

Die Verhaltensproben sind getrennt zu bewerten: Kurs-Fokuswechsel und gefilterte
Kursübersicht sind durch passende synthetische Proben bestätigt. Der erste
Kursfilter-Versuch hatte einen Locator-Timeout; erst der korrigierte Probe mit
passenden Suchfeld-/Linkselektoren belegt den Produktfehler. Diese Bestätigung
ersetzt keinen gezielten Nachweis der übrigen Entwurfs- oder Pagingbefunde.

Für den Kursfreitext ist besonders `CourseMaterialPanel.tsx:30–32` zu schützen:
Ein Hintergrundrefetch mit geänderten Annotationen kann ein neues data-Objekt
liefern und damit `setBody(data.scratchpad)` auslösen. Ein dirty Entwurf braucht
seine ursprüngliche Basisrevision; ein fremder neuer Stand wird als Konflikt
angeboten statt den Text zu ersetzen. Eine Zusammenführung mit normalen Notizen
kann diesen zweiten, schwächer geschützten Editor langfristig entfallen lassen.

## Empfohlene Reihenfolge und Abnahme

1. Navigation und Draft-Rücksetzungen gezielt bestätigen und beheben: Course-
   Reader-REPLACE, gefilterte Übersicht, kursgefilterte Neuerstellung, Kursfreitext.
   Kein fehlgeschlagenes Ergebnis als abgeschlossene Prüfung behandeln.
2. Eine fortlaufende Notiz im Quellenarbeitsplatz verankern. Das ist der größte
   Beitrag zur Unterrichtsgeschwindigkeit; zusätzliche Formelsammlungen lösen
   den jetzigen Ablagebruch nicht.
3. Capture-Eingang und normale Notizen verbinden, Begriffe vereinheitlichen,
   Direktlinks und Editorzustand erhalten. Gesicherte Texte und Historien bleiben
   erhalten; Übernahme erfolgt ausdrücklich.
4. Sammlungen als gespeicherte Ansichten, Suche mit echter Vorschau und normaler
   Dokumentfokus. Diese Verbesserungen sind nachrangig gegenüber Textsicherheit
   und dem Quellen-/Mitschriftfluss.

Messbare Folgeprüfung: Fortsetzen öffnet mit einer Aktion denselben
Quellen-/Notizkontext; zwei Speicherungen während derselben Vorlesung bleiben
dieselbe Notiz; Materialfilter verändern keine anderen Tabs; Hintergrundrefetch
verwirft keinen dirty Text; ältere Gedanken und alle Tagestreffer sind erreichbar.
Browserbilder zeigen Layout, beweisen aber weder die echte MacBook-/Safari-
Gestenqualität noch eine mit dem Pencil vergleichbare Schreibgeschwindigkeit.
