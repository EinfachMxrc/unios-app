<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Getrennter Coding-Runner

Judge0 CE 1.13.1 läuft in einer eigenen Ubuntu-22.04-KVM-VM mit 2 GB RAM,
2 vCPUs und einer virtuellen 20-GB-Disk. Keine UniOS-Daten, Hostfreigaben oder
Host-Docker-Sockets gelangen hinein. Die privilegierten Judge0-Container sind
auf den Gast beschränkt. Dies setzt einen gepflegten Hypervisor und Gast voraus.

Die Hostskripte in `deploy/runner/` setzen Root und KVM voraus und ersetzen keine
bestehende Runner-Installation. `create-vm.sh` prüft den Ubuntu-Image-Hash und
startet nur den Bootstrap-Gast. Der Operator registriert den lokalen SSH-Hostkey;
`install-guest.sh` läuft ausschließlich im Gast `unios-runner`. Es lädt die
offizielle Judge0-Version, erzeugt private Zufallscredentials und bereitet **nur
den Gast-Bootloader** auf cgroup v1 vor. `activate-vm.sh` fährt nur diese VM
herunter und schaltet QEMU auf `restrict=on`; erst `start-guest.sh` startet den Runner.
Ein erfolgreicher ausgehender HTTP-Aufruf verhindert dessen Start.

Host-Freigaben: `127.0.0.1:23222` für den VM-SSH-Zugang und `127.0.0.1:2358`
für Judge0. Der Runner ist nicht öffentlich veröffentlicht. Die Konfiguration
gehört dem verifizierten Container-UID 1000 und hat Modus 600.

UniOS benötigt `CODING_RUNNER_URL`, `CODING_RUNNER_TOKEN` und
`CODING_RUNNER_ISOLATED=true`. Token ausschließlich in den privaten Server-Keyring
übernehmen. Kein Token in URLs, CLI-Argumenten, Browserantworten oder Git.
Ein Container kann Host-Loopback nicht direkt erreichen. `connect-server.sh` bindet
einen systemd-TCP-Proxy ausschließlich an die verifizierte private `docker0`-Adresse.
Dieser erreicht den VM-Forward über Host-Loopback und begrenzt offene Verbindungen auf 32.
Compose erreicht ihn über `judge0:host-gateway` und `http://judge0:2358`.
Bei zusätzlichem Edge-Netz priorisiert `compose.edge.yaml` die private UniOS-Brücke
mit `gw_priority: 1`; dafür Docker Compose ab 2.33.1 verwenden.
Ohne diese Gateway-Priorität könnte der Hostzugriff über die nicht freigegebene
Edge-Brücke laufen. Die Firewall wird dafür nicht erweitert.
Die Hostports werden nicht auf `0.0.0.0` geöffnet. Der VM-Dienst startet nach einem
Gastneustart automatisch erneut; Docker muss zuvor seine Brücke bereitgestellt haben.
Bei aktiver UFW-Firewall ergänzt `allow-private-clients.py` ausschließlich Regeln
für die vorhandene Standard-/UniOS-Docker-Brücke, ihre privaten Quellnetze und
den API-Zielport. Es aktiviert weder eine ausgeschaltete Firewall noch einen öffentlichen Port.

Der Adapter prüft die deaktivierte Netzwerkrichtlinie, benutzt feste Harnesses,
blockiert benutzerdefinierte Compiler-/Callbackparameter und setzt pro Test
2 s CPU, 6 s Wandzeit, 256 MiB Speicher, 64 Prozesse/Threads und 256 KiB Dateien.
Ein ganzer Aufgabenlauf ist zusätzlich auf drei Starts/Minute und einen gleichzeitigen
Lauf begrenzt. Abbruch unterbindet weitere Tests; bereits laufender Gastcode endet
spätestens an seinem Limit. Verdeckte Eingaben, Erwartungen und Ausgabe werden
im Lernendenbericht nicht veröffentlicht.

`scripts/check_coding_runner.py <privater-Tunnel>` erhält den Token auf stdin und
prüft ausschließlich synthetische Programme über den echten Produktionsadapter.
Die Ausgabe enthält Ergebnisse, keine Credentials. Prüfungen betreffen die drei
Sprachen, alle sieben Vorlagen, leere Eingaben, Hilfsdateien, Fehler, Zeit-/Speicherlimit,
Netzwerkverbot und fehlende UniOS-Daten. Fake-Browserrunner sind ausschließlich Testfixtures.

Images und Gastpakete benötigen spätere Sicherheitsupdates. Für ein kontrolliertes
Update den Runner deaktivieren, ausschließlich dem Gast zeitweise ausgehendes Netz
geben, Images prüfen und anschließend erneut isolieren. Keine Lernendenprogramme
während des Bootstrap-/Updatefensters zulassen. Speicherverbrauch und Gast-DB
überwachen; Judge0-Ausführungsdaten sind getrennt von UniOS' unveränderlichen Berichten.
Es wird keine automatische Aufbewahrungsfrist für diese Gast-DB behauptet.

Quellen: [offizielle Judge0-Installation](https://github.com/judge0/judge0/releases/tag/v1.13.1),
[Judge0-Konfiguration](https://github.com/judge0/judge0/blob/v1.13.1/judge0.conf),
[QEMU-Netzwerk](https://www.qemu.org/docs/master/system/qemu-manpage.html).
