<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

## Lokale Spracherkennung im Desktop-Paket

Die optionale Python-Abhängigkeit `faster-whisper` 1.2.1 (MIT, SYSTRAN) wird im Desktop-Build mitgeliefert. Sie transkribiert Aufnahmen auf der CPU ohne Browserdienst und ohne externe Übertragung. Quelle: <https://github.com/SYSTRAN/faster-whisper/tree/v1.2.1>.

Das mehrsprachige Whisper-Base-Modell (MIT, OpenAI; Konvertierung durch SYSTRAN) kommt aus <https://huggingface.co/Systran/faster-whisper-base>, fest auf Revision `ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66`. Der Build speichert Revision und SHA-256-Werte im Modellmanifest. Die Dateien werden beim App-Bau geladen, nicht bei einer Aufnahme. Lizenz: <https://github.com/openai/whisper/blob/main/LICENSE>.

Die dafür nötigen Laufzeitbibliotheken (CTranslate2, PyAV, ONNX Runtime, Tokenizers und deren Binärabhängigkeiten) behalten die Lizenzdateien ihrer Python-Wheels im Paket. PyAV/FFmpeg dienen der Audio-Dekodierung, ONNX Runtime dem lokalen Sprachaktivitätsfilter, CTranslate2 dem CPU-Modell. Drittanbieter-Lizenzen sind zusätzlich unter `voice-licenses` im gebündelten Dienst enthalten.

## Windows-Prozessverwaltung

`pywin32` 312 (PSF-Lizenz, Mark Hammond und Mitwirkende) ist auf Windows eine
direkte Laufzeitabhängigkeit. Die Parser werden vor ihrem Start einem Windows-
Job zugeordnet; so können auch verbliebene Kindprozesse zuverlässig beendet
werden. Quelle: <https://github.com/mhammond/pywin32/tree/b312>.
Die Lizenzdateien des Wheels bleiben im Paket erhalten. Es wurde kein Quellcode
aus PyWin32 übernommen.

# Hinweise zu übernommenem Code

## GLib-Sicherheitsbackport (0.1.15)

`desktop/src-tauri/vendor/glib` enthält die MIT-lizenzierten GLib-0.18.5-Quellen des gtk-rs-Projekts aus crates.io. Original-Prüfsumme: `233daaf6e83ae6a12a52055f568f9d7cf4671dabb78ff9560ab6da230ce00ee5`; Original-Commit: `42b9caf98e03ded086362d9653ca58fe94dc8658`. `LICENSE`, `COPYRIGHT` und sämtliche vorhandenen Herkunftshinweise bleiben erhalten.

