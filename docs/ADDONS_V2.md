<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Ausführbare Erweiterungen v2

`Erweiterungen` importiert ein JSON-Paket mit `manifest` und `module_base64`.
Das ausführbare Beispiel liegt in `examples/addons/isolated-tool.unios-addon.json`;
sein vollständiger WAT-Quellcode liegt daneben. Installieren → Rechte freigeben →
aktivieren → Seite öffnen → Werkzeug ausführen. Es startet kein JavaScript im UI.

## Vertrag

- `schema_version: 2`, `api_version: 2`, `runtime: wasm`, exakte Paketversion,
  `wasm_sha256` und eine Textseite. Höhere Versionen erfordern eine neue Freigabe.
- Nur `courses.read` und `study_blocks.read`. Daten sind auf Namen/Links und
  angenommene zukünftige Lernblöcke beschränkt. Keine Notizen, Dateien oder Tokens.
- Gast exportiert `memory`, `alloc(i32) -> i32`, `run(i32, i32) -> i64`.
  `run` erhält UTF-8-JSON im linearen Speicher. Im Ergebnis kodiert das obere
  32-Bit-Wort den Zeiger und das untere die Länge.
- Ergebnis: exakt `{ "title": "…", "body": "…" }`. UniOS rendert beides als Text.
  Kein HTML, keine Hooks und keine vom Gast erzeugten Links.
- Keine Imports, kein WASI, keine Dateisystem-, Netzwerk-, Umgebungs- oder
  Secret-Handles. Eingabe ≤64 KiB, Ausgabe ≤32 KiB, Modul ≤2 MB, linearer Speicher
  ≤16 MiB, zwei Millionen Fuel-Schritte. Eigener Prozess, spätestens nach fünf
  Sekunden beendet; höchstens zwei parallele Ausführungen.
- Der Core prüft Hash und aktuelle Freigabe vor und nach der Ausführung. Entzug
  blockiert neue Ausführungen und verwirft Ergebnisse laufender Ausführungen.

Wasmtime 49.0.0 ist als Laufzeit fest gebunden und wird im Desktop-Dienst
mitgeliefert. Seine Isolation wird durch die [Wasmtime-Sicherheitsarchitektur](https://docs.wasmtime.dev/security.html)
und [Fuel-Begrenzung](https://docs.wasmtime.dev/examples-deterministic-wasm-execution.html)
unterstützt. Der native Worker selbst ist vertrauenswürdiger UniOS-Code;
beliebige native Community-Binaries werden nicht gestartet.

## Nachweise

Tests führen echten WASM-Code aus und prüfen Freigabe/Entzug, Hash-Manipulation,
WASI-Import, Endlosschleife und Speicherüberschreitung. Der Browserablauf importiert
das echte Beispielpaket und startet es nach ausdrücklicher Freigabe.
Signaturen sind noch keine Voraussetzung und werden nicht als geprüft dargestellt.
