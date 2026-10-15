<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Reader-Abnahme, 07.10.2026

Alle Inhalte stammen aus lokalen Fake-Diensten und erfundenen Test-PDFs. Die
Aufnahmen zeigen keine privaten Unterlagen und sind keine echte Nutzerstudie.

Ausgangszustand: `before.png` zeigt das modale Panel, das den Leser sperrte.

| Nach Umsetzung | Hell | Dunkel |
| --- | --- | --- |
| Desktop 1440 × 900 | [Aufnahme](light-1440.png) | [Aufnahme](dark-1440.png) |
| Mobil 390 × 844 | [Aufnahme](light-390.png) | [Aufnahme](dark-390.png) |

`selection-120-pages.png` zeigt die schwebende Quellaktion auf Seite 80.
Die Aufnahmen werden von `frontend/e2e/reader-workspace.spec.ts` erzeugt und
während der Abnahme visuell geöffnet. Das Reader-Panel scrollt unabhängig; seine
primäre Save-Aktion bleibt im eigenen Scrollbereich erreichbar.

Die abschließenden Testergebnisse und Grenzen stehen in
[PROGRESS.md](../../PROGRESS.md) und
[READER_STUDY_WORKSPACE.md](../../READER_STUDY_WORKSPACE.md). Synthetische
Ctrl-Wheel-/Safari-Ereignisse beweisen keine native macOS-Trackpad-Unterstützung.

## Lokaler Testtransport

Der Gesamtlauf und ein anschließender isolierter UX-Lauf zeigten einzelne
Vite-Proxyfehler `connect EADDRINUSE 127.0.0.1:8173` bei `/api/recovery/status`.
Vite antwortete mit 502; die Laufzeitprüfung hielt daraufhin die App korrekt
geschlossen. Das sichtbare Fehlerbild war die Recovery-Gate-Ansicht, kein
nachgewiesener Notiz-/Editor-Absturz. Parallel laufende Python-Tests erklären den
isolierten Folgefehler nicht.

Der installierte Vite 8.3.1 bündelt `http-proxy-3@1.23.3`, dessen Transport ohne
eigenen Agent ausdrücklich `agent: false` und `Connection: close` setzt. Dev und
Preview teilen jetzt für die drei HTTP-Loopback-Proxypräfixe einen Keep-Alive-Agent:
höchstens 32 aktive/gesamte und acht freie Sockets, LIFO-Wiederverwendung und
Freigabe beim Schließen des Servers. Andere Ziele behalten ihren bisherigen
Transport. Recovery-Gate, Request-Timeouts und Retry-Verhalten bleiben gleich.
Die [Node-Dokumentation](https://nodejs.org/download/release/v25.6.0/docs/api/http.html#class-httpagent)
beschreibt diese Verbindungswiederverwendung und Begrenzung.

Windows meldet hier den dynamischen IPv4-TCP-Bereich 49152–65535 mit zusätzlichen
Portausschlüssen. Fehlende Wiederverwendung ist belegt; eine vollständig
erschöpfte Portmenge ist nicht bewiesen. Der nach Serverende erhobene lokale
Port-Snapshot kann den Fehlerzeitpunkt nicht erklären; laut
[Microsoft-Diagnose](https://learn.microsoft.com/en-us/troubleshoot/windows-client/networking/tcp-ip-port-exhaustion-troubleshooting)
genügt auch eine große TIME_WAIT-Menge allein nicht als Nachweis. Die erneute
Browserprüfung muss mit einem frisch gestarteten Preview-Server erfolgen;
ein bereits laufender Server verwendet weiterhin die alte Konfiguration.

Frische Preview-Server bestanden anschließend 21 gezielte Reader-/Palette-/UX-
Fälle sowie 28 finale Reader-/Notification-/Shell-Fälle. Der vollständige
Integrationslauf wird getrennt in PROGRESS protokolliert.

## Accessibility am endgültigen Build

[Abnahmeauszug](lighthouse-accessibility-summary.json) enthält Buildhash,
Prüfzeit, Runtimefehler, Warnungen und sämtliche numerischen Audits unter 1,
einschließlich ungewichteter Audits. Home und `/material/1` erreichten jeweils
100; Fehlerliste und Runtimefehler waren leer. Die ursprüngliche Lighthouse-
[Home-Aufnahme](home-lighthouse.png) und [Reader-Aufnahme](reader-lighthouse.png)
wurden visuell geöffnet. Der Reader zeigte beide tatsächlichen synthetischen
PDF-Seiten, keine Recovery-/Ladeansicht.

Eine erste Wertung 100 enthielt noch einen ungewichteten Fehler am
Benachrichtigungsbutton. Die sichtbare Ziffer ist nun Teil seines de/en-Namens;
die erneute Prüfung dieses Audits bestand. Tastaturbedienung wird zusätzlich im
Browser geprüft; diese automatische Abnahme ersetzt keine native Hardwareprüfung.

## Vollständige Integration

[Prüfauszug](validation-summary.json): 891 Python-Fälle bestanden, zwölf
übersprungen; 534 Vitest-Fälle in 54 Dateien bestanden; 293 Browserfälle ohne
Fehler, Skip oder flakigen Erfolg in 7:48 Minuten. Alle statischen Checks, Schema,
Typen, Build und Bundle-Grenzen bestanden. Der Buildhash stimmt mit der
Lighthouse-Abnahme überein. Die vier Reader-Aufnahmen wurden am endgültigen
Gesamtlauf erneut erzeugt; veränderte eigene Aufnahmen wurden visuell geöffnet.
Unbeabsichtigt regenerierte ältere Stundenplanbilder wurden bytegenau aus Git
wiederhergestellt; vorhandene unversionierte Nutzeraufnahmen bleiben erhalten.

Docker-Engine und native Hardware waren nicht verfügbar. Diese Prüfungen bleiben
offen, ebenso die im Auszug genannten Lern-Folgepakete; das Gesamtmandat bleibt aktiv.
