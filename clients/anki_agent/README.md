<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Anki-Agent

Der Agent überträgt ausschließlich im Dashboard freigegebene Kartenvorschläge in ein **lokal geöffnetes Anki Desktop** mit AnkiConnect und liest die Bewertungen der zugeordneten Karten zurück. Er läuft einmalig und beendet sich danach. Ein erneuter Aufruf verarbeitet nur noch offene Freigaben und ergänzt nur neue Bewertungen. Nach einem Abbruch zwischen `addNote` und Rückmeldung erkennt er die bereits erzeugte Notiz am `unios-id-...`-Tag und meldet sie nachträglich an den Host.

Eigene, ausdrücklich freigegebene Basic-Karten werden ebenfalls übernommen. Der
Agent meldet dafür die Fähigkeit `manual-guid-v1` im Header
`X-UniOS-Anki-Capabilities`. Hosts liefern älteren Agenten ohne diesen Header nur
KI-Vorschläge; eigene Karten bleiben sichtbar ausstehend. Für eigene Karten gilt
in beiden Lernmodi die unveränderliche Kennung `unios-manual-<UUID>` im vorhandenen
Feld `UniOSId`. Der Agent prüft bei Wiederaufnahme dieses Feld; mehrere identische
Kennungen brechen die Übernahme mit einem Konflikt ab. KI-Karten behalten ihre
bisherigen Kennungen und Tags. Eigene Fragen und Antworten werden als Klartext
mit erhaltenen Zeilenumbrüchen gespeichert; HTML-Beispiele bleiben sichtbarer Text.

1. In der geschützten `.env` des UniOS-Hosts `ANKI_AGENT_TOKEN` auf einen langen, zufälligen Wert setzen und den Dienst neu starten. Diesen Wert auf dem Anki-Gerät nur als Umgebungsvariable `ANKI_AGENT_TOKEN` setzen; weder ins Repo noch in einen Aufruftext mit Shell-Historie schreiben.
2. Anki Desktop mit AnkiConnect starten. AnkiConnect bleibt an `127.0.0.1:8765` gebunden. Den Host über Loopback oder Tailscale erreichbar machen.
3. Aus dem Projektordner mit installierten Python-Abhängigkeiten ausführen:

```sh
UNIOS_HOST_URL=http://127.0.0.1:8000 .venv/bin/python -m clients.anki_agent
```

Für ein anderes Host-Gerät `UNIOS_HOST_URL` auf dessen Tailscale-Adresse setzen. Bei späteren Änderungen an Notiztypen oder Anki-Karten zuerst ein Anki-Backup erstellen. Echte Anki-Profile werden nicht von automatisierten Tests verändert.
