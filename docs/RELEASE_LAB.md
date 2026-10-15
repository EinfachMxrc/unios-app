<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# UniOS Release Lab

Das Release Lab führt reale lokale Prüfungen gegen ausschließlich erfundene Daten
aus. Es sammelt versionierte Belege und liefert lokale Issue-Entwürfe. Ein grüner
Testlauf bedeutet **keine** bestandene Geräteinstallation oder KI-Nutzerstudie.
Es gibt keinen geratenen „Release-Readiness“-Prozentwert.

## Lokal ausführen

Im Quellcheckout mit vorhandener Entwicklungsumgebung:

```shell
python scripts/release_lab.py missions
python scripts/release_lab.py run --output .tmp/release-lab-001
python scripts/release_lab.py verify .tmp/release-lab-001
```

Der Berichtsordner muss neu sein. Frühere Berichte werden nicht überschrieben.
Ein nicht bestandener oder blockierter Gate-Lauf beendet `run` mit Exit-Code 1.
`verify` prüft, ob die Belege zum Bericht passen; eine verifizierte fehlgeschlagene
Prüfung bleibt fehlgeschlagen. Die Liste `manual_gates` bleibt ausdrücklich offen.

Einzelne Pakete und größere synthetische Bestände:

```shell
python scripts/release_lab.py run --suite retrieval-contract --documents 1000 --output .tmp/release-lab-002
python scripts/release_lab.py run --suite recovery --suite migration --skip-retrieval --output .tmp/release-lab-003
```

Alle sechs festen Pakete: Corpus-/Berechtigungsverträge, Lernen, Wiederherstellung,
Servermigration, WASM-Isolation und PDF-Markierungen. Das Lab verwendet deren
existierende Tests; es erfindet keine Installations- oder KI-Ergebnisse.
Maximal 30 Minuten pro Paket (`--timeout`, Standard 15 Minuten); Ausgabe wird
auf 512 KB begrenzt und weiter abgeführt, damit ein volles Rohr nicht blockiert.
Ohne verwertbares JUnit-Ergebnis wird ein Paket blockiert. Leere oder vollständig
übersprungene Suites können nicht bestehen.

## Corpus-Benchmark

Die bestehenden 100 Fragen in `tests/fixtures/agent/retrieval.json` werden durch
den echten `AgentDataPlane` beantwortet, nicht durch eine simulierte Suchfunktion.
Vorher entstehen in einer frischen temporären Datenbank bis zu zwölf Semester,
120 Kurse und 50.000 Dokumente. Jeder Datensatz hat eine historische und eine
aktuelle Version; 20 absichtlich gesperrte Kopien prüfen Rechte vor dem Trefferlimit.
Das Textbudget ist begrenzt und wird vor dem Datenbankimport geprüft.

Dies sind generierte indizierte Texte mit Seiten und Überschriften, **keine**
PDF-Dateien. Der Lauf beweist daher weder OCR-Durchsatz noch Rendering von
8.000 echten PDFs. Der große Bestand ist optional und wird nicht automatisch
bei jedem Start erzeugt. Default: 100 Dokumente, zwölf Kurse, vier Semester.
Die Anzahl der Suchfragen bleibt 100; „50.000 Dokumente“ bedeutet nicht
„50.000 erfolgreich erledigte Work-Aufträge“.

Feste Gates: Recall@5 ≥ 0,95; Recall@20 ≥ 0,99; MRR ≥ 0,90; keine gesperrte
Quelle und keine veraltete Version. Fehlende semantische Treffer bleiben Fehler;
Quell- und Chunk-Hashes werden gegen die erzeugten Versionen und gezielt geladenen
Abschnitte geprüft. Zusätzlich darf keines der drei Qualitätsmaße unter die
dokumentierte 0.1.17-Baseline von 0,98 fallen. Diese Baseline verwendet denselben
100-Fragen-Seed; Bestandsgröße und Hardware können abweichen. Es ist deshalb ein
Qualitätsvergleich und kein belastbarer Latenzvergleich. Der Bericht trennt
„keine Regression gegenüber 0,98“ von „absolutes Ziel 0,99 erreicht“.
es gibt kein nachträgliches Entfernen schwieriger Fragen. Latenz und Antwortgröße
werden gemessen. Die Größe wird in UTF-8-Bytes angegeben, nicht als angeblich
modellgenaue Tokenzahl. Gemessene Latenz hängt vom Gerät und Bestand ab.

