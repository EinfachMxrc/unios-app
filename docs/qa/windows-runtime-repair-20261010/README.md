<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Windows-Startreparatur vom 10.10.2026

Der gemeldete normale Start nach dem PC-Neustart scheiterte beim Laden von
`_internal/python313.dll`. Eine über den echten Windows-Desktop gestartete
Probe fand beide Programm-EXEs, aber keinen der geprüften Laufzeitbestandteile
(Win32-Fehler 3). Aus Codex heraus wurden dieselben logischen Runtimepfade
stattdessen auf seinen privaten MSIX-Cache abgebildet. Das erklärt, warum die
frühere Installation dort funktionierte und über Explorer scheiterte.

Das unveränderte NSIS-Paket 0.1.23 wurde über den Desktop erneut installiert.
SHA-256: `aca2862d0726706d6bb3a82889d1c1899f46e896cc73f85d911737edc41d8cda`.
Programmmanifest-Quellstand: `84c5af45c6372daee58cedef881d5d0613b12477`.
Es wurden ausschließlich explizite Programmdateien geprüft; der gemeinsame
Installations-/Profilstamm wurde weder rekursiv durchsucht noch kopiert.

Ergebnis:

- Alle 2896 manifestierten Programmdateien vorhanden, SHA-256 und Größe passend.
- Alle Kernel-Endpfade stimmen mit ihren normalen Installationspfaden überein.
- Isolierter installierter Starttest im unabhängigen Desktop-Kontext: Exit 0,
  `ok: true`, Clientprüfung 0,4175 Sekunden. Dies ist keine GUI-Zeitmessung.
- Neue dauerhafte Runtimeprüfung ebenfalls im Desktop-Kontext bestanden.
- Beide PowerShell-Dateien syntaktisch geprüft. Alle elf synthetischen
  Regressionstests bestanden: physische Dateien, drei echte Pipes mit leerem
  Eingabekanal, Exitfehler, ungültiges JSON, negatives Ergebnis, begrenzte
  Ausgabe, Zeitlimit, fehlende DLL, leere Bibliothek, Runtimeumleitung und
  relativer Installationspfad.
- Normal gestartete native App reagiert, ihr eigener Dienst lauscht lokal und
  liefert `/health`: `status: ok`, `mode: client`; kein eigener Fehlerdialog.
- Kein PC-Neustart durchgeführt, keine persönliche Serverkopplung geprüft.

Fehlversuche bleiben in den ursprünglichen technischen Belegen erhalten:
Der alte Installationshelfer brach nach dem Installer an seiner generischen
Vorfahrprüfung ab. Die anschließende unabhängige Prüfung sämtlicher
Programmdateien bestand. Der erste zusätzliche Starttest erbte nur Ausgabe-
und Fehler-Pipe; sein fehlender Eingabekanal verursachte den vom Nutzer
gezeigten zweiten Dialog. Mit allen drei Pipes bestand der Test. Das war ein
Fehler im Testaufruf, keine notwendige Änderung des ausgelieferten Backends.

Technische Einzelbelege sind unter `.tmp/windows-runtime-repair-20261010/`
als neue Dateien erhalten; frühere Release- und Installationsbelege bleiben
unverändert. [Zusammengefasster Nachweis](verification.json).
Der neue Prüfer und seine synthetischen Regressionstests liegen versioniert
unter `scripts/`. Für künftige Installationen den vollständigen
Manifestabgleich, den unabhängigen Starttest und einen normalen App-Start
verlangen; eine Cache-Ausnahme gilt nicht als erfolgreiche PC-Installation.
