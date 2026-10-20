<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# README-Screenshots

Aufgenommen am 20.10.2026 (Stand 0.1.31)
mit `scripts/readme_screenshots.mjs` gegen
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

## Demo-GIF und Vorschaubild

`docs/readme/current/demo.gif` zeigt eine Tour durch das Demo-Semester (Heute, Kurs, PDF, Notizen, Lernen).
Aufnahme gegen denselben getrennten Demo-Dienst auf Port 8767:

```sh
node scripts/readme_demo_gif.mjs      # schreibt .tmp/demo-video/*.webm
ffmpeg -i .tmp/demo-video/*.webm -vf "fps=10,scale=880:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" docs/readme/current/demo.gif
```

`docs/brand/social-preview.png` (1280 × 640) ist das Vorschaubild für geteilte Links. Es wird in den
Repository-Einstellungen unter *Social preview* hochgeladen; eine Kopie liegt für die Projektseite in `docs/site/assets/`.
