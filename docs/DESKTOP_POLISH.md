<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Desktop-Abnahme

Die native Tauri-App ist der normale Einstieg. Datenhaltung und Hochschulabruf laufen beim gekoppelten Client auf dem VPS. Der versteckte lokale Begleitprozess liefert die gebündelte Oberfläche aus und leitet authentifizierte Anfragen weiter; er betreibt keine zweite Studien-Datenbank und keinen lokalen Hochschul-Scheduler.

## Prüfmatrix

Ein automatisierter Browserlauf bestätigt keinen nativen Betriebssystem-Test. `Offen` bedeutet: auf diesem echten Betriebssystem noch nicht abgenommen. Die realen Mac-/Linux-Geräte sind in dieser Sitzung nicht zugänglich.

| Fall | Erwartung / Nachweis | Windows | macOS | Linux |
| --- | --- | --- | --- | --- |
| Installieren / Upgrade | Installer erhält Kopplung und Entwürfe; kein Terminal | 0.1.15 installiert; Exit 0 und Backend-Hash geprüft | Offen | Offen |
| Login-Autostart | Ohne ausdrückliche Aktivierung startet nichts; alte Scheduled Task bleibt deaktiviert | Altaufgabe deaktiviert | Offen | Offen |
| App starten | Nur App-Fenster; Client-Health bereit, bei Portkonflikt klare Fehlermeldung | Clientmodus real bestätigt; Rust-Startprüfung automatisiert | Offen | Offen |
| Vollbild | Ein-/Ausschalten erhält Reader-Seite und Notizentwurf | Offen | Offen | Offen |
| Minimieren / Tray | Wieder öffnen erhält Fenster und Eingabe; keine zweite Instanz | Offen | Offen | Offen |
| Schlaf / Resume | Alte Antworten überschreiben keine neuen Entwürfe; Servermodus bleibt Client | Offen | Offen | Offen |
| Deep Link | Moodle-Callback öffnet vorhandene App; fremde URL wird abgewiesen | URL-Validierung automatisiert | Offen | Offen |
| Datei öffnen | PDF/Audio importieren, externen Link öffnen, App bleibt bedienbar | Browser-Reader geprüft | Offen | Offen |
| Große PDF | 500 Seiten indexieren; sichtbare Canvases begrenzt; Ende erreichbar, kein Scrollsprung | synthetischer Backend-/Browsertest | Offen | Offen |
| Abbruch | Index abbrechen erhält Original und bisherigen Suchindex | atomarer Abbruch automatisiert | Offen | Offen |
| Schlüsselbund | Freigabe nur bei Bedarf; fehlende Freigabe erklärt; keine Tokens im Frontend | Offen | Offen | Offen |
| Update | Signatur/Version prüfen, Entwürfe sichern, Migration auf Server | Offen | Offen | Offen |
| Shortcuts | Sichtbare Hilfe; Suche/Navigation auch mit Tastatur erreichbar | Offen | Offen | Offen |
| Mehrere Monitore | Fenster auf anderem Monitor, abziehen, neu öffnen: bleibt erreichbar | Offen | Offen | Offen |
| Hohe DPI | 125/150/200 %, Text scharf, Reader bedienbar; PDF-Canvas maximal DPR 2 | Browserlayout Desktop/Mobil | Offen | Offen |
| Offline / VPS-Ausfall | Oberfläche öffnet; vorhandene Entwürfe bleiben; kein lokaler Server-Fallback | bestehender Offline-Entwurffluss automatisiert | Offen | Offen |

Für eine reale Abnahme Version, OS-Version, Monitor/DPI, Ergebnis und Fehlercode ergänzen. Keine Kontoinhalte, Session-URLs oder Tokens in Screenshots/Logs übernehmen. Fehlende Developer-ID/Notarisierung und Linux-Signaturen gelten weiterhin als offene Distribution, nicht als bestandene Prüfung.

## Alte Windows-Quellinstallation

`scripts/install-windows.ps1` registriert standardmäßig keinen Server-Autostart mehr. Der ausdrücklich gewünschte Altbetrieb benötigt `-EnableLegacyAutostart`. Auch dort wird das Python-Fenster versteckt. Die vorhandene alte Aufgabe wurde zuerst exportiert, dann deaktiviert und gestoppt; Originaldaten bleiben erhalten.
