<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Hochschul-Kompatibilität

Stand: 03.10.2026. Ein Profil ist eine Konfiguration, keine Zusage, dass alle
Dienste der Hochschule funktionieren. „Fixture“ bedeutet lokale erfundene Daten.
„Nutzerbestätigt“ bezeichnet ausschließlich den genannten historischen Ablauf,
keine flächendeckende Abnahme des aktuellen Builds.

| Hochschule / Quelle | Implementierung und Nachweis | Grenze / eigene Abnahme |
| --- | --- | --- |
| HS Coburg – Moodle | REST-Kurse, Materialien, Aufgaben, Ankündigungen, Kalender und Einschreibungsablauf; tests/test_moodle_sync.py, test_moodle_enrolment.py, Fake-Server. MANUELL_TESTEN dokumentiert historische Nutzerbestätigung von Kursanzahl/Inhalten | Persönlicher SSO/MFA, veränderte Moodle-Konfiguration, Einschreibung und bestätigte Abgabe im aktuellen Paket selbst prüfen |
| HS Coburg – Stundenplan | iCal-Abo, Wiederabruf, Zeitzonen, Anzeige; tests/test_extraction_search_calendar.py und Browser-Fixtures | Persönlicher Link kann ablaufen; erfolgreicher Abruf bedeutet nicht, dass jede Veranstaltung korrekt benannt/zugeordnet ist |
| HS Coburg – Mensa | SWO-Parser, Kategorien, Ernährungsmerkmale und echte Quellenbilder; tests/test_mensa.py | Tagesangebot/Quellenänderungen selbst vergleichen; Fotos nur wenn die Quelle welche liefert |
| HS Coburg – PRIMUSS | Lesender Seitenimport/Vorschau; tests/test_primuss_import.py, Sicherheits-/Portal-Fakes | Profilselektoren/Statuswerte teilweise ausdrücklich unbekannt; kein zugesicherter kompletter Noten-/Prüfungsabruf. Keine An-/Abmeldung |
| HS Coburg – myCampus | Selektorgestützter Import; tests/test_campus_import.py | institutions/hs-coburg.yaml enthält offene Selektoren. Einrichtung und fachliche Ergebnisse selbst prüfen |
| HS Coburg – Räume | Nutzerbilder belegen öffentliche URL, Formularangebot und Zeit-/Dauerwahl; [ROOM_BOOKING](ROOM_BOOKING.md) | Kein vollständiger Belegungskalender. Angebot ist keine bestätigte Reservierung; verbindliche Buchung persönlich im Hochschulfenster |
| Hochschulmail | Konfigurierbarer lesender Abruf/Weiterleitung; tests/test_mail_candidates.py, test_mail_forwarding.py | Kein universeller Outlook-Login ohne erforderliche Hochschulfreigabe. Weiterleitung ist ein separater bewusster Einrichtungsweg |
| Andere Hochschule – Moodle | Konfigurierbares Basisprofil, bestehender Moodle-Vertrag | Community-/Nutzerabnahme der jeweiligen REST-/SSO-Konfiguration nötig; keine konkrete weitere Hochschule als getestet ausgewiesen |
| Andere Hochschule – Kalender/Mensa | Generische iCal-Verarbeitung; Mensa nur vorhandene Provider/Profile | Keine automatisch übernommenen Coburger URLs oder Räume |
| Eigene Hochschule – Community-Connector | API v1, isolierter Containervertrag, Registry-/Rechteprüfung | Aktuelle Registry enthält nur lokalen Referenzconnector; kein bereits freigegebener installierbarer Community-Container behauptet |

Vor einer neuen Hochschulfreigabe sollen reproduzierbare Fakes, exakte Domains,
Fähigkeiten, Version und verantwortlicher Maintainer dokumentiert sein.
Realtests macht der Nutzer selbst. Ein Bericht enthält Datum, Paketversion,
ausgeführten Ablauf und Ergebnis; niemals private Seiten, Noten oder Sitzungslinks.
Anleitung: [ADD_UNIVERSITY](ADD_UNIVERSITY.md). Gerätegrenzen:
[RELEASE_READINESS](RELEASE_READINESS.md), [MANUELL_TESTEN](MANUELL_TESTEN.md).
