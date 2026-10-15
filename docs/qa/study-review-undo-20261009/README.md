<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Kartenbewertung zurücknehmen – technische Abnahme

Stand: 09.10.2026. Ausschließlich synthetische Collections und lokale Fake-Dienste.
Keine echte Collection oder Hochschuldaten gelesen. Keine Schemaänderung, neue
Abhängigkeit oder produktive Datenmigration. Installation/Veröffentlichung wird
durch die Gesamtpaket-Abnahme separat entschieden.

## Nutzbarer Ablauf

Im integrierten Lernmodus erscheint nach einer Bewertung **Letzte Bewertung
zurücknehmen**. **Z** führt dieselbe Aktion aus, auch nach Abschluss der Sitzung;
in Eingabefeldern und bei Modifizierertasten bleibt die Texteingabe erhalten.
Die bestätigte Rücknahme zeigt die vorherige Antwort zur erneuten Bewertung.
Ein unklarer Fehler erhält den aktuellen Lernstand und die konkrete Rücknahme-Kennung.
Bei nachweislich nicht mehr verfügbarer Rücknahme bleibt die bestätigte Bewertung
erhalten und der konkrete Rücknahmeauftrag wird kontrolliert abgeschlossen.

Unübertragene Offline-Bewertungen werden ausschließlich am Ende des geteilten
IndexedDB-Puffers entfernt. Sobald ein Übertragungsversuch dauerhaft vermerkt
wurde, bestätigt der Host die konkrete Rücknahme oder UUID-Stornierung. Eine
fehlgeschlagene Bestätigung bleibt als dauerhafter Rücknahmeauftrag im Puffer
und wird beim Wiederverbinden erneut bestätigt.

## Geprüfte Invarianten

| Grenze | Umsetzung und Nachweis |
|---|---|
| Echte Scheduler-Rücknahme | Ankís offizielle `Collection.undo()` setzt Karte, Geschwister und nativen Verlauf zurück. Keine selbst geschriebene Scheduler-SQL-Rücksetzung. |
| Konkrete letzte Aktion | UUID, Karten-ID, Rating, exakte native Revlog-ID und letzte native Undo-Schrittnummer müssen übereinstimmen. Neuere Bewertungen, fremde Bearbeitungen und geschlossene Sessions werden abgelehnt. |
| Normale Leseflüsse | Status, Stats, Due, Karten-/Medienansicht und Fokus-Projektion erhalten den begrenzten Collection-Handle. Harmlose Deckauswahl wird in den konkreten Antwortschritt zusammengeführt. |
| Hintergrundsicherung | Der native Paketexport erhält denselben Handle und Undo-Schritt. Bestätigte, noch nicht materialisierte Journale werden rein lesend dem paketgebundenen Receipt-Archiv hinzugefügt. Review → Snapshot → normale Reads → Undo ist mit echtem Anki geprüft. |
| Exactly once | Vor der nativen Antwort wird ein versionsgebundener Beleg vorbereitet; der vollständige Beleg wird innerhalb der nativen Transaktion fsync-gesichert. Ein identischer Retry beantwortet die Karte nicht erneut. |
| Prozessabbruch vor Commit | Fehlende native Revlog-ID wird nur bei identischem vollständigem Ausgangs-Kartenhash und identischer vorheriger Revlog-ID-Liste als eindeutig zurückgerollt behandelt. Jeder andere Zustand bleibt ein sichtbarer Konflikt. |
| Rücknahme gegen spätes Replay | Native Rücknahme und negativer interner Receipt-Tombstone werden atomar gespeichert. Ein noch nicht angewendeter UUID-Auftrag kann atomar storniert werden, bevor sein verzögerter Upload eintrifft. |
| Spiegel und Nebenläufigkeit | Aufnahme/Entfernung des konkreten SQL-Verlaufs sind unter dem Collection-Lock geordnet. Rücknahme löscht ausschließlich die passende UUID mit übereinstimmender historischer Karte, Zeit und Bewertung. Abbrüche können mit derselben UUID repariert werden. |
| Verlorene Host-Berechtigung | Geräte-ID, Generation und Übernahmezeit werden vor dem Warten gebunden. Nach Lock-Erwerb und unmittelbar vor nativen/SQL-Commits wird dieselbe Berechtigung geprüft. Ein neuer Host erlaubt keine alte wartende Anfrage. |
| Offline-HTTP-Rennen | Upload-Claim und Löschung sind echte gemeinsame IndexedDB-Transaktionen. Ein ursprünglicher Erfolgs-ACK entfernt keinen später gesetzten Rücknahmeauftrag. Ein abgelehnter Upload nach bestätigter Stornierung erzeugt keine neue Bewertung. |
| Bestätigte UUID nach ACK | Auch eine bereits aus dem Puffer entfernte UUID bekommt vor Undo-HTTP einen dauerhaften Rücknahmeauftrag. Undo503 → Reload → Flush bestätigt ausschließlich denselben Rücknahmeauftrag. |
| Sichere terminale Grenze | Nur ein exakter positiver Native-Beleg mit weiterhin vorhandener Revlog-ID, passender Karte/Bewertung und bestätigtem positivem SQL-Mirror erlaubt `UNDO_UNAVAILABLE`. HTTP409 + Code + exakter UUID-Marker entfernt nur diesen Intent; andere409, fremde UUIDs und503 bleiben erhalten. Die Bewertung bleibt angewendet. |
| Handoff | APKG übernimmt keine fremden Receipt-Tabellen. Ein zusätzliches versioniertes, gehashtes Receipt-Archiv ist an die Paket-Prüfsumme gebunden und wird vor Installation atomar in der staged Collection übernommen. ACKs und Tombstones bleiben erhalten. |
| Snapshot-Konsistenz | Collection-Aktion, SQL-Verlauf und Snapshot werden serialisiert. Ein noch nicht abgeglichener SQL-Verlauf zu einem Tombstone verhindert einen scheinbar fertigen neuen Snapshot. |
| Profil-/Dateiwechsel | Restore schließt den nativen Handle und archiviert alte Belegdateien gemeinsam mit der alten Collection. Dateiinode und Gerätekennung verhindern Verwendung eines Handles nach Austausch derselben Datei. Fremde Collection-Kennungen werden abgelehnt. |
| Belegvalidierung | Journal maximal 1 MiB, höchstens 50.000 vorherige IDs; Archive maximal 50 MiB / 200.000 Einträge. Symlinks, fremde Ablagepfade, widersprüchliche IDs und falsche Paketbindung werden abgelehnt. Revisionen schützen Journaländerungen unter dem bestehenden Lock. |

