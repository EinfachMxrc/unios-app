<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Entwicklungsumgebung

UniOS besteht aus FastAPI, SQLite und einer React/Vite-PWA. Arbeite für Entwicklung und Tests ausschließlich mit erfundenen Daten und lokalen Fake-Servern.

## Repository vorbereiten

Installiere Python 3.12+, uv und Node.js 22+. Im Projektverzeichnis: uv sync --locked --group dev. Im Ordner frontend: npm ci. Der Build erfolgt mit npm run build; danach kann die CLI die Demo bedienen.

## Lokale Demo

Starte uv run unios demo create und uv run unios demo serve. Öffne http://127.0.0.1:8766. Der Demo-Ordner ist vom persönlichen Datenbestand getrennt. Persönliche Verzeichnisse data/ und local/, .env und der Schlüsselbund gehören nicht in Tests. Der [README-Schnellstart](https://github.com/EinfachMxrc/unios-app/blob/main/README.md) zeigt dieselbe Folge.
