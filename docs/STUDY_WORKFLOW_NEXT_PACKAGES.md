<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Nächste Lern- und Notizpakete nach dem Reader

Stand: 07.10.2026. Reviewbare Planung aus einer Prüfung des aktuellen Quellcodes.
Reader und Cmd+K sind vollständig lokal abgenommen. Der separate Deckteil aus
Paket 2 ist umgesetzt und vollständig lokal integriert (908 Python-, 565
Frontend- und 299 Browserfälle bestanden).
Eigene Quellkarten sind ebenfalls lokal implementiert; aktuelle Abnahme:
[qa/manual-source-cards-20261007/README.md](qa/manual-source-cards-20261007/README.md).
Fokussierte Lernarbeit und Konzeptboard sind noch nicht implementiert.
Keine privaten Studieninhalte gelesen. Bauauftrag, AGENTS und
PROGRESS sind berücksichtigt. Quellenangaben zum früheren Verhalten nennen den
Stand vor der jeweiligen Korrektur; Zeilen können wandern.

Vorhanden sind PDF-Markierungen mit Quellenposition, Reader-Notizentwürfe und
kurzes Recall, versionierte Notizen/Wikilinks, Anki/FSRS samt Offline-Bewertungen,
manuell erstellbare Assessments, Kursfilter, Probeklausuren, Lernblöcke und
Lernzyklen. Die nächsten Pakete schließen die Übergänge zwischen diesen Funktionen.
Die offizielle Anki-Engine bleibt für Wiederholungsplanung maßgeblich.

**Korrekturen aus dem Quellenkarten-Review umgesetzt:** Entwürfe besitzen jetzt
atomare gemeinsame Revisionen, unveränderliche Sendrequests und sichtbare
Konfliktkopien. Die Offline-Bewertungsqueue erhält ebenfalls Änderungen anderer
Fenster. Die native Review-Brücke verwendet stabile GUIDs, erhält vorhandene
`AnkiCard.id`/Review-FKs und repariert den SQL-Mirror beim identischen Receipt-Replay
mit der tatsächlichen Revlog-Zeit. Lernstand und Wochenübersicht werden nach dem
ACK sofort aktualisiert. Unbekannte und mehrdeutige Bindungen bleiben konservativ;
alte Receipts bekommen keine erfundene historische Zeit. Umsetzung, Simulationen,
Abnahme und Grenzen: [QA-Bericht](qa/study-recovery-20261007/README.md).

**Zusätzlicher Anschluss aus dem Abschlussreview:** Der neue Receipt-only-Pfad
nach nativer Kartenlöschung repariert eigene UUID-GUID-Karten. Ältere verwaltete
KI-Karten verwenden `unios-<queue_id>`; bei SQL503 und anschließender nativer
Löschung bestätigt ihr Receipt den Scheduler, rekonstruiert aber keine unsichere
historische SQL-Zuordnung. Für diesen Lifecycle eine sichere gespeicherte
Identität entwerfen und mit SQL503 → Löschen/Reimport → identischer Replay
abnehmen. Aktuell vorhandene KI-Karten behalten ihren bisherigen SQL-Abgleich.

Empfohlene Produktreihenfolge: Quelle → Lernkarte, fokussierte Lernarbeit,
Konzeptboard. Den kleinen P1-Deckfehler aus Paket 2 vorziehen; der konkrete
migrationsfreie Vertrag und die Umsetzung stehen in
[STUDY_DECK_SCOPE_PLAN.md](STUDY_DECK_SCOPE_PLAN.md). Der Cmd+K-Fix ist abgeschlossen.

## 1. P1: Aus einer Quelle eine dauerhafte eigene Lernkarte erstellen

**Umgesetzt:** Der folgende Befund beschreibt den Ausgangszustand. Gemeinsamer
Reader-Dialog, haltbarer Entwurf, GUID-Recovery, eingefrorene Quelle, eigener
Kartenbereich unter Lernen und native Anki-Sessions schließen diesen PDF-Ablauf.
Die Abnahme steht im oben verlinkten QA-Bericht; Rohselektion, Notizblöcke und
Sammelerstellung sind spätere Anschlüsse.

**Nutzer-Painpoint:** Ein Student markiert im 120-seitigen Skript 40 Kernkonzepte.
Der Reader kann die Stellen kurz abfragen; um sie morgen nach Lernplan zu
wiederholen, fehlt ein direkter Weg zur selbst geschriebenen Karte.