Negative Ratings existieren ausschließlich in der bereits vorhandenen internen
Receipt-Tabelle als Stornierungsbeleg. Native Revlogs und angezeigte/mirrored
Bewertungen enthalten weiterhin nur die regulären Bewertungen 1–4.

## Abnahmeläufe

- 19 Fälle in `tests/test_anki_study_undo.py` bestanden: Scheduler-/Verlaufsrücknahme, normale Reads,
  konkurrierende neue Bewertung und fremde Bearbeitung, UUID-Stornierung,
  SQL-/Journal-Abbrüche, Prozessabbruch vor Commit, Generation-/Lock-Verlust,
  positiver ACK und Tombstone über echten APKG-Handoff, Archivmanipulation und
  vorheriges Profil-Archiv.
- Vorhandene Receipt-Brücke, Deck-/Quellen-Projektionen, APKG-Rundlauf sowie
  Host-Snapshot-/Handoff-Tests laufen zusätzlich als Regression.
- 42 gezielte Vitest-Fälle in `studyQueue.test.ts`, `StudySessionPage.test.tsx`
  und `StudySessionFreshness.test.tsx` bestanden; Typecheck, gezielter Lint,
  Ruff und mypy für die betroffenen Dateien bestanden.
- `frontend/e2e/study-review-undo.spec.ts`: bestätigte Bewertung → normale
  Leseflüsse → Z → wiederholter Upload wird abgelehnt; Offline-Bewertung →
  sichtbarer Button → Wiederverbinden ohne native Bewertung. Browser-Abnahme
  gehört zum zusammengeführten Paketlauf und wird dort separat dokumentiert.

Die bisherigen Receipt-Fehlertests prüfen weiterhin Rollback, verbleibende
Fälligkeit, Retry und genau einen Verlaufseintrag; die Fehlerinjektion trifft
jetzt die tatsächliche dauerhafte Journalgrenze.

## Bewusste Grenzen

Nach Serverneustart, nativer Fremdbearbeitung oder Import endet
die lebende Undo-Session. Die vorhandene Bewertung bleibt erhalten; ein späterer
Buttonklick meldet die Grenze, ohne einen beliebigen alten Schedulerzustand zu
erzwingen. Bei exaktem Nachweis einer weiter angewendeten Bewertung kann der
Rücknahmeauftrag danach beendet werden, damit spätere Bewertungen nicht im
Puffer blockieren. Snapshots erhalten die lebende Undo-Session. Bestätigte
Stornierungen und unklare Retries bleiben weiterhin dauerhaft.

Der externe AnkiConnect-Modus besitzt keinen identitätsgebundenen Undo-Receipt
für fremde Anki-Aktionen. Hier wird keine vermeintlich sichere Rücknahme angeboten.
