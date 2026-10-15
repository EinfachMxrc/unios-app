<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Bestätigte KI-Bewertung nach Kartenlöschung wiederherstellen

## Nutzerproblem und bestehender Vertrag

Anki bestätigt eine Bewertung, die SQL-Spiegelung antwortet mit 503. Vor einem
erneuten Senden wird die ursprüngliche KI-Karte gelöscht oder reimportiert.
Der bisherige Replay bestätigt den nativen Receipt, ergänzt aber keinen
historischen SQL-Lernverlauf. Damit fehlt eine tatsächlich geleistete Wiederholung
im Themen- und Wochenstand. Eigene Quellenkarten hatten bereits eine getrennte,
GUID-basierte historische Zuordnung.

## Konkreter Schnitt

`app/anki/study_review_service.py` ergänzt die historische Zuordnung für die
beiden tatsächlich verwendeten KI-Marker `unios-N` und `N`. Eine lokale Zuordnung
ist ausschließlich erlaubt, wenn die kanonische positive Queue-ID, Herkunft
`ai`, Status `pushed` und genau eine bestehende SQL-Karte mit der eingefrorenen
ursprünglichen Notiz-ID übereinstimmen. Ein Marker allein genügt nicht.

Die vorhandene SQL-Karten-ID und ihre Fremdschlüssel bleiben erhalten. Es gibt
keine neue Bindung, keinen Wechsel zur Ersatzkarte und keine zweite native
Bewertung. Der Receipt bewahrt den ursprünglichen Zeitpunkt. Fehlende, geänderte
oder mehrdeutige lokale Bindungen antworten mit 409. Fremde Queue-IDs bleiben
native ACKs; alte Receipts ohne Zeit-/Identitätsdaten erzeugen keinen erfundenen
SQL-Verlauf. DTOs, Receiptformat und Migrationen bleiben unverändert.

## Nachweis

- Echter SDK-Vorherlauf: sechs Wiederherstellungsfälle fehlgeschlagen; native
  Bewertung vorhanden, SQL-Verlauf fehlte.
- Nachher: dieselben sechs Fälle bestanden, beide Marker jeweils mit Löschung,
  einem Reimport und zwei aktuellen Ersatznotizen.
- 40 Review-Bridge-Fälle prüfen zusätzlich falsche Herkunft, fehlende/mehrfache
  Bindungen, veränderte Notiz-ID und nichtkanonische Marker.
- 81 gezielte Anki-Fälle bestanden in 124,54 Sekunden. Der integrierte Satz besteht
  1015 Pythonfälle bei zwölf erwarteten Skips in 1000,70 Sekunden.
- Ruff und Mypy bestanden; ausschließlich temporäre synthetische Profile mit
  dem installierten offiziellen Anki-SDK. Keine Bestandsdaten oder Live-Migration.

Gezielte Wiederholung: `.venv/Scripts/python.exe -m pytest tests/test_anki_review_bridge.py`.
Die breitere Fokus-Abnahme dokumentiert zusätzlich den gemeinsamen Produktstand
in `../focus-workspace-20261007/README.md`.
