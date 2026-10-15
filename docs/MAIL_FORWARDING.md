<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Uni-Mail durch Weiterleitung auf den eigenen VPS

Seit 0.1.14 kann UniOS neue Hochschulmails aus einem privaten Maildir übernehmen. Dafür ist keine Microsoft-App-Registrierung nötig. Der Empfang ist ausschließlich für eine eigene Einzelnutzer-Instanz vorgesehen.

Blockiert die Hochschule sowohl externe Weiterleitung als auch Drittanbieter-App-Zustimmung (beides sind übliche Microsoft-365-Tenant-Richtlinien), bietet die Mail-Seite in der Desktop-App einen dritten, eigenständigen Weg: Ein eigenes Browser-Fenster öffnet das Postfach unter `outlook.office.com`; die Nutzerin meldet sich darin selbst an (inklusive Zwei-Faktor-Anmeldung), UniOS speichert dabei nie ein Passwort. Danach liest UniOS read-only, was im Fenster sichtbar ist (Absender/Betreff/Datum/Text der geöffneten Nachrichten), scrollt die virtualisierte Nachrichtenliste bei Bedarf nach und speichert dieselben begrenzten Metadaten wie die beiden anderen Wege. Jeder schreibende Request im Fenster wird während eines Lesedurchgangs vom nativen WebView2-Request-Guard blockiert (`desktop/src-tauri/src/portal_crawl.rs`). Die genauen DOM-Selektoren für Nachrichtenliste und Lesebereich (`frontend/src/lib/mailCrawl.ts`) sind ein erster, auf Microsofts bekannten Barrierefreiheits-Mustern (ARIA `option`/`row`/`main`) basierender Versuch und wurden nicht gegen ein echtes Postfach verifiziert; falls nichts gelesen wird, sind sie der erste Ansatzpunkt.

## Einrichtung und Prüfung

1. Eine eigene Mail-Subdomain verwenden. In DNS einen **unproxierten A-Eintrag** auf die VPS-IP und einen **MX-Eintrag derselben Subdomain** auf diesen Mailhost anlegen (Priorität 10). Bestehende MX-Einträge der Hauptdomain bleiben erhalten.
2. Auf einem VPS ohne bestehenden Maildienst `sudo bash deploy/server/provision-mail.sh mail.example.org prepare` ausführen. Die Vorbereitung bindet SMTP nur an Loopback und legt exakt `eingang@mail.example.org` an. Für den öffentlichen Empfang wird nur TCP 25 benötigt, auch in der zusätzlichen Provider-Firewall. Kein SMTP-Relay, kein Mailversand, keine Anmeldung über SMTP und keine beliebigen Empfänger.
3. Ein gültiges Zertifikat für den Mailhost bereitstellen. Bei Certbot mit Standalone-Prüfung TCP 80 nur für die Zertifikatsprüfung öffnen und danach schließen. `sudo bash deploy/server/provision-mail.sh mail.example.org activate` bindet den TLS-pflichtigen Empfänger öffentlich und installiert den täglichen Zertifikatscheck. `renew-mail.sh` öffnet TCP 80 höchstens während der zeitlich begrenzten Erneuerung; vorher vorhandene Freigaben bleiben erhalten. Ein vorhandener HTTP-Dienst muss stattdessen separat in die Zertifikatsprüfung eingebunden werden.
4. **Von einem anderen Netz** TCP 25 und STARTTLS mit gültiger Zertifikatskette prüfen. Ohne TLS muss `MAIL FROM` abgewiesen werden; Fremdempfänger und unbekannte lokale Empfänger müssen ebenfalls abgewiesen werden. Eine lokale Prüfung allein bestätigt nicht die Erreichbarkeit durch Outlook. Erst danach als Administrator in `/opt/unios/state/local/mail-forwarding-server-connection.json` `ready` auf `true` setzen; Eigentümer UID/GID 10001 und Modus 600 erhalten. Die Aktivierung des Listeners schaltet diesen Status nicht automatisch frei.
5. UniOS → Uni-Mail zeigt Adresse, Zustand und letzten Import. In Outlook unter Einstellungen → E-Mail → Weiterleitung diese Adresse eintragen und **Kopie weitergeleiteter Nachrichten beibehalten** aktivieren. Eine tatsächliche weitergeleitete Nachricht prüfen; bestehende ältere Mails werden durch Aktivieren der Weiterleitung nicht automatisch übernommen.

Das Serverimage und die native App müssen beide 0.1.14 oder neuer verwenden. Nur ein Serverupdate aktualisiert die gebündelte Oberfläche einer installierten App nicht.

## Daten und Grenzen

- Postfix legt Originalmails inklusive Anhängen unter `state/local/mailbox/inbox` ab. Ordner sind 700, Dateien 600, Eigentümer UID 10001. Originale werden nicht gelöscht oder überschrieben.
- UniOS importiert alle fünf Minuten höchstens 100 wartende Mails, beim Start erstmals nach 20 Sekunden. In der App gibt es zusätzlich „Nachrichten jetzt lesen“ sowie Pause/Fortsetzen. Pausieren stoppt den Import; der SMTP-Empfang bleibt bestehen. Zum Stoppen des Empfangs die Outlook-Weiterleitung deaktivieren.
- Die Datenbank enthält nur Absender, Betreff, Datum, möglichen Fristtag und den Deduplizierungshash. Nachrichtentexte werden auf eindeutige Fristformulierungen geprüft; HTML und Anhänge werden nicht ausgeführt, Anhänge nicht als Studienmaterial importiert. Vollständige Mailansicht bleibt in Outlook. Die KI erhält keine Mailtexte oder Anhänge durch diesen Import.
- Ein mögliches Fristdatum wird **nicht** automatisch zu einer bestätigten Aufgabe oder einem Termin. Nutzer prüfen Datum und Uhrzeit selbst.
- Nachrichten dürfen höchstens 8 MiB groß sein. Nicht lesbare Originale bleiben mit `.review` erhalten; erfolgreiche Originale werden erst nach dem Datenbank-Commit nach `cur` verschoben. Nach einem Absturz verhindert der Hash doppelte Einträge.
- Das öffentliche Postfach ist kein vertrauenswürdiger Hochschul-Absendernachweis und kein Spamfilter. Eingehende Inhalte bleiben Hinweise. Maildir-Belegung und Backups administrativ überwachen; keine automatische Löschung von Originalen.
- Im vorhandenen Cloudflare-Tunnel wird HTTPS für UniOS transportiert. Öffentlicher SMTP-Empfang läuft direkt auf den VPS und benötigt den DNS-only-Eintrag sowie den eingehenden Port 25 beim VPS-Anbieter. Cloudflare-DNS allein öffnet keine Provider-Firewall.

## Abnahme

Automatisiert mit erfundenen Daten geprüft: große MIME-Mail, Fristvorschlag ohne automatische Deadline, Deduplizierung, Originalerhalt, Pause/Fortsetzen, begrenzte Stapel, ungültige Nachricht, Schreibberechtigung und Scheduler. Ein Browserablauf importiert über den echten Fake-Server-Maildir und prüft diese Nutzeraktionen ohne gemockte API. Reale Outlook-Weiterleitung und externe SMTP-Erreichbarkeit müssen für jede Installation gesondert bestätigt werden.