## Unabhängige KI-Tester

`missions` gibt vier Personas und elf Ziele aus. Darunter sind vier Work-Ziele:
Vorlesungsbrief, Wochenrückblick, belegbare Klausurschwächen und auf ein Kapitel
beschränkte Übungsvorschläge. Eine externe Chaos-Mission erlaubt bis zu 30 Minuten
und 300 Aktionen in der synthetischen App. Diese Ziele starten keine KI und
bleiben ohne separat ausgeführten Agenten `not_run`. Eine Mission beschreibt ein
Ergebnis, keine vorgeschriebene Klickfolge. Ein separat bewusst gestarteter
Browser-/Work-Agent kann eine lokale Fake-App verwenden. Er erhält keine echten
Campuszugänge. Tester, Verifier und UX-Reviewer liefern je einen Bericht mit
unterschiedlicher `agent_id`. Zeit-/Aktionsbudgets sind verbindlich.

Dieses Programm startet selbst **kein externes Modell** und liest keinen API-Key.
Ein automatischer Bericht nennt KI-Missionen daher `not_run`. Ein externer
KI-Auftrag braucht eine vom Nutzer gewählte Verbindung, ein Budget und ausschließlich
synthetische Daten. Die drei Rollen sind ein auswertbares Protokoll; ihre Ausführung
muss durch den externen Agenten erfolgen und darf nicht behauptet werden, solange
nur die lokalen Suites liefen.

Extern erzeugte Beobachtungen werden als JSON-Liste geliefert:

```json
[
  {
    "mission_id": "find-source",
    "role": "tester",
    "agent_id": "separater-tester-lauf",
    "model": "tatsaechlich-verwendetes-modell",
    "conclusion": "blocked",
    "summary": "Beobachtung des tatsächlich ausgeführten Auftrags; keine Beispielbehauptung übernehmen.",
    "evidence": ["retrieval-contract-junit"],
    "elapsed_seconds": 30.0,
    "actions": 4
  }
]
```

```shell
python scripts/release_lab.py record .tmp/release-lab-001 observations.json
```

Der Collector kontrolliert existierende Beleg-IDs, Dateigrößen und SHA-256-Hashes,
JUnit-Ergebnisse, Rollenidentitäten und Budgets. Er schreibt eine neue
`agent-observations-<id>.json`, ohne den ursprünglichen Laufbericht zu verändern.
Nur drei getrennte positive Rollen und ein bestandenes deterministisches Gate
führen zu `agent_claims_with_checked_evidence`. Diese Bezeichnung bedeutet
zugeordnete Modellbehauptungen mit geprüften Belegen; sie beweist nicht, dass
das Modell auf echter Hardware geklickt hat. Der Verifier prüft Belegkonsistenz,
keine Authentizität durch digitale Signatur. Rollenberichte sind nicht automatisch
vertrauenswürdig, nur weil die Modellnamen verschieden sind.

Screenshots, Videos, echte Klickzahlen und Vision-Reviews müssen im externen
Browserlauf gesondert gesammelt und manuell geprüft werden. Der jetzige Collector
verwendet ausschließlich bereits erzeugte lokale Gate-Artefakte; er behauptet
keine automatische Screenshot- oder Pixelbewertung. Dafür bleiben die bestehenden
Playwright-/Screenshot- und Accessibility-Läufe maßgeblich.

## Berichte und Tickets