**Belege:** `frontend/src/pages/material/ReaderStudyTools.tsx:218–263` erzeugt Recall
aus Markierungen, hält Index/Aufdecken nur in React-State und speichert keine
Bewertungen. `frontend/src/pages/CardQueuePage.tsx:97–153` bietet JSON-Import.
`app/anki/api.py:140–161,219–225` bindet diesen Import an KI-Freigaben und das
Kandidatenbudget, standardmäßig 15 pro Material (`app/config.py:60`).
`app/anki/study_api.py:276–294` bearbeitet vorhandene Karten; eine manuelle
Erstellroute fehlt. Das Karten-DTO `:114–148` enthält keinen navigierbaren Ursprung.

**Komponenten-/Speicherlogik:** Aktion „Als Lernkarte“ an einer Markierung und im
Recall öffnet einen kompakten Editor für Frage, Antwort und Thema mit sichtbarer
Quelle. Der Nutzer formuliert/bestätigt die Frage; Zitat und Quelle werden
vorbelegt. Ein lokaler Entwurf bleibt bei Abbruch/Offline erhalten. Gespeichert
werden Herkunft `manual`, Materialversion, Ursprungsseite, Markierungs-ID/-Revision
und eindeutige Mutationskennung. Bestehende Anki-Übernahme und Bewertungsqueue
verarbeiten die Karte; ausstehende Übernahme wird ausdrücklich angezeigt.

**Minimale Umsetzung:**

1. `ReaderStudyTools.tsx`/`ReaderAnnotations.tsx`: ein gemeinsamer
   `ManualCardDialog` mit lokalem Entwurf und klarer Speicherbestätigung;
   deutsche/englische Texte ergänzen. Zunächst PDF-Markierungen als Eingangsweg.
2. Neue `app/anki/manual_api.py`, `manual_service.py`, `manual_repository.py`:
   `POST /api/anki/manual-cards` mit Quellenvalidierung, Writer-Prüfung und
   Idempotenz. Server setzt die manuelle Herkunft; KI-Freigaben gelten weiterhin
   für KI-Ergebnisse. Das KI-Kandidatenbudget zählt KI-Herkunft.
3. `app/db/models.py` + Migration: Herkunft und unveränderlichen Quellenbezug
   an der bestehenden Kartenqueue ergänzen; Bestandsdatensätze bleiben
   KI-Herkunft. `app/anki/collection.py`/Übernahme wiederverwenden, stabile
   UniOS-ID auch bei Wiederholung nach einem Absturz erhalten.
4. `app/anki/study_api.py` und `StudySessionPage.tsx`: Quellenlink über eine
   gebündelte Queue-/Karten-Zuordnung liefern und „Quelle öffnen“ anbieten.
   OpenAPI/Typen regenerieren. Auswahl aus einer Notiz ist ein späterer Anschluss.

**Zusätzlicher Quellenbefund:** Die heutige KI-Importroute validiert die Version,
speichert sie aber nicht an der Queue. Bestandskarten erhalten deshalb keinen
erfundenen neuesten Ursprung. Eine nachträglich verankerte Markierung kann eine
andere `source_version_id` besitzen, während ihre historische Anzeige noch V1
und Seite 12 liefert. Die eigene Karte muss die tatsächlich angezeigte Version,
Seite und das Zitat unveränderlich speichern. Nach einer Verschiebung der
Markierung zu V2/17 bleibt ihr Quellenlink V1/12. Ein Retry derselben erfolgreichen
Mutationskennung wird vor dem aktuellen Markierungszustand erkannt.

**Abnahme:** Synthetisches PDF → Markierung → eigene Karte → bestehende Lernsession
→ Bewertung → Neustart: Karte, Historie und exakte Quellenversion bleiben erhalten.
Wiederholtes Speichern nach Verbindungsabbruch erzeugt eine Karte. Bei deaktivierter
KI ist Erstellung möglich; die 16. manuelle Karte verbraucht kein KI-Budget.
Fremde Quellen/Standby-Schreiben werden abgewiesen. In beiden Anki-Modi stimmt
der angezeigte Übernahmestatus. Gezielt pytest, Vitest und ein Browser-Hauptablauf.

Der konkrete nächste Vertrag einschließlich historischer Quellen, GUID-Recovery,
gezielter Übernahme und Prüfgrenzen steht in
[MANUAL_SOURCE_CARD_PLAN.md](MANUAL_SOURCE_CARD_PLAN.md). Der PDF-Ablauf ist
implementiert; der Vertrag gibt keine Migration eines echten Bestands frei.

## 2. P1: Eine angenommene Lernaufgabe im richtigen Kontext beginnen

**Nutzer-Painpoint:** Morgen ist Analysis, nächste Woche Programmierung. Der
Student nimmt einen Analysis-Lernblock an und muss Karten, passende Übungen und
Quellen danach wieder selbst zusammensuchen. Ein Deck kann sogar fälschlich leer
erscheinen, wenn andere Decks die globale Kartenmenge belegen.

