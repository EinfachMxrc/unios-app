<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# UniOS: verbindliche Arbeitsregeln

Lies vor jeder Änderung `docs/BAUAUFTRAG.md` und `docs/PROGRESS.md`. Maßgeblich ist die finale Fassung des Bauauftrags. Arbeite die Phasen in Abschnitt 32 der Reihe nach ab und aktualisiere den Fortschritt nach größeren Schritten.

## Sicherheit

- Keine Umgehung von MFA, CAPTCHA oder sonstigen Schutzmaßnahmen. Niemals bei echten Hochschulsystemen anmelden; Tests benutzen erfundene oder anonymisierte Fixtures und lokale Fake-Server.
- Echte Daten unter `data/` und `local/`, im Schlüsselbund oder in `.env` nie lesen, ausgeben, kopieren oder in Tests benutzen. Vor jeder Migration am echten Bestand erstellt Marc einen geprüften Snapshot.
- PRIMUSS ausschließlich lesend. Moodle-Abgaben nur über den ausdrücklich bestätigten UI-Flow. Keine automatische Annahme von Eigenständigkeitserklärungen.
- Keine Dateien überschreiben oder löschen; Änderungen versionieren. Keine Geheimnisse, Session-URLs oder persönlichen Hochschuldaten im Repo oder in Logs.
- Secrets in der OS-Keychain, ersatzweise `.env` mit Dateirechten 600. Dashboard, API und iCal nur lokal oder über Tailscale.
- Uni-Systeme sequentiell und schonend abfragen. Bei unklaren Zuständen keine Sicherheit oder Genauigkeit vortäuschen. Einzelnutzer-System.

## Projekt und Qualität

- Backend: `app/`, `alembic/`, `tests/`; Frontend: `frontend/`; Betrieb: `deploy/`, `scripts/`; Dokumentation: `docs/`.
- Neue Backend-Funktionen trennen HTTP-Validierung (`api.py`), Fachregeln (`service.py`) und Datenzugriff (`repository.py`). Routen greifen nicht direkt auf die Datenbank zu; Repositories enthalten keine Fachentscheidungen. Bestehende Domänen werden bei konkreten Änderungen schrittweise angepasst, nicht pauschal umgebaut.
- Backend prüfen mit `pytest`, `ruff check .`, `mypy app tests`. Frontend prüfen mit `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` in `frontend/`. Nutzerfunktionen zusätzlich mit Playwright-E2E gegen die laufende App prüfen.
- Jeder Hauptablauf braucht einen bestandenen Playwright-Test mit lokalen Fake-Servern; Randfälle werden mit pytest oder Vitest geprüft. Keine Platzhalter, TODOs oder Mock-Daten in der ausgelieferten App; unbekannte Hochschulwerte dürfen nur im Profil als TODO stehen.
- Am Phasenende Hauptseiten als Playwright-Screenshots in Dark/Light auf Desktop und 390 px selbst prüfen. PWA muss installierbar sein, Lighthouse Accessibility mindestens 90 erreichen. Was nur mit echten Konten prüfbar ist, genau in `docs/MANUELL_TESTEN.md` erklären.
- UI und Doku deutsch, Code und Bezeichner englisch. Keine echten Hochschuldaten in Fixtures. Neue Abhängigkeiten kurz begründen. Conventional Commits nach jedem funktionierenden Teilschritt.
- Neuer UI-Text im Frontend läuft immer über i18n (`useT`/`t(...)`, niemals hart codierter String in JSX) — siehe [docs/TRANSLATING.md](docs/TRANSLATING.md) zum Hinzufügen einer Sprache.
- **Release-Pflicht:** Jede neue Version (Tag `vX.Y.Z`) bekommt einen veröffentlichten GitHub-Release (kein Draft) mit Release-Notizen, Prüfsummen und aktuellen README-Screenshots. Ablauf und Checkliste in [docs/RELEASING.md](docs/RELEASING.md). Das ist bei jeder Version verpflichtend, nicht optional; die README verlinkt nur `releases/latest`.
- Der bestätigte Bauauftrag legt AGPL-3.0-or-later fest; Lizenz- und Herkunftshinweise bei übernommenem Code erhalten.
- Eigene Textdateien erhalten einen SPDX-Header; übernommener Code behält seine Lizenz und wird in `THIRD_PARTY_NOTICES.md` mit Quelle und Commit dokumentiert.
- Für umfangreiche lesende Shell-Ausgabe `rtk` benutzen, sofern der Befehl unterstützt wird. Exakte Quellzeilen, vollständige Diffs und Änderungen nativ ausführen.

## Testrhythmus (Zeit sparen)

- **Während eines Arbeitspakets:** Ruff und Typecheck für betroffene Sprachen sowie gezielte Tests, z. B. `pytest tests/test_x.py -x` oder `vitest related`. Kein voller Build und kein Playwright bei reinen Logikänderungen.
- **Vor jedem Paket-Commit:** betroffene pytest-/Vitest-Tests, Ruff, mypy oder Typecheck für betroffene Sprachen und die passenden Playwright-Abläufe bei geändertem Nutzerfluss. Den Frontend-Build einmal vor den Browser-Tests ausführen; danach für normale Abläufe `npm run e2e:focused -- <spec>` nutzen (nur Haupt-Fake-App und Vorschau). Für die Übergabe `npm run e2e:handoff` nutzen (nur drei Fake-Dienste); für Standby, Syncthing, Produktionsansicht oder deaktivierten Connector `npm run e2e:run -- <spec>` nutzen. Ein lokaler Commit pro funktionierendem Paket.
- **Bei Integrationsänderungen und am Phasenende:** vollständiger Python-, Frontend- und Playwright-Lauf sowie OpenAPI-Prüfung. Am Phasenende zusätzlich Screenshots, Lighthouse und Docker-Smoke. Die Abnahmekriterien aus Abschnitt 31 des Bauauftrags bleiben vollständig bestehen.
- **Parallelisierung messen:** `pytest -n auto` nur verwenden, wenn es auf dem Gerät schneller ist; sonst mit einer gemessenen, kleinen Worker-Zahl laufen lassen. Playwright-Worker wegen gemeinsamem Fake-Server-Zustand nicht ohne Isolationsnachweis erhöhen.
- **GitHub-Läufe sparen:** fertige Arbeitspakete lokal committen und höchstens einmal regulär pro Phase gesammelt pushen, nach bestandenem Phasenend-Lauf. GitHub Actions im Hintergrund laufen lassen; Ergebnis vor einem weiteren Push prüfen. Ist es rot, lokal beheben und die Korrektur gesammelt pushen.
- Lange Läufe mit Log-Datei im Hintergrund starten und währenddessen an unabhängigen Teilen desselben Pakets weiterarbeiten. Auf fehlgeschlagenen Prüfungen nicht aufbauen.
- Testabdeckung bei Bedarf gezielt mit `pytest --cov=app --cov-branch -q` prüfen (Schwelle in `pyproject.toml`, `[tool.coverage.report]`); nicht Teil des normalen `pytest`-Laufs, da spürbar langsamer.
