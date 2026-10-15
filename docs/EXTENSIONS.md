<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# UniOS Extensions: Addon API v1 und v2

Connectoren und Addons sind getrennt. [Connectoren](CONNECTOR_PLUGINS.md) holen Daten aus externen Quellen. Feature-Addons ergänzen ein UniOS-Werkzeug, UI-Addons eine kleine Ansicht an einem festen Platz. **v1 bleibt deklarativ**: Ein JSON-Manifest wählt ausschließlich vom Core implementierte Ansichten. **[v2](ADDONS_V2.md)** ergänzt ausführbaren WASM-Code in einem eigenen Prozess ohne WASI/Imports, mit Hashbindung, erneuter Freigabe und Ressourcenlimits. Python, React, HTML, CSS und JavaScript aus Addons werden nicht ausgeführt. Ein öffentlicher Download-Store ist nicht Teil dieses Vertrags.

## Installation

Unter **Mehr → Erweiterungen** zeigt der lokale Katalog eingebaute Beispiele. Über eine JSON-Datei können weitere Manifeste in den lokalen Katalog aufgenommen werden. Danach folgen getrennt **Installieren → Rechte freigeben → Aktivieren**. Entzug, Deaktivierung und Entfernung sind jederzeit möglich. Eine höhere Manifestversion ändert den Fingerprint und macht eine erneute Installation und Freigabe nötig. Eine unveränderte oder niedrigere Version darf den Inhalt nicht ersetzen.

Der Katalog und die Freigabeereignisse stehen im lokalen, nur anhängenden `local/`-Speicher. V1-Manifeste enthalten keine ausführbaren Artefakte. V2-Pakete binden ein WASM-Modul mit SHA-256; dessen Code läuft ausschließlich im begrenzten Worker. Der Core registriert keine fremden Routen oder Komponenten. Der eingebaute Katalog kommt aus `app/addons/registry.json`; `addons/` ist Dokumentation, kein automatisch geladener Codepfad.

## Manifest v1

```json
{
  "schema_version": 1,
  "id": "org.example.course-overview",
  "name": "Kursüberblick",
  "author": "Beispiel",
  "version": "1.0.0",
  "description": "Zeigt eigene Kurse auf der Startseite an.",
  "kind": "ui",
  "permissions": ["courses.read"],
  "network_domains": [],
  "runtime": "declarative",
  "widgets": [
    {"slot": "today.secondary", "view": "courses", "title": "Meine Kurse", "limit": 3}
  ]
}
```

`ExtensionManifestV1` lehnt unbekannte Felder und Werte ab. `ExtensionPermission` kennt derzeit `courses.read` und `study_blocks.read`. `text` braucht kein Datenrecht; `courses` und `study_blocks` brauchen das jeweilige Recht. Die Feature-Seite unterstützt zusätzlich `focus_timer` mit begrenzter Arbeits- und Pausenzeit. Ein Feature-Addon braucht eine Seite; ein UI-Addon mindestens ein Widget. Beide dürfen Widgets und eine Seite kombinieren. `network_domains` muss leer sein. Schreibrechte, Notizen, Dateien, Internetzugriff und beliebige APIs sind nicht freigebbar.

## Feste Erweiterungspunkte

| Slot | Ort |
| --- | --- |
| `today.secondary` | Nachrangige Karte auf Heute |
| `course.sidebar`, `course.tools` | Kursseite, Daten auf den geöffneten Kurs begrenzt |
| `learning.tools` | Lernseite |
| `note.toolbar` | Notizseite |
| `material.actions` | Materialseite |
| `more.section` | Mehr |

Bis zu vier aktive Beiträge werden pro Slot angezeigt. Ein Addon ersetzt keine Kernseite. `today.primary` ist absichtlich nicht freigegeben. Der Core rendert Text und erlaubte interne Links als eigene React-Komponenten. Er liefert Daten erst nach aktiver Freigabe und prüft das jeweilige Recht auf dem Server. Er verwendet das vorhandene lokale Session- und Host-Schreibmodell; im Standby sind Installations- und Freigabeaktionen gesperrt.

## Grenze von v1

Ein v1-Manifest kann vorhandene Ansichten konfigurieren, aber keine neue Berechnungslogik, Datenquelle, Schreibaktion oder eigene Browseroberfläche mitbringen. Der Fokus-Timer ist ein vom Core bereitgestellter Feature-Typ; seine Zeit läuft im Browser und wird derzeit nicht als Lernsitzung gespeichert. Eigene begrenzte Berechnungslogik verwendet den separaten [v2-Vertrag](ADDONS_V2.md). Signaturen werden derzeit nicht verifiziert; der Katalog behauptet keine geprüfte Herkunft.
