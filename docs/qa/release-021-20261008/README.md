<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Auslieferung 0.1.21 · 08.10.2026

Produktrevision `900395f354844e51a0afd86be2b5ad523891c497`; die Korrektur gegenüber
`b1dbb35` betrifft nur zwei Browser-Testselektoren und die Fortschrittsdoku.

Windows-NSIS/MSI frisch gebaut. NSIS tatsächlich von GitHub heruntergeladen,
SHA-256 `d65308d4ebd5183dcaa3bc57326b8dc86db37375b9b282776bbf4989012efaab`,
mit Exit 0 installiert und native App gestartet. Alle 2878 Programmdateien
einschließlich 277 Oberflächendateien entsprechen bytegenau dem Bau. Gekoppelter
Client und eigener Server antworten erfolgreich; keine privaten Bestandsdateien
oder Schlüssel gelesen. Isolierter Start des installierten Dienstes: Median
0,6844 s in zwei Durchläufen.

VPS-Image `unios-server:0.1.21-alpha3-final`, Image-ID
`sha256:d9c78615bac7360f05266f20067a94d12dfea1e0e9f0d29e54b86aee974b06fe`,
aktiv und gesund. Backend-, Alembic-, Connector- und ausgelieferte Konfiguration
bytegleich zum vorherigen Image. Schemaversion aus Migrationsquellen:
`ff98c7da0320`, keine neue Migration. Daten-/Schlüssel-Mounts verglichen und
erhalten. Loopback-/HTTPS-Health 200, unauthentifizierte API 401 mit passender
Origin. Der vorgeschaltete HTTPS-Dienst verweigerte die erste urllib-Probe;
die Prüfung mit curl und anschließend mit dem gekoppelten nativen Client besteht.
Altes Image und Compose-Kette bleiben vorhanden.

712 Frontendtests, 15 Paket-/Release-Tests, Ruff, mypy, Typecheck, Lint, OpenAPI,
SPDX sowie Quell-/Archivintegrität bestanden. PWA: 274 Precache-Dateien,
17.991.636 Bytes roh / 5.053.932 gzip, unveränderte Budgets bestanden.
Erste Formeleingabe und Darstellung ohne Netzwerk bestehen.

Vollständiger lokaler Browserlauf: 349 bestanden, ein Produktions-Fixture-Fall
las während des parallelen Desktopbaus dessen Dist statt der PWA. Die Vorschau
nutzte bereits einen unveränderlichen PWA-Build. Nach Wiederherstellung der PWA
bestand der einzelne Produktionsfall; alle 281 Build-Dateien sind bytegleich
zum vollständigen Browserlauf. Somit sind alle 350 Fälle am gleichen Produktbuild
geprüft; kein vollständig grüner monolithischer Lauf behauptet. Vorherige Fehler
und Nachprüfung bleiben in getrennten lokalen Diagnoseprotokollen erhalten.

GitHub-Erstlauf `37693137614`: fünf Backend-/Plattform-/Docker-/GLib-Bereiche
bestanden; Frontend 712 und Browser 349 bestanden. Mehrdeutige Notizvorschau
lokal reproduziert, auf die Markdown-Werkzeugleiste begrenzt und sämtliche fünf
Notizfälle erneut bestanden. Neuer vollständiger Lauf `37757305844` wurde von
GitHub wegen fehlgeschlagener Kontozahlung oder Ausgabenlimit vor dem ersten
Jobschritt blockiert. Der Release bleibt deshalb Entwurf; Gate nicht umgangen.
Neue macOS-/Linux-Pakete und deren Geräteabnahme stehen aus.

Gesamt-ZIP: `UniOS-0.1.21-complete-update.zip`, 710.309.478 Bytes,
SHA-256 `aa355333b200cd566c35280fccf1a546f66e19a5150773a30c5f889706f86a49`.
Enthält beide Windows-Installer, Serverquellen, vollständigen Quellcode und
Prüfnachweise, keine Daten oder Schlüssel. Komponentenhashes und Inhalt geprüft.
Technische Details stehen in [release-receipt.json](release-receipt.json).
