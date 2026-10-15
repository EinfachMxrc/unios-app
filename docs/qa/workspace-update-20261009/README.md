<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Arbeitsbereich-Update 0.1.22 – abgenommen und installiert

Marc hat die konkrete Roadmap und die anschließende Installation auf PC
und Server bestätigt. Grundlage ist der separat geprüfte Kalender `7f9c40d`.
Die folgenden Pakete sind eigene UniOS-Implementierungen ohne neue Abhängigkeit
und ohne Alembic-Migration.

| Nutzerproblem | Bedienkonzept | Komponenten und Absicherung |
| --- | --- | --- |
| Vorlesungen lassen sich schlecht verschieben | Tag, Arbeitswoche, ganze Woche und Liste; größere Zeitgriffe, sofortige Rückmeldung | TimetableCalendar; gespeicherte Ansicht/Stundenhöhe, effektive Termine, Revisionen, mobile Formulare und Undo |
| Formeln brauchen zu viele Suchschritte | Vorlagenfavoriten, letzte Vorlagen und Pfeiltasten/Enter | MathEntryDialog/StudyHelperDialog; nur gültige Werkzeug-IDs gespeichert; portable LaTeX-Ausgabe und Cursorwiederherstellung |
| Für die Mitschrift muss zuerst ein Lernplan entstehen | Arbeitsbereich unmittelbar aus Kurs und PDF | FocusKind course; lesender Kontext ohne Prüfung/Planerzeugung, Fremdkursprüfung vor Anzeige, vorhandene Notizspeicherung |
| Beim Wiederöffnen muss die Stelle gesucht werden | Heute zeigt die letzte Quelle, Seite und Mitschrift | studyResume; begrenzte Ressourcenhandles gerätelokal, kein Dokumenttext; beim Verbindungswechsel gelöscht |
| PDF und Notizen sind unergonomisch schmal | Standard etwa 60/40, beide Bereiche mindestens 320 px, Trennlinie auch per Tastatur | MaterialReader misst verfügbare Breite; unter 960 px Panewechsel, vorhandene Seitenanker bleiben |
| Aufgabenstatus und Fehler sitzen an verschiedenen Stellen | Persönlicher Arbeitsstand und Rückgängig direkt am Objekt | PersonalTaskStatus/ProjectDetail; CAS, konkrete Pending-/Fehleranzeige, Hochschulstatus separat; Eigenschaftenentwürfe bleiben bei Konflikten erhalten |
| Eine verschobene Prüfung lässt den Lernplan veralten | Vergleich vorher/nachher, Vorschau, ausdrücklich übernehmen | ExamImpactDialog/CycleService; Kalender und Revision erneut geprüft, atomare Änderung, bestehender Verlauf erhalten |
| Ein falscher Tastendruck bewertet eine Lernkarte | Letzte Bewertung mit Z oder Schaltfläche zurücknehmen | StudySession/Anki; offizielle native Rücknahme, identitätsgebundene Receipts, Offline-Upload-Rennen und Snapshotbelege |

Die unabhängigen Prüfungen behandeln insbesondere Writer-/Generationsverlust,
native Anki-Transaktionen, Belegreplay, Rücknahme während eines Uploads und
Handoff. Es werden ausschließlich erfundene Profile und Fake-Dienste verwendet.

Quellrevision: `6f3f39ae3b5e0f966fd8dac9733efd218e175947`.
Vollständige lokale Prüfung: **1.053 Backendtests bestanden, zwölf Skips;
790 Frontendtests; 379 Browserabläufe bestanden, keine Skips oder Retries**.
Fünf kritische Tastatur-/Dialogabläufe bestanden zusätzlich jeweils dreimal.
Ruff, mypy, Lint, Typprüfung, OpenAPI/API-Typen und de/en-Übersetzungen bestanden.

