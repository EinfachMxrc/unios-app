<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# README-Screenshots

Aufgenommen am 15.10.2026 (Stand 0.1.28) mit `scripts/readme_screenshots.mjs` gegen
die echte React-Oberfläche und einen frisch erzeugten, getrennten Demo-Dienst. Alle
Inhalte (vier Kurse, 15 Karten, generierte PDFs, die Notiz „Rekursion verstehen“)
sind erfunden; es wurden keine echten Konten, Sessions oder Produktionsdaten benutzt.
Die PNGs sind unveränderte Browser-Screenshots (Chrome/Playwright, 1440 × 960 und
390 × 844, Europe/Berlin). „Heute“ liegt in Hell und Dunkel vor, der Rest im
Dunkelmodus.

## Neu aufnehmen

Bei jedem Release, siehe [RELEASING](../../RELEASING.md):

```sh
(cd frontend && npm run build)
uv run unios demo create --directory .tmp/readme-demo
uv run unios demo serve --directory .tmp/readme-demo --port 8767 &
node scripts/readme_screenshots.mjs
```

Nur einen neuen, getrennten Demo-Ordner verwenden. Danach jedes Bild ansehen. Das
Skript schreibt nach `docs/readme/current/`; `README_SHOTS_DIR` überschreibt das Ziel.
Ältere Aufnahmen liegen unter `alpha-0.1.19/` und `archive/`.
