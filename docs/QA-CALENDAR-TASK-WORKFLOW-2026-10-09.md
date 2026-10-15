<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Kalender und persönliche Aufgabenbedienung – 9. Oktober 2026

## Implementiertes Verhalten

Die Unterrichtswoche startet mit Montag bis Freitag. Tag, Arbeitswoche, ganze
Woche und Liste sowie die Kalendervergrößerung werden als validierte
Darstellungseinstellungen lokal gespeichert. Termine am Wochenende verschwinden
nicht: Ein Hinweis öffnet die ganze Woche beziehungsweise auf dem Telefon den
betroffenen Tag.

Termine lassen sich über große obere und untere Flächen verkürzen oder verlängern.
Kurze Termine bleiben vollständig über ihren Hauptbutton, das Bearbeitungsformular
und die vorhandene Tastaturbedienung erreichbar. Die Endpunkte können mit
Alt+Pfeiltaste in 15-Minuten-Schritten geändert werden. Speichern, Fehler,
Wiederholung und Rückgängig erscheinen im Arbeitskontext; bestätigte Revisionen,
Originaltermine importierter Quellen und Zeitzonenregeln bleiben erhalten.

In der Aufgaben-Schnellansicht und Kursansicht kann der persönliche Arbeitsstand
direkt auf Offen, In Arbeit oder Erledigt gesetzt werden. Diese Bedienung ändert
persönliche Metadaten, keine offizielle Abgabe. Andere Eigenschaften werden mit der
bestätigten Revision erhalten. Rückgängig gilt nur für die zuletzt bestätigte
Änderung; eine neue oder fremde Revision macht es ungültig. Ein Konflikt lädt den
aktuellen Stand und bleibt als Fehler sichtbar.

Projekt-To-dos zeigen ihren ausstehenden Speichervorgang direkt an der betreffenden
Zeile. Fehler stellen den bestätigten Zustand wieder her. Rückgängig verwendet die
Projektrevision und bewahrt Notizen, andere To-dos und weitere Projektfelder.
Die Terminbearbeitung zeigt die bestehende Frist in Europe/Berlin und verweigert
nicht existierende Uhrzeiten während der Zeitumstellung vor dem API-Aufruf.

Der Eigenschaften-Editor bewahrt einen veränderten Entwurf, wenn eine neue
Serverrevision eintrifft – auch nach einem eigenen Arbeitsstandwechsel. Er meldet
den Konflikt und verlangt ein bewusstes Verwerfen und Neuladen. Er mischt keine
fremden Eigenschaften automatisch in den Entwurf. Ein sauberer Editor lädt die
neue Revision automatisch; Speicherung benutzt die Revision des Entwurfsbeginns.

## Dateien

- Kalender: `TimetableCalendar.tsx`, `Calendar.css`, `TimetablePanel.tsx`,
  `calendarLayout.ts`, `calendarPreferences.ts`, `useCalendarMutation.ts` und
  zugehörige Tests; `calendarWorkspace` in Deutsch und Englisch.
- Aufgaben: `PersonalTaskStatus.tsx/.css`, `taskWorkflow.ts`, `TaskPeekDrawer.tsx`,
  `AssignmentDeadline.tsx`, der Detailteil von `ProjectsPage.tsx/.css` und
  zugehörige Tests; `ownTaskSupport` in Deutsch und Englisch.
- Entwurfsintegration: `MetadataEditor.tsx/.css` und `MetadataEditor.test.tsx`.
- Browserfälle: `calendar-workweek.spec.ts`, Anpassung von
  `calendar-apple.spec.ts`, `calendar-editing.spec.ts`, `task-workflow.spec.ts`.
- Die gemeinsame Sprachregistry und die Einbindung in die eigene Kurs-Schnellansicht
  wurden durch den integrierenden Hauptagenten vorgenommen.

## Prüfung

Gezielte Vitest-Läufe: 22 Kalenderfälle und 9 Aufgaben-/Entwurfsfälle erfolgreich.
TypeScript-Prüfung und ESLint der geänderten Komponenten, Hilfsfunktionen und
Aufgabentests erfolgreich.

Im zweiten integrierten Browserlauf waren alle acht Kalenderfälle sowie vier der
fünf Aufgabenfälle erfolgreich. Der Projektfall scheiterte bereits an ungültigen
synthetischen To-do-IDs beim Anlegen, vor der Benutzerbedienung. Das Testsetup wurde
auf serverseitig erzeugte UUIDs korrigiert und gibt bei Setupfehlern den Responsebody
aus. Der integrierende Hauptagent übernimmt dessen erneuten Browserlauf.

Im anschließenden vollständigen Browserlauf traf ein alter Pointer-Test bei
`y+20` die inzwischen 24px hohe Beginnfläche statt des Termin-Inhalts. Seine
Bewegung setzte Beginn und Ende gleich und erzeugte daher korrekt keinen gültigen
Preview. Der Test startet nun in der tatsächlichen Inhaltsmitte. Ein zusätzlicher
Fall bricht beide Resize-Kanten mit Escape ab, prüft null Speicheraufrufe und den
unveränderten Termin nach Reload. Testauflistung und ESLint erfolgreich; die acht
gezielten Kalender-Editing-/Preferences-Unit-Tests sind erneut erfolgreich.
Der echte Browserlauf dieser Korrektur bleibt beim Hauptagenten.

Die Browserfälle prüfen unter anderem mobile Erreichbarkeit, Revisionen,
Wiederholung nach temporärem Fehler, Rückgängig, fremde Änderungen, DST-Lücken und
bewusstes Neuladen eines Eigenschaftenentwurfs. Ausschließlich synthetische Daten
wurden verwendet. Natürliche MacBook-Trackpadgesten erfordern zusätzlich eine Prüfung
auf dem tatsächlichen Gerät. Diese Teilaufgabe enthält keinen Release, keine
Installation und kein Deployment.
