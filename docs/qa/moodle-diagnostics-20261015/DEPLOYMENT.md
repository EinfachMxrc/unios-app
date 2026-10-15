<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Moodle-Diagnose und VPS-Wartung am 15.10.2026

Die Diagnose-Erweiterung aus `cafa2332a0809ee5b6dd410a5043c98976be3e2a`
ist als schmaler Patch auf dem bestehenden 0.1.27-Image gebaut worden.
Nur `app/connectors/moodle/client.py` und `diagnostics.py` wurden ersetzt.
Abhängigkeiten, Frontend und Alembic-Schema `ff99e3b1a721` bleiben gleich.

- Quellarchiv: SHA-256 `c7f595e12121cf7d07755e0de82f135f2c3841e3598e36ab655456aec85183ae`.
- Basisimage: `sha256:87f0bdb48f6a4fbe9515f869282d57a56a510c76442f62ec32ab5295d0b0cf52`.
- Kandidat: `unios-server:0.1.27-moodle-diagnostics-cafa2332a080`.
- Image: `sha256:cdc898a4c85fefa92a63b28f3ee1f5593e91f719eee5a439ce53483812ae3daf`.
- Aktivierung: 07:58:21 UTC; Container healthy, localhost-/HTTPS-Health erfolgreich,
  private API ohne Kopplung 401. Mounts, Netzwerke, Portbindungen und
  Sicherheitsparameter gegen den vorherigen Container geprüft.
- Isolierter Smoke ohne Netz und echte Mounts: synthetische Datenbank,
  Appstart, Authentisierungsschutz, Frontend und Moodle-Warnungsdiagnose bestanden.
- Eine HTTPS-Probe mit Python urllib erhielt 403; dieselbe öffentliche
  Health-Prüfung mit curl ergab 200. Die Aktivierungsprüfung verwendet curl.
- Ein anschließender regulärer Abgleich hat die neue Diagnose geliefert.
  Hochschulbezogene IDs und Meldungen bleiben in der privaten Systemansicht;
  dieser Nachweis enthält keine entsprechenden Rohdaten.

Die bestehenden Programme und privaten Daten wurden nicht direkt ausgelesen.
Altes Image, Compose-Dateien und vorherige Mac-App sind erhalten. Keine neue
Hochschulanmeldung, keine zusätzliche manuell ausgelöste Moodle-Abfrage und
keine UniOS-Datenbankmigration.

Auf ausdrücklichen Zusatzauftrag ist außerdem die VPS-Systemwartung erfolgt.
53 verfügbare APT-Pakete wurden mit beibehaltener lokaler Konfiguration
aktualisiert. APT meldete danach drei wegen Ubuntu-Phasing zurückgestellte
Updates (`open-vm-tools`, `python3-software-properties`,
`software-properties-common`). Keine Pakete entfernt, kein Autoremove.
Docker Engine 29.9.1 und Compose 5.6.0 sind installiert.

Sechs Container wurden auf die aktuellen Images ihrer vorhandenen Reihen
umgestellt: beide Python-3.12-Dienste, Caddy 2, PostgreSQL 16 und beide
Cloudflare-Tunnel. Technische Topologie vor/nach dem Wechsel verglichen,
bisherige Images zusätzlich getaggt. PostgreSQL wechselte von 16.14 auf 16.15;
keine Major-Migration. Versionsprüfungen für Python 3.12.15 und Caddy 2.11.7
bestanden. Der abschließende Neustart aktiviert den bereits installierten
Kernel 7.0.0-38-generic.

Umami 3.4.0 wurde nur vorbereitet: gegenüber dem laufenden 3.2.0 enthält es
sechs zusätzliche SQL-Migrationen. Vor Aktivierung verlangt AGENTS.md einen
von Marc geprüften Snapshot. Das neue Image ist unter einem getrennten
Kandidatentag erhalten, der bisherige Compose-Tag zeigt weiter auf 3.2.0.
Andere selbst gebaute Anwendungen haben in ihren VPS-Verzeichnissen keinen
Git-Checkout; deren Releasecode wurde durch diese Wartung nicht geändert.

Die nur technischen Betriebsbelege liegen auf dem VPS unter
`/root/maintenance-20261015` und im neuen UniOS-Releaseverzeichnis.
Schlüssel und private Konfigurationsinhalte gehören nicht zu diesen Belegen.