Einzige Quelländerung: der offizielle Zwei-Zeilen-Fix aus [gtk-rs-core #1343](https://github.com/gtk-rs/gtk-rs-core/pull/1343), Commit `05dff0ee696f9bcd8617cd48c4b812d046d440cb`, in `src/variant_iter.rs`: veränderlicher Ausgabezeiger und `&mut p`. Dadurch wird [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html) behoben. Tauri/GTK3 verlangt weiter den ABI-/Typzweig 0.18; ein Austausch gegen GLib 0.20 allein wäre inkompatibel. Cargo verwendet die lokale Quelle über `[patch.crates-io]`; die Versionsnummer wird nicht als vermeintliches 0.20 umetikettiert. Versionsbasierte Scanner können den Backport weiterhin melden; die optimierten Upstream-Iterator-Tests prüfen den tatsächlichen Fehler. Der Backport entfällt, sobald der gesamte Tauri/GTK-Unterbau eine korrigierte veröffentlichte GLib-Version unterstützt.

## Wiederkehrende Stundenpläne (0.1.10)

`recurring-ical-events` 3.8.2 und dessen Abhängigkeit `x-wr-timezone` 2.0.1 (jeweils LGPL-3.0-or-later) erweitern das vorhandene `icalendar`: Termine werden mit Serien, Ausnahmen und verschobenen Einzelterminen gelesen. Quellen: [recurring-ical-events](https://github.com/niccokunzmann/python-recurring-ical-events), [x-wr-timezone](https://github.com/niccokunzmann/x-wr-timezone). Die genauen Paketversionen und Prüfsummen stehen in `uv.lock`; kein Quelltext wurde ins Projekt kopiert. Ihre vollständigen Lizenzdateien werden unter `third-party-licenses` im Desktop-Dienst mitgeliefert. Der Dienst lässt sich mit den öffentlich verfügbaren Quellen und `scripts/build_desktop.py` neu bauen.

UniOS steht unter AGPL-3.0-or-later. Die folgenden Bestandteile behalten ihre jeweilige Herkunft und Lizenz. Die angegebenen Commits sind die unveränderlichen Quellen der verwendeten Versionen.

| Bestandteil | Quelle und Commit | Lizenz | Betroffene Dateien |
| --- | --- | --- | --- |
| shadcn/ui, CLI-Version 4.21.0 | [shadcn-ui/ui](https://github.com/shadcn-ui/ui/tree/7c9eaba1c0a6404c990c144a654792e3313c650d), `7c9eaba1c0a6404c990c144a654792e3313c650d` | MIT | `frontend/src/components/ui/*.tsx`; lokal für Imports und Darstellung angepasst. Die Themenbasis in `frontend/src/index.css` stammt ebenfalls aus der shadcn-Einrichtung und wurde für das Projekt angepasst. Nicht verwendete Generator-Konfiguration und Komponenten wurden am 03.10.2026 entfernt; die Vorgängerversion bleibt in Git nachvollziehbar. |
| moodle-dl 2.3.13 | [C0D3D3V/Moodle-DL](https://github.com/C0D3D3V/Moodle-DL/tree/ab284ee2aead539d20722234b1bd6d9170079a71), `ab284ee2aead539d20722234b1bd6d9170079a71` | GPL-3.0 | Als Paketabhängigkeit in `pyproject.toml` und `uv.lock`; verwendet in `app/connectors/moodle/client.py` und `scripts/setup_token.py`. Es wurde kein moodle-dl-Quelltext ins Repo kopiert. |
| React-PDF 11.0.0 | [wojtekmaj/react-pdf](https://github.com/wojtekmaj/react-pdf/tree/v11.0.0) | MIT | Paketabhängigkeit in `frontend/package.json`; PDF-Anzeige in `frontend/src/pages/MaterialPage.tsx`. |
| PDF.js (`pdfjs-dist` 6.3.289) | [mozilla/pdf.js](https://github.com/mozilla/pdf.js) | Apache-2.0 | Transitive Abhängigkeit von React-PDF; PDF-Worker und Textebene im Material-Viewer. Der vollständige Lizenztext wird unter `frontend/public/licenses/PDFjs-Apache-2.0.txt` mit dem Build ausgeliefert. |
| Anki Python 26.9.3 | [ankitects/anki](https://github.com/ankitects/anki) | AGPL-3.0-or-later | Paketabhängigkeit in `pyproject.toml` und `uv.lock`; offizielle Collection, FSRS-Planung und `.apkg`-Import/Export in `app/anki/`. Kein Anki-Quelltext wurde kopiert. |
| ts-fsrs 5.4.2 | [open-spaced-repetition/ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) | MIT | Paketabhängigkeit in `frontend/package.json`; unverbindliche Intervallvorschau im Offline-Lernmodus. Kein Quelltext wurde kopiert. |
| Geist Variable 5.3.0 | [vercel/geist-font](https://github.com/vercel/geist-font) | OFL-1.1 | Schriftdateien aus `@fontsource-variable/geist` werden in den Frontend-Build übernommen. Der vollständige Lizenztext wird mit dem Build unter `frontend/public/licenses/Geist-OFL.txt` ausgeliefert. |

Die UniOS-Wortmarken unter `docs/brand/v2` und `frontend/public/brand/v2` enthalten
Geist-Glyphen als Vektorpfade (Gewicht 650). `docs/brand/v2/Geist-OFL.txt` enthält
deren OFL-1.1-Lizenz. Das originale U-/Buch-Zeichen ist separat als eigene
SVG-Geometrie gestaltet; Herkunft und Entwurf stehen im Brand-Kit.

Direkte Frontend-Laufzeitpakete, geprüft am 15.10.2026 gegen
`frontend/package-lock.json` und die installierten Paketmetadaten:

| Paket | Version | Lizenz |
| --- | --- | --- |
| `@fontsource-variable/geist` | 5.3.0 | OFL-1.1 |
| `@fontsource/fira-code` | 5.3.0 | OFL-1.1 |
| `@tailwindcss/vite` | 4.3.3 | MIT |
| `@tanstack/react-query` | 5.104.2 | MIT |
| `@tanstack/react-query-persist-client` | 5.104.2 | MIT |
| `@tauri-apps/api` | 2.12.3 | Apache-2.0 OR MIT |
| `@tauri-apps/plugin-process` | 2.4.0 | MIT OR Apache-2.0 |
| `@tiptap/core` | 3.31.4 | MIT |
| `@tiptap/extension-code-block-lowlight` | 3.31.4 | MIT |
| `@tiptap/extension-drag-handle-react` | 3.31.4 | MIT |
| `@tiptap/extension-link` | 3.31.4 | MIT |
| `@tiptap/extension-list` | 3.31.4 | MIT |
| `@tiptap/extension-placeholder` | 3.31.4 | MIT |
| `@tiptap/extension-table` | 3.31.4 | MIT |
| `@tiptap/markdown` | 3.31.4 | MIT |
| `@tiptap/pm` | 3.31.4 | MIT |
| `@tiptap/react` | 3.31.4 | MIT |
| `@tiptap/starter-kit` | 3.31.4 | MIT |
| `cn` | 0.4.0 | MIT |
| `class-variance-authority` | 0.7.1 | Apache-2.0 |
| `diff` | 9.0.0 | BSD-3-Clause |
| `docx-preview` | 0.4.1 | Apache-2.0 |
| `dompurify` | 3.4.16 | (MPL-2.0 OR Apache-2.0) |
| `i18next` | 26.4.2 | MIT |
| `i18next-resources-to-backend` | 1.2.3 | MIT |
| `idb-keyval` | 6.3.0 | Apache-2.0 |
| `jszip` | 3.10.2 | (MIT OR GPL-3.0-or-later) |
| `katex` | 0.19.0 | MIT |
| `lowlight` | 3.3.0 | MIT |
| `lucide-react` | 1.55.0 | ISC |
| `mathlive` | 0.111.1 | MIT |
| `monaco-editor` | 0.57.0 | MIT |
| `radix-ui` | 1.8.0 | MIT |
| `react` | 19.3.0 | MIT |
| `react-dom` | 19.3.0 | MIT |
| `react-i18next` | 17.0.15 | MIT |
| `react-pdf` | 11.0.0 | MIT |
| `react-router-dom` | 7.18.4 | MIT |
| `tailwindcss` | 4.3.3 | MIT |
| `ts-fsrs` | 5.4.2 | MIT |
| `tw-animate-css` | 1.4.0 | MIT |

KaTeX liefert eigene Typen;
`@types/katex` wurde ebenfalls entfernt. Die Sperrdatei dokumentiert zusätzlich die tatsächlich aufgelösten transitiven Pakete.

## Wasmtime für ausführbare Addons

Wasmtime 49.0.0 und die Python-Bindings stammen von der Bytecode Alliance
(Apache-2.0 mit LLVM-Ausnahme). Im Desktop-Paket werden die Lizenzdateien der
installierten Distribution unter `third-party-licenses/wasmtime` mitgeliefert.
Der Worker verwendet keine WASI-Imports und führt ausschließlich freigegebene,
hashgebundene WASM-Module aus. Vertrag und Grenzen: [Addons v2](docs/ADDONS_V2.md).

## MIT-Lizenz von shadcn/ui (Lizenztext)

Seit 03.10.2026 wird ausschließlich das Stylesheet aus shadcn 4.21.0 unter
`frontend/src/vendor/shadcn-tailwind.css` mitgeliefert; der Generator und seine
Paketabhängigkeiten sind entfernt. Quelle:
[packages/shadcn/src/tailwind.css](https://github.com/shadcn-ui/ui/blob/7c9eaba1c0a6404c990c144a654792e3313c650d/packages/shadcn/src/tailwind.css),
Commit `7c9eaba1c0a6404c990c144a654792e3313c650d` (Tag `shadcn@4.21.0`).
Original-Paketdatei `dist/tailwind.css`, SHA-256
`bc7d83425702955b4cb67cb14ede9d603f9d912376d57a2d81d661094d2a782a`;
nur Lizenz-/Herkunftskommentar ergänzt. Der folgende MIT-Lizenztext gilt auch
für dieses Stylesheet.

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Rich-Text-Editor (02.10.2026)

- Tiptap Core, React, StarterKit, Markdown und freie Tabellen-, Listen-,
  Code-, Placeholder- und DragHandle-Extensions: Version 3.31.4, MIT.
  Quelle: https://github.com/ueberdosis/tiptap (release v3.31.4).
  ProseMirror-Abhängigkeiten behalten ihre jeweiligen MIT-Hinweise.
- Lowlight 3.3.0: MIT, Quelle https://github.com/wooorm/lowlight.
- Fira Code über `@fontsource/fira-code` 5.3.0: SIL Open Font License 1.1,
  Quelle https://github.com/tonsky/FiraCode. Der Original-Lizenztext liegt
  unter `frontend/public/licenses/fira-code.txt` und wird ausgeliefert.

Die Implementierung benutzt veröffentlichte Pakete. Architektur und Format: [NOTE_STUDIO.md](docs/NOTE_STUDIO.md).

## Assessment Engine und Coding Tutor (0.1.18)

- Monaco Editor 0.57.0, Microsoft, MIT; npm-Paket mit VS-Code-Stand `6a598d4a13031703d483d103c1d934a36ad27971`. Eigene React-Anbindung in `frontend/src/components/coding/CodeEditor.tsx`; unveränderter Lizenztext in `docs/licenses/monaco-editor-0.57.0.txt`. Lokale Editor-/JavaScript-Worker, kein CDN.
- SymPy 1.14.0, SymPy Development Team, BSD-3-Clause; Quelle: https://github.com/sympy/sympy/tree/1.14.0. Unveränderter Lizenztext in `docs/licenses/sympy-1.14.0.txt`. Nur für den begrenzten eigenen AST-Parser, keine freie eval-/parse_expr-Auswertung.
- mpmath 1.3.0, Fredrik Johansson und Mitwirkende, BSD-3-Clause; Quelle: https://github.com/mpmath/mpmath/tree/1.3.0. Transitive SymPy-Abhängigkeit, Lizenz in `docs/licenses/mpmath-1.3.0.txt`. Exakte Paket-Hashes in `uv.lock`.
- Judge0 CE 1.13.1, GPL-3.0, Quelle: https://github.com/judge0/judge0/releases/tag/v1.13.1; separater Dienst in eigener VM, kein kopierter Judge0-Code im UniOS-Backend. Der eigene Adapter benutzt die HTTP-Schnittstelle. Die VM behält die offiziellen Quellen/Lizenzen.

## Visuelle Formeleingabe und Logik (07.10.2026)

- MathLive 0.111.1, Arno Gourdol, MIT. Quelle:
  https://github.com/arnog/mathlive/tree/30ad20a7a47ea43a2f6915808023202c78f37742.
  Visuelles Formelfeld mit Cursor, Vorlagen und virtueller Tastatur, ohne einen
  eigenen Formeleditor nachzubauen. Unveränderte MIT-Lizenz:
  `docs/licenses/mathlive-0.111.1.txt`.
- KaTeX 0.19.0, Khan Academy und Mitwirkende, MIT. Quelle:
  https://github.com/KaTeX/KaTeX/tree/6ea2dc97188f0cc282e05a9690418ae7fe5457ba.
  Lokale HTML-/MathML-Darstellung gespeicherter Formeln. Unveränderte MIT-Lizenz:
  `docs/licenses/katex-0.19.0.txt`. `@types/katex` 0.16.8 (MIT) ist ausschließlich
  eine Entwicklungsabhängigkeit. Versionen und Paket-Integrität in `package-lock.json`.

Beide Lizenztexte werden zusätzlich aus `frontend/public/licenses/` mit dem
Web-/Desktop-Build ausgeliefert. MathLive- und KaTeX-Fonts kommen aus den lokalen
Paketen und werden von der PWA zwischengespeichert; kein Font-CDN.
