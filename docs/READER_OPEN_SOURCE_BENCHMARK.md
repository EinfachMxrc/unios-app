<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# PDF-Leser und Quellenverknüpfung: überprüfter Quellenvergleich

Stand: 07.10.2026. Öffentliche GitHub-Quellen wurden aktiv gelesen; die unten
genannten Commit-IDs wurden über die öffentliche GitHub-API geprüft.  Keine persönlichen
Dateien, Datenbestände oder Hochschulzugänge wurden benutzt. Der Vergleich ist
eine Quellprüfung, keine Nutzerstudie und keine Messung nativer Mac-Hardware.

## Konkrete Referenzen

### PDF.js

Commit `638bcdf0ada7a677c1bace3f11d32ff9090ed7b1`.
[`web/app.js`](https://github.com/mozilla/pdf.js/blob/638bcdf0ada7a677c1bace3f11d32ff9090ed7b1/web/app.js):
`onWheel` liest `deltaMode` zuerst, berechnet einen exponentiellen Zoomfaktor und
übergibt die Cursorposition als Ursprung. Kleine Faktoren werden akkumuliert.
[`web/pdf_viewer.js`](https://github.com/mozilla/pdf.js/blob/638bcdf0ada7a677c1bace3f11d32ff9090ed7b1/web/pdf_viewer.js):
`updateScale`, `#setScaleUpdatePages` und `panBy` halten Ursprung und Pan-Bewegung
zusammen. `panBy` behält Bruchteile, die Scrollpositionen verlieren können.
`drawingDelay` trennt Größenänderung von teurem Neuzeichnen; `update` begrenzt
den Seitenpuffer anhand sichtbarer Seiten. Lizenz:
[Apache-2.0](https://github.com/mozilla/pdf.js/blob/638bcdf0ada7a677c1bace3f11d32ff9090ed7b1/LICENSE).

Entscheidung: eigene seitenbezogene Verankerung verwenden, weil UniOS vertikal
im Fenster und horizontal in einem eigenen PDF-Viewport scrollt. Subpixel-Pan
wird mit angefragter und tatsächlich beobachteter Position akkumuliert.

### React-PDF

Commit `7f294000ca74f73fe7b9a03c4e1bb6f770a080da`.
[`packages/react-pdf/src/Page/Canvas.tsx`](https://github.com/wojtekmaj/react-pdf/blob/7f294000ca74f73fe7b9a03c4e1bb6f770a080da/packages/react-pdf/src/Page/Canvas.tsx):
`Canvas`, `drawPageOnCanvas` und `cleanup` verwalten asynchrone Renderaufträge,
getrennte CSS-/Bitmapgrößen und Ressourcenfreigabe. Bei einer Größenänderung
versteckt die Komponente das Canvas während des Renderns und bricht den
vorherigen Auftrag ab. Lizenz:
[MIT](https://github.com/wojtekmaj/react-pdf/blob/7f294000ca74f73fe7b9a03c4e1bb6f770a080da/LICENSE).
[`packages/react-pdf/src/Page/TextLayer.tsx`](https://github.com/wojtekmaj/react-pdf/blob/7f294000ca74f73fe7b9a03c4e1bb6f770a080da/packages/react-pdf/src/Page/TextLayer.tsx):
`onRenderSuccess` hängt von `onRenderTextLayerSuccess` ab und gehört zu den
Abhängigkeiten von `renderTextLayer`. Wechselnde Callback-Identitäten können
also selbst bei unveränderter Renderbreite die Textebene neu zeichnen.

Entscheidung: bestehende Bibliothek behalten, sichtbare Seiten weiter begrenzen
und Zoom-Geometrie an sofort dimensionierten Seitenplatzhaltern messen;
Renderaufgaben verwenden stabile Erfolgs-/Fehlercallbacks.
Ein korrekt verankerter Zoom beweist noch keine flüssige Bitmapdarstellung.

### Excalidraw

Commit `53973c3a423fbd75a4ce68107786b4fcb90e4968`.
[`packages/excalidraw/components/App.wheel.ts`](https://github.com/excalidraw/excalidraw/blob/53973c3a423fbd75a4ce68107786b4fcb90e4968/packages/excalidraw/components/App.wheel.ts):
`AppWheel.handle` unterscheidet Editorfläche und DOM-Oberfläche;
`zoomBy` benutzt die aktuelle Cursorposition und akkumuliert gegen ausstehende
Zustandsänderungen. Kleine Trackpadbewegungen werden nicht pauschal zu großen
Zoomschritten verstärkt.
[`packages/excalidraw/viewport.ts`](https://github.com/excalidraw/excalidraw/blob/53973c3a423fbd75a4ce68107786b4fcb90e4968/packages/excalidraw/viewport.ts):
`getViewportForZoom` und `getViewportForZoomWithScrollConstraints` berechnen
den Zoom-Ursprung mit Begrenzungen. Lizenz:
[MIT](https://github.com/excalidraw/excalidraw/blob/53973c3a423fbd75a4ce68107786b4fcb90e4968/LICENSE).

Entscheidung: Zoom-Deltas vor React-Commit gegen den bereits angefragten Wert
akkumulieren; Browser-Zoom nur im PDF-Viewport verhindern. Normales Scrollen
über der restlichen Oberfläche bleibt nativ.

### tldraw

Commit `035b741dc331bf76a4cb9af27c346be10bba2a88`.
[`packages/editor/src/lib/hooks/useGestureEvents.ts`](https://github.com/tldraw/tldraw/blob/035b741dc331bf76a4cb9af27c346be10bba2a88/packages/editor/src/lib/hooks/useGestureEvents.ts):
`useGestureEvents`, `onGestureStart` und `onGestureChange` unterscheiden
Touch-Panning und Pinch. Safari-Scale wird relativ zum Gestenstart behandelt.
Touch- und Safari-Gesten sollen denselben Pinch nicht doppelt verarbeiten.
[`packages/editor/src/lib/utils/normalizeWheel.ts`](https://github.com/tldraw/tldraw/blob/035b741dc331bf76a4cb9af27c346be10bba2a88/packages/editor/src/lib/utils/normalizeWheel.ts):
`normalizeWheel` verwirft nicht endliche Werte und begrenzt Zoomschritte.

Die aktuelle
[tldraw-Lizenz](https://github.com/tldraw/tldraw/blob/035b741dc331bf76a4cb9af27c346be10bba2a88/LICENSE.md)
bindet Produktion an weitere Lizenzbedingungen. Diese Quelle wird daher als
öffentlich lesbare technische Referenz verwendet; aktueller tldraw-Code wird
nicht in das AGPL-Projekt übernommen.

Entscheidung: Safari-Scale separat vom Ctrl-Wheel behandeln und während einer
aktiven Safari-Geste keine zweite Wheel-Zoomänderung erzeugen. Eine umfassende
Touch-Kamera aus dem Canvas-Editor wäre für den vorhandenen Fensterleser zu groß.

Entscheidung: eigener PDF.js-Leser bleibt für Textauswahl und UniOS-Markierungen
erforderlich. Layoutmessung und Width-Commit werden pro Frame gebündelt.

### Logseq: reaktive Referenzen und stabile Identitäten

Aktueller geprüfter Hauptzweig-Commit
`22a29b30dee3b3930cf49bba50454650c31d2a07`.
[`src/main/frontend/components/block.cljs`](https://github.com/logseq/logseq/blob/22a29b30dee3b3930cf49bba50454650c31d2a07/src/main/frontend/components/block.cljs):
`page-reference` trennt UUID und Titel. `referenced-block` nutzt vorhandene
Referenzdaten; `looked-up-page-reference` löst über
`db-hooks/use-resource [:page-identity ...]` eine Identität auf.
`subscribed-page-reference` abonniert anschließend den Block-Snapshot und
behandelt fehlende Entitäten explizit. Die Auflösung hängt damit nicht von
einer sichtbaren, gefilterten Seitenliste ab.

`subscribed-block-row` liest per `db-hooks/use-block` dieselbe Block-UUID;
`block-container`, `generated-container-id-key` und `resolve-block-container-id`
trennen Inhaltsidentität und Darstellungscontainer. Mehrere Ansichten behalten
getrennten Bearbeitungs-/Klappzustand. Im aktuellen Zweig meldet die alte
`embed`-Makroform allerdings eine Deprecated-Warnung. Das
[`Tutorial`](https://github.com/logseq/docs/blob/08f855f24d66e4509b7ea808554c13b4649e6ee1/pages/tutorial.md)
(Doku-Commit `08f855f24d66e4509b7ea808554c13b4649e6ee1`) erklärt historische
Block-/Seiten-Embeds und Shift-Klick zur Sidebar; diese Syntax wird daher
nicht ungeprüft als aktuelle API empfohlen.
[`right_sidebar.cljs`](https://github.com/logseq/logseq/blob/22a29b30dee3b3930cf49bba50454650c31d2a07/src/main/frontend/components/right_sidebar.cljs):
`block-cp`, `page-cp` und `sidebar-item-component` öffnen eine weitere Ansicht
derselben Entität statt einer Inhaltskopie. Lizenz:
[AGPL-3.0 mit aufgeführten Zusatzgenehmigungen](https://github.com/logseq/logseq/blob/22a29b30dee3b3930cf49bba50454650c31d2a07/LICENSE.md).

### Logseq-Whiteboards: ausdrücklich archivierter Vergleich

Der geprüfte vollständige
[`master`-Baum](https://api.github.com/repos/logseq/logseq/git/trees/22a29b30dee3b3930cf49bba50454650c31d2a07?recursive=1)
enthält keine Whiteboard-Quelldateien. Die folgende Implementierung ist im
Tag `0.10.15`, Commit `03bcefbdf87458f87499abb988ac3b9fac2c07d8`, belegt:
[`components/whiteboard.cljs`](https://github.com/logseq/logseq/blob/03bcefbdf87458f87499abb988ac3b9fac2c07d8/src/main/frontend/components/whiteboard.cljs)
lädt mit `tldraw-app` den Editor bedarfsweise und zeigt mit `references-count`
eingehende Blockreferenzen.
[`handler/whiteboard.cljs`](https://github.com/logseq/logseq/blob/03bcefbdf87458f87499abb988ac3b9fac2c07d8/src/main/frontend/handler/whiteboard.cljs)
persistiert über `shape->block`, `build-shapes` und `whiteboard-clj->tldr`
Formen und stabile IDs.
[`graph_parser/whiteboard.cljs`](https://github.com/logseq/logseq/blob/03bcefbdf87458f87499abb988ac3b9fac2c07d8/deps/graph-parser/src/logseq/graph_parser/whiteboard.cljs)
wandelt mit `get-shape-refs` und `with-whiteboard-block-refs` Portal-/Formverweise
in normale Seiten-/Blockreferenzen um. Das Vorschau-Rendering enthält selbst
einen offenen Hinweis auf fehlende Reaktivität; es ist kein belegtes Vorbild
für sofort aktualisierte Vorschauen. Daraus folgt keine Aussage zur heutigen
Verfügbarkeit von Whiteboards in ausgelieferten Logseq-Produkten.

### Übertrag auf UniOS: Quellstand und künftiges Konzept

| Nutzer-Pain-Point | Konzept und Komponenten-Logik | Umsetzung und Status |
| --- | --- | --- |
| Ein `[[Titel]]` wirkt unbekannt, weil die Zielnotiz aus dem aktuellen Filter fällt. | Ein globaler Resolver liefert Metadaten und eindeutige ID; alle Editor-/Leseansichten abonnieren dieselben Cache-Daten. | Im aktuellen Quellstand: `app/notes/link_api.py`, `link_service.py` und `frontend/src/hooks/useNoteLinks.ts` lösen Titel global in begrenzten Batches auf. Mehrdeutige/fehlende/unverfügbare Ziele bleiben erkennbar; Änderungs-/Sync-Ereignisse invalidieren den gemeinsamen Cache. Browserabnahme erfolgt im Gesamtpaket. |
| Ein Exzerpt verliert seine Herkunft oder zeigt nach einer neuen PDF-Version die falsche Stelle. | Inhalt und Darstellung haben eigene Identitäten; Herkunft enthält Material-/Versions-ID, Annotations-ID, Seite, Zitat und normalisierten Anker. | Vorhanden: `MaterialAnnotation` und versionierte Anker; Reader zeigt ungeklärte/mehrdeutige Stellen zur manuellen Prüfung. Künftige Notiz-/Canvas-Referenzen sollen diese Herkunft übernehmen und Quellenwechsel sichtbar machen. Ein stabiler Absatz-ID-Vertrag für beliebige Notizblöcke ist noch zu entwerfen. |
| Ein Konzept wird in Notiz, Sidebar und Mindmap kopiert und später widersprüchlich. | Canvas-Knoten referenziert eine stabile Entitäts-/Block-ID; Container-ID hält Position, Auswahl und Klappzustand getrennt. Ein eigener Resolver aktualisiert die Inhaltsprojektion. | Künftiges Konzept, kein implementierter Canvas: Referenzschema, rückwärtige Verweise und Resolver-Abonnements zuerst definieren; anschließend lazy gemountete Knoten mit Quellen-Preview und „Quelle öffnen“ bauen. Notiztext bleibt separat editierbar, Canvas-Daten speichern Geometrie und Verweise. |

Keine Logseq-/tldraw-Clientabhängigkeit und kein fremder Quellcode werden
übernommen. Die übertragbaren Architekturentscheidungen werden eigenständig
im bestehenden React-/API-Stack umgesetzt. Ein vollständiger Blockeditor oder
unbegrenzter Canvas ist mit diesem Paket nicht geliefert.

## Nutzerproblem, Konzept und Umsetzung

| Nutzer-Pain-Point | UI-/Komponenten-Logik | Konkrete Umsetzung |
| --- | --- | --- |
| Pinch auf Seite 80 springt zu anderem Stoff. | Seitenposition unter dem Cursor bleibt sichtbar. | `captureReaderZoomAnchor` erfasst lokale Seitenanteile; `useLayoutEffect` korrigiert Fenster-Y und Viewport-X nach neuer Platzhaltergröße. |
| Browser und PDF zoomen gleichzeitig. | Gesten gehören zum PDF-Bereich. | Nicht passive Listener nur am Viewport; Ctrl-Wheel und Safari-Gesten verhindern dort den Standard. Außerhalb bleiben Browser-Gesten erhalten. |
| Kleine Fingerbewegungen verpuffen. | Präzise Eingabe statt grober Schritte. | Width bleibt intern gebrochen; Integer-Commit erfolgt erst pro Frame. `accumulateReaderPan` hält Scrollreste bis zum nächsten Delta. |
| Diagonales Pan blockiert das Lesen. | Horizontale Dokumentbewegung und vertikaler Lesefluss bleiben gekoppelt. | Bei horizontalem Überlauf X anwenden und Y einmal ans Fenster weiterreichen; reine vertikale Wheel-Ereignisse bleiben unverändert. |
| Momentum überspringt mehrere Seiten. | Seitenwechsel braucht bewusste Zusatzgeste. | Alt plus überwiegend horizontales Wheel: 72 px Schwelle, ein Wechsel pro Ereignisburst, 650 ms Mindestabstand. |
| 120 Seiten belasten Speicher und Renderzeit. | Größenplatzhalter halten Geometrie; nur nahe Seiten zeichnen. | Bestehendes IntersectionObserver-Rendering erhalten; sofortige Slot-Breite/-Höhe sind Voraussetzung der Zoom-Verankerung. |

Implementierung: `frontend/src/pages/material/useReaderGestures.ts` und
`readerGestures.ts`; keine neue Abhängigkeit, kein kopierter Quellcode.

## Integrationsvertrag und Grenzen

`useReaderGestures` erhält `viewportRef`, `pageWidth`, `onWidthChange`,
`onPageSwipe` und `enabled`. `onWidthChange` muss Fit-Breite deaktivieren und
den angefragten Wert übernehmen. `onPageSwipe` führt einen begrenzten
Seitenwechsel aus. `enabled` wird erst gesetzt, wenn PDF-Viewport und
Seitengeometrie bereit sind. Der Hook verändert bei anderen Layoutänderungen
keine Scrollposition, solange kein Pinch-Commit aussteht.

Der PDF-Viewport enthält nur das Dokument, verwendet horizontalen Überlauf,
`overflow-anchor: none` und `overscroll-behavior-x: contain`. Vertikaler
Scrollcontainer bleibt das Fenster. Seiten mit `data-reader-page` müssen bei
Width-Änderungen sofort die neue Breite und geometrisch richtige Höhe erhalten.
Grenzen des Dokumentanfangs/-endes und fehlender horizontaler Überlauf können
die exakte Cursorverankerung begrenzen.

17 gezielte Vitest-Fälle bestanden; zusätzlicher Typecheck und ESLint der vier
Gestendateien bestanden. Die Tests prüfen Geometrie, Einheiten, Subpixel-Reste,
Listenerbereich, Cleanup, Safari-Scale, doppelte Zoompfade und Swipe-Inertia.
Ausführung: `npx vitest run --configLoader native
src/pages/material/readerGestures.test.ts
src/pages/material/useReaderGestures.test.ts`. Unter der lokalen Windows-Sandbox
benötigten Vitest-Kindprozesse eine freigegebene Ausführung. Echte Hardware,
Browser-Integration und Bildqualität sind damit nicht nachgewiesen.

Der anschließende Rendering-Schritt ist im Quellstand umgesetzt:
`useReaderRenderLayers.ts`, `ReaderRenderLayer.tsx` und `ReaderParts.tsx` trennen
Layoutbreite und Renderbreite. Während Pinch bleibt der fertige PDF-Baum bei
konstanter Renderbreite erhalten; Canvas, Text, PDF-Links und normalisierte
Markierungen werden gemeinsam transformiert. Ein exakt dimensionierter,
geclippter Seitenrahmen verhindert falsche Scrollbereiche beim Verkleinern.
Nach 140 ms Ruhe startet höchstens ein verborgener Ersatzbaum pro naher Seite.
Er wird erst nach Canvas-, Text- und Annotation-Fertigmeldung eingeblendet.
Bestehende Textauswahl verzögert den Tausch, bis sie freigegeben wurde.
Veraltete Renderantworten werden verworfen; Fehler erhalten die letzte gute
Darstellung und melden den Fehler über vorhandene deutsche Übersetzung.
Die Erfolgsbarriere wird bei Text-/Annotationsfehlern nicht erfüllt, auch wenn
die beiden anderen Schichten schon fertig sind. Späte Erfolgsmeldungen einer
gescheiterten Aufgabe bleiben wirkungslos. Stabile Callback-Identitäten halten
den React-PDF-Text-Render-Effekt bei reinen Layoutänderungen konstant.

Die stabile äußere Seite registriert sich einmal beim React-PDF-LinkService;
innere Ersatzseiten registrieren sich nicht gegenseitig. Außerhalb des
IntersectionObserver-Bereichs gibt es weder Canvas noch Idle-Timer. Im Bereich
liegen höchstens zwei Canvas pro Seite vor; der Ersatz erhöht den kurzzeitigen
Speicherbedarf. Primäre Grundlage ist die oben belegte Trennung per
`drawingDelay` in PDF.js; die konkrete React-Lösung ist eigenständig geschrieben.

Zwölf zusätzliche Hook-/Komponententests bestanden, zusammen mit den
Gestentests 29 Fälle. Typecheck und gezieltes ESLint bestanden. Die Komponenten-
tests simulieren React-PDF-Fertigmeldungen und prüfen den Tausch, gemeinsame
Transformation, Callback-Stabilität, Auswahl, letzte fehlerhafte Schichten,
Lazy-Unmount und die Canvas-Obergrenze.
Sie ersetzen die Browserprüfung mit echtem PDF.js nicht. Eine nachgewiesene
FPS- oder Geschwindigkeitsverbesserung wird nicht behauptet.

Manuelle macOS-Prüfung bleibt erforderlich: Chrome/Safari im Browser und
WKWebView, langsames/rasches Pinch mit Cursor auf mittleren/späten Seiten,
diagonales Pan samt Auslauf und Scrollgrenzen, Alt-Swipe mit langer Inertia,
Browser-Zoom außerhalb des PDF und Auswahl/Markierung während bzw. nach Zoom.
Safari-Gesten sind plattformspezifisch; synthetische Events beweisen keine
native Trackpad-Kompatibilität.
