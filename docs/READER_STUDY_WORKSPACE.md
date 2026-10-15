<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Ein zusammenhängender Lern-Arbeitsbereich

Der geprüfte Ausgangszustand blockierte das PDF mit einem modalen Seitenpanel.
Eine Studentin musste zwischen Lesen, Markieren und Notieren wechseln, obwohl
diese Tätigkeiten dieselbe Quelle benötigen. Die Umsetzung hält das Dokument
auf breiten Ansichten bedienbar und bindet Auszüge an die konkrete PDF-Fassung.
Sie ist ein funktionierendes Entwicklungspaket; die vollständige Einzelabnahme
aller App-Bereiche und native MacBook-Tests bleiben Teil des laufenden Mandats.

## 1. Sofort löschen / aufräumen

Sieben belegte Altquellen sind in `ca94b81` entfernt: 4.011 Zeilen und 109.004
UTF-8-Bytes. Die Quellen waren schon unimportiert und erzeugen daher keine
behauptete Bundle-Ersparnis. Belege und komplette Bereichsinventur stehen in
[CODEBASE_AUDIT_20261007.md](CODEBASE_AUDIT_20261007.md).

Im aktiven Reader sind dreifach vorhandene Annotation-Listen in
`material/ReaderAnnotations.tsx` zusammengeführt. Reader-Regeln gehören jetzt
zu `MaterialPage.css`; die konkurrierenden globalen Reader-Regeln entfallen.
Seitengrößen, Gestenerkennung, Render-Ebenen, Exzerpte, Notiz-Speichern und
Arbeitsbereichskomponenten haben eigene Dateien und klar begrenzte Aufgaben.

## 2. UI/UX-Kritik & Redesign

| Simulierter Nutzer-Pain-Point | Konzept und Komponenten-Logik | Konkrete Umsetzung |
| --- | --- | --- |
| Eine Markierungsliste verdeckt das Skript; Nachschlagen benötigt Schließen/Öffnen. | PDF und Lernwerkzeuge bleiben gleichzeitig bedienbar. | Ab 1.100 px nicht modaler Split, Breite 280–520 px per Pointer oder Tastatur. Mobil bleibt ein fokussierter Bottom-Sheet. |
| Leere Karten, Exportaktionen und Metadaten verdrängen den Stoff. | Primär Lesen/Notieren, zusätzliche Werkzeuge nach Bedarf. | Kompakte Toolbar, Einzelversionsauswahl entfällt, Dateiaktionen und Verbindungen sind einklappbar, Annotationen haben einen gemeinsamen Filter. |
| Ein Auswahlformular verschiebt auf Seite 80 die ganze Quelle. | Auswahlaktionen schweben innerhalb der Reader-Breite. | Fixed-Tray mit Quote, Kommentar und Aktionen; Hinweise/Fehler sind auch tief im Dokument sichtbar. Ungültige neue Auswahl verwirft die alte Passage. |
| Schrift auf dem grauen Reader-Hintergrund ist zu kontrastarm. | Kleine Reader-Hinweise erhalten die primäre Textfarbe. | Reader-spezifisches `--app-text`; der gemessene alte Muted-Kontrast war dort nur 4,11:1. |
| Pinch oder Öffnen/Verkleinern des Splits verliert die Lesestelle. | Quelle unter Cursor bzw. aktuelle Seitenposition bleibt verankert. | Seitenanteil erfassen; Slot-Geometrie sofort ändern; Fenster-Y und Viewport-X vor dem Paint korrigieren. ResizeObserver berücksichtigt auch Breakpoint-/Fensterwechsel. |
| Jede Zoomänderung bricht den fertigen Canvas ab. | Fertiges Bild bleibt während der Geste sichtbar. | Gemeinsamer Transform für Canvas/Text/PDF-Links/Highlights; Ersatzrender nach 140 ms Ruhe und Tausch erst nach allen erfolgreichen Schichten. |

Eine bewusste Alt-Geste wechselt Seiten: Alt plus horizontales Two-Finger-Wheel.
Normales Panning bleibt Bewegung im Dokument; ein Momentum-Burst wechselt
höchstens eine Seite. Ctrl-Wheel-Pinch und Safari-Gesten werden ausschließlich
im PDF-Viewport behandelt. Der übrige Browser behält seine gewohnte Bedienung.

## 3. Workflow- & Feature-Lücken

**120-Seiten-Szenario:** Seite 80 direkt öffnen → Passage auswählen → „In
Mitschrift übernehmen“ → eigenen Gedanken ergänzen → auf Seite 81 weiterlesen →
zweite Stelle an denselben Entwurf anhängen → Notiz anlegen → Quellenlink zur
genauen Fassung/Seite öffnen → im Tab „Wiederholen“ eine Antwort verdeckt abrufen.
Die Browserregressionen nutzen ausschließlich erfundene PDFs und Notizen.

