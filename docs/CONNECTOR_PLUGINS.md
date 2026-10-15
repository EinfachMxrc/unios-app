<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# UniOS Connector API v1

Diese API gilt für externe Datenquellen. Feature- und UI-Addons sind ein späterer, getrennter Vertrag; das [Zielbild für UniOS Extensions](EXTENSIONS.md) reserviert dafür Sicherheitsgrenzen und Erweiterungspunkte.

Ein Hochschulprofil kombiniert Connectoren mit Konfiguration. Die [Registry](../app/connectors/registry.json) veröffentlicht geprüfte Versionen und Profile; die konkrete Konfiguration steht unter [institutions](../institutions/). Eine neue Hochschule braucht keinen Core-Fork.

## Im Produkt

Unter **System → Hochschule** wird das Profil gewählt. Ein Wechsel wird nach einem Neustart aktiv. Die Auswahl ist auch im ersten Einrichtungsassistenten möglich. Unter **System → Erweitert** zeigt UniOS die Connectoren, ihre Fähigkeiten, Domains und Secret-Namen. Ein Container-Connector lässt sich dort installieren, anschließend für genau sein Manifest freigeben, mit seinen deklarierten Secrets im System-Schlüsselbund versorgen und aktivieren. Entziehen der Freigabe deaktiviert ihn. Ein Profil muss ihn ausdrücklich binden. Der normale Start führt nicht durch einen technischen Plugin-Dialog.

Aktuell enthält die Registry nur den lokalen Python-Beispielconnector. Er ist standardmäßig gesperrt und lässt sich über die Oberfläche nicht sicher installieren. Ein erster veröffentlichter Container-Connector muss mit einem geprüften Image-Digest in die Registry aufgenommen werden, bevor die Installation praktisch nutzbar ist.

## Sicherheitsgrenze

Community-Connectoren laufen in einem separaten Docker-Container ohne eigenes Netzwerk, Host-Mounts oder Schreibzugriff auf das Container-Dateisystem. Der Core übermittelt ausschließlich die für diesen Connector deklarierten Secret-Aliase und die Profilkonfiguration. HTTPS-GETs laufen über den Core; er prüft die exakte Domain und folgt Redirects nicht. Rückgaben werden gegen den v1-Datenvertrag und die Fähigkeiten geprüft. Prozess-, CPU-, Speicher-, Anfrage- und Antwortlimits begrenzen die Ausführung. Fehlt Docker oder das exakt geprüfte Image, startet der Connector nicht. Das ist eine Laufzeitgrenze für Community-Code, keine Garantie gegen Schwächen der Container-Engine oder bösartige Inhalte auf erlaubten Domains.

Der Python-Entry-Point `unios.connectors.v1` bleibt für lokale Entwicklung erhalten. Er läuft im Host-Prozess und erfordert zusätzlich `ALLOW_TRUSTED_PYTHON_CONNECTORS=true`; diese Einstellung ist standardmäßig aus. Eine normale GUI-Freigabe aktiviert ihn nicht.

## Vertrag und Fähigkeiten

Die öffentliche API v1 liegt in `app.connectors.sdk`; für Container gibt es den kleinen Stdio-Helfer `app.connectors.container_worker.serve`. Der Vertrag umfasst `check_auth`, `list_courses`, `fetch_changes`, `download` und `health`. Der aktuelle Sync übernimmt Kurse, Materialien, Aufgaben, Ankündigungen und Termine. Der Capability-Katalog umfasst außerdem `grades.read`, `exams.read`, `enrollments.read`, `submissions.read`, `profile.read` und `messages.read` als reservierte Berechtigungen für spätere Datenverträge. `submissions.write` ist reserviert; die v1-Plugin-Schnittstelle bietet **keinen** Schreibaufruf. Moodle-Abgaben bleiben im gesonderten, bestätigungspflichtigen Ablauf.

Manifestfelder: `id`, exakter Paketname und Version, `api_version`, Fähigkeiten, exakte HTTPS-Domains, Secret-Aliase, Review-Status, Runtime und für Container ein Image mit `@sha256:`-Digest. Der Fingerprint schließt diese Felder ein. Jede Änderung entzieht die Wirkung alter Freigaben. Der Host lädt keinen Connector allein wegen seiner Installation. Die alte Entry-Point-Gruppe `marc_unios.connectors` bleibt deaktiviert.

## Versionen und Veröffentlichung

Für API v1 bleiben Namen, Methoden und Datenklassen stabil. Ein inkompatibler Vertrag bekommt API v2 und einen neuen Worker/Entry Point. Ein Update publiziert einen neuen exakten Paketstand und Container-Digest; es überschreibt kein Image unter einem beweglichen Tag. Nach dem Update sind erneute Installation, Sichtprüfung und Freigabe nötig. Der lokale Zustand bleibt bis dahin deaktiviert beziehungsweise der alte installierte Digest bleibt ohne geänderte Registry nicht automatisch aktiv.

`python -m scripts.validate_connector_registry` prüft Registry, Profile und Bindungen im CI. Mit `--previous <alte-registry.json>` prüft es zusätzlich, ob IDs erhalten blieben und geänderte Manifeste eine neue Paketversion tragen. Eine Community-Einreichung verwendet die [PR-Vorlage](../.github/PULL_REQUEST_TEMPLATE/connector.md): Quellcode, Lizenz, begründete Berechtigungen, reproduzierbarer Build, fester Digest und Fake-Server-Tests. Ein menschliches Review muss die Quelle und den Build prüfen, bevor der Status `verified` vergeben wird. Kryptografische Signaturen und eine unabhängige Supply-Chain-Attestierung sind noch offen.

Das [Beispielpaket](../examples/connector-plugin/) verwendet nur erfundene Daten. Tests neuer Connectoren verwenden lokale Fakes, nie echte Hochschulserver. Secret-Aliase liegen im OS-Schlüsselbund unter `unios.connector.<id>`.
