<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Paketupdates vom 02.10.2026

Exakte Versionen und Prüfsummen stehen in `uv.lock`, `frontend/package-lock.json` und `desktop/src-tauri/Cargo.lock`. Updates werden mit der tatsächlichen Toolchain geprüft; fehlgeschlagene Dependabot-Läufe sind kein Beleg dafür, dass das vorgeschlagene Paket selbst defekt ist.

| Paket | Eingebaut | Entscheidung |
| --- | --- | --- |
| oxlint | 1.86.0 | Gezeigtes Update übernommen. |
| typescript-eslint | 8.71.0 | Gezeigtes Update übernommen; Lint besteht. |
| anthropic | 1.11.0 | Aktuell verfügbares kompatibles Update; Adaptertests bestehen. |
| filelock | 4.0.9 | Aktuell verfügbares kompatibles Update; Snapshottests bestehen. |
| TypeScript-Compiler | 7.0.2 | Unter `typescript-native` installiert; Build und Typecheck starten dessen CLI explizit. |
| TypeScript-API für Tools | 5.9.3 | ESLint akzeptiert `<6.1.0`, OpenAPI-TypeScript verlangt `^5.x`. Bis zur Unterstützung bleibt die API separat erhalten. |
| @types/node | 22.20.5 | Neueste geprüfte Typen für die Node-22-Build-/CI-Laufzeit. Node-26-Typen würden APIs eines anderen Laufzeit-Majors voraussetzen. |
| @vite-pwa/assets-generator | 1.0.4 | `vite-plugin-pwa` 1.3.0 akzeptiert ausschließlich `^1.0.0`. 2.0.0 führt zum Peer-Konflikt und wird erst nach kompatiblem Pluginupdate übernommen. |
| GLib | 0.18.5 + offizieller Backport | Tauri/GTK3 benötigt 0.18. Der offizielle Fix für RUSTSEC-2024-0429 wird über die lokale Cargo-Patchquelle eingebaut; Herkunft und Lizenz stehen in `THIRD_PARTY_NOTICES.md`. |

Die drei Dependabot-Ausnahmen betreffen nur inkompatible Major-Updates des API-Pakets, der Node-Typen und des PWA-Generators. Kompatible Updates und der separate TypeScript-7-Compiler bleiben überwacht. Die Ausnahmen werden entfernt, sobald die jeweiligen konsumierenden Tools die neue API unterstützen.

Die bisherigen roten Dependabot-Prüfungen scheiterten an fehlenden Typinformationen für optionale `av`-/`numpy`-Module sowie am deutsch/englisch identischen Wort „Vegan“. Beide Ursachen sind behoben. Prüfungen nach dem Upload laufen erneut; frühere rote Ergebnisse werden nicht als nachträglich bestanden dargestellt.

## 03.10.2026: braces aus dem Build entfernen

GitHub meldete [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
für `braces` 3.0.3. Der einzige Pfad war shadcn → fast-glob → micromatch → braces.
UniOS verwendet die generierten UI-Komponenten und das Stylesheet, jedoch keine
Generatorfunktion. Deshalb wurde das MIT-Stylesheet mit Herkunft und Lizenz lokal
behalten und das shadcn-Paket entfernt. `npm ls braces --all` ist leer;
`npm audit` meldet null bekannte Schwachstellen. Keine verbleibende Paketversion
wurde dabei aktualisiert. Der Produktions-CSS-Hash blieb unverändert:
`fd1be82e4f4ae4b4cb51e4aa01cce6f9c6ba07072a6ed2364bb365a1a813ea46`.