`ReaderStudyTools` enthält Markierungen, Mitschrift und Wiederholen. Exzerpte
erhalten ein wörtlich escaped Markdown-Zitat und einen Link mit Versions-ID und
Seite. Bestehender Text bleibt erhalten; Entwürfe werden lokal über das vorhandene
Draft-Format geführt. Der vollständige NoteStudio-Editor bleibt erreichbar.

Eine gemeinsame `lib/sourceNoteSave.ts`-Ablage verbindet Reader und vollständige
Neuanlage innerhalb derselben App-Sitzung. Pro Quelle läuft höchstens eine
Create-Anfrage. Schließen/Öffnen und responsive Remounts behalten den Status;
spätere Edits und RAM-Text bei gesperrtem Gerätespeicher werden nicht vom alten
ACK gelöscht. Serverwechsel invalidiert alte Antworten und bricht Requests ab.
RAM-Erhaltung ersetzt keinen dauerhaften lokalen Save. Nach vollständigem Reload
oder einer verlorenen Antwort nach Server-Commit besteht noch keine garantierte
Backend-Idempotenz.

Wiederholen nutzt bereits bestätigte, zugeordnete Markierungen: Kommentar als
Frage, Quellzitat erst nach Aufdecken. Es erzeugt keine KI-Fragen, verifiziert
keine Lernqualität und ersetzt nicht die bestehende FSRS-Lernsession.

Der globale Notizresolver ist unabhängig von den ersten 50 Notizen, Kursfilter
und Listenseite. Unicode-Normalisierung und Mehrdeutigkeit liegen beim Backend;
Editor-Views aktualisieren ohne Ersetzen des Dokuments oder Undo-Historie.
Titelprojektionen werden beim Incoming-Refresh einmal pro Transaktion verwendet.

**Weiter offen:** echtes mathematisches Rendering im Editor, ein persistenter
Canvas mit stabilen Objekt-/Quellen-IDs, Paging großer Sammlungen, Zusammenführen
doppelter Beziehungsdarstellungen und die visuelle/funktionale Einzelprüfung
aller Hauptansichten. Die Komponenten werden nicht durch Attrappen ergänzt.

## 4. Konkrete Umsetzung und Abnahme

- `MaterialPage` orchestriert Layout, Seitenposition, Suche und Quellaktionen.
- `ReaderAnnotations` besitzt eine gemeinsame, gefilterte Markierungsdarstellung.
- `ReaderStudyTools` verbindet Quellenentwurf und verdeckten Abruf.
- `readerGestures`/`useReaderGestures` bündeln Deltas pro Frame und halten Anker.
- `ReaderRenderLayer`/`useReaderRenderLayers` trennen Layout und scharfes Rendern.
- `sourceNoteSave` hält Quelle, Arbeitsentwurf, Request und erwarteten Write-ID
  zusammen; bestätigte ältere Inhalte löschen keine neuere Fassung.
- `notes/link_api`, `link_service`, `link_repository` begrenzen HTTP-Batches und
  liefern ausschließlich Zielmetadaten. Quellenlinks navigieren in App-Routen.
- Workbox nimmt auch PDF-Worker-`.mjs`, `.woff` und `.ttf` in den Offline-Cache.
  Der Bundle-Gate kontrolliert Einstieg, Reader, Notizeditor, Monaco/Worker und
  die gesamte deduplizierte Precache-Nutzlast.
- Der Desktop unterdrückt native Kontextmenüs nicht mehr global.

Der kleine Renderpuffer benötigt kurzzeitig bis zu zwei Canvas je naher Seite;
entfernte Seiten werden weiterhin entladen. Das ist ein bewusster Speicherpreis
für unterbrechungsfreien Zoom, keine behauptete FPS-Messung. Die Implementierung
verwendet bestehende Bibliotheken ohne zusätzliche Abhängigkeit.

Primärquellen, geprüfte Commits, Lizenzen und Übertragungsentscheidungen:
[READER_OPEN_SOURCE_BENCHMARK.md](READER_OPEN_SOURCE_BENCHMARK.md). Die Referenzen
beinhalten PDF.js, React-PDF, Excalidraw, tldraw und Logseq. Aktueller
tldraw-Code wird aufgrund seiner zusätzlichen Produktionsbedingungen nicht
kopiert. Reader-Geometrie und Renderpuffer sind eigene Implementierungen der
belegten Prinzipien.

Abnahmestand und konkrete Grenzen stehen in
[PROGRESS.md](PROGRESS.md), Screenshots unter `qa/reader-workspace-20261007/` und
Hardware-Prüfschritte in [MANUELL_TESTEN.md](MANUELL_TESTEN.md).
