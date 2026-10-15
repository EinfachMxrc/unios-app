<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# UniOS: Prüfung aller Seiten und Arbeitswege

Stand: 9. Oktober 2026, UniOS 0.1.22, Quellrevision
`05e56cfad86b110e2d1be505adad2b58e3ab6d2a`.

**Urteil:** Die fünf Hauptbereiche **Heute, Kurse, Lernen, Notizen und Termine**
sind sinnvoll. Der Grundstil ist bereits ruhig. Die nächste Verbesserung sollte
vor allem Arbeitswege vereinfachen: eine fortlaufende Mitschrift neben der
Quelle, ein eindeutiger Ort zum Üben und ein gemeinsamer Eingang. Vor diesem
Umbau müssen die bestätigten Speicher- und Kontextfehler behoben werden.

Diese Prüfung enthält konkrete Empfehlungen, keine bereits eingebauten
Änderungen. Produktcode, Installation und Server wurden dabei nicht geändert.

## Umfang und Belege

- **49 Routen / 48 unterschiedliche Seitenkennungen** vollständig im Code
  beurteilt; Einrichtung, Detailseiten, optionale Werkzeuge und Fehlerseite
  eingeschlossen. Die Entscheidung für jede einzelne Route steht in
  [page-decisions.md](page-decisions.md).
- **104 synthetische Browserbesuche:** alle 49 Routen sowie Notizbearbeitung,
  Lernblock und Lernzyklus bei 1440 und 390 Pixeln. Keine unbehandelten
  JavaScriptfehler, Navigationsabbrüche oder horizontalen Überläufe in diesem
  Lauf. Das beweist Erreichbarkeit und Layoutgrenzen, nicht die Fehlerfreiheit
  sämtlicher Aktionen. Rohdaten: [browser-walk.json](browser-walk.json).
- Alle Module waren für die Inspektion aktiviert. Die echte Standardnavigation
  hat fünf Hauptbereiche; KI, Projekte, Noten und Uni-Mail sind optional.
  [Standard-Mehr](screenshots/default-more-1440.png) zeigt die bereits reduzierte
  Ausgangsstruktur.
- Die erste Kartensession verwendete irrtümlich eine numerische Deckkennung,
  das erste Projekt war im künstlichen Profil nicht vorhanden. Korrigierte
  Session- und Projektbesuche liegen separat vor. Die gültige Projektansicht
  wurde **ohne Frist** geprüft; der Fehler mit Frist ist eigenständig belegt.
  Die deaktivierte Erweiterung und nicht verfügbare Hochschuleinrichtung zeigen
  erwartete Zugangszustände, keinen erfolgreich abgeschlossenen Einrichtungsweg.
- Zusätzliche Verhaltensproben halten Speicherantworten gezielt zurück und
  vergleichen gesendete, sichtbare und gespeicherte Inhalte. Fehlgeschlagene
  Testselektoren sind keine Produktfehler. Sie wurden korrigiert und bei
  wiederholten Fällen unter `previous_fixture_attempts` dokumentiert.
  Belege: [behavior-probes.json](behavior-probes.json).
- Ausschließlich erfundene Studieninhalte. Echte Notizen, Konten und Unterlagen
  wurden nicht geöffnet. Schreibtempo gegenüber einem iPad, echte
  MacBook-Gesten, Kontrastmessungen und vollständige Offline-/Bewertungsabläufe
  wurden in dieser Prüfung nicht neu gemessen.

## Nutzerszenarien als Maßstab

| Situation | Was schnell gelingen muss | Wichtigste heutige Reibung |
| --- | --- | --- |
| Vorlesung, 120-seitiges PDF, Tastaturmitschrift | Quelle und dauerhafte Notiz gleichzeitig bedienen; Formel oder Wahrheitstabelle eingeben; weiterarbeiten | Die Quellenmitschrift ist ein Neuerstellungsformular. Nach dem Anlegen wechselt die Bearbeitung ihren Ort. Mobil steht der Dokumenttext hinter einer langen Auswahl und Werkzeugleiste. |
| Nachbereitung, 200 Aufgaben aus mehreren Fächern | Passende nächste Aufgabe finden, selbst lösen, erst danach vergleichen | Lernstart, Übungsvorschläge und Prüfungsübungen verteilen einen fachlichen Auftrag auf mehrere Orte; vollständig gerenderte Historien wachsen extrem. |
| Karte oder Pythonlösung während Wartezeit korrigieren | Weitergetippter Text bleibt erhalten und nur der tatsächlich gesendete Stand gilt als gespeichert | Verspätete Antworten können neuere Entwürfe entfernen; Sammelfreigabe kann einen anderen Inhalt freigeben als sichtbar. |
| Mailhinweis, Projektfrist und Stundenplan | Eine Uhrzeit einmal eingeben und an allen Orten identisch wiederfinden | Gerätezeitzone und Campusanzeige sind inkonsistent; Projekte mit Frist scheitern zusätzlich beim erneuten Laden. |
| Schnell mehrere Gedanken oder Dateien erfassen | Sofort erfassen, später dem richtigen Fach zuordnen | Eingang, Schnellnotizen, Dateien, Sprache und Import haben teilweise getrennte Erfassungsmodelle; auch Eingang verliert Folgeeingaben bei verspätetem ACK. |

