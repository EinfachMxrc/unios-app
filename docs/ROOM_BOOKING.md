<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Raumbuchung: geprüfter Ausgangspunkt

Stand: 03.10.2026. In Version 0.1.16 als Vorbereitung und lesende Übernahme eines offiziellen Raumangebots umgesetzt.

## Automatischer Verfügbarkeitsabruf (Quellstand nach 0.1.19)

Zwei vom Nutzer gelieferte HAR-Aufzeichnungen belegen ausschließlich lesende
GET-Prüfungen bei `myapps.hs-coburg.de`:

- Kategorie Bibliothek-Arbeitsräume: `/raumbuchung/kategorie-buchen/8/verfuegbarkeit`.
- Einzelraum: `/raumbuchung/raum-buchen/{room}/verfuegbarkeit`; für 4-032 aufgezeichnet.
- Parameter: `capacity` als Personenzahl, `date` als ISO-Datum, `time` in Sekunden
  seit Mitternacht und `duration` in Sekunden.
- Die Antwort ist HTML, kein Kalender und keine Liste bestehender Buchungen.
  Ein freies Angebot nennt den Raum und hat eine passende Angebotsüberschrift.
  Der `from`-Zeitstempel des Buchungslinks entspricht exakt dem angefragten
  Datum/Uhrzeit in Europe/Berlin; beide Aufzeichnungen wurden darauf geprüft.
- Die tatsächlich aufgezeichnete Ablehnung lautet „Räume dürfen maximal 14 Tage
  im voraus gebucht werden“. Dies ist eine Buchungsregel, keine Belegt-Meldung.
- Der Pfad `/raumbuchung/buchen/...` gehört zum verbindlichen Abschluss und wird
  niemals vom Prüfer abgerufen, auch wenn der Anbieter dafür einen GET-Link zeigt.

Nach persönlicher Anmeldung im eigenen Hochschulfenster bietet UniOS
„Verfügbarkeit prüfen“ und „Alle Räume prüfen“. Letzteres prüft die bekannte
Raumliste nacheinander für genau dieselbe Auswahl, mit mindestens einer Sekunde
Abstand zwischen Anfragen, Fortschritt und Stoppen vor der nächsten Anfrage.
Eine laufende Anfrage bleibt auf zehn Sekunden begrenzt. Es werden keine
Anmeldedaten aus der HAR übernommen; die persönlichen Original-HARs sind weder
Teil des Repositories noch der Tests.

Der feste native Prüfer erlaubt nur die beiden Verfügbarkeitspfade,
Same-Origin-GET und keine HTTP-Weiterleitung. Antwortgröße maximal 256 KiB.
Ein nicht eingefügtes HTML-Template hält Skripte, Bilder und Iframes inert.
Nur erkannte Statuswerte bzw. passende Angebotstexte gehen an UniOS; keine
Cookies, Headers, Rohseiten, fremden Buchenden oder Buchungslinks werden exportiert.
Freie Angebote werden erst nach Prüfung des konkreten Raums, vollständigen
Datums, Startzeit, Dauer und eindeutigem Link übernommen. Auch „30 min“ wird erkannt.

Die Übersicht unterscheidet frische direkte Abfragen von übernommenen sichtbaren
Seiten und manuellen Konfliktbestätigungen. Eine erneute fehlgeschlagene Prüfung
entkräftet das frühere Angebot für diesen Raum/Zeitraum. Die manuelle Bedienung
liegt als eingeklappte Alternative darunter. Ein direktes Angebot ist weiter
keine Reservierung; Buchung und persönliche Bestätigung erfolgen im Portal.

**Offen:** Beide Aufzeichnungen enthalten freie Angebote, aber keine Antwort
für einen bestehenden Buchungskonflikt. Solche nicht verifizierten Antworten
bleiben „Status unklar“. Der tatsächliche Belegt-Antworttext sowie der direkte
Abruf in einer frisch angemeldeten installierten App müssen noch abgenommen
werden. Es wird kein kompletter Belegungsfeed bzw. Tageskalender behauptet.
Für dieses Paket ist ein neues Desktop-Build erforderlich; App/VPS wurden
mit der Quelländerung noch nicht aktualisiert.

## Belegt

Die vom Nutzer bereitgestellten Bilder zeigen im myCampus-Dienst „Raumbuchung“
die Auswahl „Bibliothek-Arbeitsräume“ beziehungsweise „einzelner Raum“ sowie
Datum und Personenzahl. Die Raumliste enthält 4-030, 4-031, 4-032, 4-034,
4-035, 4-036, 4-037, 4-038, 4-039 und 5-U11a (Raum der Stille).
Kapazitäten, Buchungsregeln und Verfügbarkeiten sind daraus nicht abzulesen.

