<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Release-Ablauf

Jede neue Version bekommt einen **veröffentlichten** GitHub-Release. Ein Tag oder ein
Entwurf (Draft) zählt nicht. Die Reihenfolge steht hier, damit sie nicht vergessen wird.
Ergänzend gelten [PUBLISHING](PUBLISHING.md), [RELEASE_READINESS](RELEASE_READINESS.md)
und [DESKTOP_PACKAGES](DESKTOP_PACKAGES.md).

## Checkliste

1. **Qualität:** `pytest`, `ruff check .`, `mypy app tests`, Frontend-Typecheck, Lint,
   Test, Build und die passenden Playwright-Abläufe sind grün.
2. **Version** in `pyproject.toml` (und den Desktop-Manifesten) erhöhen. Der Tag heißt `vX.Y.Z`.
3. **CHANGELOG.md:** den Abschnitt „Unveröffentlicht“ in `X.Y.Z – Titel (Datum)` umbenennen.
4. **Screenshots** neu aufnehmen und ansehen ([Anleitung](readme/current/SCREENSHOTS.md)).
   README-Bilder müssen zur Version passen.
5. **README prüfen:** Der Download-Link zeigt auf `releases/latest`. Keine feste
   Versionsnummer im Fließtext, außer in diesem Ablauf und in Release-Notizen.
6. **Pakete** bauen (`scripts/stage_desktop_release.py`), `SHA256SUMS.txt` und
   `verification.json` erzeugen. Nur Plattformen auflisten, die wirklich gebaut und geprüft wurden.
7. **Release-Notizen** schreiben: was neu ist, was nicht verifiziert ist, Migrationen,
   Hinweis auf Snapshot. Ablage als `docs/releases/X.Y.Z.md`, ehrlich zu Grenzen
   (Signierung, Geräteabnahme, echte Hochschulkonten).
8. **Veröffentlichen** (kein Draft):

   ```sh
   git tag -a vX.Y.Z -m "UniOS X.Y.Z"   # falls noch nicht vorhanden
   git push origin vX.Y.Z
   gh release create vX.Y.Z --verify-tag --latest \
     --title "UniOS X.Y.Z – Kurztitel" --notes-file docs/releases/X.Y.Z.md \
     dist/*/UniOS-X.Y.Z-* dist/*/SHA256SUMS.txt
   ```

   Ist ein Draft vorhanden: `gh release edit vX.Y.Z --draft=false --latest`.
   Vorabversionen (Alpha/Beta) mit `--prerelease` statt `--latest`.
9. **Prüfen:** `gh release view vX.Y.Z` zeigt kein Draft, die Assets sind vollständig,
   `releases/latest` löst auf diese Version auf.
10. **Fortschritt** in [PROGRESS](PROGRESS.md) eintragen.

## Auto-Update

Der Updater liest `releases/latest/download/latest.json`. Diese Datei nur
veröffentlichen, wenn die Pakete signiert sind. Fehlt sie, bleibt der Updatekanal
inaktiv, auch wenn der Release öffentlich ist.

## Repository-Seite

Beschreibung, Topics und Homepage beim Release prüfen (`gh repo edit`). Topics sollen
Technik und Zweck abdecken, ohne Hochschulnamen oder persönliche Angaben.
