<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Moodle-Warnung und Quizlinks, 0.1.26

Die einfache Systemansicht zeigte eine Warnung als „Prüfung fehlgeschlagen“
und den letzten erfolgreichen Abgleich ohne Erklärung. Beide Bedeutungen
sind jetzt ausdrücklich beschriftet. Ein vorhandener Grund wird nur bei
übereinstimmendem Connector und Status eingeblendet. Der Release-Health-
Endpunkt enthält weiterhin ausschließlich begrenzte Metadaten.

Die vier Screenshots stammen aus Playwright mit erfundenen Daten, in Light
und Dark bei 1440 und 390 px. Die geänderte Warnung und Zeitangabe sind lesbar;
die Seite läuft nicht horizontal über. Es wurden keine persönlichen
Hochschuldaten oder hochgeladenen Nutzerscreenshots als Fixtures gespeichert.

Der zusätzliche Kursablauf prüft den anklickbaren Quiztitel, die originale
Moodle-Seitenadresse und das Öffnen in einem neuen Tab. Er besucht keine
echte Hochschule. Die Pythonprüfung synchronisiert sichtbare, versteckte
und unsichere Quizmodule zweimal: nur der sichere sichtbare Link wird
übernommen, ohne Zugangsdaten, Dateiversion oder Testversuch. Neue Moodle-
Abfragen und erratene Öffnungs-/Schließtermine wurden nicht eingeführt.

Mit einem echten Konto manuell prüfbar: Nach dem nächsten regulären
Moodle-Abgleich erscheinen sichtbare Tests im passenden Kursabschnitt.
Den Titel anklicken und die Moodle-Informationsseite vergleichen. UniOS
betätigt „Test versuchen“ nicht. Die Bedeutung einer verbleibenden Warnung
unter „System“ anhand des aktuellen Hinweistexts prüfen; eine erfolgreiche
Anmeldung allein bestätigt nicht jeden Dateiimport.

Validierung: 1.291 Pythonfälle bestanden, zwölf übersprungen; 1.413
Frontendfälle bestanden. Ruff, mypy, Typecheck, Lint, i18n, OpenAPI und Build
bestanden. Der vollständige Browserlauf bestand 495 Fälle; zwei veraltete
Testprüfungen scheiterten, weitere 19 Fälle wurden dadurch ausgelassen.
Nach präziser Auswahl der Warnungsdetails und Warten auf das geschlossene
Anmeldefenster bestanden alle 37 Fälle der betroffenen beiden Specs. Damit
sind alle 516 unterschiedlichen Browserfälle geprüft. Die Programmbinaries
brauchten für die ausschließlich geänderten Testprüfungen keinen Neubau.

Produktquellen und beide Windows-Pakete: Commit 90afebe, Tag v0.1.26.
Testnachlauf: Commit 39ef2dc. GitHub main enthält beide Änderungen. Der
Release bleibt Entwurf, ohne automatischen Updatefeed. Actions-Lauf
38605245256 wurde vor dem ersten Schritt durch die Abrechnungs-/Ausgaben-
begrenzung des Kontos blockiert; dies ist kein bestandener CI-Lauf.

Server 0.1.26 gesund, synthetischer Smoke bestanden, private API ohne
Kopplung 401, Schema unverändert ff99e3b1a721. Voriges Image bleibt erhalten.
Die Docker-Mountliste hat keine stabile Reihenfolge; der Nachvergleich
prüft ihre Bedeutung sowie Netzwerke, Portbindung und Schutzoptionen.
Windows installiert: 2.825 Programmdateien mit identischen Hashes/Größen
an den physischen Zielpfaden; isolierter Start und laufender Client gesund.
Vorhandene Serverkopplung und Schlüsselbund verfügbar. Keine echten
Hochschulanmeldungen oder direkten Zugriffe auf persönliche Zustandsdateien.

Der strukturierte Installationsnachweis und die Paketprüfsummen liegen beim
[GitHub-Entwurfsrelease](https://github.com/EinfachMxrc/unios-app/releases).
Goodnotes/iPad wurde auf Marcs anschließenden Wunsch nicht weiter umgesetzt.
