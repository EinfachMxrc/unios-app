<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Veröffentlichung vorbereiten

## Alpha 1 · 0.1.19 (04.10.2026)

Auf ausdrücklichen Nutzerwunsch wird `v0.1.19` als **Alpha-Vorabversion** im
bestehenden privaten GitHub-Repository angeboten. Diese begrenzte Veröffentlichung
aktiviert weder Stable/Beta/Nightly noch GitHub Pages und ändert die Sichtbarkeit
des Repositories nicht. Eine öffentliche Freigabe der gesamten Historie bleibt
ein eigener Schritt nach den Prüfungen unten.

Die [README](../README.md), [Release-Hinweise](releases/0.1.19-alpha.md) und
[Downloadseite](site/download.html) nennen verfügbare Pakete, fehlende
Vertrauenssignierung und offene Geräteabnahmen ausdrücklich. Windows nutzt die
geprüften lokalen Installer; weitere Pakete nur erfolgreiche Plattformbuilds.
SHA-256-Prüfsummen und `release-info.json` dokumentieren die tatsächlichen Dateien.
Es wird kein unsigniertes `latest.json` als automatischer Updatefeed veröffentlicht.

Der App-Code ist `3618c994daaadaf2956df81395bb5c949cb9c74d` mit
[bestandener Qualitäts-CI](https://github.com/EinfachMxrc/unios-app/actions/runs/37196635430).
Der [Paketlauf](https://github.com/EinfachMxrc/unios-app/actions/runs/37197766239)
baut denselben Code; macOS Intel ist durch die fehlende Plattform-Wheel von
`onnxruntime==1.30.0` blockiert. Diese Grenze wird nicht als bestandene Abnahme geführt.

## Weitere Freigaben

Für 0.1.19 gilt Feature Freeze. Maßgeblich sind die tatsächlich ausgeführten
Prüfungen in [RELEASE_READINESS](RELEASE_READINESS.md) und [PROGRESS](PROGRESS.md).
Das [Release Lab](RELEASE_LAB.md) erzeugt getrennte synthetische Prüfberichte und
lokale Issue-Entwürfe. Geräte-/Screenreader-/Signierprüfungen und die externe
Alpha-Woche bleiben eigenständige Freigaben. Stable/Beta/Nightly werden erst nach
dieser Abnahme aktiviert; eine gebaute Datei bedeutet keinen öffentlichen Release.

Die Desktop-Bauschritte für Windows, macOS und Linux sowie der Stand von Signierung und Updates stehen in [DESKTOP_PACKAGES.md](DESKTOP_PACKAGES.md). Die [Downloadseite](site/download.html) verweist auf die ausdrücklich als Alpha bezeichnete Vorabversion.

**Repository-Beschreibung:** UniOS – lokaler Studienarbeitsplatz für Kurse, Unterlagen, Aufgaben und Lernen.

**Topics:** `education`, `student-productivity`, `local-first`, `markdown`, `pdf`, `react`, `fastapi`.

Unter [`docs/site/`](site/) liegen die statische Projektseite sowie eigenständige Entwürfe für [Hilfe](site/docs.html) und [Entwicklerdokumentation](site/developers.html). Die Projektseite enthält schematische Geräteansichten mit erfundenen Daten. Die README zeigt aktuelle App-Screenshots aus dem lokalen Fake-Server-Audit und der isolierten Demo. Der Text nennt PRIMUSS und mycampus ausdrücklich als noch nicht live abgenommene Anbindungen. Die Seiten können nach Freigabe über GitHub Pages veröffentlicht werden; der Quellordner ist noch nicht automatisch mit einem öffentlichen Pages-Deployment verbunden.

Vor dem Sichtbarschalten des Repositories oder einer Pages-Seite sind diese konkreten Prüfungen nötig:

1. Alle **aktuellen Repo-Dateien** auf Secrets, private URLs, reale Kursinhalte, Namen Dritter und hochgeladene Archive prüfen. `data/`, `local/`, `.env`, Schlüsselbunddaten, Browserprofile, Testvideos mit echten Konten und Portalbeispiele dürfen nicht im Repository liegen.
2. Die **gesamte Git-Historie** auf dieselben Daten prüfen. Ein sauberer aktueller Stand reicht nicht, wenn ältere Commits sie noch enthalten. Fundstellen bereinigen, Schlüssel widerrufen und die betroffenen Personen informieren, falls Daten bereits geteilt wurden.
3. Lizenzhinweise in `LICENSE` und `THIRD_PARTY_NOTICES.md` mit tatsächlich übernommenen Quellen abgleichen. Die Projektseite verwendet Systemschriften und lädt keine externen Fonts.
4. Den aktuellen Quellstand lokal auf einem frischen Mac und Windows-PC installieren, inklusive Dienstneustart, Moodle-Einrichtung, PWA und Wiederherstellung. Die Coburger Portale erst nach stabilen Selektoren als nutzbar beschreiben.
5. Nach bestandenem Audit eine Release-Kennung setzen, Quelle und Checksummen veröffentlichen und erst dann GitHub Pages aktivieren. Repo-Beschreibung und Topics können anschließend gesetzt werden.

Bis diese Punkte belegt sind, bleibt das Repository privat und die Projektseite ein lokaler Entwurf. Der technische Teststand steht in [`PROGRESS.md`](PROGRESS.md).

**Historienprüfung am 26.09.2026 (Commit `89b5885`):** `scripts/audit_history.py` prüfte einen vollständigen privaten Git-Spiegel mit 139 Commits, 2.700 Git-Objekten und 1.545 Dateiobjekten. Die geprüften Muster für private Schlüssel, bekannte Anbieter-Token und Session-URLs ergaben keinen Treffer; in den historischen Pfaden lag nur die unvertrauliche `.env.example`. Das ist ein technischer Mustercheck und keine Freigabe für beliebige persönliche Inhalte. Vier Designreferenzen unter `docs/design/` zeigen ein Profilbild und den Namen „Marc“. Der Nutzer hat bestätigt, dass das Profilbild eine generierte Figur ist. Die weitere Geräte- und Quellenprüfung aus der Liste oben bleibt offen.

**Technischer Mustercheck am 05.10.2026 (erreichbare Historie bis `ebf03fc`):**
9.324 Git-Objekte, davon 5.496 Dateiobjekte, null Fundstellen für die angegebenen
Muster und Pfad-/Größenausschlüsse; Arbeitskopie nicht flach geklont. Der Prüfer
fragt Objektmetadaten vor Inhalten ab. Private Daten-/Archivpfade und Dateien über
4 MB werden als nicht gelesen gemeldet und sperren die Prüfung; ihre Inhalte
werden nicht geladen. Ein synthetischer Regressionstest kontrolliert ausdrücklich
die tatsächlich an Git gesendeten Inhaltsabfragen. Nicht erkannte Secretformate,
persönliche Angaben in Bildern und Rechte an übernommenen Referenzen sind durch
diesen Mustercheck nicht abgedeckt. Die Freigaben oben bleiben erforderlich.