Die eingefrorene PWA bestand sämtliche acht Chunkbudgets und das Offlinebudget:
287 Precache-Dateien, 18.060.939 Byte roh und 5.076.349 Byte gzip.
Die zwölf Lighthouse-Messungen der vollständig dargestellten Quellen-, Heute-
und Kalenderansichten erreichen mindestens **97/100 Accessibility**;
Quelle und Heute jeweils 100. Desktop und 390 px in Hell/Dunkel selbst und
unabhängig geprüft; PDF-Canvas/Text/Annotation tatsächlich fertig gerendert.
Die neue mobile Mitschrift ist sichtbar, die Hauptaktionen sind nicht abgeschnitten.

Windows-NSIS/MSI und Serverimage wurden aus dieser Revision neu gebaut.
Der NSIS wurde von GitHub zurückgeladen, SHA-256 verglichen und tatsächlich mit
Exit 0 installiert. Installierte ProductVersion 0.1.22; alle **2.891 Programmdateien
und 290 UI-Dateien** stimmen mit dem Bau überein. Die bestehende Serverkopplung
und Client-/Hostverbindung bestehen. Zwei isolierte Starts bestanden:
Median 0,8005 Sekunden. Keine persönlichen Profile verschoben oder gelesen.

Das Serverimage `unios-server:0.1.22-workspace-6f3f39ae3b5e` ist aktiv und gesund;
Image-ID `sha256:0cd1c8d2355aab2ce3eed5db731d06a4dc2af71295942b682ababdc1314f22f9`.
Isolierter Smoke, HTTPS-Health200 und private API401 bestanden. Daten-/Schlüssel-
Mounts, Netzwerk-/Port-/Schutzkonfiguration und Schema ff98c7da0320 erhalten.
Keine neue Migration. Die neue native Undo-/Snapshot-Belegkette ist keine
pauschale Downgradefreigabe für 0.1.21: kompatibel vorwärts reparieren.

Nachweise: [Qualität](quality-summary.json), [Zugänglichkeit](lighthouse-summary.json),
[unabhängige Sichtprüfung](independent-visual-review.md),
[Quelle und Bundle](source-and-bundle-verification.json),
[Auslieferung](release-receipt.json), [Betrieb](deployment-runbook.md).
Die Bilder liegen unter `gallery/`, `workflows/`, `regression/` und `lighthouse/`.
Historische Bildnachweise wurden nach den Testläufen wiederhergestellt;
erzeugte Wiederholungen bleiben als lokale technische Kopie erhalten.

Gesamtpaket `UniOS-0.1.22-complete-update.zip`: 712.185.802 Byte, explizite
Komponentenliste und alle enthaltenen Datei-Prüfsummen geprüft.
SHA-256: `85ac3988fd106d091bd88308b94ff1d551d52befae4ab56fcbcf8a7aa1b337fe`.
Alle 16 GitHub-Dateidigests stimmen mit den lokalen Artefakten überein.
Die vollständige ZIP wurde von GitHub nach
`C:\Users\einfa\Downloads\UniOS-0.1.22-complete-update.zip` zurückgeladen;
SHA-256 identisch. Nachweise: [Upload](github-upload-verification.json),
[Download](complete-download-verification.json).

GitHub hat die genaue Plattformmatrix [37934023250](https://github.com/EinfachMxrc/unios-app/actions/runs/37934023250)
vor dem ersten Schritt wegen Kontozahlung/Ausgabenlimit abgewiesen.
Der private Release bleibt ein Entwurf, keine vollständige Plattformfreigabe
oder neue Mac-/Linux-Desktopinstallation behauptet. Echte MacBook-/Safari-Gesten,
Softwaretastatur und Unterrichtstempo benötigen den Gerätetest aus MANUELL_TESTEN.
Die vorhandenen Sharp/source-map-js-Buildmeldungen sind nicht behoben;
die konkrete Prüfung fand keinen betroffenen Consumer im App-Eingabepfad.
