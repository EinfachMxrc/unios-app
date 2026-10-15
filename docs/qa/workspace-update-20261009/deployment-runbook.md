<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Vorbereiteter Auslieferungsablauf 0.1.22

Diese Recherche führt keine Erstellung, Installation oder Serveränderung aus.
`workspace-022-server.sh` wurde nur syntaktisch geprüft; die Docker- und
Aktivierungsphasen sind noch nicht abgenommen. Image-Tag, Quellenrevision und
Archiv-Hash müssen aus dem fertigen, geprüften Paket kommen.

## Quellen und Prüfnachweis

1. Nach vollständiger Integration Tests/Typecheck/Lint/OpenAPI/i18n abschließen.
   Den letzten UI-Build vor den Browserfällen erstellen. Einen Desktop-Build erst
   nach diesen Fällen starten: er verändert `frontend/dist`; Produktionsfixtures
   verwenden teilweise genau diesen Ordner.
2. Metadaten 0.1.22 in `pyproject.toml`, `uv.lock`, Tauri-Konfiguration,
   `Cargo.toml`/`Cargo.lock`, `desktop/package.json`/Lockfile und Server-Compose
   abgleichen. `frontend/package.json` führt weiterhin die interne Version0.0.0.
3. Einen eindeutigen Quellencommit und eine unveränderliche Paket-Revision
   dokumentieren. `scripts/package_server.py` erzeugt ausschließlich freigegebene
   Quellpfade, normalisiert Shellskripte auf LF und überschreibt kein Archiv:

   ```powershell
   .venv\Scripts\python.exe scripts/package_server.py dist/releases/v0.1.22/UniOS-0.1.22-server-source.tar.gz
   Get-FileHash -Algorithm SHA256 -LiteralPath dist/releases/v0.1.22/UniOS-0.1.22-server-source.tar.gz
   ```

4. Quellpaket, Release-Helfer und Hash über den bekannten SSH-Zugang
   `root@203.0.113.10` in ein neues, eindeutiges
   `/opt/unios/releases/v0.1.22-<Kennung>` übertragen. Vorhandenen `id_rsa` als
   SSH-Dateipfad verwenden; Inhalt nicht lesen/ausgeben. Das Archiv vor und nach
   Übertragung per SHA-256 abgleichen. Keine privaten Daten-/env-/Profilkopien.

## Server – explizite Phasen

Der Helfer verlangt in dieser Reihenfolge: Phase, Releaseverzeichnis,
Quellencommit mit40Hex-Zeichen, Archivhash mit64Hex-Zeichen und einen eindeutigen
Image-Tag `unios-server:0.1.22-<Kennung>`.

```sh
bash workspace-022-server.sh build "$release" "$commit" "$archive_hash" "$image"
bash workspace-022-server.sh smoke "$release" "$commit" "$archive_hash" "$image"
# Erst bei erfolgreichem build+smoke und abgenommenem 0.1.22-Betrieb:
bash workspace-022-server.sh activate "$release" "$commit" "$archive_hash" "$image"
```

Build prüft das aktive Basisimage und Compose-Labels, Hash und Archivpfade;
entpackt nur reguläre Quelldateien in ein neues Verzeichnis; baut den vorhandenen
Server-Dockerfile mit Quellen-/Versionslabels. Das Quellarchiv ist kein unabhängiger
Nachweis des Commits: der Hauptagent muss die Beziehung zwischen freigegebenem
Commit und erzeugtem Archiv zuvor dokumentieren.

Smoke benutzt UID10001, schreibgeschütztes Root, keine Netzverbindung, keine Ports
und nur ein flüchtiges `/tmp`. Es erstellt einen erfundenen Schlüssel sowie eine
leere synthetische Datenbank; prüft Metadatenversion, Schemahead, Health, React,
PWA und HTTP401 für die private API. Der Test bindet keine produktiven Mounts ein.

Aktivierung benutzt exakt den aktiven Compose-Projektpfad, dieselbe env-Datei
(nur Pfad, kein Lesen/Ausgeben im Helfer), die sechs vorhandenen Composefiles in
derselben Reihenfolge und **zuletzt nur** `image-022.yaml`. Der Aufruf ist
`up -d --no-build --no-deps api`. Die ursprünglichen Daten-/Schlüsselmounts,
Portbindungen, Zusatzhosts, Netzwerknamen und Containerhärtung werden verglichen.
Kein `provision.sh`, kein `compose down`, keine Runner-/Edge-/MCP-Aktivierung.

