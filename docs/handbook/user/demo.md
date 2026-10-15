<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Demo ausprobieren

Die Demo zeigt ein erfundenes Semester in einem eigenen Ordner. Sie verbindet sich nicht mit einer Hochschule und ist der einfachste Weg, Oberfläche und Lernabläufe kennenzulernen.

## Vorbereiten

Du brauchst uv und Node.js 22 oder neuer. Klone das Repository und führe im Projektverzeichnis nacheinander aus:

1. uv sync --locked --group dev
2. Im Ordner frontend: npm ci und npm run build
3. Zurück im Projektverzeichnis: uv run unios demo create
4. Danach: uv run unios demo serve

Öffne anschließend http://127.0.0.1:8766 im Browser. Weitere Optionen zeigt uv run unios demo --help.

## Worauf du achten kannst

Öffne zuerst Heute, dann einen Kurs und ein PDF. Im Eingang siehst du, wie neue Inhalte eingeordnet werden. Der Demo-Ordner demo-workspace ist von persönlichen Daten getrennt.
