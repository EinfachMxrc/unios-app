<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Eigene Hochschule ergänzen

Zuerst prüfen, ob ein vorhandener Connector und ein neues Profil reichen. Ein
Moodle-Basisprofil braucht keinen neuen Parser. Unbekannte URLs/Selektoren nicht
raten; der jeweilige Nutzer prüft sie persönlich. Unterstützung genau in der
[Kompatibilitätsmatrix](COMPATIBILITY.md) abgrenzen.

## Entwicklungsvorlage

Im UniOS-Repository einen **neuen** Zielordner verwenden:

```sh
uv run unios connector init examples/my_university --id my_university --university "Erfundene Hochschule" --capability courses.read --capability materials.read
uv run pytest examples/my_university/tests -q
```

Der Generator erzeugt manifest.json, connector.py, fixtures/course.json,
tests/test_contract.py und README.md. Er überschreibt keinen Ordner, validiert ID
und Fähigkeiten und erlaubt nur bereits implementierte lesende v1-Datenarten.
Das Ergebnis enthält erfundene Kurse, keine Dateien, Domains oder Secrets. Es ist
ein Entwicklungsgerüst mit Reviewstatus reference, keine installierte oder freigegebene
Verbindung. Zusätzlich gewählte Fähigkeiten implementieren noch keinen Hochschulparser.

## Parser und Vertrag

`create_connector(context)` liefert check_auth, list_courses, fetch_changes, download,
health. Stabile Remote-IDs müssen über Abrufe bestehen bleiben. Unvollständige Listen
dürfen nicht als vollständiges Verschwinden ausgegeben werden; Aufgabenvollständigkeit
nur bestätigen, wenn sie tatsächlich feststeht. Fehlende/unlesbare Statuswerte bleiben
unklar. Keine schreibenden Hochschulaktionen hinzufügen.

Reale Parser mit lokalen HTTP-Fakes für Erfolg, Loginablauf/abgelaufene Sitzung,
429/500/Timeout, Redirect, ungültige Struktur und Teilantwort testen. HTTPS-Domains
exakt und minimal deklarieren; keine Wildcards, keine pauschalen Netzzugriffe.
Zugangsdaten nur als erklärte Secret-Aliase, nie als Fixture. Testen, dass entzogene
Rechte, falsche Domains und nicht deklarierte Daten vom Core abgewiesen werden.

## Sichere Auslieferung

Die erzeugte Python-Vorlage ist lokale Entwicklung im Hostprozess. Für Community-
Auslieferung den [Containervertrag](CONNECTOR_PLUGINS.md) und das
[Beispielpaket](../examples/connector-plugin/) verwenden: reproduzierbarer Build,
fester Image-Digest, begrenzter Worker, keine Host-Mounts/eigener Netzwerkzugriff.
Einen erfundenen Image-Digest niemals als ausführbar veröffentlichen.

Manifest und institutions/<slug>.yaml erst als geprüften PR zur Registry beitragen.
`uv run python -m scripts.validate_connector_registry` prüft Registry/Profilbindung.
Paketversion, Quelle, Lizenz, Maintainer, Fähigkeiten und Domains nach
[Connector-PR-Vorlage](../.github/PULL_REQUEST_TEMPLATE/connector.md) begründen.
Eine geänderte Manifestversion benötigt erneute Freigabe; Herkunftssignaturen sind
noch kein zugesichertes Merkmal. Der Nutzer macht die echte Anmeldung/Abnahme;
ein Fixture-Pass wird nicht als Campus-Test veröffentlicht.
