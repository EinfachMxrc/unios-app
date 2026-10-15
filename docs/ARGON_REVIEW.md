<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Argon-/Gemini-Review: Abgleich und Korrekturen

Geprüft gegen Entwicklungsstand 0.1.23 auf Basis von `67b693a`, nicht nur gegen
den älteren Gemini-Snapshot `18c4abb`. Ausschließlich erfundene Fixtures,
temporäre Verzeichnisse und lokale Fake-Dienste. Kein Bestandszugriff,
keine Migration, Installation, Veröffentlichung oder Serveraktivierung.

| Befund | Ergebnis am aktuellen Stand |
| --- | --- |
| Sitzungen laufen serverseitig nicht ab | Korrigiert: absolute 400-Tage-Grenze in normaler und unverändernder Recovery-Prüfung; fehlerhafte Zeiten abgewiesen. Native Geräte müssen danach neu gekoppelt werden. |
| Ungenutzte Kopplungscodes sammeln sich | Korrigiert: neue Codes bereinigen abgelaufene, ungültige und gesperrte Einträge. |
| Kalenderlink nicht widerrufbar | Korrigiert: bestätigte Erneuerung im Kalenderpanel und über POST; alter Token ungültig, Gerätesitzungen unverändert. |
| Host-Freigabe braucht Generation | Sicherheitsregel bleibt: fehlende/veraltete Generationen dürfen keine Übergabe auslösen. |
| Host-Freigabe umgeht Journal | Korrigiert: Intent/Ergebnis werden protokolliert, ohne den eigenen Drain zu blockieren. |
| Native MCP-Brücke ignoriert Legacy-Cookie | Korrigiert: gemeinsames Fallback und Migration auf den aktuellen Cookie. |
| Cache-Schutz hat unvollständige Präfixliste | Korrigiert: sämtliche API-/Datei-/Kalenderantworten sind auch lokal `private, no-store`. |
| Import von app.main initialisiert Produktzustand | Korrigiert: reine Factory; lokale Dienste, VPS, Docker und nativer Backendstart verwenden sie ausdrücklich. |
| Nachgeladene Moodle-Adresse ungeprüft | Korrigiert: gleicher HTTPS-Validator wie bei direkter Konfiguration. |
| README zeigt ältere Releaseversion | Präzisiert: Entwicklung 0.1.23, dokumentierte öffentliche Alpha 0.1.20; keine Links auf unfreigegebene Pakete umgebogen. |
| Lizenz-/Paketliste veraltet | Direkte Frontendpakete mit Version/Lizenz neu abgeglichen; bestehende Herkunftshinweise erhalten. |
| Lokales UI-Updateskript ohne Rollback | Korrigiert: vorhandene veränderte Dateien bei Kopier-/Prüffehlern aus geprüftem versioniertem Backup wiederherstellen. |
| Lesende CTEs auf Standby blockiert | Korrigiert mit SQLite-Authorizer und erneuter Vorbereitung aller koordinierten Statements. Schreibende CTEs/PRAGMAs bleiben gesperrt. |
| CLI-Schreibanfragen ohne Origin ergeben 403 | Trifft aktuell nicht zu: `is_dashboard_request` akzeptiert Nichtbrowseranfragen ohne Origin. Keine unnötige Lockerung der Middleware. |
| CLI benötigt auch im Servermodus Gerätesitzung | Bestehende Berechtigungsgrenze bleibt. Die CLI ist eine lokale API-Oberfläche; keine automatische Übernahme privater Browser-/Keychain-Tokens. |
| Windows-Parser meldet Fehler nach ungeklärtem taskkill | Korrigiert mit einem Windows-Job: Worker startet angehalten, wird dem Job zugeordnet und erst dann freigegeben. Abbruch prüft den gesamten Prozessbaum; auch nach regulärem Elternprozessende werden Kindprozesse beendet. Der taskkill-Fallback bleibt bei ungeklärten Kindprozessen streng. |
| MCP v2 protokolliert Aktionen doppelt | Korrigiert: gemeinsame Fachregeln/Repository, genau ein Autorisierungs-/Auditbesitzer pro HTTP-Aufruf. Kurs-, Kategorie-, Quellen- und OAuth-Prüfungen erhalten. |
| Chunked Clientupload unbeschränkt im RAM | Korrigiert: laufende Byteprüfung, begrenzter RAM-Puffer, privater temporärer Dateipuffer, stückweise Weitergabe erst nach vollständiger Größenprüfung. |
| Portal-Beispielexport ohne Writer-Prüfung | Korrigiert auch bei allein eingebundenem Router. |
| Ältere Router vermischen Schichten | Betroffene MCP-, Entity- und Lernrouten schrittweise angepasst. Kein pauschaler Umbau unberührter Domänen gemäß AGENTS.md. |
| Fake-Reset lässt Dateien/Zustände zurück | Korrigiert: Konflikte, Snapshots, Backupstatus, Karten-/Notizmedien, Voice, Mail, Doctor, Addonereignisse und gemeinsamer Retrievalcache; synthetische Ausgangssnapshots erhalten. |
| CLI-/CTE-/MCP-Testlücken | CTE-Lese-/Schreibgrenze und genau ein MCP-Audit ergänzt; CLI-403-Befund durch normale Notiz-Schreibanfrage mit echter Auth-/Generation-Middleware widerlegt. |
| Preisprüfung hängt an produktivem Aktualisierungsdatum | Korrigiert: eigene alte/frische Zeitstände; Paketdatei auf Schema und tatsächliches Stale-Flag prüfen. Keine Preisaktualisierung behauptet. |
| Fake-Import verändert Prozessumgebung | Korrigiert; subprocessbasierte Import-/Resetprüfung mit verbotenen privaten Zugriffswegen. |
| Drei Specs umgehen Resetfixture | Auf gemeinsame Fixture umgestellt; Reset verwendet die konfigurierte Vorschauadresse. |
| Screenshots im Quell-/Dokubaum | Zentral nach Playwright-Ausgabe; Dokuverzeichnis nur bei ausdrücklich gesetztem `UNIOS_QA_DIRECTORY`. Anhänge verwenden denselben tatsächlichen Pfad. |
| Benachrichtigungsspec erwartet festen Port | Navigation mit konfigurierter Basisadresse prüfen. |
| Karten-Themetest verwendet falschen Speicherschlüssel | Auf `unios-theme` korrigiert. |
| Leere OpenAPI-Antwortschemas | Für die 67 genannten JSON-Antworten ergänzt: Lernaufgaben, Addons, Connectoren, Entities, Jobs, Recovery, Release und Setup. Dynamische Entity-/Plugininhalte bleiben erweiterbar und werden nicht weggefiltert. |
| Kollidierende OpenAPI-Modellnamen | Paket-/Notenmodelle eindeutig benannt; abhängige Imports und generierte Typen aktualisiert. |
| OpenAPI-Version 0.1.0 | Aus der installierten Produktmetadatenversion, hier 0.1.23. |
| Offline-PDF-Markierungen bei Standby gelöscht | Im aktuellen `annotationQueue` bereits korrigiert: kein Löschen bei Uploadfehlern. |
| Direkte UUID-Aufrufe ohne Fallback | Verbliebene Produktionsstellen auf gemeinsamen kryptografischen UUID-Helfer umgestellt, einschließlich RAM-Notizrettung und Reviewqueue. |
| Reviewqueue wiederholt unbekannte Fehler endlos | Aktuelles `studyQueue` bricht mit erhaltenem Eintrag ab; bestehende Tests erhalten. |
| Blob-URLs bei Neuaufnahme nicht freigegeben | Aktuelle Voice-Seite gibt Vorgänger frei und räumt beim Wechsel/Unmount auf; alter Capture-Dialog existiert nicht mehr. |
| Ungeschütztes JSON.parse in alten Seiten/Stores | Genannte alten Module sind entfernt/umgebaut; aktueller Einstellungsreader fängt Fehler ab. Keine überholten Dateien rekonstruiert. |
| cn / separate KaTeX-Typen | Korrektur beim frischen Releasebau: cn ist der tatsächlich verwendete MIT-Klassenhelfer der UI-Komponenten und bleibt als direkte Abhängigkeit erhalten. Separate KaTeX-Typen entfernt; KaTeX-eigene Typen verwendet. |
| Zwei identische generierte API-Dateien | Aktuell nur `api.d.ts`; Generator und Prüfung verwenden dieselbe Datei. Kein Duplikat entfernt, das nicht mehr existiert. |
| HTTP503 reiht Kartenbewertung zweimal ein | Aktueller Ablauf speichert einmal und lässt Uploads aus der Queue arbeiten. Bestehende Retry-/Undoabläufe geprüft. |
| Ressourcentitel zerlegt Notizlink | Aktuelle Kurs-/Readerlinks kodieren Titel bereits mit `encodeURIComponent`. |
| PDF-Clip aktualisiert unmontierten Dialog | Aktueller Dialog prüft Abort nach toBlob und vor Übernahme, nutzt das Signal beim Upload und schützt finale Zustandsänderungen bereits. |
| Standby erlaubt Bewertungsaktionen in der UI | Korrigiert: Hinweis, gesperrte Buttons und Guard für Tastatur/Bewerten/Undo. Offline-Lernen auf dem bisherigen Hauptgerät bleibt möglich. |
| Datei-Benachrichtigungen öffnen den Aktivitätsverlauf | Korrigiert: vorhandene Einzeldatei direkt im Leser öffnen, mehrere Dateien im zugehörigen Kurs. Ohne gespeicherte Datei kein erfundenes Leserziel. |
| Lokale Änderungen stehen vor Ereignissen | Ereignisse zuerst, lokale Änderungen danach. |
| Aktivitätsfilter springen an den Seitenanfang | Filterwechsel als Zustandsänderung behandeln; Scrollposition und Fokus erhalten, bisherigen Inhalt während des Nachladens stehen lassen. |

Zusätzliche Integrationskorrekturen: Windows-WASM-Worker übernimmt SystemRoot
unabhängig von der Großschreibung; Coding-Runner darf ohne Backendbezeichner
antworten. Zahlen-Automatiken respektieren explizite LaTeX-Blöcke und escaped
Dollarzeichen. Galerieprüfungen warten auf sichtbare Ladezustände.

Gleichzeitig bearbeitete Notizdateien (`NoteDocument.tsx`,
`components/editor/extensions.tsx`) sowie Änderungen an Fernadressen und
Push-Verweisen gehören nicht zu diesem Reviewpatch. Sie werden erhalten und
nicht in dessen Commits aufgenommen. Bei gemeinsam betroffenen Dateien sind
nur eigene Teilhunks committed. Die Abnahme prüft den Gesamtarbeitsbaum mit.

Prüfnachweise und Abschlussstatus stehen in `docs/PROGRESS.md`.
