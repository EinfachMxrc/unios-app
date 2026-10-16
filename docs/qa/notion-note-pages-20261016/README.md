<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Unterseiten, Vorlagen und Seitendarstellung

Paket 4 aus `docs/NOTION_UMBAU.md`. Alle Prüfungen verwenden synthetische Inhalte.

Unterseiten sind normale, versionierte Notizen mit einer bestehenden `part_of`-
Beziehung. Elternlinks und Unterseitenliste lesen denselben Beziehungsgraphen wie
„Verknüpft“. Seine Kreisprüfung schützt die Struktur. Lösen entfernt die Beziehung;
die Notiz bleibt erhalten. Mehrere schon vorhandene Eltern werden angezeigt.

Neue freie Seiten beginnen leer. Vorlesungsmitschrift, Prüfungsvorbereitung und
Lernreflexion werden erst durch ausdrückliches Auswählen eingesetzt. Ein eigener
Titel bleibt erhalten; bei vorhandenem Text wird kein Ersatz angeboten. Die
bekannten Quell- und Aufgaben-Vorlagen bleiben wirksam. Breite und Serifenschrift
werden pro Seite im Fenster gemerkt; die Markdown-Bausteine bleiben unabhängig
davon lesbar, verschiebbar und exportierbar.

Beim Speichern wird die beabsichtigte Elternkennung an die Anfrage gebunden. Nach
einer bestätigten Erstellung wird nur noch die Zuordnung wiederholt. Ihr Fehler
zeigt die bereits gesicherte Seite mit Wiederholen und Verwerfen der Zuordnung;
ein Verbindungswechsel bricht veraltete Folgeaktionen ab. Der normale bestehende
Notiz-Erstellweg erhält dadurch keine zusätzliche serverseitige Idempotenzgarantie
bei einer verloren gegangenen Erstellantwort.

Sieben neue Unitfälle prüfen Vorlagenschutz, erhaltene Titel, getrennte Anfragen,
StrictMode, Standby und eine verspätete Antwort nach Verbindungswechsel. Insgesamt
1.485 Frontendfälle bestanden. Sechs neue Browserfälle prüfen echte Erstellung,
Vorlagen, Rücknavigation, Kreisablehnung, Lösen, Wiederholen ohne Doppelanlage,
Seitendarstellung und die beiden Bildschirmbreiten. Mit den betroffenen Notiz-,
Tab- und Sammlungsabläufen bestanden 30 gezielte Fälle. Acht Screenshots stammen
vom gemeinsamen eingefrorenen Kandidaten, jeweils Hell/Dunkel und 1.440/390 Pixel.

Die abschließende Integration ist getrennt unter `../notion-final-20261016`
dokumentiert. Keine neue Abhängigkeit, kein neues Datenmodell und keine Migration.
