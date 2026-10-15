<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Gezielte Korrektur der Organisationsabläufe

Stand: 09.10.2026. Umsetzung der Auditbefunde O2/O3/O4/O8/O10;
ausschließlich synthetische Testdaten. Keine Migration, kein Zugriff auf
persönliche Inhalte, kein Build, kein eigener Browserdienst und kein Commit.

| Befund | Geändertes Verhalten | Code |
| --- | --- | --- |
| O2/O10: Projektfrist | Aware Eingaben werden vor dem Speichern in UTC umgerechnet. Nutzereingaben ohne Zeitzone bleiben422. Gespeicherte SQLite-naive UTC-Werte werden an der Antwortgrenze als UTC ausgegeben, auch bei Liste, Detail, Archive und Restore. | `app/projects/api.py`; neue `tests/test_project_deadlines.py` |
| O2: Projekt-/Mailfeld | Der Rohtext des Datumsfeldes bleibt bei der Eingabe erhalten. Speichern verwendet Campuszeit Europe/Berlin statt Gerätezeit. DST-Lücken liefern eine verständliche Korrekturaufforderung. Unveränderte Projektfristen behalten ihren vorhandenen Instant inklusive Sekunden; bei Änderungen in der doppelten Herbststunde bleibt der vorhandene Offset Referenz. Ein neues Datum ohne Referenz verwendet den bestehenden Kalenderdefault, die erste Herbst-Occurrence. | `ProjectsPage.tsx`, `MailPage.tsx`, `lib/calendarEditing.ts` |
| Zusätzlicher belegter DST-Fehler | Bei sekundengenauen Referenzen verglich der Kalenderhelper einen minutenweisen lokalen Wert mit einem sekundengenauen UTC-Epoch. Ein Offset59m15s fand keinen DST-Kandidaten und fiel auf die erste Occurrence zurück. Beide Vergleichswerte haben jetzt Minutenpräzision. | `calendarEditing.ts`, Regression mit Sekunden und Millisekunden |
| O3/O4: Journal | Reflection- und Kursentwürfe besitzen Tages-/Kursidentität und eine feste Baseline-Revision. Gecachter Tageswechsel und vorübergehend ungecachter Tag vermischen oder verlieren die Kursentwürfe nicht. Neue Revisionen überschreiben nur saubere, freie Entwürfe. Dirty Entwürfe bleiben offen; Übernahme des neuen Serverstands ist ausdrücklich. Eine ältere Speicherrückmeldung bewahrt später getippten Text und verändert keinen neuen Tageskontext. Neu angelegte Kurseinträge bleiben beim Übergang in die geladene Liste dieselbe Editorinstanz. | `JournalPage.tsx`, `hooks/useRevisionDraft.ts` |
| O4: Sprachmemo | Hintergrunddaten überschreiben keine offene Korrektur. Schreiben verwendet die Baseline-CAS-Revision; eine ältere Bestätigung schließt einen fortgeschriebenen Editor nicht. Bei Konflikt bleibt der Entwurf erhalten, Neuladen ist ausdrücklich. | `VoicePage.tsx`, derselbe kleine Draft-Hook |
| O4: Manuelles Notenmodul | Eine neue Serverrevision remountet den Editor nicht. Saubere Eingaben übernehmen neue Daten, dirty Eingaben zeigen einen Konflikthinweis. Nach POST plus fortgeschriebenem Entwurf wird das neu angelegte Modul anschließend mit PUT fortgesetzt, statt nochmals angelegt. Ein älteres Modul-ACK darf keinen inzwischen geöffneten anderen Editor schließen. Offizielle Portalnoten werden dadurch nicht editierbar. | `GradesPage.tsx` |
| O8: Prognose | Jede Berechnung ist an Eingaben und den zugrunde liegenden Modulstand gebunden. Neuere Eingaben oder Serverdaten verwerfen die Anzeige-/Antwortberechtigung älterer Anfragen. Vertauschte Antworten zeigen nur das aktuelle Ergebnis; geänderte Grundlagen verlangen eine neue Berechnung. Das Ergebnis benennt die verwendeten hypothetischen Eingaben. | `GradesPage.tsx` |

Der Draft-Hook hält diese Entwürfe im Speicher des geöffneten Arbeitsbereichs.
Dieser Patch behauptet keine Wiederherstellung nach App-Neustart. Formtexte und
Konfliktmeldungen laufen über die bestehenden deutschen/englischen Namespaces;
keine neue i18n-Registry und keine Abhängigkeit.

## Gezielt geprüft

- Backend: `tests/test_project_deadlines.py` plus `tests/test_projects.py`: **10 bestanden**. Null-/UTC-/Offsetfristen, frische SQLite-GETs, tatsächlicher gespeicherter UTC-Wert, Archive/Restore und Revisionswechsel; naive POST-/PUT-Eingaben422 ohne Revisionserhöhung. Ruff und mypy für die betroffenen Backenddateien bestanden.
- Frontend: drei gezielte Vitestdateien, ursprünglich **37 bestanden**: `DeadlineCampusTime.test.tsx`, `RevisionDraftSafety.test.tsx`, `calendarEditing.test.ts`. Echte gerenderte Page-Submitpfade mit gemocktem Netzwerk, DST-Lücken/-Doppelstunden, Sekundenreferenz, dirty/clean Refetch, 409-Fehlerrückmeldung, Tages-/Modulwechsel und vertauschte Prognoseantworten. Im späteren Gesamtlauf erwies sich die doppelte UTC-/Berlin-Wiederholung per Laufzeitänderung von `TZ` unter Windows-Workerthreads als unzuverlässig: acht UTC-Vorprüfungen scheiterten bereits am unveränderten Node-Offset. Die acht eigenständigen Campus-/DST-Fälle bleiben erhalten; tatsächliche Gerätezeitzonen prüfen ausschließlich die folgenden Browserfälle mit `timezoneId`. Der aktuelle gezielte Umfang beträgt damit **29 Tests**.
- Gemeinsamer Typecheck, ESLint für eigene Dateien und i18n-Check bestanden. Frühe Typechecks enthielten vorübergehend Fehler in parallel bearbeiteten fremden Dateien; sie wurden nicht als Erfolg gewertet.
- Vier passende Browserfälle sind in `frontend/e2e/deadline-campus-time.spec.ts` ergänzt: Projekt und Mail jeweils UTC/Berlin, Spring-Lücke plus regulärer Campus-Zeitpunkt. **Noch nicht in diesem Teilauftrag ausgeführt**; Root übernimmt den integrierten Browserlauf mit dem neuen Build. Die neuen Journal-/Voice-/Grades-Renderregressionen ersetzen keinen echten Backend-/Browserlauf dieser Zusatzseiten.

Der erste Pythonlauf scheiterte an Windows-Sandboxrechten des frischen
synthetischen Fixtureordners; die Wiederholung außerhalb der Sandbox bestand.
Vitest benötigt auf diesem Gerät den nativen Konfigurationsloader und
Workerstart außerhalb der Sandbox. Alle Wiederholungen blieben auf die
genannten Dateien und erfundenen Daten begrenzt.
