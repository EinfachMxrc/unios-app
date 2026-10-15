<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# UniOS 0.1.24: Auslieferungsprüfung vom 14.10.2026

GitHub-main und Tag v0.1.24 enthalten den zusammengeführten Produktstand
`c636da4dd93a773fcf28fd7260e9c2d57c8cb8e5`. Die bereits auf GitHub liegenden
Listen-, Link-, Übersetzungs- und Abhängigkeitsupdates sind erhalten.

Der Server wurde nach Marcs Bestätigung des geprüften aktuellen Snapshots
aktualisiert. Container und öffentlicher Healthcheck sind gesund. Die private
API bleibt ohne Kopplung bei HTTP 401. Bestehende Mounts, Netzwerke, Ports,
Benutzer und Containerhärtung wurden beim Wechsel verglichen. Das vorherige
Image bleibt erhalten. Das neue Quellschema enthält die Papierkorbmigration
`ff99e3b1a721`; Migration erfolgt durch den vorhandenen App-Start.

Auf dem PC ist das NSIS-Paket installiert, die native EXE meldet 0.1.24.
Alle 2.825 Programmdateien wurden ausschließlich anhand des expliziten
Programmbaumanifests auf Größe, SHA256 und tatsächlichen Kernelpfad geprüft.
Ein unabhängiger Prozess bestätigt den isolierten Dienststart ohne
MSIX-Umleitung. Die neu geöffnete App meldet einen gesunden Client und ihre
bestehende Serverkopplung; der technische Hoststatus ist Server/Host.
Private Bestandsdateien, Schlüssel und Hochschulunterlagen wurden weder
direkt gelesen noch kopiert oder als Testdaten verwendet.

Der Windows-Bauquellstand unterscheidet sich vom Produktstand ausschließlich
in CI- und Playwright-Konfiguration. Runtimequellen sind identisch. Tauri
patcht beim Verpacken drei Bytes der Paketformatkennung; deshalb stammt der
native EXE-Hash im korrigierten NSIS-Manifest aus dem Installerpayload.
Der ursprüngliche Cargo-Hash bleibt als früheres Manifest erhalten.

Die vollständigen lokalen Prüfungen bestehen: 1.280 Pythonfälle, 1.407
Frontendfälle und alle 509 Browserfälle. Zusätzlich bestehen Ruff, mypy,
Typecheck, Lint, OpenAPI, i18n, Frontend-Build und isolierter Docker-Smoke.
GitHub Actions startet wegen des GitHub-Kontozahlungs-/Ausgabenlimits keine
Jobs; das ist keine bestandene CI. Die Plattformmatrix und signierte
Autoupdatefreigabe werden nicht behauptet. Windows-Installer und Serverquellen
liegen im GitHub-Releaseentwurf; Server und dieser PC sind bereits aktualisiert.

Die technischen Ergebnisse und unveränderlichen Hashes stehen in
[verification.json](verification.json).
