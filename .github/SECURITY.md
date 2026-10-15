<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Sicherheitsmeldungen

UniOS ist ein Alpha-Projekt. Sicherheitskorrekturen zielen auf den aktuellen
Hauptzweig und den neuesten veröffentlichten Alpha-Stand. Es gibt noch keine
zugesagte LTS-Unterstützung, Reaktionsfrist oder bezahlte Bug-Bounty.

## Vertraulich melden

Auf der GitHub-Repository-Seite **Security → Report a vulnerability** verwenden
([direkter Link](https://github.com/EinfachMxrc/unios-app/security/advisories/new)).
Die Meldung ist privat und nur für die Maintainer sichtbar. **Keine
Schwachstellendetails, Geheimnisse oder privaten Dateien** in öffentliche Issues
oder Diskussionen schreiben. Fehlt die Schaltfläche, öffne ein Issue mit der neutralen
Bitte um einen privaten Meldekanal, ohne Details.

Eine Meldung nennt betroffene Version/Plattform, Voraussetzungen, Auswirkungen
und eine minimale Reproduktion mit erfundenen Daten. Keine echten Portal-Sessions,
Zugangsdaten, Notizen oder PDFs anhängen. Diagnose und Screenshots vorher prüfen.
Vermutete Geheimnisse nicht weiter kopieren; verantwortlichen Eigentümer informieren.

## Prüfrahmen

Nur eigene isolierte Instanzen, Fake-Server und erfundene Konten prüfen. Keine echten
Hochschulsysteme scannen, MFA umgehen oder fremde Daten lesen. Bei Datenverlust-/
Überlastungsrisiko zuerst eine getrennte Wegwerf-Instanz verwenden. Automatisierte
KI-Sicherheitsprüfungen ergänzen deterministische Rechte-/Traversal-/Sandbox-Tests;
sie sind kein vollständiger Sicherheitsnachweis.

Eine bestätigte Korrektur bekommt Regressionstest und Release-Hinweis mit betroffenen
Versionen und notwendigen Nutzermaßnahmen. Öffentliche Details erst nach koordinierter
Korrektur veröffentlichen. [Vertrauensgrenzen](../docs/TRUST.md) und
[Release-Gates](../docs/RELEASE_READINESS.md) bleiben nachvollziehbar dokumentiert.
