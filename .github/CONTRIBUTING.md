<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Zu UniOS beitragen

Beiträge zu Fehlern, Bedienung, Übersetzung, Tests und Hochschulprofilen sind willkommen.
Vor Änderungen [AGENTS.md](../AGENTS.md), [Bauauftrag](../docs/BAUAUFTRAG.md) und
[Fortschritt](../docs/PROGRESS.md) lesen. Ein Release-Kandidat priorisiert Stabilität;
größere neue Funktionen zuerst als Vorschlag beschreiben.

**Zum Einstieg:** Issues mit dem Label [good first issue](https://github.com/EinfachMxrc/unios-app/labels/good%20first%20issue) sind klein und beschrieben (z. B. eine UI-Sprache, ein Hochschulprofil, ein Komponententest). Kommentiere kurz, welches du übernimmst.

## Lokal entwickeln

Python 3.13+ über uv sowie Node.js 22+ verwenden. Im Repository:

```sh
uv sync --locked --group dev
cd frontend
npm ci
npm run build
cd ..
uv run unios demo create --directory demo-workspace
uv run unios demo serve --directory demo-workspace
```

Die Demo enthält erfundene Daten. Sie verbindet sich nicht mit einer Hochschule.
Keine privaten data/- oder local/-Ordner, Schlüsselbünde oder .env für Tests verwenden.
Normale Produktdaten sind kein Testfixture. Persönliche Portaltests macht der Nutzer
selbst; MFA/CAPTCHA werden niemals umgangen.

## Pull Request

Ein verständlicher PR beschreibt Problem, Änderung, ausgeführte Prüfungen und Grenzen.
Eigene Textdateien tragen SPDX AGPL-3.0-or-later; Herkunft/Lizenzen von Fremdcode
erhalten und in THIRD_PARTY_NOTICES.md nennen. Keine echten Noten, Namen, Tokens,
Sitzungslinks oder unbereinigten Screenshots beitragen. UI und Dokumentation sind
deutsch, Bezeichner englisch; UI-Text über i18n. Conventional Commits verwenden.

Backend trennt HTTP-Validierung, Fachregeln und Datenzugriff. Gezielte Tests zuerst:

```sh
uv run pytest tests/test_betroffener_bereich.py
uv run ruff check .
uv run mypy app tests
cd frontend
npm run typecheck
npm run lint
npm run test
```

`test_betroffener_bereich.py` ist durch eine vorhandene Testdatei zu ersetzen.
Neue Nutzerabläufe brauchen passende Browserprüfungen nach AGENTS.md; Integration
braucht vollständige Gates. Windows-Testordner kurz und frisch wählen, damit lange
Dateipfade keine irreführenden Fehler erzeugen. Die Freigabe enthält tatsächliche
Ergebnisse, keine Behauptung „getestet“, weil ein Test nur geschrieben wurde.

Hochschule ergänzen: [ADD_UNIVERSITY](../docs/ADD_UNIVERSITY.md).
Addon-Beispiele/Vertrag: [EXTENSIONS](../docs/EXTENSIONS.md), [ADDONS_V2](../docs/ADDONS_V2.md).
Sicherheitsfehler vertraulich nach [SECURITY](SECURITY.md) melden.