## Zuerst beheben: bestätigte Fehler

P1 bezeichnet hier Verlust neuer Benutzertexte, falsche Inhaltsfreigabe oder
einen blockierten Arbeitsgegenstand. P2 bezeichnet eine irreführende Ansicht
oder unterbrochene Bedienung. Keine Einstufung behauptet Verlust bereits
gespeicherter Originalmaterialien.

| Priorität / Nachweis | Nutzer-Pain-Point | Komponentenlogik und konkrete Umsetzung |
| --- | --- | --- |
| **P1 · Coding-Entwurf**, Probe `coding-newer-edit-during-save` | A speichern, während der Antwort B tippen: ACK entfernt Bs lokale Sicherung; Neuladen zeigt A. | `CodingPage.tsx:105–125`: Task-ID, Editnummer, Basisrevision und Dateien im gesendeten Snapshot binden. ACK darf nur denselben Edit clean setzen. Neueren Edit samt Recovery behalten und bestätigte Basisrevision nachführen; Run zeigt den tatsächlich getesteten Stand. Abnahme: verzögerter ACK, neuer Edit, Fehler sowie Taskwechsel. |
| **P1 · Eingang und Karteneditor**, Proben `inbox-newer-edit-during-save` / `study-card-newer-edit-during-save` | Folgeeingabe verschwindet; Karteneditor schließt trotz weitergetipptem B, Server enthält A. | `InboxPage.tsx:41–59`, `StudyPage.tsx:161–168`: Reset/Schließen nur bei übereinstimmender Objekt- und Entwurfsgeneration. Gemeinsame kleine Draft-Snapshot-Regel verwenden; fachliche Speicherverträge behalten. Abnahme mit B während A gespeichert wird, einschließlich bewusstem Objektwechsel. |
| **P1 · Karten-Sammelfreigabe**, Probe `proposal-bulk-approval-ignores-visible-draft` | Sichtbar korrigiertes B wird ignoriert; freigegeben wird gespeichertes A. | `CardQueuePage.tsx:28–35/124–129`: dirty Zeilen nach ID an den Controller melden; globale Freigabe erst nach bestätigtem Speichern zulassen. Einzel- und Sammelmutationen koordinieren. Zusätzlich API-Maximum 100 gegenüber Listenlimit 200 beachten; dieser Mengenbefund ist sourcegeprüft. |
| **P1 · Projekt mit Frist**, Browser-GET 500 plus unabhängige In-Memory-Reproduktion | Anlegen gelingt; erneutes Öffnen scheitert. Archivieren kann Fehler melden, obwohl die Änderung schon übernommen wurde. | `app/projects/api.py:103–108/152/197–206`: Inputvalidierung und Response-Normalisierung sauber trennen. Persistierte SQLite-UTC-Werte ausdrücklich als UTC serialisieren; zonenlose neue Eingaben weiterhin ablehnen. Vertragsprobe: datiertes Projekt anlegen → frischer GET → Archivieren/Wiederherstellen, jeweils Antwort und Revision prüfen. Beleg: [project-deadline-get-repro.json](project-deadline-get-repro.json). |
| **P1 · Projekt-Zeitzone**, Probe `project-deadline-UTC` mit Berlin-Kontrolle | Eingabe 26.10.2026, 09:15 wird in UTC-Browser als 09:15Z gespeichert; Berliner Campuszeit wäre 08:15Z. | `ProjectsPage.tsx:66–86/122`: Raw-Datumsentwurf vom UTC-Instant trennen; bestehendes `calendarInputInstant` mit Campuszone nutzen. Dieselbe sourcegeprüfte Ursache in `MailPage.tsx:74/144` mitbeheben und gesondert testen. Abnahme: Berlin/UTC, Sommerzeitlücke, doppelte Stunde. |
| **P2 · Kursfilter und Reader-Fokus**, Proben `course-search-leaks-into-overview` / `course-passive-page-replace-focus` | Materialsuche ohne Treffer lässt auch die Übersicht „Noch keine Unterlagen“ zeigen. PDF-Seitenabgleich zieht Fokus auf die Seitenüberschrift. | `CoursePage.tsx:51–67/516–547`: gefilterte Materialliste von Übersichtsdaten trennen, Offset nur in der passenden Ansicht anwenden. `WorkspaceNavigation.tsx:16–23`: passiven Seitenabgleich auch für gültige Kursarbeitsplätze erkennen. Abnahme: Suche → Übersicht → zurück; Seitenwechsel ohne unerwarteten globalen Scroll/Fokus. |