**Belege:** `frontend/src/pages/LearningPage.tsx:30–49,76–86` lädt globale Daten
und führt vom hervorgehobenen Thema zu allgemeinen Karten/Übungen.
`StudyBlocksPanel.tsx:42–54` und `StudyCyclesPanel.tsx:50–55` bieten nach Annahme
keinen Start der passenden Lernarbeit. Die IDs existieren bereits in
`app/db/models.py:779–804`; `app/cycles/service.py:20–37` liefert nur Themennamen.
Der konkrete Deckfehler: `app/anki/study_api.py:218–225` begrenzt die globale
Antwort auf 100, `StudySessionPage.tsx:39–56` filtert erst danach nach Deck.
Karten außerhalb dieser Auswahl können als „nichts fällig“ erscheinen.

**Komponenten-/Speicherlogik:** Angenommene Blöcke/Zyklen bekommen „Jetzt lernen“.
Eine fokussierte Lernen-Ansicht hält Kurs, stabile Themen-IDs und optional Prüfung
sichtbar in der URL. Sie zeigt passende Karten, Übungen und Quellen sowie genau
dazu passende nächste Aktionen. Die laufende Session behält ihre bereits
eingefrorene Queue; ein Hintergrund-Sync setzt Antworten nicht zurück.
Prüfungsdatum und Stoffzuordnung stammen aus gespeicherten/gewählten Quellen.
Fehlende Zuordnung bleibt sichtbar; Kursstoff wird entsprechend beschriftet.

**Minimale Umsetzung:**

1. Deckfehler ist separat nach [STUDY_DECK_SCOPE_PLAN.md](STUDY_DECK_SCOPE_PLAN.md)
   umgesetzt: echter Scheduler-Scope vor Queuebegrenzung, verlässliche Deckzählung
   und kompatible Reviews/Offline-Queue. Gezielte und vollständige lokale
   Integration bestanden. Das Paket braucht keine Inhaltsmigration.
2. `StudyBlockView` besitzt bereits `exam_id` und `topic_id`; hier nur `course_id`
   ergänzen. Bei `CycleView` zusätzlich die gespeicherten `topic_ids` liefern.
   Neue `app/learning/focus_api.py`, `focus_service.py`,
   `focus_repository.py` liefern einen begrenzten Arbeitskontext für Block/Zyklus
   bzw. Kurs/Themen und Links zu vorhandenen Lernfunktionen.
3. `LearningPage.tsx`, beide Planungspanels, `StudyPage.tsx` und
   `StudySessionPage.tsx`: Kontext weiterreichen und vor Begrenzungen filtern.
   `app/learning/practice.py` um Kursfilter vor dem bestehenden Limit erweitern;
   vorhandene Assessment-Kursfilter weiterverwenden. Neue freigegebene Übungen
   erhalten ihre `Exercise.topic_id` erst beim ersten Versuch. Ein INNER JOIN
   auf Exercise würde gerade diese neuen Übungen ausblenden; zunächst ehrlich
   „Übungen dieses Kurses“ anbieten und fehlende Themenzuordnung sichtbar lassen.
   Importierte Karten ohne sichere
   Themenzuordnung werden als unzugeordnet ausgewiesen.

**Abnahme:** Zwei synthetische Kurse/Prüfungen und mehr als 100 fällige Karten:
das gezielt geöffnete zweite Deck enthält seine fälligen Karten. Der angenommene
Analysis-Block öffnet passende Arbeit ohne Programmierungsaufgaben. Titel können
sich ändern, IDs und Kontext bleiben stabil. Sync verändert eine begonnene
Session nicht; Bewertungen bleiben idempotent. Kein bestätigtes Datum/Stoffgebiet
wird erfunden. Gezielt Scheduler-/Filtertests und ein Browser-Kontextwechsel.

## 3. P2: Konzepte aus mehreren Quellen räumlich verbinden

**Nutzer-Painpoint:** Der Student vergleicht Skript, Übungsblatt und eigene Notizen
und möchte Ursache, Voraussetzung und Anwendung gleichzeitig sehen. Lineare
Notizen und Verknüpfungslisten erfordern wiederholte Seitenwechsel.

**Belege:** `frontend/src/pages/notes/NoteDocument.tsx:287,411–418` ist ein lineares
Dokument trotz Klassenname `note-canvas`. Das vorhandene Sammlungs-„Board“ ist eine
gruppierte Spaltenansicht (`CollectionsPage.tsx:153–157`). Kern-Routen
(`App.tsx:130–173`) und Datenmodelle enthalten kein freies Konzeptboard.
Stabile `EntityRef` und semantische Beziehungen sind dagegen vorhanden
(`app/entities/schema.py:10–19`, `app/links/service.py:139–155`).

