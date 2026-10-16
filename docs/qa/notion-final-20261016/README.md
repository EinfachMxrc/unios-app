<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Gemeinsame Abnahme des Notion-Umbaus

Stand: 16.10.2026. Die vier Pakete stehen in
[`NOTION_UMBAU.md`](../../NOTION_UMBAU.md). Diese gemeinsame Prüfung ergänzt die
Zwischenstände der einzelnen Pakete. Ausschließlich erfundene lokale Fixtures;
keine Anmeldung an Hochschulsystemen und keine persönlichen Bestandsdaten.

## Geprüftes Verhalten

- Tabs öffnen, wechseln, sortieren, schließen und wiederherstellen; gemeinsame
  Notizentwürfe, Editor-Cursor und PDF-Lesestand bleiben erhalten. Unterschiedliche
  Kursentwürfe und Übungsaufgaben erhalten unterschiedliche Tabs.
- Gemeinsame Seitenköpfe und mit Maus oder Tastatur erreichbare Editor-Werkzeuge.
  Das Einblenden der Formatierung verschiebt die Schreibposition nicht.
- Gespeicherte Kursansichten, bestehende Sammlungsfilter und lesbare seitliche
  Notiz-/PDF-Vorschauen. Eine verspätete Speicherantwort darf weder neuere
  Formulareingaben noch die Route eines anderen Tabs überschreiben, auch während
  dessen JavaScript noch lädt.
- Unterseiten mit bestehender Kreisprüfung, ausdrücklich gewählte Vorlagen und
  individuelle Seitenbreite/Schrift. Eine gescheiterte Elternzuordnung lässt sich
  wiederholen, ohne eine zweite Notiz anzulegen. Ein Verbindungswechsel verhindert
  unzulässige Folgeaktionen.
- Bisherige Abläufe einschließlich Kalender, mathematischer Werkzeuge, Downloads,
  Offline-/PWA-Verhalten, Standby und Übergabe bleiben Teil der gemeinsamen Suite.
  Der Originaldownload ist auch im kompakten Reader bei fehlender Vorschau sichtbar.

## Automatisierte Prüfung

| Prüfung | Ergebnis |
| --- | --- |
| Frontend, vollständige Vitest-Suite | 1.485 Tests in 186 Dateien bestanden |
| Python | 1.385 bestanden, acht reguläre Skips; macOS-Signaturdatei ausgenommen, siehe unten |
| Typecheck, ESLint, Übersetzungen | Bestanden; 73 deutsche/englische Namensräume |
| Ruff, mypy | Bestanden; mypy: 651 Quelldateien |
| OpenAPI-Export und generierte Frontend-Typen | Bestanden |
| Produktionsbuild und Browserbudgets | Bestanden |
| Vollständige Playwright-Suite | 567 Fälle abgedeckt: 566 im Gesamtlauf grün; kompletter korrigierter 27-Fälle-Block anschließend grün |
| Lighthouse Accessibility | 28 Ansichten, 96–100 Punkte, keine JavaScript-/Audit-Laufzeitfehler |

Der Gesamtlauf endete mit 566 bestandenen Fällen und genau einem fehlgeschlagenen
Test: Der Moodle-Redirect-Test suchte nach vorherigen Uploads in der begrenzten
Kursvorschau. Er öffnet nun ausdrücklich die vollständigen Unterlagen. Danach
bestand der gesamte zusammenhängende Moodle-Block mit 27 von 27 Fällen auf
demselben eingefrorenen Build. Für diese Testkorrektur wurde kein App-Code und
kein Build verändert. Die übrigen 540 Fälle stammen aus dem Gesamtlauf.

Der vollständige Browserlauf verwendet ein separates, eingefrorenes Build und
einen isolierten Checkout. Die Frontend- und Backend-Quelldateien wurden byteweise
mit dem Arbeitsstand verglichen. Andere gleichzeitig laufende App-Instanzen werden
nicht beendet. Nur die Test-Portadressen werden in der temporären Testkopie
verschoben: Vorschauen 4673/4674/4678, Fake-Dienste 8673 bis 8678. Der anschließende Moodle-Block verwendet Vorschau 4573 und Fake-Dienste
8573 bis 8578. Die Tests laufen weiterhin mit einem Worker und denselben Assertions. Die synthetische
Syncthing-Adresse und die Test-Origin-Freigabe folgen denselben isolierten Ports.

Reguläre Wiederholung ohne parallel belegte Standardports:

```sh
cd frontend
npm run typecheck
npm run lint
npm run i18n:check
npm run test
npm run build
npm run e2e:run
```

Das eingefrorene Build hält die Budgets ein: 277 eindeutige Precache-Dateien,
18.591.367 Byte roh und 5.219.722 Byte gzip; Grenzen 18.874.368 bzw. 5.242.880 Byte.
Der Start-Einstieg benötigt 179.457 Byte gzip bei einem Budget von 227.328 Byte.
Der Hash des geprüften HTML-Einstiegs steht in `lighthouse-summary.json`.

## Visuelle Prüfung

Sieben Zustände jeweils bei 1.440 und 390 Pixeln in Hell und Dunkel:
Leseseite mit Unterseiten (`page`), Bearbeitung (`editor`), leere Seite mit Vorlagen
(`templates`), Kursansichten (`course`), PDF-Seitenvorschau (`preview`), neuer Tab
(`new`) und vollständiger Reader (`reader`). Die PNGs wurden auf Lesbarkeit,
Überlauf, erreichbare Hauptaktionen und die responsive Anordnung geprüft.

`lighthouse-summary.json` enthält alle Einzelwerte und die verbliebenen Befunde.
Die niedrigsten Werte betreffen die vorhandene zugängliche Benennung der
schreibgeschützten Tiptap-Ansicht sowie des Suchknopfs in der Desktop-Seitenleiste.
Alle Ansichten erreichen die Projektgrenze von mindestens 90 Punkten.

## Grenzen der Abnahme

Der lokale separate macOS-Signaturtest scheitert beim Prüfen seines kurzlebigen
Testzertifikats an `CSSMERR_TP_NOT_TRUSTED`; deshalb wurde
`uv run pytest --ignore=tests/test_macos_signing.py` verwendet. Kein Schlüsselbund
und keine Vertrauenseinstellung wurde dafür geändert. Docker steht auf diesem
Rechner nicht zur Verfügung; ein Docker-Smoke wurde nicht ausgeführt.

Native Tastenkürzel, WebView-Verhalten, geschützte Systemdialoge und die Prüfung
mit echten Konten bleiben die ausdrücklich aufgeführten Schritte in
[`MANUELL_TESTEN.md`](../../MANUELL_TESTEN.md). Ein Desktop-Release, Installation,
Server-Deployment oder eine Datenmigration gehört nicht zu diesem Umbau.