Weitere sourcegeprüfte Risiken sind im Detail dokumentiert: Refetch überschreibt
dirty Kursfreitext/Noten-/Sprachentwürfe; gecachter Tageswechsel kann Journaltext
dem falschen Tag zuordnen; gespeicherte Filter verhindern Fragen-Deep-Links;
Regelvorschau und Ausführung verwenden unterschiedliche Stände. Diese Fälle sind
keine zusätzlich behaupteten Browserbestätigungen.

## Danach umbauen: wenige vollständige Arbeitswege

| Arbeitsbereich | Pain-Point | UI/UX-Konzept und Komponentenlogik | Konkrete Umsetzung |
| --- | --- | --- | --- |
| **Heute / Kurse** | Empfehlung und „Fortsetzen“ können unterschiedliche Ziele meinen; Kurskatalog wird zum zweiten Dashboard. | Heute zeigt eine klar benannte Fortsetzung und daneben eine ausführbare Empfehlung. Kursliste dient der Fachwahl; Kursdetail bleibt Katalog und Organisation. | `Today.tsx:79–133` getrennte Resume-/Recommendation-Modelle; `Courses.tsx:15–18` Filterzustand erhalten; Details aus Kurs und Quelle öffnen. |
| **Quelle & Mitschrift / Notizen** | Nach jeder neuen Notiz ist erneut ein Bearbeitungsort zu wählen. Bei nur drei Notizen beginnt der mobile Dokumenttext erst ungefähr bei y=880. | Eine vorhandene Notiz neben dem PDF binden, dauerhaft weiterschreiben, Quellenauszüge an Cursorposition einfügen. Desktop mit verschiebbarer Trennlinie; mobil Dokument zuerst, Bibliothek als Drawer und Werkzeugleiste bei Bedarf. | `FocusWorkspacePage.tsx`, `ReaderStudyTools.tsx:157–175`, `NotesPage.tsx`: Notiz-UUID pro Arbeitsplatz binden; vorhandenen Editor, Autosave/CAS und Mathewerkzeuge wiederverwenden. Quellenlinks behalten. Mathe-/LaTeX-Hilfen in denselben Schreibfluss statt einen weiteren Editor legen. |
| **Lernen / Üben** | Unter künstlichen 200 Aufgaben wird die Lernseite 27.891px hoch; Übungsvorschläge werden zu 133.068px und 1.002 Formularfeldern. | Lernstart zeigt nächste Handlung, offene Fragen und kleine passende Auswahl. Gemeinsame Aufgabenbibliothek nach Kurs/Thema/Status, einzelne Aufgabe im Fokus, Lösung erst nach eigener Antwort. Vorschlagsarchiv geschlossen mit kompakten Zeilen. | `LearningPage.tsx`, `PracticePanel.tsx`, `ExercisePage.tsx:196–197`, `AssessmentPage.tsx`: Aufgabenliste begrenzen/paginieren, Detail nur bei Auswahl mounten; bestehende Prüfer und Ergebnis-IDs erhalten. Historie nicht als sämtliche deaktivierten Editoren rendern. |
| **Karten / Vorschläge** | Karten, Übungen und Erklärungen werden an getrennten Orten geprüft; „Übungen“ bedeutet teils Prüfung eines Vorschlags statt eigenes Lösen. | Gemeinsame Vorschlagsprüfung mit Typfilter und klaren Zuständen. Manuelle eigene Karten bleiben im Kartenbereich. Kartensession bleibt ablenkungsarm mit Tastatur und vorhandener Rücknahme. | Wiederverwendbaren Review-Controller über `CardQueuePage`, `ExercisePage`, `ExplanationPage` legen; Statusverträge getrennt lassen. Alte Direktwege bis vollständiger Ablösung erhalten. |
| **Termine** | Abgaben erscheinen erst hinter dem großen Stundenplan; Kalender und Fristen konkurrieren auf einer langen Seite. | „Als Nächstes“ immer sichtbar; klare Ansichten „Kalender / Abgaben“. Terminbearbeitung direkt am Objekt, konsistente Uhrzeit und sichtbarer Quellenstatus. | `DeadlinesPage.tsx`, `TimetablePanel`, `DeadlineViews`: Priorisierung und gespeicherten Ansichtsschalter ergänzen, bestehende Verschiebe-/Resize-Logik erhalten; Nebenquellen unterscheiden Laden/Fehler/nicht eingerichtet. |
| **Gemeinsamer Eingang** | Text, Datei, Browserclip, Schnellnotiz und Sprache brauchen verschiedene Startorte und Zuordnungsabläufe. | Globales „Neu“ öffnet einen Composer mit passenden Modi; sofort erfassen, danach zuordnen. Bibliothek und unzugeordnete Gedanken bleiben durchsuchbar. | `InboxPage`, `JotCapture`, `JotsPage`, `DropPage`, `VoicePage`, `ImportWizard`: gemeinsame Erfassungsoberfläche und Draftregel, getrennte fachliche APIs behalten. Jots benötigen Zugriff über das neueste 200er-Fenster hinaus. |
| **Mehr / Einstellungen** | Rückblick, Quellenverwaltung und Betriebsdetails wirken bei vollständiger Aktivierung gleichrangig. Einstellungen sind eine sehr lange Seite. | Mehr bleibt Aufgabenindex; Campus/Noten/Projekte bewusst optional und anpinnbar. Erweiterungen/Verbindungen zusammen finden; Betriebsdetails kontextuell aus Fehlern. Einstellungen mit dauerhafter Abschnittsnavigation. | `MorePage`, `SettingsPage`, `SystemPage`, Addon-/Marketplace-Seiten: Einstieg zusammenführen und Deep Links erhalten; konkrete Sync-/Nachrichtenobjekte adressieren. Bereits kompakte Katalogdetails nicht erneut pauschal umgestalten. |

