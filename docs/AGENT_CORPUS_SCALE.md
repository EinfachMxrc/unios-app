<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Agent Corpus: Ausbau und Skalierungsnachweis

Stand 04.10.2026, Entwicklung nach Alpha1. REST, CLI und MCP behalten dieselben
acht Werkzeuge `search`, `fetch`, `outline`, `context`, `graph`, `changes`, `act`,
`jobs`. Keine neue Datenbankmigration oder Abhängigkeit.

## Gezielte Ansichten

`search` und `context` akzeptieren `view`:

| Wert | Auswahl |
| --- | --- |
| `all` | Aktuell erlaubte, fertig indexierte Quellen |
| `current_semester` | Eindeutig als aktuell eingestelltes Semester |
| `open_work` | Aufgabe/Frist/Projekt mit ausdrücklich gespeichertem Status `open`/`working` |
| `open_questions` | Unbeantwortete Fragen, keine gewöhnlichen Hervorhebungen |
| `unread_material` | Aktuelle Materialversion ohne registrierte erste Öffnung |
| `recent_changes` | Quellen nach zuletzt veröffentlichtem Indexereignis |

Ein fehlender Aufgabenstatus wird nicht als „offen“ erfunden. Ohne eindeutiges
aktuelles Semester liefert die entsprechende Suche keine Treffer, `context` 409.
Ein widersprechender Semesterfilter im Context Pack liefert 422. Alte Semester
bleiben explizit durchsuchbar.

```json
{"query":"Rekursion","scope":{"course":"Programmieren 1"},"view":"current_semester","top_k":20,"chunks_per_document":2,"deduplicate":true,"budget":12000}
```

Volltextsuche begrenzt auf 1–20 Chunks je Dokument, Standard 2: viele ähnliche
Skriptseiten sollen andere Quellen nicht verdrängen. `fetch` kann weiterhin
weitere ausgewählte Kapitel und Seiten liefern.

Treffer erklären tatsächliche Titel-/Überschrift-/Textübereinstimmungen, Filter,
Ansicht, Rangverfahren und Semesterbereich. BM25 ist keine Wahrscheinlichkeit.
Bei gleichem Rang kommt das aktuelle Semester zuerst, danach eine an die Revision
gebundene Reihenfolge. `recent_changes` verwendet die Ereignisfolge.

## Dubletten, Cache und Revision

Identischer indexierter Dokumentinhalt wird je Typ, Kurs und Semester
zusammengefasst. `duplicate_count` zählt passende, aktuell erlaubte Kopien;
`deduplicate=false` zeigt sie einzeln. Keine Fusion ähnlicher Dateien, einzelner
gleicher Seiten oder gleicher Inhalte in verschiedenen Kursen. Alternative und
historische Handles bleiben abrufbar.

Der Prozesscache hält höchstens 128 Einträge, 8 MiB insgesamt, 256 KiB je Eintrag
und 15 Sekunden. Schlüssel binden Agent, Rechte, Abfrage, Scope, Indexrevision und
relevante Lese-/Workflowzustände. Ausstehende Quellenänderungen verhindern
Wiederverwendung. Vor jeder Cache-Ausgabe prüft SQL erneut aktuelle Quellrechte,
Fremdgruppen, aktuelle Fassung, Löschung und Indexgültigkeit.

`corpus_revision=epoch:published_sequence` beschreibt den veröffentlichten Index,
kein Transaktionslog aller UI-Einstellungen. Cursor binden zusätzlich relevante
Scope-/Ansichtszustände. Nach Änderungen fordert 409 einen neuen Suchbeginn.

## Context Packs und Code

Zielbezogene Pakete ergänzen extraktive Semesterüberblicke aus Kursüberblicken.
Herkunft, Hash, Zeitpunkt, abgeleiteter Charakter und unvollständige Auswahl sind
gekennzeichnet. Primärquellen bleiben erhalten. Ändern sich Rechte/Quellen während
der Auswahl, verlangt der Dienst einen neuen Abruf.

Schwache Themen verwenden nur freigegebene, fertig indexierte Lernkarten/Übungen
und deren vorhandene Ergebnisse. Lernzustand und Übungsbereich müssen beide
freigegeben sein. Niedrige Sicherheit heißt unzureichende Evidenz, nicht
nachgewiesenes Nichtwissen.

Python-AST ergänzt qualifizierte Namen (`Klasse.methode`), syntaktische Aufrufe,
Imports, Testkennzeichen und begrenzte Aufruferkandidaten für eindeutig benannte
direkte Aufrufe. Kein zur Laufzeit aufgelöster Callgraph; andere Sprachen bleiben
Datei-/Textquellen.

## Abgleich mit den 25 Punkten