Beim ersten Neustart wurde ein vorhandener Runner-Startfehler sichtbar:
`unios-runner-proxy.socket` war zugleich vor `sockets.target` und nach
`docker.service` eingeordnet. Docker benötigt über `basic.target` wiederum
`sockets.target`; systemd meldete den Zyklus und die private Bridgeadresse
war beim Bind-Versuch noch nicht vorhanden. Die beiden Docker-Abhängigkeiten
wurden aus dem Socket entfernt und `FreeBind=yes` ergänzt, wie von der
[systemd-Dokumentation](https://github.com/systemd/systemd/blob/main/man/systemd.socket.xml)
für Bindung an erst später verfügbare Adressen vorgesehen. Die gebundene
private Adresse bleibt gleich; Proxy-Service und VM-Abhängigkeit bleiben erhalten.

Die bisherige Unit ist versioniert erhalten und die aktive Unit verweist auf
die korrigierte Fassung. `deploy/runner/connect-server.sh` erzeugt künftig
dieselbe Konfiguration. `bash -n` und `systemd-analyze verify` bestanden;
der reparierte Socket lauscht, die private Runner-API antwortet mit 401.
Der zweite Neustart hat die korrigierte Reihenfolge tatsächlich bestätigt.
Abschluss um 08:07:51 UTC: Ubuntu 26.04.1 LTS, Kernel 7.0.0-38-generic,
systemd running ohne fehlgeschlagene Unit, alle 15 Container laufen und alle
sechs vorhandenen Container-Healthchecks bestanden. SSH mit unverändertem
Host-Pin, UniOS-HTTPS 200, private UniOS-API 401 und private Runner-API 401.
Kein weiterer Neustart erforderlich; dpkg meldet keinen unvollständigen Zustand.
Technischer Ergebnisdatensatz: [verification.json](verification.json).


## Abschluss der restlichen Updates und Moodle-Fix

Marc hat anschließend die selbstständige Durchführung einschließlich Umami
freigegeben. Ein konsistenter Umami-Dump wurde vor der Migration angelegt,
sein Archiv geprüft und vollständig in einer isolierten PostgreSQL-Instanz
mit deaktiviertem Netzwerk wiederhergestellt. Die Sicherung bleibt privat auf
dem VPS; ihre Inhalte wurden nicht ausgegeben. Danach Umami 3.4.0 aktiviert,
alle sechs zusätzlichen Migrationen erfolgreich (26 abgeschlossen, null offen).
Topologie erhalten und ursprüngliches Image zusätzlich getaggt.

Auch die drei zuvor zurückgestellten Ubuntu-Updates sind jetzt installiert.
APT meldet null offene Updates; dpkg sauber, kein weiterer Neustart notwendig.

Der Moodle-Fix aus b7b81e8d1e508fac293b61fc346122f1b6be8456 unterscheidet
Zugriffsbeschränkungen von unvollständigen Antworten. Nur wenn alle angefragten
Kurse und alle laut Kursübersicht sichtbaren Aufgaben geliefert wurden,
werden Warnungen für andere, nicht zugängliche Aktivitäten als Hinweis
behandelt. Fehlende sichtbare Aufgaben, Kurswarnungen, unbekannte Codes und
fehlerhafte Antworten bleiben Warnungen. Vorhandene Aufgaben und Termine
bleiben vorsorglich erhalten. Details bleiben auf den privaten Systemstatus
beschränkt und sind auch beim Status ok sichtbar; keine Störungsbenachrichtigung
für den erwarteten Zugriffsfall. Kein neuer Moodle-Aufruf, keine neue Migration.

92 gezielte Pythonfälle und alle 1.424 Frontendfälle bestanden. Ruff, mypy,
Typecheck, Lint und Build bestanden. Zwei Browserabläufe bestätigen echten
Warnstatus sowie erfolgreiche Abgleiche mit sichtbarem Zugriffshinweis.
Die erste isolierte Smoke-Fixture ließ optionale API-Funktionen aus und
produzierte deshalb deren erwartete Warnungen; nach Vervollständigung der
synthetischen API bestanden alle drei Fälle im fertigen Serverimage.

Neues Image am 15.10.2026 um 09:13:00 UTC aktiv:
`sha256:a9d7d0bd70af3feae4292e75645a4e36efa3378b6108fa4bab861aff48f6eef3`.
332 Overlay-Dateien vor dem Bau gehasht. Topologie und Schema unverändert,
UniOS healthy, HTTPS 200 und private API ohne Kopplung 401. Der normale
Moodle-Abgleich endete um 09:13:23 UTC erfolgreich mit Status ok und
Zugriffshinweis; die frühere Sammelwarnung ist nicht mehr vorhanden.

Mac-Paket aus demselben Quellstand erstellt und mit der bestehenden Identität
signiert. Alle sieben installierten Programmdateien entsprechen dem Paket,
Signatur und isolierte Startprüfung vor/nach Installation bestanden.
Vorherige App versioniert erhalten. Bestehende Serverkopplung und verfügbarer
Schlüsselbund nach Neustart über die vorgesehenen Statusendpunkte bestätigt.
Abschließend alle 15 Container laufend und sechs vorhandene Healthchecks
bestanden; keine fehlgeschlagene systemd-Unit. Technische Abschlusswerte:
[completion.json](completion.json).

SHA-256 des ausgelieferten Programmoverlays: `4f11a3be8ef42dea8cdef09beda00e888d9a29052f37bdbd645082a39ee9444b`.