Vorbedingung ist das bestätigte Basisimage
`unios-server:0.1.21-alpha3-final` mit ID
`sha256:d9c78615bac7360f05266f20067a94d12dfea1e0e9f0d29e54b86aee974b06fe`.
Beide Image-Schemaheads müssen `ff98c7da0320` sein. Keine Live-Migration wird
ausgeführt. Bei anderem Schema abbrechen; der bestehende Snapshot-/Migrationsflow
benötigt seine eigene Abnahme. Auch bei gleichem Schema muss der Hauptagent die
fachliche Rückwärtskompatibilität neuer gespeicherter Daten bestätigen.

Der Helfer hält das alte Image unter einem eindeutigen Referenztag fest und
schreibt dessen ID in `base-image.reference`. **Er führt keinen Downgrade aus und
bietet keine Rollback-Phase.** Nach der öffentlichen Aktivierung können bereits
Clients echte Bewertungen, Undo oder wartende Outbox-Einträge übertragen haben;
eine reine Healthprüfung beweist keine unbenutzte neue Version.

Bei Aktivierungs-, Health-, HTTPS- oder Schutzfehlern bleibt die 0.1.22-Version
mit ihren Overrides, Journaldaten und Containerlogs bestehen. Der Helfer stoppt
ausschließlich den nach Image-ID bestätigten neuen Container geordnet mit bis
zu120Sekunden Frist. Er liest keine Logs, privaten Dateien oder env-Inhalte und
schreibt nur technische IDs, Zeit, Exitcode und Stop-Ergebnis in
`activation.failure`. Selbst wenn der Stop gelingt, ist damit keine sichere
Rückkehr nach0.1.21 nachgewiesen. Der Hauptagent muss den Fehler vorwärts mit
0.1.22-kompatiblem Code beheben; ein fehlgeschlagener Stop bleibt ausdrücklich
im Nachweis sichtbar. Ein erfolgreicher Start erhält `activation.success`.

Nur ein getrennt geprüfter Operatorablauf darf das alte Image reaktivieren,
wenn **positiv nachgewiesen** ist, dass während der gesamten neuen Aktivierung
keine native Bewertung, Undo, Outbox-Übertragung oder neue Snapshot-/Handoff-
Datenübergabe stattfinden konnte. Das verlangt eine vorher eingerichtete und
bis zum Ende gehaltene Zugriffssperre; Vermutungen, erfolgreiche Healthantworten
oder ein sauberer Shutdown genügen nicht. Der Helfer automatisiert diesen
Ausnahmefall bewusst nicht. Images und Releaseverzeichnisse werden nicht gelöscht.

## Fachliche Grenze der Rückkehr 0.1.22 → 0.1.21

Lesender Vergleich mit 0.1.21-Quellencommit
`900395f354844e51a0afd86be2b5ad523891c497`; keine realen Zustandsdateien untersucht.
Der unveränderte Alembichead `ff98c7da0320` gilt für die Hauptdatenbank, nicht
automatisch für neue native Bewertungsbelege oder Snapshot-Manifeste.

- **Positive Journale:** 0.1.22 bestätigt die native Bewertung mit einem atomar
  gespeicherten `review-actions`-Journal und hält das native Undo verfügbar.
  0.1.21 sucht die Review-UUID ausschließlich in `unios_review_receipts` innerhalb
  der Anki-Collection. Nach einem harten Abbruch vor Materialisierung fehlt dort
  unter Umständen der Beleg. Fehlt zusätzlich der SQLite-Review-Mirror nach503,
  oder handelt es sich um eine unmanaged/importierte Karte, kann ein UUID-Replay
  die Bewertung erneut anwenden, sobald die Karte wieder den Queuekopf erreicht.
  Ein vorhandener Managed-Mirror verhindert dies durch409, ersetzt aber keinen
  allgemein verlässlichen positiven Beleg.
- **Shutdown:** `app/main.py` ruft `close_study_collection()` im Lifespan-Finally
  auf. `app/anki/collection.py` materialisiert Journale nur bei einem vorhandenen
  aktuellen Handle. Nach Hardcrash und Neustart ohne Collectionöffnung kann der
  Handle leer sein; ein anschließendes sauberes SIGTERM materialisiert verwaiste
  Journale dann nicht. Materialisierung prüft aktuelle Collection-ID und exakten
  Revlog und repariert keinen fehlgeschlagenen SQLite-Mirror. SIGKILL, Fehler oder
  Timeout erlauben ebenfalls keine Kompatibilitätsannahme.
- **Undo-Tombstones:** Negative Ratings in der vorhandenen SQL-Belegtabelle
  verhindern ein positives Replay auch unter0.1.21 durch Ratingkonflikt409.
  0.1.21 besitzt jedoch weder den neuen Undo-Endpunkt noch die neue Mirror-Reparatur.
  Ein wartender Undo kann dort nicht abgeschlossen werden; ein nach native Undo
  fehlgeschlagener Mirror-Löschvorgang kann dort eine veraltete Historie behalten.