- `report.json`: Lauf-ID, Quellrevision, Zeiten, Status, Testzahlen, Beleg-Hashes.
- `report.sha256`: Fingerabdruck des unverändert erzeugten Berichts.
- `verification.json`: unabhängig erneut gelesene JUnit-/Retrieval-Ergebnisse.
- `evidence/`: begrenzte Command-Ausgabe, JUnit und Retrieval-Metriken.
- `issue-drafts/`: lokale deutsche Entwürfe für fehlgeschlagene/blockierte Gates.

Ein normaler Lauf und die Beobachtungssammlung versenden keine GitHub-Issues oder
Nachrichten. Prüfe zuerst die lokalen `issue-drafts/`. Nur dieses separat bewusst
bestätigte Kommando kann fehlgeschlagene/blockierte Gates veröffentlichen:

```shell
python scripts/release_lab.py publish-issues .tmp/release-lab-001 --confirm --repo EinfachMxrc/unios-app
```

Voraussetzungen: lokal angemeldetes `gh`, unveränderter Bericht mit
`report.sha256`, sämtliche Beleg-Hashes und konsistente Gate-Ergebnisse.
Das Zielrepository ist fest auf `EinfachMxrc/unios-app` begrenzt. Gesendet werden
nur bekannte Gate-IDs, Status, Testzahlen, sichere Run-/Commit-IDs, Beleg-Hashes
und eine feste Reproduktionsanleitung. Rohlogs, Pfade, Fehlertexte und externe
Modellbeobachtungen werden nicht übertragen. Das Programm verwendet eine temporäre
UTF-8-Body-Datei und `gh issue create --body-file`, ohne Shell-Interpreter.

Unveränderliche `publish-receipts/` dokumentieren vor dem Aufruf die Absicht und
nach bestätigtem Erfolg die Issue-URL. Derselbe Run/Gate-Auftrag wird dann nicht
erneut versendet. Bei Timeout, fehlendem `gh`, Fehlerstatus oder unerwarteter URL
bleibt das Ergebnis unklar: vor einem weiteren Versuch GitHub manuell prüfen;
das Programm verhindert dann eine automatische Wiederholung. Geheimnisartige
GitHub-Fehlerausgaben werden nicht angezeigt. Ältere Lab-Berichte ohne den beim
Erzeugen geschriebenen Fingerabdruck sind für Veröffentlichung nicht zugelassen.
Die Fingerabdrücke sind Konsistenzbelege, keine digitale Signatur gegen einen
Angreifer, der Bericht und Prüfsumme gemeinsam ändern kann.

Die Revision nennt Git-HEAD; nicht eingecheckte Änderungen
werden ausdrücklich als mögliche Einschränkung ausgewiesen.

## Isolation und verbleibende Abnahme

Child-Prozesse erhalten ein frisches temporäres Home sowie eine eng begrenzte
Umgebung ohne Tokens, Connector-URLs, `PYTHONPATH` oder persönliche Einstellungen.
Der Benchmark ignoriert zusätzlich Umgebungs-/Dotenv-/Secret-Konfigurationen
vollständig. Es gibt keinen Shell-Interpreter, freie Modellbefehle oder
produktive Keyring-/Daten-Verzeichnisse. Ausführbar sind nur fest registrierte,
vertrauenswürdige Quelltests. Das ist **keine Betriebssystem-Sandbox für fremden
Code**; untrusted Code bleibt Aufgabe der isolierten Runner-VM.

Hardware, macOS-Schlüsselbund, SmartScreen, Notarisierung, Screenreader, Touch,
Sleep/Wake, echte Netzwerkwechsel und subjektive Bedienbarkeit bleiben reale
Abnahmen. Hochschul-MFA/CAPTCHA wird ausschließlich vom Nutzer bedient.
Automatisierte lokale Belege ersetzen weder diese Abnahmen noch zehn externe
Menschen, die UniOS tatsächlich eine Woche verwenden.