| Punkt | Stand und Grenze |
| --- | --- |
| 1 Katalog | Stabile Handles, Version/Hash, Scope, Größe, Rechte; Struktur-/Extraktionsmetadaten ergänzt |
| 2 Hierarchie | Semester/Kurs/Dokument/Abschnitt/Seite/Chunk; begrenzte Überblicke |
| 3 Outlines | Vorbereitet/paginiert; Lesezeichen oder erkannte Struktur |
| 4 Stabile Chunks | Inhalts-/Extraktionshash, keine flüchtigen Listenindizes |
| 5 Mehr als Volltext | Metadatenfilter, FTS5, Symbolsuche, bestehende Graphverknüpfungen |
| 6 Semantik | Wie vorgeschlagen später optional; kein Embedding-/Vectorindex |
| 7 Reranking | Gewichtetes BM25, Quellenvielfalt, aktuelles Semester bei Gleichstand; kein semantisches Modell |
| 8 Context Packs | Bestehende Ziele; Semester und freigegebene Lernindikatoren ergänzt |
| 9 Budget | Ganze JSON-Nutzlast in UTF-8-Bytes inklusive Cursor; keine modellgenaue Tokenzählung |
| 10 Batch Fetch | Bis zu 50 Handles in `fetch`, explizite Fortsetzungen |
| 11 Changefeed | Dauerhafte Sequenz und rechtegebundener Cursor |
| 12 Summaries | Extraktive Abschnitts-/Dokumenttexte, begrenzte Kurs-/Semesterkompositionen |
| 13 Versionierung | Herkunftshash, Modell-/Extraktionsversion, Zeitpunkt, Stale-Markierung |
| 14 Evidenz | Exakte Dokument-/Chunkhandles und private Quellenlinks |
| 15 Graph | Vorhandene Relationen, beide Endpunkte geprüft; keine erfundenen Kanten |
| 16 Agent Memory | Quellenindex übernimmt keine Agentengespräche als Primärquellen |
| 17 Code | Python-AST ergänzt; kein universeller sprachübergreifender Call-/Git-History-Graph |
| 18 Mails | Freigegebene Metadaten; Provider-Threads und Attachmentindex fehlen noch im Importmodell |
| 19 Dubletten | Exakter Dokumentinhalt innerhalb desselben Scopes; keine Ähnlichkeitsfusion |
| 20 Hot/Warm/Cold | Aktuelles/vorige zwei/ältere bekannte Semester; unbekannte Datierung bleibt unklassifiziert, keine Archivlöschung |
| 21 Views | Sechs serverseitige Ansichten ergänzt |
| 22 Treffergrund | Matchfelder, Filter, Ansicht, Rangverfahren |
| 23 Cache | Begrenzt, Agent/Rechte/Revision gebunden, Liveprüfung vor Ausgabe |
| 24 Revision | Corpus-Epoche plus veröffentlichte Ereignisfolge |
| 25 Evaluation | 500 Fälle auf einer Million aktuellen Chunks; reproduzierbares Skript und Bericht |

Katalogseitenzahlen zählen **indexierte** Seiten, keine behauptete Gesamtzahl eines
unvollständig extrahierten PDFs. Mail-Metadaten geben nur bekannte Absender,
Betreff, Empfangszeit und Status nach Freigabe aus. Semantik und echte Mailthreads
werden nicht als fertig dargestellt.

## Gemessene Skalierung

Windows-Entwicklungsgerät, gleicher künstlicher Bestand vor/nach Optimierung:
50.000 Dokumente, 120 Kurse, zehn Semester, eine Million aktuelle Chunks,
50.000 ältere Versionen, insgesamt 1.050.000 Chunks; 4.998 gesperrte Dokumente.
500 Fälle: 100 feste Fragen plus 400 eindeutige künstliche Suchbegriffe.
Der Anwendungscache wird vor jedem kalten Abruf geleert, danach folgt ein warmer
Abruf. OS-/SQLite-Caches werden nicht geleert.

| Messung | Vorher | Nachher |
| --- | ---: | ---: |
| Recall@5 / Recall@20 | 99,8 % / 99,8 % | 100 % / 100 % |
| MRR | 0,998 | 0,999 |
| Kalter Median / p95 | 2,95 / 198,87 ms | 2,27 / 204,61 ms |
| Warmer Median / p95 | 1,56 / 2,12 ms | 1,03 / 1,52 ms |
| Sehr allgemeine Abfrage | 13.686,90 ms | 3.217,46 ms |
| Gesperrte / alte Suchtreffer | 0 / 0 | 0 / 0 |
| Geprüfte Abruf-Hashfehler | 0 | 0 |

Die allgemeine Abfrage ist in diesen Läufen rund **76,5 % schneller**. Der kalte p95
ist leicht höher; keine pauschale Beschleunigungszahl für die ganze App ableiten.
Breite Suche braucht weiterhin Sekunden. Gezielte Fragen und Kurs-/Semesterfilter
vermeiden unnötig breite Abfragen.

Rangfolge, Quellvielfalt und Dublettenauswahl laufen auf skalaren IDs/Scores.
Auszüge, Matchfelder und große Strukturen werden erst nach dem Ergebnislimit
geladen. Rechte/aktuelle Fassungen bleiben vor der Auswahl geprüft. Es gibt
keinen willkürlich abgeschnittenen Kandidatenpool.

Der Benchmark misst **vorbereitete künstliche Indexzeilen**, weder PDF-Import/OCR
noch Netz-/Modelllaufzeit, keine 500 natürlichen Fragen und keine beliebige reale
Million Dateien. Hashprüfung: ein ausgewählter Such-/Abruf-Batch. Rechtewiderruf,
Änderungen, Fortsetzungen und Protokolle haben zusätzliche Regressionstests.

Reproduktion ohne `.env`, Nutzerdateien oder Hochschulanmeldung:

```powershell
.venv/Scripts/python.exe scripts/corpus_benchmark.py --documents 50000 --pages 20 --queries 500 --report .tmp/corpus-run-new.json
```

Das Skript überschreibt keinen Bericht und nutzt ein isoliertes temporäres
Datenverzeichnis. [Maschinenlesbare Messwerte](benchmarks/agent-corpus-20261004.json)
enthalten beide Läufe.