- **Snapshots/Handoff:** 0.1.22-Manifeste enthalten `anki_receipts_filename` und
  `anki_receipts_sha256`, auch wenn diese `null` sind. Die alte Dataclass
  `SnapshotManifest(**json)` akzeptiert diese zusätzlichen Felder nicht und weist
  das neue Manifest als ungültig ab. Der neue separate Receipt-Sidecar enthält
  positive Belege sowie Tombstones, die der APKG-Export selbst nicht mitnimmt.
  Alte Hosts können dieses neue Snapshotformat nicht übernehmen. Felder zu
  entfernen oder nur das APKG zu importieren wäre kein gleichwertiger Ersatz.

Daher müssen Hosts, die die neue Undo-/Snapshot-/Handoff-Kette verwenden, auf
mindestens0.1.22 bleiben. Bei einem fehlgeschlagenen Liveupdate ist die sichere
Standardreaktion die Reparatur mit kompatibler neuer Version. Der Hauptagent
erhält den technischen Auslieferungsnachweis und entscheidet den konkreten
Wiederanlauf; der Helper behauptet keine vollständige Rückwärtskompatibilität.

## Windows-Paket und bestehende Installation

1. `scripts/build_desktop.py` ohne `--skip-backend` baut die finale UI, einen neuen
   PyInstaller-Dienst mit Metadaten0.1.22 und NSIS/MSI. Für Windows müssen
   `dist/desktop-backend/uniosd/uniosd.exe` **und** `_internal/` vollständig ins
   Tauri-Paket. Ein alter `.tmp/verify_frozen_frontend.py` für Onefile ist dafür
   ungeeignet; aktueller Windows-Build ist Onedir.
2. Gezielt `tests/test_server_package.py`, `tests/test_desktop_package.py`,
   `tests/test_desktop_release.py`, `tests/test_release_quality_gate.py` prüfen.
   Die gebauten/exakten heruntergeladenen Installer, Quellenarchive und den
   Gesamt-ZIP jeweils hashen; ZIP-Mitglieder und entpackte Dateien mit dem
   expliziten Komponentenmanifest vergleichen. Nichts aus `data/`/`local/`/env
   oder Benutzerprofilen in ein Gesamtpaket aufnehmen.
3. Gebauten und später installierten `uniosd.exe --startup-check` prüfen: dieser
   Prüfpfad benutzt eine temporäre leere Client-Home und keinen persönlichen
   Schlüsselbund. Nicht den normalen Dienst mit einem fremden Port starten.
4. Vor der Installation nur UniOS-Prozesse anhand ihres überprüften
   Installations-Executablepfades schließen; laufende Bedienung/Speicherung
   beenden lassen. Den exakt gehashten NSIS-Installer mit `/S`, `Start-Process
   -WindowStyle Hidden -Wait -PassThru` starten; Exit0 verlangen. Bestehendes
   UniOS-Home nicht verschieben, kopieren oder rekursiv ersetzen: auf Windows
   liegen Programme und persönliche Unterordner unter `%LOCALAPPDATA%/UniOS`.
5. Installierte ProductVersion0.1.22 prüfen. `uniosd.exe` und ausschließlich die
   auf der **gebauten** `_internal`-Dateiliste aufgeführten Programmdateien mit
   SHA-256 vergleichen. Kein rekursiver Scan des gesamten installierten Homes.
   Programmdateien-/UI-Zahl im Nachweis festhalten, ohne private Dateien zu lesen.
6. App starten und ausschließlich technische Health-/Clientstatus-/Hostwerte
   prüfen: Clientmodus, bestehende Kopplung, erwarteter HTTPS-Server und
   Server-Hostbetrieb. Keine privaten API-Inhalte/Logs/Schlüssel ausgeben.
   Bei Fehlern den bisher geprüften Installer behalten und mit einer kompatiblen
   neuen Programmversion reparieren. Eine native Hostinstallation darf nach
   realer0.1.22-Review-/Undo-/Snapshot-Nutzung nicht pauschal auf0.1.21 wechseln;
   dieselben fachlichen Grenzen gelten für ihre lokale Collection.

GitHub-Upload bleibt im bisherigen privaten Alpha-/Entwurfsflow. Ein CI-Fehler
wegen Kontozahlung ist keine bestandene Plattformmatrix. Ohne echte Signaturen
und erfolgreiche Plattformpakete weder `stage_desktop_release.py` als Ersatz
noch einen neuen `latest.json`-Autoupdatefeed verwenden; diese Routine erwartet
vier signierte Plattformartefakte und versionierte Kompatibilitätsmetadaten.
