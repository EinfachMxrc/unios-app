<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Screenshots · Alpha 1 / 0.1.19

Aufgenommen am 04.10.2026 gegen die echte React-Oberfläche und den getrennten
Demo-Dienst auf `127.0.0.1:8767`. Keine persönlichen Daten, echten Konten,
Hochschul-Sessions oder Produktionsdaten wurden verwendet. Vier erfundene Kurse,
15 Demo-Karten und generierte PDFs stammen aus `app/demo/service.py`.
Die Notiz „Rekursion verstehen“ wird für die Aufnahme über die Demo-API erstellt.

Die PNGs sind unveränderte Browser-Screenshots, keine Mockups. Chrome/Playwright,
Desktop 1440 × 960 und Handybreite 390 × 844, Zeitzone Europe/Berlin.
Heute ist in Hell/Dunkel aufgenommen; die weiteren Ansichten im Dunkelmodus.
Editor-Fokusmodus wurde über die vorhandene UI aktiviert; das Editorbild ist
ein unveränderter Screenshot des vollständigen Notizformulars.
Alle neun Aufnahmen wurden visuell geprüft; im Aufnahmelauf gab es keine
Browser-Ausnahmen. Dies ersetzt keine native Geräteabnahme.

## Reproduzieren

Nach `uv sync --locked --group dev`, `npm ci` und `npm run build` im Frontend:

```sh
uv run unios demo create --directory .tmp/readme-demo
uv run unios demo serve --directory .tmp/readme-demo --port 8767
```

In einem zweiten Terminal im Repository:

```sh
node scripts/readme_screenshots.mjs
```

Nur einen neuen, getrennten Demo-Ordner verwenden. Das Skript verwendet eine
bereits vorhandene Demo-Notiz mit demselben Titel erneut.
Das Skript wartet auf geladene Seiten, Schriften und API-Inhalte.