Die langen Lernseiten sind ein **Stressbefund mit erfundenem Bestand**, keine
Messung des persönlichen aktuellen Bestands. „Dokument zuerst“, kompakter
Lernstart und zusammengeführte Erfassung sind Designurteile aus den Szenarien;
ihre Zeitersparnis muss später mit realen Aufgaben gemessen werden.

## Reihenfolge und Abnahme

1. **Zuverlässigkeit:** bestätigte Draft-, Freigabe-, Projekt- und Kontextfehler;
   danach die weiteren sourcegeprüften Entwurfsrisiken gezielt reproduzieren.
2. **Vorlesungsweg:** PDF öffnen → vorhandene Mitschrift fortsetzen → Formel oder
   Wahrheitstabelle tippen → Quellenbeleg einfügen → wechseln und zurückkehren.
   Text, Cursor, Quelle, Seite und Notizidentität müssen erhalten bleiben.
3. **Nachbereitung:** kursbezogene Aufgabe wählen → selbst lösen → vergleichen
   → nächste passende Aufgabe. 200 Aufgaben dürfen keine 200 geöffneten
   Formulare erzeugen. Karten und bestätigte Erklärungen direkt aus diesem
   Kontext erreichbar halten.
4. **Sekundäre Struktur:** gemeinsame Erfassung, Vorschlagsprüfung, Rückblick
   und Erweiterungen; alle bisherigen Inhalte, IDs, Quellen, Direktlinks und
   Freigabegrenzen durch eine Übergangsroute erreichbar halten.

Eine nachvollziehbare Erfolgsmessung wäre anschließend ein identischer
Vorlesungsausschnitt am Laptop und iPad: Dauer bis zur vollständigen Mitschrift,
Unterbrechungen, verlorener Kontext und Korrekturaufwand. Der jetzige Bericht
belegt noch keine Gleichheit mit handschriftlichem Mitschreiben.

## Vollständige Detailreviews

- [Jede Route und ihre zukünftige Aufgabe](page-decisions.md)
- [Heute, Kurse, Quellen, Notizen, Suche und Sammlungen](core-review.md)
- [Lernen, Karten, Übungen, Programmieren und KI](learning-review.md)
- [Termine, Eingang, Projekte, Campus, Einstellungen und Betrieb](organization-review.md)
- [Globale Zustände und Reset-Grenzen](state-map.md)
- [Routeninventar](route-inventory.json), [Browserlauf](browser-walk.json),
  [Verhaltensproben](behavior-probes.json),
  [Projekt-Reproduktion](reproduce_project_deadline_get.py)
