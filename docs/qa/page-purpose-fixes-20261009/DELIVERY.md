<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# UniOS 0.1.23: tatsächliche Auslieferung am 09.10.2026

Windowsinstallation, Serveraktivierung, GitHub-Upload und Rückdownload des
Gesamtpakets sind abgeschlossen. Der Produktquellstand ist
`84c5af45c6372daee58cedef881d5d0613b12477`; spätere Dokumentationscommits ändern
die Quellenbindung der gebauten Artefakte nicht.

## Paket und GitHub

[Vollständiges Updatepaket](https://github.com/EinfachMxrc/unios-app/releases/download/untagged-ef6e7fb1b9cbc9161415/UniOS-0.1.23-complete-update.zip)
im [GitHub-Entwurf v0.1.23](https://github.com/EinfachMxrc/unios-app/releases/tag/untagged-ef6e7fb1b9cbc9161415).
Der Entwurf ist für das berechtigte GitHub-Konto zugänglich.

Das ZIP enthält 13 geprüfte Komponenten, den gebundenen Releasebeleg und die
Komponentenprüfsummen: insgesamt 15 Mitglieder. Darunter sind NSIS, MSI,
Quell-ZIP, Serverarchiv sowie Installations-, Quellen-, Server-, QA- und
Lighthouse-Nachweise. CRC und sämtliche Mitgliederhashes wurden geprüft.

| Datei | Bytes | SHA-256 |
| --- | ---: | --- |
| UniOS-0.1.23-complete-update.zip | 752044944 | `c4affd3260967f98a78ac19cac0e507ce51849b2380b024b6f7196a5109bd78b` |
| UniOS_0.1.23_x64-setup.exe | 304111844 | `aca2862d0726706d6bb3a82889d1c1899f46e896cc73f85d911737edc41d8cda` |
| UniOS_0.1.23_x64_en-US.msi | 371036636 | `c4db783c39e28e8ba411a8a6a33c3e48a8233804ad103cc5ca9d48678e5c2a4b` |
| UniOS-0.1.23-source.zip | 74758882 | `23d3b6abff86fe1d36abf0a8e791101a3a499f16541a789cf3eb87e5c5baeb1b` |
| UniOS-0.1.23-server-source.tar.gz | 1978539 | `486eac68ac2c8817b344fa813d1ae82c342bda648d672c47e2c120c3a60689e2` |

Der Gesamtpaket-Rückdownload liegt unter
`C:\Users\einfa\Downloads\UniOS-0.1.23\UniOS-0.1.23-complete-update.zip`;
daneben liegt `SHA256SUMS.txt` mit SHA-256
`9785a003671fdf423542c6765ffc879cfd94e33c5b285b4594dd75eb7512776e`.
Beide heruntergeladenen Dateien stimmen in Größe und SHA-256 gleichzeitig mit
den lokalen Auslieferungsdateien und den tatsächlichen GitHub-Asset-Digests
überein. Der tatsächlich installierte NSIS wurde zuvor separat von GitHub
zurückgeladen und gegen denselben Build-/GitHub-Digest geprüft.

## Windows und Server

Der volle neue Windowsbau bestätigte Exit 0 des tatsächlichen Pythonkindes;
Backend und UI wurden vollständig neu gebaut. Die Installation endete am
`2026-10-09T21:08:03.6782448Z` mit Exit 0 und ProductVersion `0.1.23`.
Installationsprüfung und unabhängiger Pythonprüfer bestätigen denselben
Programmmanifesthash
`b5b4d26ecd37988b93358cc30427723a6b4d0f18930223bb0c4f9ec2bebfc94a`
und alle 2896 Programmdateien, darunter 293 UI-Dateien.

Die unabhängige Prüfung dokumentiert ausdrücklich die beobachtete
MSIX-Dateiumleitung: der logische `_internal`-Programmpfad zeigt auf den
fest gebundenen Codex-LocalCache-Programmpfad. Jede der 2894 Runtime-Dateien
muss exakt auf ihre physische Datei zeigen und innerhalb dieses geprüften
Programmverzeichnisses liegen. Die beiden EXEs bleiben innerhalb des normalen
UniOS-Installationsverzeichnisses. Alle Größen und SHA-256 stimmen; die
gemeinsamen Pfadguards sind unverändert. Die vorherigen strengeren
Standardprüfungen einschließlich WMI- und Benutzerkontextversuch bleiben als
fehlgeschlagene Belege erhalten. Eine unvirtualisierte Installation oder
private Kopplung wird nicht behauptet. Der einmalige Hilfs-Starteintrag wurde
nach seinem Abschluss entfernt.

Die neue App wurde gestartet; Metadaten der bekannten installierten App- und
Dienstprozesse bestätigen laufende, antwortende Prozesse. Dies ist kein
Nachweis privater Inhalte oder der Serverkopplung. Drei isolierte synthetische
Dienst-/Clientstarts bestanden; medianer Dienststart 0,7428 Sekunden.

Serverimage `unios-server:0.1.23-page-purpose-84c5af45c637` wurde am
`2026-10-09T20:39:44Z` gesund aktiviert. Tatsächliche Image-ID:
`sha256:2e2d457f61bf51657a089c060fe59c099dee5ec7a3d28e0211a231d4adc0327d`.
Synthetic-Image-Smoke, Mount- und Topologieabgleich bestanden; Schema bleibt
`ff98c7da0320`. Eine weitere Statusprüfung um `2026-10-09T21:05:52.5781591Z`
bestätigt HTTPS-Health 200 und unauthentifizierte API 401. Private Inhalte,
Schlüssel und Profile wurden für diese Abnahmen nicht gelesen.

## Abnahme und verbleibende externe Grenzen

1082 Backendfälle bestanden, zwölf übersprungen; 965 Frontendfälle bestanden.
Ruff, mypy, ESLint, Typecheck, OpenAPI/API-Vertrag und Übersetzungen bestanden.
Die Browserbelege decken 391 konkrete Fälle zusammengesetzt ab: Originalfull
389 bestanden/1 fehlgeschlagen, finaler betroffener Lauf 45/45 einschließlich
korrigierter Bildprüfung und zusätzlichem Neuladen. Kein einzelner grüner
391-Fälle-Volllauf. Zwölf finale Lighthouse-Messungen erreichen 96–100
Accessibility-Punkte; Bundle-/PWA-Grenzen und 634 kanonische Frontendinputs
sind an den Produktquellstand gebunden.

[GitHub-Lauf 37987669584](https://github.com/EinfachMxrc/unios-app/actions/runs/37987669584)
hat wegen der Konto-Zahlungs-/Ausgabenlimitsperre keinen der sechs Jobs
gestartet: null ausgeführte Schritte. Das ist kein bestandener Plattformlauf.
Der Release bleibt deshalb Entwurf; es gibt keinen neuen signierten
Autoupdatefeed. Mac-Hardwaregesten und Unterrichtsmitschrifttempo sind
weiterhin nicht auf dem Gerät geprüft.

Beim abschließenden Push meldete GitHub zusätzlich zwei bereits vorhandene
Dependabot-Befunde auf dem Standardzweig. Der eingefrorene Frontendlock enthält
ebenfalls `sharp` 0.35.4 (Entwicklungsabhängigkeit) und `source-map-js` 1.2.1.
Die offiziellen Meldungen nennen als reparierte Versionen
[sharp 0.35.5](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) und
[source-map-js 1.2.2](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
Diese nach der Paketlieferung abgeglichenen Abhängigkeitsupdates sind noch
nicht in 0.1.23 umgesetzt. Eine konkrete Ausnutzbarkeit im ausgelieferten
UniOS-Produkt wurde nicht nachgewiesen. Der tatsächliche Metadatenabgleich
liegt in `github-default-security-alerts-023.jsonl`; die veröffentlichte
Paketprüfsumme und Quellenbindung bleiben unverändert.

Die technischen Originalbelege liegen unter `.tmp/page-purpose-fixes/`;
die geprüften Paketbelege unter `dist/releases/v0.1.23/` und im Gesamt-ZIP.