**Komponenten-/Speicherlogik:** Ein Board pro Kurs/Thema enthält angeheftete
Notizen, Materialien und Themen. Karten zeigen Titel/kurzen Auszug; ein einzelner
Inspector zeigt die vollständige Quelle. Beschriftete Pfeile verwenden bestehende
Beziehungstypen. Knotenpositionen/Größen besitzen eigene UUIDs und Board-Revision;
Inhalte referenzieren echte Objekt-IDs. Quellen-Auszüge bleiben versionierte
Notizen mit exaktem Materiallink. Viewport/Zoom wird gerätebezogen gehalten.
„Vom Board entfernen“ entfernt nur die Anordnung; globale Beziehungen werden
durch eine ausdrücklich benannte Aktion geändert. Automatische Wikilinks bleiben
aus ihrem Notiztext abgeleitet.

**Minimale Umsetzung:**

1. Neue `app/boards/{api,service,repository}.py`, Board-/Node-Modelle und
   Migration: begrenzte Boards, `expected_revision`, Mutationskennung,
   validierte `EntityRef`, gebündelte Metadaten statt HTTP-Anfrage pro Karte.
2. `frontend/src/pages/ConceptBoardPage.tsx`, DOM-Karten + SVG-Pfeile und ein
   Inspector; Route, Sidebar und Server-SPA-Routing in `app/main.py` ergänzen.
   Bestehende `/api/links` nutzen; Layout und Fachbeziehung klar getrennt speichern.
3. Zwei-Finger-Panning, Zoom um den Zeiger, Touch/Pointer und Tastaturbewegung
   im Board; Zoom-/Einpassen-Tasten und zugängliche Listenansicht. Lokale
   Layoutentwürfe und Revisionskonflikte sichtbar halten. Notizblöcke werden
   zunächst nicht über ihren veränderlichen Index referenziert
   (`app/notes/blocks.py:75–101`). Reader-Auszüge nach Notizspeicherung anheften.

**Abnahme:** Synthetisches Board mit 100 Knoten: Umordnen/Zoom/Öffnen der
Originalquelle, Neustart und erneutes Laden erhalten Inhalt und Anordnung.
Umbenennen einer Notiz löst die ID-Verbindung nicht; eine neue PDF-Version ersetzt
keinen angehefteten Ursprung. Konflikte überschreiben nichts still. Entfernung
eines Knotens löscht keine Notiz/Beziehung. Tastatur-/Listenweg und echte
MacBook-Trackpad-Abnahme zusätzlich zum fokussierten Browserablauf.

## Umgesetzt: Cmd+K verteilt Treffer auf alle sieben Suchtypen

**Behobener Painpoint:** Ein Begriff kommt in vielen PDFs und einer eigenen Notiz
vor. Die frühere Palette fügte bis zu vier PDF- und drei Markierungstreffer vor
Notizen an und kappte danach auf sieben. Die Notiz verschwand; Kursnotizen, Jots
und Clips fehlten trotz vorhandener API-Suchergebnisse.

**Implementierung:** `frontend/src/components/commandPaletteHits.ts` überführt die
sieben API-Typen in `CommandPaletteHit` und verteilt bis zu sieben sichtbare
Treffer per Round-Robin. Leere Gruppen werden übersprungen, die Reihenfolge pro
Typ bleibt erhalten; freie Plätze werden aufgefüllt. Typ und Quelle erscheinen
mit de/en-Texten. `CommandPalette.tsx` öffnet die passenden Workspace-Ziele bzw.
externe Ankündigungen. `useCommandPaletteSearch.ts` kombiniert Debounce/Abort mit
Abfragezuordnung und blendet verspätete Ergebnisse früherer Eingaben aus.

**Verifizierte Abnahme:** 20 Unit-Fälle in `commandPaletteHits.test.ts`,
`CommandPalette.test.tsx` und `useCommandPaletteSearch.test.ts` sowie drei
Browserfälle in `frontend/e2e/command-palette-search.spec.ts` sind grün
(Integrationsprüfung vom 07.10.2026). Alle sieben Typen bleiben bei vielen PDFs
sichtbar; nur ein Typ füllt sieben Plätze. Typisierte Schlüssel unterscheiden
gleiche IDs. Tastaturnavigation öffnet eigene Notizen und externe Ziele korrekt;
verspätete Antworten erscheinen nach geänderter/verkürzter Eingabe nicht erneut.
Für diese Dokumentationsaktualisierung wurden keine Tests erneut gestartet.