Die Hochschule bestätigt öffentlich buchbare Gruppenarbeitsräume:
[ITMZ und Bibliothek](https://www.hs-coburg.de/news/tag-der-bibliotheken-auf-einen-kaffee-ins-itmz/).
Die Veröffentlichung stammt von 2022 und ist kein aktueller Belegungsplan.
[Studienorganisation](https://www.hs-coburg.de/studieren/studienorganisation/)
verweist für Hochschul-Onlinedienste auf das authentifizierte myCampus.
Eine öffentliche Belegungs-API oder ein Raumkalender konnte in der Recherche
nicht verifiziert werden.

## Ablauf in UniOS

Unter Mehr → Organisation → Räume & Buchung, in der Suche oder über die
anpassbare Seitenleiste erreichbar. Datum mit Wochentag und Tagespfeilen,
Personenzahl, Raum, Startzeit und Dauer werden gemeinsam vorbereitet.
Die vom Nutzer gezeigten Startzeiten reichen in 30-Minuten-Schritten von
08:00 bis 21:30; Dauern von 30 bis 180 Minuten. Diese Auswahl ist keine
Aussage über Öffnungszeiten, Raumkapazität oder verfügbare Termine.

Die Desktop-App öffnet ein eigenes offizielles Hochschulfenster ohne UniOS-
API-Rechte. Der Nutzer meldet sich dort selbst an. Auf seinen Knopfdruck
werden nur eindeutig beschriftete sichtbare Formularfelder befüllt; kein
Klick, Absenden oder Change-Event wird ausgelöst. Die Schritte der Hochschule
bleiben vom Nutzer zu bedienen. Unbekannte Felder müssen dort manuell
ausgefüllt werden.

„Angebot lesen“ übernimmt ausschließlich die sichtbare Überschrift, den Satz
„Der Raum … steht zur Verfügung.“ und das Vorhandensein des aktivierten
Buttons „Raum verbindlich buchen“. Das Angebot muss zu Datum, Uhrzeit,
Dauer und gewähltem Raum passen. Der Jahreswert kommt aus der eigenen
Datumsauswahl, da die Hochschulüberschrift nur Tag und Monat nennt.
Ein Angebot ist keine Reservierung. Den verbindlichen Abschluss führt der
Nutzer ausschließlich im Hochschulfenster aus.

Der Zeitpunkt bezeichnet das Lesen der sichtbaren Seite, keinen neuen
Serverabruf. Nach zwei Minuten erscheint eine Erinnerung zur erneuten
Prüfung im Hochschulfenster. Diese Frist ist eine UI-Erinnerung und keine
vom Anbieter zugesicherte Gültigkeit. Anmeldung, unklare Seiten oder
fehlende Angebote werden niemals als „belegt“ oder „frei“ ausgegeben.

Browsernutzer erhalten einen direkten Link zum offiziellen Dienst.
Andere Hochschulprofile ohne geprüften Anbieter zeigen keine Coburger
Raumliste. Ein älterer UniOS-Server kann die Konfiguration über sein
authentifiziert gewähltes Hochschulprofil liefern; fehlende Anmeldung
wird dabei nicht umgangen.

## Vergleich von Räumen und geprüften Zeiten (03.10.2026)

Die Übersicht zeigt alle konfigurierten Räume für genau das gewählte Datum,
Startzeit, Dauer und die Personenzahl. Ein gelesenes, passendes offizielles
Angebot wird mit Quelle und Lesezeit angezeigt. Andere Zeiträume, Teilintervalle,
Personenzahlen oder Räume werden daraus niemals als frei abgeleitet.

Die vorhandenen Screenshots belegen keine Meldung für einen bereits gebuchten
Raum. Deshalb wird kein Ablehnungstext des Anbieters geraten. Bis eine solche
Meldung anonymisiert geprüft ist, kann der Nutzer eine ausdrücklich im Portal
angezeigte bestehende Buchung für einen konkreten Raum und Zeitraum bestätigen.
Die Übersicht nennt dies „Buchungskonflikt“ und kennzeichnet die Quelle deutlich
als „Von dir bestätigt“. Fehlendes Angebot, Loginfehler, Schließzeit oder
fehlende Daten reichen nicht für einen solchen Eintrag aus. Ein Konflikt bedeutet
nur, dass die angefragte Auswahl an einer bestehenden Buchung scheitert, nicht,
dass jede Minute des gesamten Intervalls belegt ist.

Geprüfte Zeiten des gewählten Tages bleiben als anklickbare Liste erhalten.
Nach zwei Minuten werden beide Statusarten als ältere Prüfung angezeigt; der
frühere Status bleibt nachvollziehbar. Erneutes Lesen einer unveränderten Seite
ist weiterhin kein neuer Serverabruf. Vor dem Buchen muss im Portal erneut
geprüft werden. Maximal 100 Beobachtungen verbleiben nur im Arbeitsspeicher bis
zum Neuladen/Schließen; keine Speicherung im Server, kein geräteübergreifender
Belegungsfeed, keine Namen anderer Buchender.

Ein vollständiger Tagesplan erfordert einen vom Anbieter bereitgestellten
Kalender/API oder eine verifizierte lesbare Belegungsansicht. Ein Raster aus
geratenen freien Zeiten oder automatisch durchgeklickte Buchungsformulare wird
nicht verwendet. Die echte Ablehnungsseite und eine eventuell vorhandene
Belegungsansicht müssen noch durch den Nutzer überprüft werden.

## Noch nicht verifiziert

Formularattribute, Kategorie- und Einzelraum-Prüfpfad sowie freie Antworten
sind mittlerweile durch die bereitgestellten Aufzeichnungen belegt. Eine
abgeschlossene Buchungsbestätigung und eine echte Belegt-Antwort fehlen weiter.
Eine automatische Übernahme als reservierter Kalendertermin und ein
vollständiger Belegungsplan sind deshalb nicht implementiert.

## Prüfung

pytest prüft Hochschulprofile und die authentifizierte Kompatibilität mit
älteren Servern. Vitest führt die tatsächlich verwendeten nativen Scripts
gegen erfundene DOM-Strukturen aus: eindeutige Labels, keine automatischen
Events, kein Login-Auslesen und keine versteckten Felder. Playwright prüft
Navigation/Suche, passende und unklare Angebote, abgelaufene Erinnerung,
geschlossene Fenster und nicht unterstützte Hochschulprofile. Das ersetzt
keine Abnahme mit dem persönlichen Hochschulkonto.
