<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

## Moodle-Aufgabendiagnose vom 15.10.2026

Die Erweiterung muss auf dem aktiven Host/Server installiert sein. Ein Update
nur der Mac-App erweitert keine serverseitigen Diagnosewerte. Nach dem nächsten
regulären Moodle-Abgleich unter System den Moodle-Hinweis prüfen:

- `Moodle-Aufgabendiagnose` nennt angefragte/gelieferte Kursanzahl,
  Warnungsanzahl und höchstens 20 einzelne Warnungen. Weitere Warnungen werden
  ausdrücklich gezählt; die begrenzte Liste ist dann keine vollständige Diagnose.
- Kurs-Code 1: fehlender Zugriff auf den Kurskontext. Kurs-Code 2: keine aktive
  Einschreibung oder erforderliche Berechtigung; diese beiden Ursachen dürfen
  nicht ohne weitere Prüfung auseinandergehalten werden. Aktivitäts-Code 1:
  fehlender Zugriff auf den Aktivitätskontext. Das beweist weder einen
  abgelaufenen Token noch, dass die Aktivität nur verborgen ist.
- Kurs- und Aktivitäts-IDs stammen aus Moodle, nicht aus der UniOS-Datenbank.
  Ist eine Aktivität bereits in der Kursübersicht enthalten, wird ihr Kurs
  zugeordnet. Fehlt diese Information, muss „Kurs nicht zuordenbar“ erscheinen.
  Eine Zuordnung wird nicht geraten. Moodle-Kurs-/Aktivitätsseiten ausschließlich
  selbst über die vorhandene Hochschulanmeldung vergleichen.
- Unbekannte oder fehlerhafte Werte bleiben unbekannt. Rohmeldungen, URLs,
  Tokens und Inhalte werden nicht übernommen. Die Diagnose steht nur im privaten
  Systemstatus, nicht in Logs, Pushnachrichten, allgemeinem Feedbackexport oder
  im beschränkten Release-Health-Bericht. Alte Abgabetermine bleiben erhalten.

Sind alle angefragten Kurse und alle darin für das Konto sichtbaren Aufgaben
geliefert und betreffen die Meldungen ausschließlich nicht sichtbare,
nicht gelieferte Aktivitäten mit Code 1, muss der Abgleich erfolgreich sein.
Unter System bleibt ein sachlicher Hinweis auf die Zugriffsbeschränkungen
sichtbar. Er darf weder eine Fehlermeldung noch eine neue Störungsnachricht
auslösen. Vorhandene Aufgaben und Termine bleiben vorsorglich erhalten;
der vollständige Aufgabenbestand wird dadurch nicht behauptet.

Fehlt dagegen ein Kurs oder eine sichtbare Aufgabe, betrifft eine Meldung eine
sichtbare/gelieferte Aktivität, oder ist ein Code bzw. das Antwortformat
unbekannt, muss der ursprüngliche Warnstatus bestehen bleiben. Bei einem
späteren vollständigen Abgleich ohne Warnungen verschwindet auch der Hinweis.

Die bisherigen Sammelhinweise enthalten keine rekonstruierbaren Einzelgründe.
Die Codezuordnung folgt dem
[offiziellen Moodle-Vertrag für get_assignments](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/assign/externallib.php).
Ein frischer Abgleich mit der Erweiterung ist erforderlich. Keine häufigen
Wiederholungsabfragen und keine automatische neue Hochschulanmeldung zur
Diagnose. Lokale Tests benutzen ausschließlich erfundene Antworten und prüfen
den tatsächlichen Sync sowie die Browserdarstellung.

## Outlook-Browserimport vom 14.10.2026

1. In der installierten Windows-App unter Uni-Mail das Outlook-Fenster öffnen.
   Anmeldung und MFA ausschließlich selbst auf der Hochschul-/Microsoft-Seite
   durchführen. Das Einlesen vor abgeschlossener Anmeldung muss zur Anmeldung
   auffordern, ohne Anmeldeformulare zu bedienen.
2. Nach abgeschlossener Anmeldung unter den E-Mail-Verbindungen „Im eigenen
   Fenster anmelden und lesen“ auswählen. Prüfen, ob sichtbare Nachrichten
   erkannt werden und Betreff, Absender und Datum zur tatsächlichen Mail passen.
   Ein nicht lesbares Datum muss unbekannt bleiben. Fristvorschläge weiterhin
   selbst prüfen; keine automatische Übernahme als bestätigte Frist.
3. Erneut einlesen: dieselbe erkannte Nachrichtenzeile darf kein Duplikat
   erzeugen. Outlook-Zeilenkennungen können sich ändern; eine vollständige
   oder dauerhaft stabile Deduplizierung ist dadurch nicht bestätigt.
4. Während eines Lesedurchgangs keine eigenen Postfachänderungen ausführen.
   Die native Sperre blockiert POST/PUT/PATCH/DELETE; sie kann deshalb auch
   von Outlook für Lesezwecke verwendete POST-Aufrufe blockieren. Wenn nichts
   oder nur ein Teil erkannt wird, den angezeigten Status prüfen und nicht
   als vollständigen Import ausgeben. Keine Schutzmaßnahmen deaktivieren.
5. Auf Mac/Linux bleibt dieser Windows-Durchlauf nicht verfügbar; ein
   verständlicher Hinweis muss erscheinen. Automatisierte Abnahme verwendet
   erfundene DOMs und Nachrichten, kein echtes Postfach.

## Verbindungswarnungen nach Anmeldung – 0.1.25

Die Anmeldung an echten Hochschulsystemen und ein echter Import bleiben
Marcs manuelle Prüfung. Lokale Fake-Server prüfen Fehlerzuordnung, erneuerte
Anmeldungen und gesperrte Unterlinks; sie beweisen keine aktuelle Gültigkeit
einer Hochschulsitzung.

In der App unter Einrichtung selbst bei myCampus anmelden und „Anmeldung
übernehmen“ wählen. Ein alter Anmeldefehler muss verschwinden; ein neuer Import
darf weiterlaufen. Anschließend „Erneut einlesen“ wählen. Ein ausschließlich
gesperrter Unterlink muss als teilweise nicht lesbar erscheinen, ohne eine
lesbare Einstiegsseite als abgelaufene Anmeldung zu bezeichnen. Wenn die
Einstiegsseite tatsächlich eine Anmeldung verlangt, muss der entsprechende
Hinweis bleiben. Schutzmaßnahmen weder umgehen noch automatisch beantworten.

Moodle selbst erneut verbinden. Nach erfolgreicher Tokenprüfung muss der
vorherige Tokenfehler verschwinden. Ein Fehler beim Laden einzelner Dateien
bleibt davon unabhängig sichtbar. Unter „Heute“ dürfen myCampus-/andere
Connectorfehler nicht als Moodle-Fehler beschriftet sein. Pausiertes Moodle
darf keine aktive Moodle-Verbindungswarnung erzeugen. Keine Zugangsdaten,
Sessionadressen oder persönlichen Inhalte für die Dokumentation kopieren.

## Direkt bearbeitbarer Kalender – lokales Paket vom 09.10.2026

Noch nicht in einem neuen Installer oder Serverimage aktiviert. Nach späterer
Installation auf dem MacBook einen eigenen Testtermin erstellen, in der Woche
auf einen anderen Tag ziehen, Beginn/Ende am Rand verändern, Escape und
Rückgängig testen. Nach Reload gleiche Position prüfen. Alt/Option+Pfeile
verschieben Tag/Zeit; Shift+Alt/Option+oben/unten verändert das Ende. Prüfen, ob
die tatsächliche deutsche Tastatur oder ein OS-Kürzel kollidiert; alle Änderungen
sind auch im sichtbaren Terminformular möglich.

Two-Finger-Scroll und Pinch müssen Inhalt am Pointer erhalten. Ein kurzer Klick
darf keinen Drag auslösen; Randscrollen muss die Vorschau korrekt mitnehmen.
Bei einem Hochschul-Testtermin persönliche Anpassung und Originalzeit vergleichen,
„Original wiederherstellen“ und Undo prüfen. Keine Originaldaten im Portal ändern.
Auf dem Handy das Datums-/Zeitformular, Fokus und virtuelle Tastatur prüfen.
Mit Screenreader Beginn/Ende, Speicherfehler, Originalhinweis und Undo testen.
Automatisierte Fixtures und [Screenshots](qa/calendar-editing-20261009/README.md)
belegen die Logik, aber nicht die tatsächliche Mac-Trackpad-/Screenreader-Ergonomie.


## Schnelle Lernwerkzeuge – lokales Paket vom 07.10.2026

Die [Kurzanleitung](STUDY_TOOLS.md) beschreibt die eingebauten Helfer. Noch
keine neue Desktop-/Serververöffentlichung installiert. Folgendes auf dem
echten MacBook in Safari/Chrome und dem installierten WebView prüfen:

- Mitschrift ohne Maus: `/bruch`, Tab zwischen Zähler und Nenner,
  ⌘+Enter, direkt weitertippen. `/matrix` mit 3×2 Zellen, Option+Tab für eine
  neue Spalte und Option+Enter für eine neue Zeile. Prüfen, ob die tatsächlich
  verwendete deutsche Tastatur oder ein OS-Kürzel kollidiert. Bei einer
  Kollision das sichtbare Werkzeug verwenden und die genaue Kombination melden.
- Zehn Minuten einer eigenen Vorlesung mit Brüchen, Ableitungen, Mengen und
  mehrzeiliger Rechnung mitschreiben. Auslassungen und Korrekturzeit mit dem
  eigenen handschriftlichen Ablauf vergleichen; Unterrichtstempo wurde durch
  die automatischen Windows-Tests nicht belegt.
- Ein langes eigenes PDF mit Two-Finger-Panning und Pinch-Zoom bearbeiten,
  Textzitat und Bildausschnitt übernehmen. Quellenlink muss ursprüngliche
  Version, Seite und Rechteck zeigen. Bei Verbindungsabbruch muss der Entwurf
  erhalten bleiben und der Ausschnitt per Tastatur erneut übernehmbar sein.
- `/bin` und `/hex` im Unterricht benutzen, dann `/kv`: Tab/Leertaste für
  Zellen, gültige Gruppen und Randübergänge. DNF/KNF mit eigenen kleinen
  Aufgaben vergleichen. Nicht vollständige Gruppen müssen als solche erscheinen.
- `/ueben` mit einer Formel in der Lösung anlegen, speichern und neu öffnen:
  Lösung verdeckt. Frage und Lösung später bearbeiten. Dieselbe visuelle
  Formeleingabe in einer vorhandenen Übungsantwort verwenden.
- Einen Diagramm-, Statistik-, Quellen-, Projekt- und Codeablaufbaustein
  speichern, neu öffnen und exportieren. Markdown enthält Formeln/Tabellen und
  den lesbaren JSON-Quelltext der interaktiven Bausteine. Fremde Markdown-Apps
  müssen die Bausteine zumindest als Code erhalten.

## Mehrfenster-Lernen – Entwicklungspaket vom 07.10.2026

Automatische Abnahme und genaue Grenzen:
[QA-Bericht](qa/study-recovery-20261007/README.md). Ausschließlich synthetische
Bestände wurden migriert; vor echter Migration Marc geprüften Snapshot erstellen.

- Auf einem echten MacBook in Safari/Chrome und im installierten WebView denselben
  Kartenentwurf in zwei Fenstern öffnen. Unterschiedliche Fragen schreiben,
  beide Fenster neu laden. Beide Texte müssen unter aktiver/gesicherter Fassung
  erreichbar sein; Übernahme muss bewusst möglich sein. Lange Frage/Antwort auf
  390 px lesen, Konfliktaktion und feste Aktionszeile per Tastatur erreichen.
- Fähigkeitshinweis prüfen: Ohne Web Locks bleiben IDB-Entwürfe lokal editierbar;
  eigener Server-Save ist gesperrt. Ohne sichere IDB-/Lock-Koordination darf keine
  ältere Kopie als erfolgreich gespeicherter neuer Stand angezeigt werden.
- Zwei Decks parallel offline bewerten, beide Fenster neu öffnen und später
  verbinden. Beide ursprünglichen Bewertungen müssen genau einmal ankommen.
  Bei unklarer Antwort erneut senden, ohne Bewertung oder UUID neu zu erzeugen.
- Eine Bewertung mit künstlich unterbrochener SQL-Verbindung nur im eigenen
  isolierten Testbestand prüfen. Anki bestätigt einmal; Neustart/identischer Retry
  repariert den Lernverlauf mit ursprünglicher Zeit. Sofort zu Lernen zurückkehren:
  Themenzähler und Wochenstand müssen aktualisiert sein.
- Einen eigenen Kartenimport im isolierten Bestand mit neuer nativer Notiz-ID
  prüfen. Quelle und vorhandene Fortschrittsidentität müssen erhalten bleiben;
  unklare/doppelte GUID-Zuordnung muss sichtbar abgewiesen werden. Synthetischer
  Datenbank-ID-Wechsel ersetzt keine Live-APKG-Importabnahme.
- Während eines gehaltenen Kartensaves eine andere Serververbindung koppeln.
  Nach spätestens 30 Sekunden kann die Sperre freigegeben werden; ein unklarer
  alter Request bleibt erhalten. Alte Entwürfe dürfen nicht an den neuen Server
  gesendet werden. Bei abgelehntem Token (401 vor dem Speichern) bleibt die alte
  Verbindung nutzbar; unklare Kopplungsantworten sperren alte Writes bis zur
  erfolgreichen erneuten Kopplung. Fehler bei lokaler Namespace-Rotation prüfen.

## Eigene PDF-Lernkarten – Entwicklungspaket vom 07.10.2026

Vor einer Migration eines echten Bestands einen geprüften Snapshot erstellen.
Die lokale Abnahme verwendet ausschließlich synthetische PDFs und Collections;
reale externe Anki-Kommunikation und native Gerätebedienung bleiben zu prüfen.

- Auf MacBook und Handy eine gespeicherte Markierung als Lernkarte öffnen,
  eigene Frage/Antwort eingeben und das Fenster zwischen Desktop und Mobilgröße
  wechseln. Genau ein Dialog besitzt den Fokus; Kommentar und Recall-Position
  bleiben nach dem Schließen erhalten. Lange Quellenbezeichnungen umbrechen.
- Einen Entwurf offline ändern, die App neu öffnen und die Texte prüfen. Bei
  unklarer Speicherantwort denselben Request wiederholen: genau eine Karte.
  Bei angezeigter Quellenänderung die Vorschau prüfen und ausdrücklich übernehmen.
- Unter **Lernen → Eigene Lernkarten** auch bei ausgeblendeten KI-Bereichen eine
  gespeicherte Karte öffnen. Im integrierten Modus wiederholen und den Quellenlink
  prüfen: eine spätere neue PDF-Version oder verschobene Markierung verändert
  den ursprünglichen Quellenbezug nicht.
- Im externen Modus Anki Desktop zunächst schließen. Die Karte bleibt gespeichert
  mit „Übernahme ausstehend“. Den aktualisierten Agent aus `clients/anki_agent`
  verwenden, Anki öffnen und genau eine Übernahme prüfen. Alte Agenten erhalten
  weiterhin KI-Karten; eigene Karten erfordern `manual-guid-v1`. Einen Retry
  ausführen und mehrzeiligen Klartext mit `<T>` und `&` in Anki vergleichen.

Automatische Resultate: [QA-Bericht](qa/manual-source-cards-20261007/README.md).

## Reader und Mitschrift – Entwicklungspaket vom 07.10.2026

- Auf einem echten MacBook im installierten Webview sowie in Safari/Chrome ein
  langes eigenes Test-PDF öffnen. Auf Seite 80 Pinch hinein/heraus, diagonales
  Two-Finger-Panning und Momentum prüfen. Die Stelle unter dem Cursor soll
  erhalten bleiben; der fertige Canvas darf während der Geste nicht verschwinden.
  Browser-Zoom außerhalb des PDF-Viewports muss normal funktionieren.
- Alt plus horizontales Two-Finger-Wheel bewusst für genau einen Seitenwechsel
  verwenden. Eine lange Auslaufbewegung darf nicht mehrere Seiten überspringen.
  Safari-Gesten dürfen nicht gleichzeitig einen zweiten Ctrl-Wheel-Zoom auslösen.
- Mitschrift öffnen, Split per Pointer und Tastatur vergrößern/verkleinern,
  Fenster unter 1.100 px verkleinern und wieder erweitern. Quellenstelle,
  eigenen Entwurf und Fokus prüfen; auf 390 px die primäre Save-Aktion erreichen.
- Während eines langsamen Saves eine neue Passage und einen neuen Kommentar
  eingeben; die alte Antwort darf neueren Text nicht löschen. Reader schließen
  und vollständige Neuanlage öffnen: innerhalb derselben App-Sitzung darf nur
  eine Create-Anfrage für dieselbe Quelle laufen.
- Nach erfolgreichem Speichern den Quellenlink im lesenden Notizeditor öffnen:
  exakte PDF-Fassung und Seite müssen innerhalb der App erreichbar sein.
  Wiederholen darf das Quellzitat erst nach „Antwort aufdecken“ zeigen.
- Native Kontextmenüs für Texteingabe, PDF-Textauswahl und Links unter Windows
  und macOS prüfen. Die globale Webview-Sperre wurde entfernt; der Browser-E2E
  beweist dieses native Verhalten nicht.

Die automatischen Tests verwenden synthetische Dokumente. Sie ersetzen keine
Hardware-/Touch-/Webview-Abnahme und keine Nutzerstudie. Die Save-Ablage schützt
Remounts in einer App-Sitzung, bietet aber nach vollständigem Reload oder
verlorener Serverantwort noch keine garantierte Backend-Idempotenz.

## Start und Stundenplangruppen – 05.10.2026

- Windows-Update: `_internal` neben `uniosd.exe` vollständig installiert. App
  beenden und öffnen, Client-Health und gekoppelte Verbindung prüfen. Fenster
  vorhanden bedeutet noch nicht, dass die Oberfläche fertig dargestellt ist.
- Ein App-Update beendet auch laufende stdio-Work-Begleitprozesse, weil Windows
  ihre Programmdateien sperrt. Anschließend Codex neu öffnen, falls die bestehende
  MCP-Verbindung „Transport closed“ meldet. Die gespeicherte Einrichtung bleibt
  erhalten. Das neue installierte Programm ist mit initialize/tools-list in einem
  leeren Testprofil geprüft; dieser Nachweis ersetzt nicht die Neuverbindung der
  bereits laufenden Codex-Sitzung.
- Termine → Kalenderverbindung verwalten → Meine Zeitslots: eine alternative
  Gruppe ausblenden, neu laden und Heute/Studientag/persönlichen iCal prüfen.
  Andere Fächer behalten; Raumwechsel und Sommerzeit ändern die Auswahl nicht.
  Neue oder zeitlich verschobene Slots bleiben zur Prüfung sichtbar. Keine
  Änderung der tatsächlichen Einschreibung; Originaltermine werden erhalten.

## Nächster Alpha-Kandidat: frische Geräte und externe Testwoche

Je Kandidat Commit, Paketversion, SHA-256, Betriebssystem, CPU/RAM, Serverversion
und Zeitpunkt festhalten. CI vollständig manuell auslösen; Paketbau nur am
unveränderten geprüften Commit. Neuer Commit benötigt neue vollständige Matrix.
Alpha1 nicht umtaggen oder ersetzen.

### Geräteabnahme

Je frischem Windows-, macOS- und Linux-Zielgerät getrennt protokollieren:

- Ohne Entwicklungsumgebung installieren, Demo ohne Terminal öffnen.
- Eigenen HTTPS-Server koppeln, Gerät widerrufen und erneut koppeln. Niemals
  Zugang zu Marcs Server oder persönlichem Hochschulbestand verteilen.
- Unterlage finden, PDF lesen, Notiz sichern, Karte bewerten. Zeit bis zum
  ersten eigenen Erfolg und benötigte Hilfen erfassen.
- Netz verlieren/zurückkehren: tatsächliche Offline-Grenzen sehen, ausstehende
  Bewertungen genau einmal übernehmen, Entwurf unverändert erhalten.
- Minimieren, Fullscreen, Sleep/Resume, Zweitmonitor, HiDPI, Shortcuts,
  Dateiverknüpfung, Deep Link prüfen; macOS-Schlüsselbund persönlich bestätigen.
- Vom vorherigen Paket upgraden. Vor echter Datenbankmigration einen frischen
  geprüften Snapshot erstellen und vom Besitzer bestätigen lassen.
- Restore zuerst in getrennter Testinstallation: Dateien, Fassungen, Notizen,
  Bewertungen und Suche nach Neustart gegen Original prüfen. Beschädigten
  Testbestand im Safe Mode öffnen und exportieren.
- Signierung/SmartScreen/Notarisierung und fehlende Plattformpakete ausdrücklich
  als bestanden, offen oder blockiert dokumentieren.

### Suchqualität und Zielhardware

Auf dem Zielserver Text-PDFs, Scans und Office getrennt messen: Dateigröße,
Seitenzahl, Import-/OCR-/Indexdauer, RAM-Spitze, gleichzeitiges Notizspeichern,
Search p50/p95, Snapshotdauer und vollständiger Restore. Der synthetische
775-Seiten-Lauf beweist keine 300-MB-Importleistung oder VPS-OCR.

Mindestens 15 natürliche Fragen vorher mit erwarteten Quellen/Fassungen/Seiten
festlegen. Treffer manuell auf Relevanz, Vollständigkeit, falsche/veraltete Quellen
und Zitate prüfen. Misses erfassen; Fragen nicht nachträglich an Treffer anpassen.
Private Fragen/Inhalte lokal halten, nur anonymisierte Messwerte ins Repo.

### Externe Testwoche

5–10 freiwillige Studierende verwenden denselben Kandidaten eine Woche mit
eigenem Server oder getrennten Demo-Daten. Vorher Zustimmung zur Erfassung
anonymisierter Rückmeldungen einholen; keine automatische Inhalts-/Kontolog-Erhebung.
Pro Tag Erfolg, Blocker, Datenverlust, Bedienhilfe, Offline-/Sleep-Probleme und
Suchfehler erfassen. Blocker korrigieren, relevante Gerätefälle erneut prüfen,
erst danach freigeben. Eine Checkliste ist keine abgeschlossene Nutzerstudie.

## Alpha-Fokus und Corpus-Ausbau (Entwicklung nach Alpha1)

- Neues Profil: Heute, Kurse, Lernen, Termine; mobil dieselbe Reihenfolge plus Mehr.
  Bestehendes angepasstes Profil: Reihenfolge bleibt erhalten. Über Seitenleiste
  anpassen → Standard wiederherstellen den neuen Standard prüfen.
- Weitere Bereiche: Räume/Mensa/Notizen direkt, Verbindungen und Werkzeuge zunächst
  geschlossen. Nach Öffnen bleiben KI-Freigaben, Aufträge und System erreichbar.
- Auf Windows Strg K, auf macOS ⌘ K; Escape schließt die Palette. Textzoom,
  schmale Fenster und vorhandene benutzerdefinierte Kursverknüpfungen prüfen.
- Eine Notiz ändern, lokal sichern, neu laden und gespeicherten Entwurf öffnen.
  Nach einem echten Netzwechsel/Sleep darf der Editor keine leere Fehlerseite
  zeigen. Zwei widersprechende Änderungen bleiben bis zur bewussten Entscheidung
  getrennt; keine automatische Übernahme einer Seite.
- Nach Installation/Serverupdate die bestehende Work-Verbindung erneut verwenden:
  Quellen suchen, begrenzten Batch abrufen, Freigabe entziehen, dieselbe Suche
  wiederholen. Keine alten freigegebenen Treffer aus dem Cache ausgeben.
  Fehlendes aktuelles Semester bleibt sichtbar unbekannt; alte Semester explizit suchen.

Lokale Prüfungen verwenden nur Fake-Daten. Echte Betriebssystem-/Hochschul- und
Work-Produktverbindungen bleiben manuelle Abnahme. Der vorhandene Alpha1-Installer
enthält diese Entwicklungsänderungen noch nicht; siehe [Alpha-Fokus](ALPHA_FOCUS.md).

## Benachrichtigungsglocke (04.10.2026)

- Glocke auf Heute öffnen: kleines Fenster mit kurzen Vorschauen; die Seite
  bleibt geöffnet. Ein Klick auf eine Vorschau öffnet den zugehörigen Bereich.
- „Alle als gesehen markieren“ entfernt den Glockenzähler und den Hinweis auf
  neue Unterlagen auf Heute. F5 darf die bestätigten Hinweise nicht zurückbringen.
  Später eintreffende Meldungen und Dokumente erscheinen wieder als neu.
- Escape und Außenklick schließen das Fenster; über „Alle Benachrichtigungen
  ansehen“ bleibt die vollständige Übersicht zugänglich.
- Lesestatus von Benachrichtigungen liegt auf dem Server. Für Portalimporte
  ohne eigene Meldung verwendet Heute ergänzend den bisherigen lokalen
  Gesehen-Stand des Geräts. Die Sammelbestätigung erfasst auch diese Hinweise.
- Bei fehlender Schreibberechtigung ist die Sammelbestätigung deaktiviert;
  Vorschauen und Details bleiben lesbar. Bei einem Abruffehler bleiben die
  Zähler erhalten und eine Fehlermeldung erscheint im Fenster.


## Agent Gateway v2 (0.1.17)

Nach geprüftem Snapshot und VPS-Update:

1. KI → Quellenindex öffnen. Der erste Aufbau darf im Hintergrund laufen; Fehler
   sind als Anzahl sichtbar. Einen bewussten Neuaufbau über Aufträge starten.
2. Work-Verbindung neu starten. Genau `search`, `fetch`, `outline`, `context`,
   `graph`, `changes`, `act`, `jobs` erwarten. Keine Originaldateien nacheinander öffnen.
3. Einen freigegebenen Kurs suchen, Inhaltsverzeichnis abrufen und eine bekannte
   PDF-Seite über den erhaltenen Handle holen. Titel/Seite/Version mit Original prüfen.
4. Unter KI den Kurs sperren; denselben Handle erneut abrufen. Zugriff muss sofort
   verweigert werden. Notizen/Code/Übungen/Lernkarten bleiben ohne zusätzliche Freigabe aus.
5. Eine Testnotiz freigeben/ändern. `changes` liefert ein neues Ereignis; ein alter
   exakter Handle bleibt nachvollziehbar, aktuelle Suche nimmt die neue Fassung.
6. Bei kleinem Budget alle Fortsetzungen folgen. Kein Abschnitt darf übersprungen
   werden. Budgetangabe ist UTF-8-JSON-Größe, keine modellgenaue Tokenzahl.
7. Quellenlink im gekoppelten UniOS öffnen; ohne Gerätesitzung muss er geschützt sein.
8. Falls Remote-MCP eingerichtet wird: öffentlichen HTTPS-Ursprung, PIN-/Scope-Dialog,
   PKCE und Work-/ChatGPT-Client prüfen. Alte reine `mcp`-Freigabe erneuern. Nach
   Ausschalten von MCP dürfen auch Remote-Aufrufe nicht mehr funktionieren.
9. Für echte große Skripte Import-/OCR-Dauer, Abbruch, Neustart und Speicherverbrauch
   messen. Der 50022-Dokumente-Test verwendet synthetischen, schon extrahierten Text;
   er ersetzt keinen Produktionsbenchmark mit persönlichen Hochschulunterlagen.

Die oben genannten echten Quellen-/Work-/Mehrgeräte-Abnahmen sind nicht durch die
Fake-Server-Tests oder durch das Vorhandensein des MCP-Overlay erledigt.

## Raumbuchung 0.1.16

Ergänzung automatischer Abruf (Quellstand nach 0.1.19, neues Desktop-Build nötig):
Nach persönlicher Anmeldung im Hochschulfenster direkt „Verfügbarkeit prüfen“
verwenden, ohne die Formularschritte vorher durchzuklicken. Für einen bekannten
freien Einzelraum innerhalb der nächsten 14 Tage Datum/Uhrzeit/Dauer/Personenzahl
mit dem Portal vergleichen; „Abgefragt um“ und „Direkt bei der Hochschule geprüft“
erwarten. Dann „Alle Räume prüfen“; Fortschritt muss nacheinander laufen und
Stoppen darf keinen weiteren Raum anfordern. Eine schon laufende Anfrage kann
noch bis zum Timeout auslaufen. Andere Personen/Zeiten dürfen nicht dieselben
Prüfungen übernehmen. Anmeldung schließen/abmelden und erneut prüfen: Fehler,
kein vorheriges frisches Angebot. Außerhalb der 14 Tage Buchungsregel erwarten,
keinen Belegungsstatus. Die HARs belegen bisher keine echte Konfliktantwort;
für einen nachweislich belegten Einzelraum die Prüfantwort anonymisiert liefern,
ohne den verbindlichen Buchungslink anzuklicken. Unklare Antworten bleiben unklar.

Unter Mehr → Organisation → Räume & Buchung Datum, Personenzahl, Zeit,
Dauer und optional Raum wählen. Das offizielle Fenster öffnen und dort
persönlich anmelden. Pro Formularschritt „Auswahl einsetzen“ prüfen;
unerkannte Felder manuell setzen und „weiter“ selbst drücken. Auf der
Angebotsseite „Raumangebot übernehmen“ benutzen und Datum, Zeit, Dauer und Raum
vergleichen. Nur dort persönlich „Raum verbindlich buchen“ drücken, wenn
die Reservierung gewünscht ist. UniOS zeigt dieses Angebot weiterhin nicht
als bestätigte Reservierung. Eine automatische Terminübernahme benötigt
zuerst eine anonymisierte tatsächliche Buchungsbestätigung.

Loginablauf, originale Formularattribute, konkurrierende Buchung und
Bestätigungsseite sind mit einem echten Konto noch nicht abgenommen.
Nach zwei Minuten oder einer Formularänderung neu prüfen; das erneute
Lesen derselben Seite ersetzt keine Aktualisierung im Hochschulfenster.

Ergänzung Belegungsübersicht: Für einen konkreten Raum einen Zeitraum prüfen,
der laut Portal an einer bestehenden Buchung scheitert. Nur diese ausdrückliche
Meldung über „Die Hochschule meldet den Raum als belegt?“ bestätigen. In der
Übersicht müssen „Buchungskonflikt“, „Von dir bestätigt“ und die Lesezeit stehen.
Ein anderer Raum, eine andere Uhrzeit/Dauer/Personenzahl bleibt unbekannt.
Passendes freies Angebot eines zweiten Raumes übernehmen und beide Prüfungen
in „Geprüfte Zeiten“ vergleichen. Nach zwei Minuten müssen ältere Prüfungen
erkennbar sein. Neuladen beendet diese flüchtige Prüfgeschichte.
Eine anonymisierte Belegt-Meldung und ggf. eine vom Portal angebotene
Belegungsansicht angeben, bevor automatische Erkennung/ein voller Tagesplan
implementiert werden. Persönliche Namen und Kontodaten aus Screenshots entfernen.

# Manuelle Prüfung mit echten Konten

## Neuer Notizeditor: Geräteabnahme

Automatisiert sind Bearbeiten/Speichern, alte Notizen und Konflikte, Blockbewegung,
Tabellen, Checklisten, Verknüpfungen und echte WAV-Wiedergabe mit Fake-Daten geprüft.
Auf Windows, macOS und Linux im installierten Paket zusätzlich IME/Diktat,
Systemzwischenablage und Datei-Drop aus Explorer/Finder prüfen. Code mit `->`,
`<=` und `>=` muss beim Kopieren seine Originalzeichen behalten. Auf dem Mac
⌘B/⌘I/⌘Z verwenden. Audio/Video-Codecs des jeweiligen Webviews, VoiceOver/NVDA/Orca,
200 % Vergrößerung und Fokus nach Medien-/Verknüpfungsdialogen prüfen.
Keine echten Hochschulzugänge sind für diese Prüfung nötig. Diese Änderung
installiert selbst kein neues Desktop-Paket. Format und Grenzen: [NOTE_STUDIO.md](NOTE_STUDIO.md).

Die automatisierten Tests verwenden ausschließlich erfundene oder anonymisierte Daten und lokale Fake-Server. Der echte Moodle-Sync erfolgt nur nach Marcs ausdrücklicher Freigabe; Zugangsdaten und persönliche Inhalte bleiben lokal.

## Vor der Phase-1-Abnahme durch Marc

1. Die von Marc genannte Moodle-Basisadresse `https://moodle.hs-coburg.de` ist in `institutions/hs-coburg.yaml` eingetragen und leitete bei einer anonymen HEAD-Anfrage zur Moodle-Anmeldeseite weiter. Beim eigenen Login prüfen, ob sie zum persönlichen Moodle-Konto führt. PRIMUSS und mycampus sind dort mit den bereits genannten Basisadressen hinterlegt; Hochschulkürzel, Mailserver, Selektoren, öffentliche Fristenseiten und Notensystem sind ausdrücklich noch offen.
2. Im Projektordner den Moodle-SSO-Token selbst einrichten: auf macOS/Linux mit `.venv/bin/python -m scripts.setup_token`, unter Windows PowerShell mit `& .\.venv\Scripts\python.exe -m scripts.setup_token`. Diese Modulform startet auch dann, wenn ein lokaler Python-Einstieg das Projektpaket nicht findet. Der Browser-Login inklusive MFA erfolgt ausschließlich durch Marc. Wenn der Browser die Rückrufadresse nicht öffnet, die vollständige Adresse mit `://token=` verdeckt in das Skript übernehmen; das Schema kann durch die Moodle-Konfiguration vorgegeben sein. Prüfen, ob das Skript Keychain oder den `.env`-Fallback meldet; bei Fallback müssen unter Unix die Dateirechte 600 sein. Unter Windows darf die ACL weder geerbte noch ausdrückliche Berechtigungen für andere Konten enthalten. Falls App oder Skript unter macOS/Linux eine unsichere `.env` ablehnen, eine reguläre Datei im eigenen Benutzerkonto verwenden und mit `chmod 600 .env` schützen; keine Verknüpfung verwenden. Unter Windows kann die Token-Einrichtung die ACL einer eigenen regulären `.env` vor dem Lesen korrigieren. Den Token nicht in Chat, Screenshots oder Git kopieren. Danach auf macOS/Linux `.venv/bin/python -m app.cli.main doctor --pretty` ausführen (Windows PowerShell: `& .\.venv\Scripts\python.exe -m app.cli.main doctor --pretty`) und auf der Systemseite „Gerät prüfen“ drücken: Der Tokenstatus muss `OK` und der lokale Moodle-Sync muss bei erreichbarer lokaler Datenbank als bereit erscheinen. Die Token-Gültigkeit kann erst ein eigener Sync bestätigen. Weitere Diagnosen für Tailscale, Syncthing, Verschlüsselung und AnkiConnect einzeln prüfen; die Mehrgeräte-Übernahme bleibt bis Phase 2 nicht eingerichtet. Danach den Backend-Dienst neu starten.
3. Die echten Moodle-Läufe sind nach der Kalender-Korrektur technisch erfolgreich, und Marc hat die erwartete Kursanzahl sowie die sichtbaren Inhalte bestätigt. Sämtliche lokal gespeicherten Dateiversionen haben die richtige SHA-256-Prüfsumme; gespeicherte URLs und der iCal-Feed enthalten keine sensiblen Queryparameter. Bei künftigem Material weiterhin einzelne Dateien und Kurslinks mit Moodle vergleichen. Auch eine Datei öffnen, bei der Moodle intern weiterleitet, falls vorhanden; bei Weiterleitung auf eine fremde Domain muss der Download ohne Tokenweitergabe abbrechen. Unsichere oder nicht verfügbare Ziele sollen als Text ohne Link erscheinen. Falls Moodle mehr als 50 künftige Termine zeigt, kontrollieren, ob auch spätere Seiten in UniOS erscheinen.
4. Bei einem Kurs mit mehreren Gruppen prüfen, ob unter „Heute“ die Zuordnungsfrage erscheint. Im Kurs jeden Gruppenvorschlag bestätigen oder korrigieren. Fremdmaterial muss unter „Zusatzmaterial anderer Gruppen“ stehen, darf nicht als „Heute neu“ zählen und keine Datei-Pushmeldung auslösen. Die Option „Material anderer Gruppen herunterladen“ deaktivieren, einen neuen fremden Abschnitt abwarten und prüfen, dass dessen Datei nicht geladen wird, die Zuordnungsfrage aber erneut erscheint.
5. Auf diesem Mac ist ein privates ntfy-Topic eingerichtet und der echte Empfang einer neutralen Testmeldung von Marc bestätigt. Der App-eigene Restic-Backup-Aufruf war erfolgreich; das verschlüsselte Archiv wurde vollständig geprüft und getrennt wiederhergestellt. Das Backup liegt bisher auf demselben Mac: Sobald ein externes Ziel vorhanden ist, das Repository dorthin verlagern und die Wiederherstellung erneut prüfen. Auf der Systemseite müssen das schreibende Gerät, die aktuelle Staffelstab-Generation und ein laufender Herzschlag erscheinen. „Jetzt Snapshot erstellen“ drücken und prüfen, dass danach ein gültiger Snapshot mit aktuellem Alter erscheint. Nach höchstens zwei Snapshot-Intervallen (Standard: 30 Minuten) muss sich der Zeitstempel automatisch erneuern. Die Aktion muss auf einem Standby-Gerät gesperrt bleiben. Bei einer eigenen Frist in 7, 3 oder 1 Tagen kontrollieren, ob die Erinnerung auch dann ankommt, wenn der letzte Moodle-Sync fehlgeschlagen ist. Falls der Moodle-Token später ungültig wird, auch während eines Dateiabrufs: Auf der Systemseite muss „Moodle-Token erneuern“ erscheinen und eine Benachrichtigung ankommen; eine Moodle-Fehlermeldung darf nicht als Dateiversion auftauchen. Anschließend den Token lokal erneuern.
6. Den dauerhaft eingerichteten Dienst auf Mac und Windows mit gültiger Moodle-Verbindung außerhalb der Ruhezeit laufen lassen. Auf diesem Mac ist `de.marc.uni-os` als LaunchAgent eingerichtet; nach erneuter Anmeldung `launchctl print "gui/$(id -u)/de.marc.uni-os"` ausführen und `state = running` sowie eine PID prüfen. `http://127.0.0.1:8000/health` und die gebaute Oberfläche auf Port 8000 müssen erreichbar sein. Die Entwicklungsansicht auf Port 5173 läuft nur, solange ihr separater Vite-Prozess gestartet ist. Nach einer Änderung des lokal gespeicherten Moodle-Tokens den Mac-Dienst mit `launchctl kickstart -k "gui/$(id -u)/de.marc.uni-os"` neu starten. Zeitpunkt und Lauf-ID des letzten Syncs auf der Systemseite notieren, das Gerät für länger als das eingestellte Sync-Intervall schlafen legen und wieder aufwecken. Prüfen, ob zeitnah genau ein Nachhol-Sync erscheint und danach der normale Rhythmus weiterläuft. Ein zweiter Versuch innerhalb der Ruhezeit muss erst nach deren Ende synchronisieren. Den Rechner dafür nicht über Nacht eingeschaltet lassen, wenn das nicht gewünscht ist.

Weitere kontogebundene Schritte werden vor der Abnahme der jeweiligen Phase ergänzt.

## Phase 3: Hochschul-Login im sichtbaren Browser

Der Login-Helfer ist derzeit für die Ausführung **auf dem Host-Gerät** vorgesehen. `uv sync --locked --extra portals --group dev` installiert das optionale Python-Playwright-Paket; falls Chromium noch fehlt, `.venv/bin/python -m playwright install chromium` ausführen (Windows: `.venv\Scripts\python.exe -m playwright install chromium`). Der Helfer benötigt einen sicheren System-Schlüsselbund und speichert keine Portal-Session im Projektordner. Es gibt keinen automatischen Login und keine Umgehung von MFA.

Wenn Marc die Hochschulzugänge selbst prüfen möchte, auf dem Host im Projektordner `.venv/bin/python -m clients.login_helper primuss` beziehungsweise `mycampus` ausführen (Windows: `.venv\Scripts\python.exe -m clients.login_helper primuss`). Der Browser ist sichtbar. Falls eine SSO-Weiterleitung im gebündelten Chromium hängen bleibt, kann `--browser chrome` oder `--browser msedge` den jeweils installierten Browser verwenden; ein erfolgreicher Login ist damit nicht garantiert. Für Coburger PRIMUSS startet er bei mycampus; nach der eigenen Anmeldung und MFA einmal **Meine Dienste → PRIMUSS** öffnen. Erst auf der tatsächlichen PRIMUSS-Seite im Terminal Enter drücken. Ist PRIMUSS nicht erreicht, beendet der Helfer den Versuch ohne Session. Der Helfer liest die erreichte Seite ausschließlich per GET und speichert erst danach die Session. Weder Session-URL noch Cookies in Chat, Screenshots oder Fehlerberichte übernehmen. `--status` zeigt nur, ob eine Session vorhanden ist; `--clear` entfernt sie. `--check` prüft einen lesenden HTML-Abruf und verwirft Weiterleitungen zu einem fremden Host oder leere Seiten; er bestätigt noch keine korrekte fachliche Auswertung.

Für anonymisierte Beispiele auf dem **Host-Gerät** den sichtbaren Helfer mit `--sample-output` starten, etwa unter Windows `& .\.venv\Scripts\python.exe -m clients.login_helper primuss --sample-output "$HOME\Downloads\primuss-beispiel.zip"` oder auf dem Mac `.venv/bin/python -m clients.login_helper primuss --sample-output ~/Downloads/primuss-beispiel.zip`. Das Ziel muss ein **neuer** ZIP-Name außerhalb des Projektordners sein. Nach dem eigenen Login bei PRIMUSS und Enter findet der Helfer eindeutige GET-Links selbst. Für Coburger PRIMUSS öffnet er außerdem die geprüften Menüs „Prüfungen“ und „Studium“ selbst. Dabei lässt er nur deren eng begrenzte CGI-Navigationsanfrage mit Sitzungs- und Navigationsfeldern zu; andere schreibende Anfragen werden blockiert. Mit bereits gespeicherter Sitzung kann er ohne erneuten Login über `--sample-from-session <neues-zip>` erneut erfassen. `--sample-pages 1` bis `5` begrenzt die ZIP-Seitenzahl. Rohe HTML-Seiten werden nicht auf Platte geschrieben. Der Export ersetzt sämtliche sichtbaren Texte, URLs, Zeitwerte sowie CSS-Klassen und IDs. Nur die Zuordnung der CSS-Kürzel zu den Originalen landet im sicheren System-Schlüsselbund dieses Hosts. **Das ZIP vor dem Teilen selbst öffnen und prüfen.** Die Alias-ID aus der Ausgabe kann zusammen mit dem anonymisierten ZIP weitergegeben werden; sie ist kein Zugangsschlüssel. Wenn die Selektoren später mit den Kürzeln `anon-c…`/`anon-i…` im Hochschulprofil stehen, trägt `selector_alias_map` diese ID. Auf einem anderen Host ohne dieselbe Schlüsselbund-Zuordnung muss ein neues Beispiel erfasst werden. Falls nur bereits selbst gespeicherte HTML-Dateien vorhanden sind, funktioniert alternativ `python -m clients.portal_sample primuss --input <seite1.html> --input <seite2.html> --output <neues-zip>`; rohe Dateien ebenfalls nie im Projektordner ablegen oder teilen.

Unter „Noten und ECTS → PRIMUSS-Vorschau“ ist ein lesender Abruf vorbereitet. Er bleibt gesperrt, bis die CSS-Selektoren `exams_link`, `exams`, `exam_title`, `registration_status`, `grades_link`, `grades`, `grade_title` und `grade_value` im Hochschulprofil anhand anonymisierter Seiten geprüft sind. Optional können `exam_date`, `registration_deadline`, `grade_ects` und `grade_status` ergänzt werden. `registered_text` und `unregistered_text` müssen beide exakt zu den Portaltexten passen; sonst bleibt der Anmeldestatus „Unklar“. Der Export ersetzt auch diese Texte: Marc muss sie selbst direkt im Portal vergleichen und im Profil eintragen. Termine werden nur aus einem vollständigen `datetime`-Attribut mit Zeitzone gelesen. Nach dem GET-Abruf öffnet die App dieselbe Prüfungsseite mit der gespeicherten Session noch einmal im Browser, blockiert Schreibmethoden und fremde Hosts, vergleicht die erkannten Anmeldungen und speichert erst dann ein PNG mit Zeitstempel unter `DATA_DIR/portal-proofs/primuss/`. Das Bild lässt sich direkt aus der Vorschau öffnen. Dafür muss auf dem Host das optionale Paket `portals` samt Playwright-Chromium installiert sein. Bei Abweichung oder fehlendem Browser wird kein Anmeldestatus als geprüft angezeigt.

Ohne `exam_key_attr` ist dies nur eine Vorschau ohne Prüfungseinträge in der Datenbank. Ein im Portal nachweislich stabiler Zeilenwert aus `id` oder einem `data-*`-Attribut kann als `exam_key_attr` konfiguriert werden; die App speichert ausschließlich dessen Hash. Dann erscheint „Anmeldungen prüfen und speichern“: Der Knopf hängt den geprüften Status samt Zeit und Nachweisbild an die Historie an und legt eindeutig erkannte, noch offene Anmeldefristen im Kalender ab. Bei bestätigter Anmeldung wird die Warnfrist ausgeblendet. Vor dem ersten echten Abgleich einen geprüften Host-Snapshot kontrollieren und danach einen eigenen Prüfungsstatus, die Frist und das Bild direkt mit PRIMUSS vergleichen. Der Knopf nimmt **keine Anmeldung** im Portal vor und speichert keine Noten. Die Bilder enthalten persönliche Portalansichten, gehören zum privaten Datenbestand und dürfen nicht in das Projekt-ZIP oder einen Chat kopiert werden. Fehlen Zeilen oder Werte, ist das keine Bestätigung eines leeren Portals. Für den echten Einsatz bleiben Coburger Seitenstrukturen und das Hochschulkürzel offen. Auch die Session-Übergabe von einem anderen Gerät an den Host ist noch offen. Keine privaten Seiten für Tests im Repository ablegen; nur zuvor selbst anonymisierte Beispiele zur späteren Selektorprüfung bereitstellen.

Der getrennte Knopf „Noten und ECTS abgleichen“ braucht zusätzlich geprüfte `grade_key_attr`, `grade_title`, `grade_ects`, `grade_value`, `grade_status`, `grade_status_passed` und `grade_status_failed`; `grade_attempt` und `grade_status_open` sind optional. `grade_key_attr` muss ein stabiler, je Modul eindeutiger `id`- oder `data-*`-Wert sein. Die Statuswerte müssen dem sichtbaren Portaltext exakt entsprechen, nachdem Marc sie selbst geprüft hat. Der Abgleich liest nur die Notenseite über GET, speichert ausschließlich vollständig erkannte Zeilen und zeigt ausgelassene Zeilen an. Vor dem ersten echten Speichern einen geprüften Host-Snapshot kontrollieren. Danach ECTS, Status, Note, Wiederholungsversuch und Gesamtschnitt direkt gegen PRIMUSS prüfen. Ein im Portal verschwundenes Modul wird nicht automatisch archiviert; Semester und Gewichtung laut Prüfungsordnung werden nicht aus der Seite abgeleitet. Die Oberfläche kennzeichnet übernommene Module als „PRIMUSS“. Der aktuelle Coburger Profilstand lässt den Knopf bewusst gesperrt, bis ein anonymisiertes Beispiel vorliegt.

Unter „Termine → Rückmeldung“ sind nach Prüfung anonymisierter Seiten zusätzlich `enrollment_link`, `enrollment`, `enrollment_key_attr`, `enrollment_title`, `enrollment_status`, `enrollment_deadline`, `enrollment_complete_text` und `enrollment_open_text` im Profil nötig. Der Schlüssel muss für jedes Semester stabil sein; die beiden Statuswerte sind wörtlich aus der echten Seite selbst zu prüfen. Die Frist muss in einem `datetime`-Attribut mit Zeitzone stehen. Vor dem ersten echten Abgleich einen geprüften Host-Snapshot kontrollieren und danach Status, Semester und Frist direkt in PRIMUSS vergleichen. Ein unklarer Text bedeutet ausdrücklich nicht „erledigt“. Der Knopf liest nur und nimmt keine Zahlung oder Rückmeldung vor. Ohne anonymisiertes Coburger Beispiel bleibt er gesperrt. Die öffentliche Fristenseite als zweite Quelle ist noch nicht eingerichtet.

Für mycampus nach eigenem Login ein anonymisiertes Beispiel der Startseite, des Stundenplans, der Veranstaltungsseite und der News-Seite mit dem Login-Helfer erfassen und vor dem Teilen selbst prüfen. Im Hochschulprofil sind pro Teilseite `*_link`, `*` (Zeilen), `*_key_attr` und `*_title` einzutragen; für Stundenplan und Veranstaltungen außerdem `*_start`, optional `*_end`, für News optional `news_published`. Die drei Präfixe heißen `timetable`, `events` und `news`. Schlüssel müssen stabile `id`- oder `data-*`-Werte sein, Termine müssen aus `datetime` mit Zeitzone stammen. Bei Alias-Kürzeln die lokale `selector_alias_map`-ID ergänzen; der Originalname bleibt nur im Schlüsselbund des Hosts. Vor dem ersten echten Speichern einen geprüften Host-Snapshot kontrollieren. Danach neue Termine und News direkt gegen mycampus sowie doppelte Einträge gegen Moodle prüfen. Fehlende Zeilen werden nicht automatisch gelöscht, weil eine Teilseite unvollständig sein kann. Nach geprüfter Profilkonfiguration liest der schreibende Host mycampus auch im normalen Sync-Takt außerhalb der Ruhezeiten; ein manueller Knopf bleibt verfügbar. Ein fehlender oder abgelaufener Login führt nur zu einer neutralen Benachrichtigung und erfordert die erneute eigene Anmeldung am Host. Ohne Coburger Beispiele bleibt der Abruf gesperrt.

Die öffentliche [Coburger Semesterzeiten-Seite](https://www.hs-coburg.de/semesterzeiten/) ist als zweite, allgemeine Quelle im Hochschulprofil hinterlegt. Unter „Termine → Offizielle Semesterzeiten“ können Rückmelde- und Prüfungsanmeldezeiträume manuell neu gelesen werden; der Host versucht dies zusätzlich höchstens einmal täglich. Die Ansicht zeigt nur Kalendertage, keine genaue Uhrzeit und keinen persönlichen Anmeldestatus. Die Endtage erscheinen als ganztägige iCal-Hinweise. Nach einem echten Abruf die angezeigten Daten direkt mit der Hochschulseite vergleichen, besonders bei einem Semesterwechsel. Bei unlesbarer Seite bleiben zuvor gelesene Werte sichtbar und werden als möglicherweise veraltet markiert. Vor der Migration `a583f6e2b941` am echten Bestand einen geprüften Host-Snapshot erstellen.

## Phase 3: Projekte mit eigenen Daten

Vor dem Einspielen der neuen Projektmigrationen `c0f534ab2e17` und `1dca4e0b9f35` auf dem echten Bestand den Host-Dienst stoppen und einen geprüften Snapshot des bisherigen Datenstands kontrollieren. Erst danach `alembic upgrade head` ausführen und den Dienst neu starten. Unter **Einstellungen → Mehr Einstellungen** das Modul „Projekte“ aktivieren. Ein unkritisches Projekt zu einem eigenen Kurs anlegen und nur eine Aufgabe aus genau diesem Kurs zuordnen. Mitglied, Link, To-do und Notiz ergänzen, speichern, die To-do abhaken und das Projekt archivieren und wiederherstellen. Eine unpassende Moodle-Aufgabe muss abgewiesen werden.

Für die GitHub-Ansicht einen auf ausgewählte Repositories begrenzten Fine-grained Token mit **Contents, Issues und Pull requests: Read-only** als `GITHUB_TOKEN` in der privaten lokalen Konfiguration eintragen und den Dienst neu starten. Ein eigenes Test-Repository im Projekt als `Eigentümer/Name` verknüpfen und „Aktivität laden“ drücken. Commits, Issues, Pull Requests, Branches und die Zählung der eingetragenen GitHub-Mitglieder mit GitHub vergleichen. Der Abruf soll keine Änderung im Repository auslösen. Token und persönliche Projektinhalte weder in Tests noch in Chat oder Git teilen. Ohne Token muss die App eine Einrichtungs-Meldung zeigen.

Für die optionale Git-Spiegelung Git lokal mit einem Lesekonto für dieses Repository anmelden; der `GITHUB_TOKEN` für die REST-Ansicht wird dafür nicht verwendet. Nach einem geprüften Host-Snapshot auf der Projektseite „Repository sichern“ drücken. Das erste Manifest unter `DATA_DIR/projects/mirrors/snapshots/` und die Anzeige „Letzte Sicherung“ prüfen. Im Test-Repository einen zweiten harmlosen Commit erstellen und erneut sichern; beide Manifeste müssen erhalten bleiben und der frühere Commit über die Snapshot-Referenz im Bare-Repository erreichbar sein. GitHub darf keinen von UniOS ausgelösten Push zeigen. Vor einem Gerätetausch den vollständigen Syncthing-Abgleich des Spiegelordners abwarten. Bei einem großen Repository zuerst den lokalen Speicherbedarf prüfen; ein realer Mehrgeräte-Abgleich der Git-Dateien steht noch aus.

Nach der Sicherung einen eindeutigen Begriff aus einer unkritischen Repository-Datei suchen und Funddatei sowie Zeile vergleichen. „Gesicherten Code als ZIP herunterladen“ öffnen und prüfen, dass die enthaltenen Dateien dem angezeigten letzten Stand entsprechen. Das ZIP wird nur lokal erzeugt und bewirkt noch keine Moodle-Abgabe. Für MCP die Kategorie „Projekt-Repositories“ zunächst ausgeschaltet lassen und den verweigerten Zugriff prüfen; erst bei Bedarf ausdrücklich freigeben und den Kurszugriff gesondert kontrollieren.

Eine Moodle-Testaufgabe mit diesem Projekt verknüpfen. Auf der Projektseite **„Abgabe aus Projekt vorbereiten“** und danach **„Gesicherten Projektstand als Datei wählen“** drücken. ZIP-Dateiname und kurzer Commit-Stand müssen zur letzten Repository-Sicherung passen. Nach **„Vorgaben und Dateien prüfen“** Größe, SHA-256, Kurs und Aufgabe mit dem heruntergeladenen ZIP vergleichen. Bis zur gesonderten Gesamtbestätigung darf nichts an Moodle gesendet werden. Einen tatsächlichen Sendeversuch nur mit der unten beschriebenen unkritischen Probeaufgabe ausführen; bei geänderter Sicherung oder zu großem ZIP muss die Auswahl abbrechen.

### Phase 3: optionale Moodle-Dateiabgabe

Vor der Migration `7b690dc715cf` den Host-Dienst stoppen und einen geprüften Snapshot des echten Datenbestands kontrollieren. Dann `alembic upgrade head` ausführen und den Dienst neu starten. „Abgabe über die App“ unter **Einstellungen → Mehr Einstellungen** ist zunächst ausgeschaltet. Die technische Prüfung bisher verwendete ausschließlich erfundene Dateien und lokale Fake-Server; eine echte Einreichung wurde nicht ausgelöst.

Für die Abnahme selbst eine harmlose Moodle-Testaufgabe mit Dateiabgabe und einer unkritischen Testdatei auswählen. Den Dateityp, die maximale Anzahl und Größe, Frist, Einreichen-Schritt und eine etwaige Eigenständigkeitserklärung direkt in Moodle ansehen. Erst dann den Schalter aktivieren, im Kurs die Datei auswählen und „Vorgaben und Dateien prüfen“ drücken. Kurs, Aufgabe, Dateiname, Größe, SHA-256, Restzeit und Entwurf/Einreichung mit Moodle vergleichen. Vor „Jetzt an Moodle senden“ die Gesamtbestätigung selbst setzen; falls angezeigt, die Erklärung lesen und selbst anhaken. Danach den Status und die Datei direkt in Moodle mit dem lokalen Ergebnis und dem Archiv unter `DATA_DIR/uni/.../_Abgaben/` vergleichen. Bei einer Aufgabe mit vorhandenem Entwurf oder vorhandener Einreichung muss eine zusätzliche Ersetzungsbestätigung erscheinen; einen solchen Test nur mit einer dafür bestimmten Probeaufgabe machen.

Falls die App „Status unklar“ meldet oder die Vorabprüfung fehlende Moodle-Vorgaben nennt, die Aufgabe direkt in Moodle öffnen und den tatsächlichen Stand prüfen. Den gleichen Versuch nicht erneut senden. Welche Moodle-Metadaten und Upload-Antworten das eigene Konto liefert, muss in dieser Abnahme geprüft werden; fehlende Angaben dürfen nicht durch Schätzwerte ersetzt werden. Den Schalter danach bei Nichtgebrauch wieder ausschalten. Zugangsdaten, Erklärungs- oder Abgabetexte und persönliche Dateien nicht in Chat, Git oder Screenshots übernehmen.

### Phase 3: manuelle Noten und ECTS

Vor der Migration `4e6c2d901ab7` den Host-Dienst stoppen und einen geprüften Snapshot des echten Datenbestands kontrollieren. Danach `alembic upgrade head` ausführen und den Dienst neu starten. Unter **Einstellungen → Mehr Einstellungen** „Noten und ECTS“ aktivieren. Die neue Ansicht zeigt bis zur PRIMUSS-Anbindung ausschließlich selbst ergänzte Module; diese sind als „Manuell“ beschriftet und gelten nicht als amtlicher Notenstand.

Ein unkritisches Probe-Modul mit ECTS, Status „Bestanden“, Versuch und Note eintragen und ein zweites als „Offen“. ECTS-Zähler und den ausdrücklich als ECTS-gewichtet bezeichneten Schnitt nachrechnen. Für das offene Modul eine hypothetische Note eintragen, den simulierten Schnitt ansehen und danach die Seite neu laden: Die hypothetische Note darf nicht als tatsächliche Note gespeichert sein. Wenn Gewichte aus der eigenen Prüfungsordnung vorliegen, diese nur nach eigener Prüfung bei **allen benoteten Modulen** eintragen; erst dann darf die Ansicht „Nach eingetragener Gewichtung“ anzeigen. Mit nur teilweise eingetragenen Gewichten muss sie weiterhin den ECTS-gewichteten Schnitt zeigen. Ein Modul bearbeiten, archivieren und aus dem Archiv wiederherstellen. Persönliche Noten nicht in Chat, Git, Screenshots oder Testdateien übernehmen.

## Phase 2: Syncthing-Ordnerstatus auf eigenen Geräten

Nach eigener Syncthing- und Tailscale-Einrichtung auf jedem Host-fähigen Gerät `DATA_DIR` als Syncthing-Ordner freigeben, die lokale Ordner-ID und den lokalen REST-API-Schlüssel nach `docs/SERVICES.md` eintragen und den UniOS-Dienst neu starten. Auf der Systemseite „Gerät prüfen“ drücken: Bei ruhendem, vollständig abgeglichenem Ordner muss „Syncthing meldet den lokalen Ordner vollständig synchron“ erscheinen. Während eine erfundene eigene Testdatei im `DATA_DIR` noch übertragen wird, muss die Diagnose den Ordner als unvollständig anzeigen. Die Testdatei anschließend auf beiden Geräten auf gleichen Inhalt prüfen. Sollte Syncthing später eine Konfliktkopie im Datenordner erzeugen, muss „Syncthing-Konfliktdatei gefunden; Datenstand manuell prüfen“ erscheinen. Keine künstliche Kollision in `host/lease.json` erzeugen.

Für die geplante Übergabe die Schritte in [SERVICES.md](SERVICES.md) zuerst mit zwei eigenen Host-Geräten und einem unkritischen Testdatenstand durchführen. Der bisherige Host muss nach „Übergabe vorbereiten“ nur noch lesen; auf dem Zielgerät müssen Syncthing und `doctor --pretty` die Übernahme freigeben. Den dortigen Dienst stoppen, `host acquire --pretty` ausführen, neu starten und Kurse, Dateien, Generation und Snapshot prüfen. Anschließend in Gegenrichtung wiederholen. Bei noch aktivem fremdem Staffelstab, unvollständigem Syncthing, veraltetem Snapshot oder Konfliktkopie muss die geplante Übernahme verweigert werden.

Für die **Ausfallübernahme** auf beiden eigenen Geräten die Tailscale-Serve-Adresse als `HOST_HEALTH_URL` gemäß [SERVICES.md](SERVICES.md) eintragen. Mit unkritischen Testdaten erst prüfen, dass das zweite Gerät bei erreichbarem Host, frischem Herzschlag, unvollständigem Syncthing und veraltetem Snapshot im Standby bleibt. Einen tatsächlichen Ausfall nur nach einem eigenen geprüften Snapshot und vollständig synchronisiertem Ordner simulieren; nach Ablauf der eingestellten Schwelle muss das Standby-Gerät automatisch übernehmen und die nächste Generation anzeigen. Den alten Host erst nach Syncthing-Abgleich wieder einschalten: er muss lesend bleiben. Keinen Staffelstab und keinen Herzschlag von Hand ändern.

Für einen **Doppel-Host-Konflikt** nur erfundene Testdaten verwenden. Nach einem geprüften gemeinsamen Snapshot auf dem bisherigen Host eine harmlose Dashboard-Änderung und einen lokalen Fake-Sync ausführen. Optional eine erfundene KI-Antwort in die Outbox legen und die automatische Verarbeitung abwarten. Den Host dann ohne Syncthing-Verbindung weiterlaufen lassen und die Ausfallübernahme auf dem zweiten eigenen Gerät über den dokumentierten Ablauf auslösen. Nach dem erneuten Abgleich muss der unterlegene Host Schreibaktionen verweigern und ein Paket unter `LOCAL_DIR/conflicts/` sowie `DATA_DIR/host/conflicts/` ablegen. Auf dem Gewinner muss „Heute“ die Warnung zeigen; unter **System → Änderungen von einem anderen Gerät prüfen** die Dashboard-Aktion und den Eintrag „Uni-Abgleich“ prüfen, gegebenenfalls auch „KI-Outbox verarbeitet“. Diese internen Vorgänge werden nicht automatisch nachgespielt; ihren tatsächlichen Stand anhand der gesicherten Datenbank und Dateien vergleichen. Die Dashboard-Aktion einzeln übernehmen und danach den tatsächlichen Zustand kontrollieren. Bei einer nicht angebotenen Aktion die Angaben manuell mit der Datenbankkopie vergleichen und den Eintrag einzeln als geprüft bestätigen. **Prüfung abschließen** darf erst nach einem solchen Beleg für jeden Eintrag möglich sein. Danach prüfen, dass die Warnung auf „Heute“ verschwindet, das Paket aber erhalten bleibt. Prüfen, dass eine beschädigte oder unbekannte Syncthing-Konfliktkopie weiterhin Schreibzugriff sperrt. Keine echten Zugangsdaten, Kursdateien oder Paketdateien teilen. Der Ablauf ist mit zwei physischen Geräten noch nicht abgenommen.

Für die Vollständigkeitsanzeige nach diesem Update zuerst auf dem bisherigen Host einen neuen geprüften Snapshot erstellen. Er enthält Länge und Prüfsumme des lokalen Aktionsprotokolls; der zusätzliche lokale Journal-Kopf prüft auch die späteren Einträge. Ältere Snapshots ohne diesen Anker gelten im Konfliktpaket vorsichtshalber als unvollständig. Mit erfundenen Daten prüfen, dass nach einem verlorenen oder gekürzten lokalen Protokoll oder fehlendem `LOCAL_DIR/host-actions.head.json` **„Das Aktionsprotokoll kann unvollständig sein“** erscheint. Automatische Fristwarnungen, Warnungen bei ausbleibendem Sync und der Sonntagsüberblick müssen bei tatsächlicher Ausführung als eigene Vorgänge erscheinen. Solche internen Vorgänge anhand der gesicherten Datenbank prüfen und nie ungeprüft nachspielen.

## Phase 2: Private Offline-Ansichten

Auf einem eigenen Gerät Heute, Kurse, einen Kurs, eine PDF mit Markierungen, frühere Notizen, Fristen, Aktivität und die Suche bei erreichbarem Host öffnen. Warten, bis unter dem Suchfeld „Auch ohne Verbindung durchsuchbar“ steht. Danach die installierte PWA ohne Netzwerk oder bei ausgeschaltetem Host neu starten. Die zuvor geladenen Ansichten müssen lesbar bleiben und „Offline – Stand“ mit Datum zeigen; Semesterzuordnung und Synchronisierung müssen gesperrt sein. Die Systemseite darf keine gespeicherten Diagnosen anzeigen. In der Suche einen **zuvor nicht gesuchten** Begriff aus einer bereits geladenen Unterlage eingeben: Dokument, Kurs und Seite müssen gefunden werden. Ebenso eine markierte Frage oder Schnellerfassung suchen und Kurs- und Semesterfilter prüfen. Nach der erneuten Verbindung die Seiten neu laden und prüfen, ob der Offline-Hinweis verschwindet und frische Daten erscheinen. Der Browser speichert die Ansichten und den Suchstand privat in IndexedDB; auf einem gemeinsam genutzten Gerät das Browserprofil schützen oder dessen Websitedaten nach der Nutzung löschen.

## Phase 2: Arbeiten im Material

Vor der Umstellung eines bestehenden Datenbestands den Backend-Dienst stoppen. **Marc** erstellt dann im Projektordner mit `.venv/bin/python -m app.cli.main host snapshot --pretty` einen geprüften Snapshot und kontrolliert die Erfolgsmeldung. Wenn bereits Markierungen vorhanden sind, den Datenbankstand gegebenenfalls zuerst mit `.venv/bin/python -m alembic upgrade f6b57d5e0a12` auf den Schritt vor der neuen Index-Migration bringen und danach erneut einen geprüften Snapshot erstellen. Dann in dieser Reihenfolge `.venv/bin/python -m app.cli.main migrate-annotations --pretty`, `.venv/bin/python -m app.cli.main rebuild-annotations --pretty` und `.venv/bin/python -m alembic upgrade head` ausführen. Bei einem Bestand ohne Markierungen genügt nach dem Snapshot `alembic upgrade head`. Die neue Migration entfernt Textkontext und Rechtecke aus der Datenbank erst, wenn jeder bestehende Eintrag vollständig im JSONL-Protokoll steht; bei einer Fehlermeldung nicht weiter migrieren und den lokalen Stand prüfen. Der Befehl für alte Markierungen verlangt einen passenden, höchstens 24 Stunden alten Snapshot. Alte Revisionsdateien bleiben erhalten; keine persönlichen Markierungen oder Snapshots ins Repo kopieren. Auf einem zweiten Gerät erst nach vollständig abgeschlossenem Syncthing-Abgleich starten. Unter Windows die Befehle entsprechend mit `.venv\Scripts\python.exe` ausführen.

Ein PDF über **Kurse → Kurs → Im Material arbeiten** öffnen. Eine kurze eindeutige Textstelle markieren, mit Kommentar versehen und als „Verstehe ich nicht“ speichern. Sie muss im Viewer und in der Fragenliste des Kurses erscheinen. Eine zweite Stelle nur hervorheben; beide Originaldateien anhand ihrer Prüfsummen unverändert lassen. Die markierte Kopie herunterladen und die sichtbaren Markierungen prüfen. Eine Frage als geklärt markieren und ihre ältere Fassung unter `DATA_DIR/annotations/` erhalten lassen. Eine später hochgeladene Version derselben PDF prüfen: eindeutiger Text soll wiedergefunden werden. Wenn derselbe Text zweimal auf einer Seite vorkommt, soll der gespeicherte Kontext die richtige Stelle wählen; bei gleichem oder nicht eindeutig zuordenbarem Kontext muss die Markierung zur Prüfung erscheinen. Eine PPTX- und eine DOCX-Datei öffnen und prüfen, ob bei stabil installiertem LibreOffice die abgeleitete PDF-Ansicht erscheint; ohne Konverter müssen Hinweis und Originaldownload sichtbar sein. Auf dem Handy die Textauswahl und den horizontalen Platz prüfen. Falls es frühere Markdown-Notizen gibt, müssen sie über **Frühere Notizen** mit ihren älteren Versionen lesbar bleiben; die Oberfläche darf keinen neuen Editor mehr anbieten. Die alte API für neue eigenständige Notizen muss auf `POST /api/notes` und `PUT /api/notes/{id}` mit 405 antworten. Persönliche Texte nicht in Chat, Git oder Screenshots teilen.

In einem Kurs unter **Verknüpft mit …** nach einem eigenen Material oder einer Schnellerfassung suchen und verbinden. Den Link öffnen, dort den Rückverweis prüfen und die Verknüpfung wieder lösen. Beide Seiten müssen die Änderung zeigen; der Inhalt der verknüpften Objekte darf sich nicht ändern.

Im PDF-Viewer unter **Im Dokument suchen** einen Begriff eingeben, der erst auf einer späteren Seite vorkommt. Die Anzeige muss die Fundseite öffnen. Mit den Pfeilen zwischen mehreren Fundseiten wechseln und auch einen Begriff ohne Treffer prüfen. Die Suche verwendet den auswählbaren PDF-Text; bei reinen Bildscans ist ohne Texterkennung kein Fund zu erwarten.

Unter **Mehr → Eigene Dateien** den angezeigten Drop-Ordner öffnen und eine unkritische eigene Textdatei hineinlegen. Auf der Seite einen Kurs und Abschnitt wählen und die Datei zuordnen. Sie muss im Kurs und in der Suche auftauchen. Im Drop-Ordner bleibt das Original unverändert. Nach einer selbst angelegten geänderten Fassung mit gleichem Dateinamen erneut zuordnen: Eine neue Version muss entstehen, die alte im Kurs abrufbar bleiben. Dateien über 512 MB werden mit einer klaren Meldung abgewiesen.

Unter **Mehr → Wochenüberblick** die Zusammenfassung prüfen: neue Materialien nach Kurs für die vergangene Woche, Fristen für die nächste Woche, Kartenstand und offene Zuordnungen. Vor dem ersten Sonntagslauf wird eine Vorschau angezeigt. Unter **Einstellungen → Mehr Einstellungen** lässt sich die Sonntagsnachricht ausschalten. Bei einem echten Empfangstest am nächsten Sonntag darf der ntfy-Text keine Kursnamen, Fristen, Bewertungen oder Inhalte nennen; er enthält nur einen neutralen Hinweis mit Link zur lokalen oder Tailscale-Ansicht. Der Link ist außerhalb des eigenen Geräts beziehungsweise Tailnetzes nur eingeschränkt nutzbar.

## Moodle-Verbindung in der Mac-App

In der aktuellen UniOS-App „Moodle verbinden“ wählen und die Anmeldung auf der offiziellen Hochschulseite selbst abschließen. Erscheint eine macOS-Schlüsselbund-Freigabe für „uniosd“, diese selbst bestätigen; eine Wartezeit über einer Minute darf die Verbindung nicht mehr als fehlgeschlagen markieren. UniOS zeigt währenddessen „Moodle-Verbindung wird geprüft“ und bleibt bedienbar. Nach erfolgreichem Speichern muss das Anmeldefenster schließen und Moodle als verbunden erscheinen. Eine doppelte Rückmeldung darf keine nachträgliche Fehlermeldung erzeugen. Eine gestartete Anmeldung muss auch nach Neustart des lokalen Dienstes innerhalb von 15 Minuten übernehmbar bleiben. „Anmeldefenster erneut öffnen“ muss eine neue Anmeldung vorbereiten, statt den abgelaufenen Link wiederzuverwenden. Bei abgelaufener Anmeldung neu verbinden; bei verweigerter Schlüsselbund-Freigabe Zugriff erlauben und erneut versuchen. Nach „Moodle aktualisieren“ muss ein erfolgreicher Abruf mit Warnung als „Aktualisierung abgeschlossen – bitte die Hinweise prüfen“ erscheinen. „Hinweise ansehen“ erklärt die Einschränkung; bei eingeschränkter zusätzlicher Änderungsprüfung bleiben die regulär abgerufenen Inhalte sichtbar. Ein tatsächlicher Abruffehler muss weiter als Fehler erscheinen. Keine Tokens, Rückmelde-URLs oder persönlichen Inhalte in einen Fehlerbericht kopieren.

## Phase 1: neue Designkriterien

Mit einer Person ohne Informatikstudium die Startseite öffnen. Ohne Hilfe soll sie erkennen, was neu ist, wann die nächste Frist liegt und ob eine Prüfungsanmeldung vorliegt. Die Antworten, Suchwege und Stolperstellen ohne persönliche Studieninhalte festhalten. Light/Dark auf Desktop und 390 px mit den Referenzen unter `docs/design/` vergleichen; die normale Ansicht darf keine technischen Host-Begriffe zeigen.

## Phase 2: Schnellerfassung

Auf **Heute** oder mit Strg/Cmd+K einen erfundenen Gedanken, eine Frage und ein To-do festhalten. Einen Eintrag bei ausgeschalteter Netzwerkverbindung erstellen, die PWA neu öffnen und unter **Schnellerfassung** prüfen, dass er als vorgemerkt erhalten bleibt. Nach Wiederverbindung muss er genau einmal in den gespeicherten Einträgen erscheinen. Ihn einem Kurs und anschließend einer Notiz zuordnen; unter **Suche** mit einem eindeutigen Wort finden. Auf einem Standby-Gerät muss die Online-Eingabe gesperrt sein. Browserdaten nicht löschen, solange noch Einträge zur Übertragung vorgemerkt sind.

## Phase 2: Moodle-Abgabe prüfen

Mit einer eigenen Moodle-Testaufgabe unter **Kurse → Kurs** „Abgabestatus prüfen“ drücken und den angezeigten Stand direkt mit Moodle vergleichen. Falls möglich nacheinander eine leere Aufgabe, einen Entwurf mit erforderlichem finalem Einreichen, eine eingereichte und eine bewertete Aufgabe prüfen. Abgabeschluss, persönliche Verlängerung, Feedback und bei Gruppenabgaben die ausstehenden Bestätigungen vergleichen. Bei einer eingereichten Datei prüfen, dass sie unter `DATA_DIR/uni/<Semester>/<Kurs>/_Abgaben/` unverändert liegt und SHA-256, Dateigröße, Zeitpunkt und Status im `manifest.json` stimmen. Ein zweiter Check darf keine zweite identische Archivfassung erzeugen. Die App darf bei diesem Ablauf keine Datei hochladen und nichts final einreichen. Wenn Moodle die benötigte Statusfunktion oder Dateiangaben nicht liefert, den Wortlaut der Warnung notieren und den Zustand direkt in Moodle prüfen; keine persönlichen Dateien oder Antworten hier teilen.

## Phase 2: Anki-Übertragung

Mit einem eigenen Anki-Testprofil und laufendem AnkiConnect einen erfundenen Kartenvorschlag importieren, im Dashboard bearbeiten und freigeben. Den [Anki-Agenten](../clients/anki_agent/README.md) einmal ausführen und im Testprofil Deck `Uni::<Kursname>`, Notiztyp `UniOS Basic` beziehungsweise `UniOS Cloze`, Felder, Tags und Quelle prüfen. Eine Karte einmal lernen und den Agenten erneut starten: im Wochenüberblick muss die Bewertung einmal gezählt werden. Ein weiterer Lauf darf weder eine zweite Notiz noch eine zweite Bewertung erzeugen. Vor einer echten Nutzung die eigene Anki-Sammlung sichern.

## Phase 5: Integrierter Lernmodus

Mit einer **Kopie** der eigenen Anki-Sammlung testen: In Anki Desktop ein `.apkg` mit Lernhistorie und Medien exportieren, unter **Mehr → Karteikarten lernen** auswählen, die Vorschau auf Karten und Bewertungen prüfen und anschließend importieren. Eine Karte lernen, das Paket wieder exportieren und in ein separates Anki-Testprofil importieren. Karten, Medien und Review-Historie vergleichen. Der Wechsel zurück zu Anki Desktop stellt das exportierte Paket zum Download bereit; dieses vor der weiteren Nutzung in Anki importieren. Modus B benutzt kein AnkiWeb.

Für den Gerätewechsel zuerst auf beiden Geräten getrennte, gesicherte Testprofile nutzen. Nach einem Host-Snapshot auf Gerät A den Staffelstab auf Gerät B übernehmen und prüfen, dass Karten, Bilder und Bewertungen vorhanden sind. Auf dem Handy eine Karte im Flugmodus bewerten, den Browser geöffnet lassen und nach Wiederverbindung die Anzeige „0 ausstehende Bewertungen“ sowie die neue Host-Statistik prüfen. Bei einem Übertragungsfehler bleibt die Bewertung im Browser gespeichert; Browserdaten dann nicht löschen und den Fehler zuerst beheben.

## Phase 2: KI-Paket

Vor der neuen Migration `b12c4e670a21` einen geprüften Snapshot des echten Datenbestands erstellen, dann den Dienst stoppen und Alembic auf `head` bringen. Unter **Mehr → KI-Paket** einen Testkurs wählen und prüfen, dass das ZIP nur Material aus diesem Kurs enthält. Einen Kurs und danach die Material-Kategorie sperren: in beiden Fällen muss der Export serverseitig mit 403 verweigert werden. Material fremder Gruppen und sensible Kategorien dürfen niemals im ZIP stehen. Die ZIP-Datei enthält persönliche Lernunterlagen; nur in einen bewusst ausgewählten KI-Chat hochladen und nicht in Git speichern.
Unter **Nur ausgewähltes Material verwenden** ein einzelnes Dokument wählen. ZIP und **Pakettext anzeigen** dürfen nur dieses Dokument enthalten. Den Text vor **Text kopieren** lesen und erst dann bewusst in den eigenen KI-Chat einfügen. Mit **Download-Datum ab/bis** einen Zeitraum wählen, in dem nur die neueste Version dieses Dokuments liegt; ältere Dokumente dürfen nicht im Paket stehen. Dann **Zeitraum über freigegebene Kurse** wählen und eine Datumsgrenze setzen: Das Paket darf nur Material der freigegebenen Kurse in diesem Zeitraum enthalten und muss die Kurszuordnung zeigen. Ein gesperrter Kurs, Material fremder Gruppen und älteres Material dürfen nicht auftauchen. Ohne Datumsgrenze muss der Export gesperrt bleiben. Bei einem sehr großen Paket muss die Textfassung mit dem Hinweis auf ZIP abgelehnt werden. Den Kurs oder die Material-Kategorie erneut sperren: Auch Materialauswahl und Textfassung müssen serverseitig verweigert werden.
Eine offene Frage im PDF markieren und anschließend **Offene Fragen erklären** herunterladen. Das ZIP soll nur die Frage, ihre Textumgebung und das zugehörige Material enthalten. Nach Sperren der Fragen-Kategorie muss diese Paketvariante verweigert werden.

Die Migration `c34e1b701d29` für die KI-Outbox erst nach demselben geprüften Snapshot ausführen. Eine erfundene JSON-Antwort nach `DATA_DIR/ai/outbox/` legen und unter **Kartenvorschläge → Jetzt übernehmen** prüfen. Der Vorschlag muss offen bleiben, bis er ausdrücklich freigegeben wird; die Originaldatei muss unter `processed/` erhalten bleiben. Dieselbe Antwort erneut ablegen und prüfen, dass keine zweite Karte entsteht. Eine absichtlich ungültige Datei muss unter `rejected/` samt Fehlerdatei liegen. Alternativ lässt sich eine JSON-Datei direkt über die Dateiauswahl der Warteschlange einlesen.

Die Migration `d9a820f76c14` für das MCP-Zugriffsprotokoll ebenfalls nur nach geprüftem Snapshot ausführen. Die [lokale MCP-Verbindung](../clients/uni_mcp/README.md) zunächst mit erfundenen Kursinhalten testen. Ohne `MCP_ENABLED` oder mit falschem Token muss die Host-API ablehnen. Einen Kurs und die Material-Kategorie sperren: Kursliste, Materialtext und Suche dürfen danach nichts aus diesem Kurs preisgeben. Fristen bleiben bis zur gesonderten Freigabe gesperrt. Im Zugriffsprotokoll muss der erlaubte und verweigerte Zugriff erscheinen.

Für `get_exam_status` und `get_submission_status` die beiden neuen Freigaben unter **Mehr → KI-Paket** zunächst ausgeschaltet lassen: beide Werkzeuge müssen verweigert werden. Mit ausschließlich erfundenen Daten einzeln freigeben, einen Kurs sperren und prüfen, dass nur freigegebene Kurse erscheinen. Die Antwort darf keinen Notenwert, Kommentar, Dateianhang oder Nachweisbild enthalten. Der Abgabestatus stammt aus dem letzten lokal gespeicherten Check und ist kein neuer Moodle-Abruf. Die Freigaben anschließend wieder ausschalten, wenn sie nicht benötigt werden.

Für den optionalen MCP-Fernzugang zuerst die [Einrichtung](../clients/uni_mcp/README.md) mit erfundenen Kursdaten durchführen. Vor Migration `e7d62b0a4c19` am echten Bestand einen geprüften Snapshot erstellen. Einen Testclient über HTTPS anmelden, Programmname und Rücksprungadresse auf der PIN-Seite prüfen, eine absichtlich falsche PIN probieren und dann mit einer neuen Anfrage die richtige PIN verwenden. Einen Kurs und eine Kategorie sperren; der Client darf deren Daten nicht sehen. Im KI-Zugriffsprotokoll muss der Fernzugriff mit Client-Kennung erscheinen. Den Not-Aus betätigen: der nächste `/mcp`-Aufruf muss mit 503 scheitern. Danach den Tunnel abschalten, solange der Fernzugang nicht gebraucht wird. Nur den Fernprozess auf Port 8001 veröffentlichen; den privaten Host auf Port 8000 nie durch den Tunnel leiten.

Für die neue Mail-Tabelle vor Migration `f8a726d31b04` am echten Bestand wieder einen geprüften Snapshot erstellen. Unter **Einstellungen → Mehr Einstellungen** „Uni-Mail“ einschalten, dann unter **Mehr → Uni-Mail** eine unkritische, selbst gespeicherte `.eml`-Nachricht wählen. Absender, Betreff und ein eindeutig formuliertes Fristdatum mit dem Original vergleichen. Vor „Frist bestätigen“ darf unter **Termine** nichts hinzugekommen sein. Datum, Uhrzeit und Titel selbst prüfen und bestätigen; erst dann muss die Frist erscheinen. Eine zweite Auswahl derselben Datei darf keinen zweiten Eintrag erzeugen. Den lokalen Browser-Cache prüfen: die Mail-Liste darf nicht als Offline-Ansicht gespeichert werden; im Aktivitätsverlauf darf nur ein neutraler Hinweis ohne Betreff oder Nachrichtentext stehen. Der automatische Zugriff auf das Coburger Postfach bleibt ausgeschaltet, bis die Hochschule eine lesende Methode und Marc die Absenderregeln bestätigt haben.

Vor der Migration `f6b57d5e0a12` für Übungsvorschläge ebenfalls den geprüften Snapshot des echten Bestands kontrollieren; Dienst stoppen, Alembic auf `head` bringen und erst danach neu starten. Unter **Einstellungen → Mehr Einstellungen** das KI-Modul einschalten. Unter **Mehr → KI-Paket** für einen unkritischen eigenen Kurs „Übungsaufgaben vorschlagen“ wählen und das ZIP auf erlaubte Kursmaterialien prüfen. Eine erfundene, zum enthaltenen Material passende JSON-Antwort unter **Mehr → Übungsvorschläge** einlesen, Frage und Musterlösung bearbeiten und ausdrücklich freigeben. Der Vorschlag darf vorher weder als Anki-Karte noch als gestartete Übung erscheinen. Eine zweite Antwort über `DATA_DIR/ai/outbox/` prüfen: Nach „Jetzt übernehmen“ muss sie als Vorschlag erscheinen und das Original unter `processed/` erhalten bleiben. Dieselbe Datei erneut einzulegen darf keinen doppelten Vorschlag erzeugen. Kurs- und Materialfreigaben testweise sperren und prüfen, dass Paketexport sowie Import verweigert werden. Bei Nutzung von MCP muss `submit_exercises` ebenfalls nur einen prüfbaren Vorschlag anlegen. Persönliche KI-Antworten und Lernmaterialien nicht in Git oder Chat kopieren.

Die Migration `b89d170c2f42` für KI-Erklärungen ebenfalls erst nach dem geprüften Snapshot und bei gestopptem Dienst mit `alembic upgrade head` einspielen. Unter **Mehr → KI-Paket** ein Paket „Offene Fragen erklären“ für einen freigegebenen Kurs erstellen und prüfen, ob `explanation_schema.json` und nur erlaubte Fragen und Materialien enthalten sind. Eine erfundene JSON-Erklärung unter **Mehr → KI-Erklärungen** einfügen oder als Datei wählen: Sie muss zunächst „Zur Prüfung“ bleiben und darf unter **Lernen** noch nicht als Antwort erscheinen. Erst nach Bearbeitung und Freigabe muss sie bei der richtigen Frage angezeigt werden; die ursprüngliche Frage bleibt unverändert. Eine zweite Datei über `DATA_DIR/ai/outbox/` prüfen und die Ablage unter `processed/`, Duplikaterkennung sowie `rejected/` für ungültige Daten kontrollieren. Eine gesperrte Fragekategorie oder ein gesperrter Kurs muss den Import verweigern. Auf dem echten Bestand nur eigene, unkritische Fragen verwenden und keine Antwortdateien ins Repo kopieren.

## Phase 4: Üben

Vor Migration `c1a472d90e6b` einen geprüften Snapshot des echten Datenbestands erstellen, den Dienst stoppen und erst dann `alembic upgrade head` ausführen. Eine bereits freigegebene Übung unter **Lernen → Üben** öffnen. Die Musterlösung darf erst nach Eingabe der eigenen Antwort und „Lösung ansehen“ sichtbar werden. Einen Versuch als falsch mit passender Fehlerart speichern, denselben Aufgabentyp erneut üben und als richtig speichern. Beide Versuche müssen unter **Letzte Versuche** und in der Datenbank mit Antwort, Zeitpunkt, Thema, Schwierigkeit, Dauer und Lösungsweg erhalten bleiben. Einen noch nicht freigegebenen Vorschlag prüfen: Er darf nicht im Übungsbereich stehen. Echte Antworten nicht in Git oder Testfixtures übernehmen.

## Phase 4: Lernstand, Lernblöcke, Kostenrechner und KI-Adapter (26.09.2026)

Vor den drei neuen Migrationen `a1b2c3d4e5f6`, `b2c3d4e5f6a7` und `c3d4e5f6a7b8` einen geprüften Snapshot des echten Bestands erstellen, den Dienst stoppen und danach `alembic upgrade head` ausführen.

Für **Lernstand**: Eine echte Anki-Karte über die Kartenvorschläge freigeben und im echten Anki-Profil mehrfach wiederholen (siehe Phase-2-Abschnitt „Anki-Übertragung“), außerdem dieselbe Anzahl eigener Übungsversuche wie `LEARNING_MIN_REVIEWS`/`LEARNING_MIN_ATTEMPTS` (Standard je 5 bzw. 3) sammeln. Unter **Lernen → Lernstand** muss das Thema danach eine Prozentzahl statt „Zu wenig Daten“ zeigen; die Zahl mit eigener Zählung der Anki-Bewertungen (nicht „Again“) vergleichen.

Für **Lernblöcke**: Ein Thema absichtlich schwach halten (überwiegend falsche Übungsversuche oder schlechte Anki-Bewertungen) und für den zugehörigen Kurs eine echte Prüfung mit Termin innerhalb der nächsten `STUDY_BLOCK_LOOKAHEAD_DAYS` (Standard 14) Tage eintragen lassen (aus Noten/ECTS oder PRIMUSS). Unter **Lernen → Lernblöcke** muss ein Vorschlag erscheinen; nach „Annehmen“ muss der Block im iCal-Feed auftauchen, nach „Verwerfen“ nicht mehr in der Liste stehen.

Für den **Kostenrechner**: Unter „Mehr → KI-Paket“ die angezeigte Zeichen-/Tokenschätzung mit dem eigenen Materialbestand grob plausibilisieren; die Preise in `config/ai_prices.yaml` sind eine Momentaufnahme und sollten vor ernsthafter Nutzung selbst mit dem jeweiligen Anbieter verglichen und aktualisiert werden (`as_of`-Datum entsprechend anpassen). Der Rechner darf nachweislich keine Netzwerkverbindung aufbauen.

Für den **KI-Adapter**: Er bleibt ohne eigenen Anbieter nutzlos und sicher inaktiv (`AI_ADAPTER_ENABLED=false`). Wer ihn später mit einem echten Anbieter verbinden will, muss selbst eine Klasse nach dem `AiProviderAdapter`-Protokoll in `app/ai/adapter.py` schreiben, einen eigenen Schlüssel in `AI_ADAPTER_API_KEY` hinterlegen und ein monatliches `AI_ADAPTER_MONTHLY_BUDGET_TOKENS`-Limit setzen. Vor jeder echten Anbindung selbst prüfen, dass das Budget-Limit vor dem ersten Aufruf tatsächlich greift.

## Phase 3: RFC-3161-Zeitstempel für Abgaben (26.09.2026, optional)

Diese Funktion ist ohne `SUBMISSION_TSA_URL` vollständig inaktiv. Wer sie nutzen will, trägt die HTTPS-Adresse einer eigenen oder öffentlichen RFC-3161-Vertrauensstelle ein und startet den Dienst neu. Nach einer echten Abgabe muss im Archivordner unter `DATA_DIR/uni/.../_Abgaben/...` zusätzlich `manifest.json.tsr` und `timestamp.json` mit `"status": "ok"` erscheinen; die Abgabeseite zeigt Vertrauensstelle und Zeitpunkt. Bei nicht erreichbarer Vertrauensstelle darf die Abgabe selbst weiterhin gelingen, nur `timestamp.json` zeigt `"status": "failed"`. Die Echtheit des Zeitstempels selbst (Zertifikatskette der gewählten Vertrauensstelle) ist Marcs eigene Prüfung; die App verifiziert nur, dass eine Antwort einging.

## Phase 6: Installation und erster Start

Vor den Migrationen `d4e5f6a7b8c9` und `e5f6a7b8c9d0` am echten Bestand zuerst den vorgeschriebenen geprüften Snapshot erstellen und den Host anhalten. Nach dem Upgrade mit einer unkritischen eigenen PDF-Seite prüfen: Ein eindeutig formuliertes zukünftiges Fristdatum erscheint unter **Termine → Terminvorschlag prüfen** mit Seite und Textstelle. Vor „Kalender aktualisieren“ darf keine neue Frist erscheinen. Titel und genaue Uhrzeit prüfen, bestätigen und anschließend in Tabelle und iCal vergleichen. Eine Seite mit zwei unterschiedlichen Fristdaten darf keinen automatisch angelegten Vorschlag erzeugen. Einen neuen Stand derselben Datei mit geändertem Datum prüfen: die bisherige Frist bleibt bis zur erneuten Bestätigung bestehen. Nach dem nächsten Moodle-Sync einen selbst bekannten Forenbegriff unter **Suche** finden; die lokale Suche kann nur Text finden, den Moodle über die API tatsächlich liefert.

Optional installierte Hochschul-Konnektoren nur nach [der Plug-in-Anleitung](CONNECTOR_PLUGINS.md) und zunächst mit erfundenen Daten aktivieren. Die lokale Stichwortsuche für verwandte Notizen ist eine nachvollziehbare Hilfe, aber keine KI-Bedeutungsanalyse; vorgeschlagene Verknüpfungen selbst prüfen. Der Zeitrechner unter **Lernen** verwendet manuell eingegebene Wochenstunden und Aufwand; andere Termine und nicht erfasste Aufgaben sind nicht abgezogen.

Auf einem **frischen** Mac `sh scripts/install-mac.sh`, auf einem frischen Windows-PC `powershell -ExecutionPolicy Bypass -File .\scripts\install-windows.ps1` im heruntergeladenen Projektordner starten. Einmal Host und auf einem zweiten Gerät Zuschauer wählen. Prüfen, dass der Browser unter `http://127.0.0.1:8000/` öffnet und der Hintergrunddienst nach Ab- und Anmeldung erneut startet. Der Zuschauer darf ohne synchronisierten Datenordner keinen eigenen Staffelstab anlegen. Auf bestehenden Geräten vor einer Migration erst Snapshot und Backup prüfen; die Installationsskripte migrieren eine vorhandene lokale Datenbank bewusst nicht.

Im ersten Browserstart Hochschule Coburg bestätigen. Für Moodle den offiziellen Mobile-SSO-Login öffnen und Benutzername, Passwort und MFA nur dort eingeben. Wenn der Browser fragt, „UniOS Login“ öffnen; danach muss der Moodle-Haken ohne Kopieren einer Adresse erscheinen. Falls die Betriebssystem-Rückkehr nicht klappt, die Adresse mit `marcunios://token=` nur verdeckt im Assistenten eingeben. Weder Adresse noch Token in Chat, Screenshots oder Git übernehmen. Unter „Heute“ muss anschließend ein eigener Moodle-Sync möglich sein. Den automatischen Rückruf auf einem frischen Mac und Windows-PC mit eigenem Konto prüfen; bisher ist nur der Ablauf mit erfundenem Token und Fake-Moodle getestet.

Für Handy-Hinweise das vom Assistenten erzeugte private ntfy-Topic auf dem eigenen Handy abonnieren und den Testhinweis senden. Tatsächlichen Empfang prüfen, bevor der Schritt als abgenommen gilt. Alternativ „Ohne Handy-Hinweise starten“ wählen; es darf dann kein Testhinweis versendet werden. Der Assistent soll danach „Heute“ öffnen und beim nächsten Start nicht erneut erscheinen. Mit einer Person ohne Informatikstudium die drei Schritte ohne mündliche Hilfe durchführen und Stolperstellen festhalten, ohne Zugangsdaten oder private Inhalte zu dokumentieren.

## Phase 6: Gerätekopplung (Sitzungs-Authentifizierung)

Seit dieser Änderung braucht jede `/api`- und `/calendar.ics`-Anfrage eine gekoppelte Geräte-Sitzung (`API_AUTH_REQUIRED=true`, Standard). Der eigene Browser auf `127.0.0.1`/`localhost` koppelt sich automatisch beim ersten Aufruf, ohne eigenen Schritt; das lässt sich am gesetzten `unios_session`-Cookie in den Browser-Entwicklerwerkzeugen ablesen (ältere Geräte-Sitzungen mit dem früheren Cookie-Namen `keystone_session` werden automatisch auf den neuen Namen migriert). Ein Zugriff über die Tailscale-Serve-Adresse (`*.ts.net`) koppelt sich **nicht** automatisch, weil dort der Host-Header und zusätzliche Weiterleitungs-Header von einem lokalen Zugriff unterscheidbar sind.

Für ein zweites Gerät (Handy, weiterer Rechner) im Projektordner `.venv/bin/python -m app.cli.main pair --pretty` ausführen (Windows: `& .\.venv\Scripts\python.exe -m app.cli.main pair --pretty`). Die ausgegebene Adresse gilt einmalig zehn Minuten; sie auf dem zweiten Gerät im Browser öffnen, danach ist es dauerhaft gekoppelt. Fünf falsche Versuche mit einem Kopplungscode sperren ihn; ein neuer Befehlsaufruf erzeugt einen neuen Code. Ein Gerät testweise abmelden, indem die zugehörige Sitzung über `GET /api/session/devices` gesucht und mit `DELETE /api/session/devices/{id}` entfernt wird: Der nächste Zugriff dieses Geräts muss wieder eine Kopplung verlangen.

Der iCal-Feed braucht für Kalender-Apps, die keine Cookies mitschicken, einen eigenen Token in der Adresse (`…/calendar.ics?token=…`); die vollständige Adresse liefert `GET /api/session/ical-url` mit gültiger Sitzung. Bestehende, ohne Token gespeicherte Kalender-Abos müssen einmalig durch die neue Adresse ersetzt werden.

Nach einer Host-Übergabe entstehen die Sitzungen neu: Der neue Host kennt die bisher gekoppelten Geräte nicht, da die Sitzungsdatei in `LOCAL_DIR` liegt und bewusst nicht zwischen Geräten synchronisiert wird. Der eigene Browser koppelt sich dort wieder automatisch; andere Geräte brauchen erneut `unios pair`. Nur zu Testzwecken lässt sich die Prüfung mit `API_AUTH_REQUIRED=false` ausschalten; im normalen Betrieb sollte das nicht nötig sein.

## Sprachnotizen auf eigenen Geräten (27.09.2026)

Vor den Migrationen `f4d5e6a7b8c9` bis `f7b8c9d0e1f2` am persönlichen Bestand einen geprüften Snapshot erstellen und den Host anhalten. Danach `alembic upgrade head` ausführen und den Host neu starten.

Auf dem Windows-PC und Mac **Eingang → Sprache** öffnen, dem Browser die Mikrofonberechtigung geben und ein eigenes kurzes Testmemo aufnehmen. Die Wiedergabe vor und nach dem Speichern vergleichen. „Transkript starten“ versucht zuerst deutsche Erkennung auf dem Gerät; falls ein Sprachpaket fehlt, kann der Browser es einmalig installieren. Die Verfügbarkeit hängt vom Browser ab. Den erkannten Text selbst korrigieren, Kurs und Lernthema prüfen und erst dann speichern. Der Text muss unter **Schnellnotizen** und in der Suche auftauchen; eine spätere Korrektur muss dort denselben Eintrag aktualisieren. Ohne lokale Erkennung ist eine Aufnahme ohne Transkript möglich. Die Option für den Browserdienst nur aktivieren, wenn die mögliche Übermittlung von Audio an den Browseranbieter akzeptiert ist. Persönliche Audiodateien nicht in Git, Chat oder Testfixtures übernehmen.
## Laufzeiteinstellungen auf dem eigenen Host (27.09.2026)

Vor Migration `f8c9d0e1f2a3` den persönlichen Datenbank-Snapshot prüfen und den Host anhalten. Nach `alembic upgrade head` den Host starten. Unter **Einstellungen → Ablauf und Erinnerungen** Sync-Intervall, Ruhezeit, Snapshot-Intervall und Fristwarnung prüfen. Änderungen werden ohne Neustart wirksam und mit dem nächsten konsistenten Datenbank-Snapshot auf den zweiten Host übertragen. Zugangsdaten und Webhook-Adressen weiter nur in der Keychain beziehungsweise geschützter Umgebung ändern.

## OCR auf eigenen Geräten (27.09.2026)

Vor Migration `fa25d6e7f809` einen geprüften Snapshot erstellen. Nach dem Upgrade Tesseract mit deutschem Sprachpaket auf Mac und Windows einrichten, wie in [OCR.md](OCR.md) beschrieben. Eine unkritische selbst erstellte Scan-PDF ohne Text im Reader öffnen und **„Text für Suche erkennen“** auslösen. Der erkannte Begriff soll anschließend in der globalen Suche erscheinen; die Originaldatei muss bytegleich bleiben. Eine leere Bildseite darf bei erneutem Aufruf nicht endlos verarbeitet werden. Auf diesem Entwicklungs-PC wurde der Ablauf mit einem Test-Doppel geprüft; Tesseract ist dort noch nicht installiert.

## UniOS-Profil und Connectoren (27.09.2026)

Eine vorhandene Coburg-Installation behält ihre Profilwahl und das bisherige `marcunios`-Rückrufschema. Auf einem **neuen** Gerät startet zunächst das neutrale Profil; Coburg kann im Einrichtungsassistenten gewählt und nach Neustart eingerichtet werden. In System → Erweitert muss das aktive Profil korrekt angezeigt werden. Mit `unios profiles list` und `unios connectors list` nur die öffentlichen Registry-Daten prüfen; keinen unbekannten Python-Connector installieren. Bei einem eigenen geprüften Testpaket muss eine veränderte Domain oder Paketversion die alte lokale Freigabe ungültig machen.

**Neue Profilwahl und Container-Connectoren:** Eine frische Installation kann die Hochschule jetzt im Einrichtungsassistenten auswählen; nach dem Speichern UniOS neu starten und erst dann den Moodle-Schritt durchführen. Eine bestehende Installation wechselt unter System → Hochschule ebenfalls nach einem Neustart. Für einen künftig veröffentlichten Container-Connector unter System → Erweitert nacheinander Installation, sichtbare Berechtigungen, Freigabe und Aktivierung prüfen. Nach Domain-, Image- oder Versionsänderung muss die alte Freigabe unwirksam sein. Ein Entzug muss ihn deaktivieren. Diese echte Abnahme ist auf diesem Windows-PC noch offen: Docker ist installiert, der Docker-Dienst läuft nicht, und die Registry enthält derzeit kein veröffentlichtes Container-Image. Den Python-Beispielconnector nicht als sichere Installation behandeln.

## Notiz-Entwurf beim Gerätewechsel (nach Einrichtung beider Geräte)

Mit erfundenem Notiztext auf dem Mac eine bestehende Notiz ändern und ihn zuklappen, sobald „Lokal auf diesem Gerät gesichert“ erscheint. Auf Windows die Ausgangsnotiz an einer anderen Zeile ändern und die neue Host-Version prüfen. Nach dem Aufwecken des Macs müssen die lokalen Änderungen wieder erscheinen; bei abweichender aktueller Version sollen unabhängige Zeilen zusammengeführt und dieselbe Zeile zur manuellen Entscheidung angezeigt werden. Vor dem Öffnen der Mac-Seite auf einer anderen Tailscale-Adresse beachten: Browser-Entwürfe sind an die ursprüngliche Adresse gebunden. Die automatische Übertragung vom lokalen Standby zum entfernten Host ist noch offen; für diesen Versuch muss der Mac selbst wieder sicher Host werden. Den Test erst mit eigenen Geräten und einem geprüften Snapshot als Produktfreigabe werten.

## Studiengangwahl beim ersten Start (0.1.3)

Neue Installation: Hochschule bestätigen → „Was studierst du?“ → Studiengang mit Abschluss auswählen → Moodle und weitere Dienste verbinden. Bei Hochschulen mit myCampus erst dort persönlich anmelden; die Suche muss auch Studiengänge anderer Fakultäten und Masterangebote anzeigen. Zum Beispiel Bachelor Betriebswirtschaft auswählen und prüfen, dass „Dein Studiengang“ die Auswahl nach Neustart weiterhin nennt und der Import dessen Unterlagen einliest. Ohne Wahl darf „UniOS öffnen“ nicht angeboten werden. Profile ohne Katalog verlangen die freie Angabe von Studiengang und Abschluss. Beim ersten Hochschulwechsel wird die freie Auswahl verworfen; in der ersten Einrichtung ist kein Neustart für die Profilwahl nötig. Bereits eingerichtete Geräte behalten eine vorhandene, zum Hochschulportal passende Studiengangwahl; unter System → Weitere Dienste verbinden kann sie geändert werden.


## Kursabgrenzung und Moodle-Einschreibung (0.1.4)

Unter **Kurse** und **Aktuelle Kurse** dürfen nur Lehrveranstaltungen erscheinen. Studiengangdokumente und PRIMUSS liegen unter **Bibliothek → Hochschulunterlagen**; alte Links werden dorthin weitergeleitet. Dokumente dort öffnen/herunterladen und in der globalen Suche finden. Inaktive Lehrveranstaltungen bleiben unter „Inaktive anzeigen“ erhalten.

Unter **Kurse → Moodle-Kurse finden** nach einem eigenen Fach suchen, Beschreibung und angebotene Einschreibeart prüfen. Wenn die Beschreibung ausdrücklich einen Schlüssel nennt, „Schlüssel aus Beschreibung übernehmen“ wählen; sonst selbst eingeben. Erst „Jetzt einschreiben“ darf die Einschreibung in Moodle ausführen. Anschließend muss der echte Kurs in der Kursliste erscheinen und seine Unterlagen werden synchronisiert. Bei falschem Schlüssel oder abgelaufenem Zeitraum darf keine Erfolgsmeldung erscheinen. Ohne die von der Hochschule freigegebenen Webservices die angebotene offizielle Moodle-Seite verwenden. Dieser Ablauf wurde mit erfundenen Daten geprüft; eine echte Hochschul-Einschreibung bleibt eine bewusste Nutzeraktion.

Auf **Heute → Moodle aktualisieren** neue Inhalte abrufen. Bei abgelaufenem Token führt „Moodle-Anmeldung prüfen“ zur erneuten Anmeldung, die auch bei bereits verbundener Installation verfügbar bleibt. Zugangsdaten und MFA weiterhin ausschließlich selbst auf der offiziellen Hochschulseite eingeben.

## Seiten erfassen auf macOS (0.1.9)

Nach der eigenen Anmeldung das Portal-Fenster offen lassen und unter **Beispielseiten für den Datenabruf erstellen** die Seitenart wählen. **Geöffnete Seite erfassen** liest ausschließlich die aktuell sichtbare Seite und speichert ihre anonymisierte Struktur. Für weitere Seiten im Portal selbst navigieren und erneut erfassen, oder mehrere Seiten mit **Aktuelle Seite merken** sammeln und gemeinsam speichern. Die gespeicherte Datei vor dem Teilen selbst prüfen. Auf macOS findet kein automatischer Rundgang statt, solange dort kein nativer Schreibschutz für diesen Ablauf vorhanden ist. **PRIMUSS-Unterlagen einlesen** liest auf dem Mac ebenfalls nur die geöffnete Seite und meldet den Abruf als teilweise; weitere Bereiche selbst öffnen und erneut einlesen. Geschlossene Fenster und Anmeldeseiten mit Passwortfeld dürfen keine erfolgreiche Erfassung melden.

Die plattformübergreifende native Lese-Brücke lässt sich ohne Backend, Hochschulzugriff oder Zugangsdaten prüfen: im Ordner `desktop/src-tauri/` `cargo run --locked --example portal_capture_smoke` ausführen. Der Test verwendet ausschließlich die gebündelte öffentliche Startseite und prüft Titel, HTML, Status, Links, Passwortfeld-Ausschluss und die Sperre ungeschützter Rundgänge.

## PRIMUSS-Menüabruf (0.1.4, Windows)

Nach der persönlichen Anmeldung das PRIMUSS-Fenster offen lassen und **PRIMUSS-Unterlagen einlesen** wählen. Der Import erfasst gerenderte Lesemenüs, auch wenn ihre URL gleich bleibt, und folgt lesbaren Frames/Dokumentlinks. Prüfungsanmeldungen, Änderungen und Form-POSTs werden nicht ausgeführt. Benötigt das Portal einen POST bereits für eine Leseansicht oder wird ein Seiten-/Größenlimit erreicht, muss „nur teilweise gelesen“ erscheinen; ein einzelner Startseitenabruf wird nie als vollständig bezeichnet. Sichtbare Seiten-/Dokumentzahlen mit dem Portal vergleichen. Strukturierte Noten/Prüfungsstatus verlangen weiterhin die geprüften Hochschul-Feldzuordnungen. Vollständigkeit am echten Portal noch nicht abgenommen.


## Mensa und Uni-Mail (0.1.6)

1. Nach Hochschulauswahl „Mensa & Mittagspause“ über Suche („Speiseplan“) oder Weitere Bereiche öffnen. Standort und persönliche Pausenzeit auswählen, Einstellungen speichern. Vorläufiger Standard ist 12:00 Uhr; er ist keine aus dem Stundenplan ermittelte Uhrzeit.
2. Heute in der laufenden App öffnen: ab mindestens einer Stunde vor der Pause erscheint der Speiseplan, auch wenn die Seite vorher geöffnet war. Ab Beginn der eingestellten Mittagspause (Standard 12:00 Uhr) verschwindet die Karte beim nächsten Uhrzeittakt innerhalb von 30 Sekunden, auch ohne Seitenwechsel. Bei geschlossener App wird kein Betriebssystem-Wecker ausgelöst. Die ganze Speiseplanseite bleibt unabhängig von der Uhrzeit erreichbar.
3. Anderen Tag und anderen Standort auswählen; Studierendenpreise und Allergencodes mit dem verlinkten offiziellen Plan vergleichen. Ein leerer Feed bedeutet „noch keine Gerichte veröffentlicht“, nicht automatisch „Mensa geschlossen“. Netzwerk nach erfolgreichem Abruf trennen: der lokale Dienst zeigt einen gekennzeichneten gespeicherten Stand.
4. Uni-Mail öffnen, die Verknüpfung zur Seitenleiste hinzufügen und „Outlook öffnen“ wählen. Benutzername, Passwort und Handy-Code nur selbst im Microsoft-/Hochschulfenster eingeben. Dieses Fenster benutzt den normalen lokalen WebView-Sitzungsspeicher und erhält keine UniOS-API-Rechte. Ob die Hochschule die eingebettete Anmeldung zulässt und wie lange MFA/Sitzung gelten, wird mit dem echten Konto geprüft.
5. Postfach erneut öffnen: das bestehende Fenster wird fokussiert. Nachrichten können dort normal benutzt werden; dieses Webmail-Fenster erteilt keine Freigabe für einen automatischen Import. Seit 0.1.10 gibt es dafür die separate Verbindung unten. Eine gespeicherte EML kann weiterhin gezielt auf eine Frist geprüft werden, die erst nach Bestätigung eingetragen wird.

## Stundenplan abonnieren und Outlook lesen (0.1.10)

**Stundenplan:** Unter **Termine → Dein Stundenplan** den eigenen HTTPS-/webcal-iCal-Link direkt in UniOS eingeben und abonnieren. Persönliche Links gehören weder in GitHub noch in Diagnoseberichte. Der vollständige Link wird ausschließlich im OS-Schlüsselbund gespeichert. Termine für die nächsten sieben Tage erscheinen hier und heutige Vorlesungen unter Heute. Der Import berücksichtigt wiederkehrende Termine, Ausnahmen, Räume und abgesagte Einzeltermine. Der Hintergrundabruf folgt dem Sync-Intervall und der Ruhezeit; zusätzlich ist Aktualisieren möglich. Die sichtbare Woche und Termine mit dem offiziellen Plan vergleichen. Ein Link mit Session-Parameter kann ablaufen: dann einen neuen Kalenderlink direkt in UniOS hinterlegen. Ein ungültiger Feed muss einen Fehler zeigen und den letzten erfolgreichen Terminstand erhalten. Abo beenden entfernt nur die importierten Stundenplantermine. Es werden keine Prüfungsanmeldungen oder Hochschultermine geändert.

**Outlook:** UniOS benötigt eine eigene Microsoft-Entra-App-Registrierung als öffentlicher Client für Hochschul-/Geschäftskonten. Unter API-Berechtigungen Microsoft Graph → delegiertes **Mail.Read** eintragen; unter Authentifizierung den öffentlichen Clientflow aktivieren. Kein Client-Secret erstellen oder in UniOS eingeben. Die Hochschule kann App-Freigabe oder Admin-Zustimmung verlangen; ein gesperrter Gerätecode-Flow darf nicht umgangen werden. Offizielle Anleitungen: [App registrieren](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app), [Gerätecode-Flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code).

Die öffentliche Anwendungs-/Client-ID unter **Uni-Mail → Microsoft-Anbindung einrichten** eintragen. **Postfach verbinden** zeigt einen kurzlebigen Code; Anmeldung, MFA und Einwilligung ausschließlich selbst bei Microsoft abschließen. UniOS verlangt Mail.Read und offline_access, keine Schreib-/Sende-/Dateirechte. Nach Freigabe werden bis zu 1.000 Nachrichten der letzten 30 Tage gelesen; Begrenzungen werden angezeigt. Gespeichert werden Absender, Betreff, Eingangszeit und unbestätigte Fristvorschläge, keine Nachrichtentexte oder Anhänge. Eine vorgeschlagene Frist erst selbst bestätigen. Abruf wiederholen: keine Duplikate, bestätigte/ignorierte Zustände bleiben erhalten. Outlook muss die Nachrichten weiterhin ungelesen zeigen, sofern sie dort zuvor ungelesen waren. Tokens liegen ausschließlich im OS-Schlüsselbund; Trennen entfernt sie, bereits importierte Hinweise bleiben erhalten. Hintergrundabrufe laufen nur auf dem aktiven Host und außerhalb der Ruhezeit.

Für diese Version wurden Serien-/Ausnahmeimport, ungültige Feeds, OAuth-/Token-Erneuerung, lesende Graph-Paginierung und die Bedienung mit erfundenen Anbietern geprüft. Echte Outlook-Anmeldung und Hochschulzustimmung bleiben ohne eigene Registrierung offen. macOS/Linux und die jeweilige Schlüsselbund-Anbindung müssen auf diesen Geräten geprüft werden.

## Weiterleitung auf den VPS (0.1.14)

Einrichtung: [MAIL_FORWARDING.md](MAIL_FORWARDING.md). Erst wenn Uni-Mail „Empfang bereit“ zeigt, die angezeigte Adresse als Outlook-Weiterleitungsziel mit beibehaltener Kopie aktivieren. Bei „Empfang wird noch eingerichtet“ ist die externe SMTP-Abnahme noch offen.


Eine tatsächlich weitergeleitete neue Nachricht mit Outlook vergleichen. Nach spätestens fünf Minuten beziehungsweise „Nachrichten jetzt lesen“ müssen Betreff und Absender in UniOS erscheinen. Fristvorschläge erst nach eigener Prüfung bestätigen; kein Termin entsteht allein durch E-Mail-Empfang. Erneuter Abruf darf keine Duplikate erzeugen. Import pausieren: neue Mails bleiben im privaten Serverpostfach und erscheinen nach Fortsetzen. Auch bei geschlossener Windows-App muss der Server weiter importieren. Bisherige ältere Mails sind ohne separate Übernahme nicht enthalten. Originale einschließlich Anhängen bleiben auf dem VPS; die vollständige Nachricht bleibt in Outlook lesbar. Externe Erreichbarkeit, Provider-Firewall und echte Outlook-Weiterleitung sind getrennte Prüfschritte.

## Produktauftrag 1–15: verbleibende Geräteabnahme

Der technische Stand ist in [PRODUCT_COMPLETION.md](PRODUCT_COMPLETION.md) beschrieben. Vor Migration eines echten Bestands erstellt der Nutzer einen geprüften Snapshot. Die automatischen Prüfungen verwenden ausschließlich erfundene Daten.

- **Wiederherstellung:** Auf einem zweiten Rechner in eine frische UniOS-Installation wiederherstellen; Originale, Notizen, Karten, Markierungen, Beziehungen und Einstellungen vergleichen. Schlüsselbund-Geheimnisse gehören nicht in den portablen Export; benötigte Hochschulverbindungen erneut freigeben.
- **Rückgängig:** Nach einer Themen-Zusammenführung neue Kartenreviews oder Übungen erfassen. Die alte Zusammenführung muss anschließend als nicht sicher wiederherstellbar gelten. Dieselbe Prüfung mit einer später geänderten Notiz durchführen.
- **Aufträge:** Einen echten langen OCR-/Indexauftrag abbrechen und neu starten. Bereits gespeicherte Seiten müssen erhalten bleiben. App schließen und neu öffnen: der alte Auftrag wird als unterbrochen angezeigt. Während eines Auftrags Host wechseln; der alte Host darf keine weiteren Änderungen speichern.
- **Erweiterungen:** Das dokumentierte WASM-Beispiel mit einem signierten nativen Paket auf Windows, macOS und Linux ausführen. Ohne Freigabe und nach Rechteentzug darf es nicht starten. Ein Container-Connector benötigt zusätzlich eine laufende Docker-Engine und eine im Registry-Workflow geprüfte Image-Version; Signaturen sind derzeit ausdrücklich unverifiziert.
- **Barrierefreiheit:** Auf Windows mit NVDA, auf macOS mit VoiceOver und auf Linux mit Orca die Hauptnavigation, Notizen, Suche, Meldungen und Dialoge bedienen. Fokus nach Dialogschluss kontrollieren. 200 % System-/Browservergrößerung, Systemkontrast und reduzierte Bewegung prüfen. Statusinformationen müssen auch ohne Farberkennung verständlich bleiben.
- **Leistung:** Native Kaltstarts auf allen drei Betriebssystemen messen. Mit einem anonymisierten großen Bestand PDF-Erstanzeige und Suche vergleichen. Die CI-Grenzen in [PERFORMANCE_BUDGETS.md](PERFORMANCE_BUDGETS.md) prüfen Browser-/API-Abläufe; sie ersetzen keine Messung nativer Installer und unbekannter Hardware.

## Assessment Engine / Coding Tutor 0.1.18

1. Nach neuem geprüften Snapshot den Server aktualisieren und den getrennten Runner privat verbinden; siehe `RUNNER.md`. Client zeigt den echten Runner-Status; ohne ihn darf kein lokaler Python-/Java-Prozess starten.
2. Eigene Kurse wählen, Entwurf auf Windows/macOS wiederherstellen, Java/Python/JavaScript ausführen, Abbruch und Versionsvergleich prüfen. Java-/Python-LSP wird nicht behauptet.
3. Work-Bereich und Kurs freigeben, OAuth mit `coding:propose` neu bestätigen. Nur ausdrücklich angeforderte Pakete lesen, Vorschläge fachlich prüfen und übernehmen. Bestehende Lesetokens dürfen keine Vorschläge schreiben.
4. PDF-Seitenbereich und Notiz wählen; bei Quellenänderung muss der alte Work-Auftrag zurückgewiesen werden. Sechs Vorschläge müssen auf genau diese Anfrage verweisen.
5. Probeprüfung starten, Seite wechseln und fortsetzen; Uhr läuft auf dem Server. Ablauf, gesperrte Hinweise, einmalige Antwort und erst nach Abgabe sichtbare Ergebnisse prüfen.
6. Echtes Mikrofon unter Windows/macOS, deutsche und englische Transkription, Audio-Upload und Abspielen prüfen. Die synthetische Browser-Antwort ersetzt keine echte Mikrofon-/Spracherkennungsprüfung. Aussprache wird nicht benotet.
7. Mathe-Grenzen und unbekannte Rechenschritte sind sichtbar; keine allgemeine Beweis-/Logarithmenprüfung erwarten. Freitext bleibt ohne objektive Bestehensfiktion.


## UX-Pass vom 04.10.2026: echte Bedienung

Die automatische Fake-Abnahme ist in [UX_QUALITY](UX_QUALITY.md) dokumentiert.
Zusätzlich auf dem eigenen Gerät prüfen:

1. Langes PDF bei Seite 47, manuellem Zoom und markiertem Text verlassen,
   Notiz öffnen und Zurück nutzen: Position, Suche und Kommentarseitenleiste prüfen.
2. Notiz im visuellen Editor bearbeiten, kurz wechseln und zurückkehren;
   Text und Cursor dürfen nicht springen. Entwurf/Serverstatus unterscheiden.
3. Verbindung kurz trennen, zwei Karten bewerten, wieder verbinden: jede Bewertung
   genau einmal übertragen; bei lokalem Speicherfehler darf die Karte nicht verschwinden.
4. Mobil eine Wikilink-Quelle antippen: Vorschau am unteren Bildschirmrand;
   Schließen, Notiz öffnen und Bildschirmtastatur ohne verdeckte Aktionen prüfen.
5. Fokusmodus in PDF/Üben/Programmieren einschalten und sichtbar beenden.
   Mit Windows 125/150-%-Skalierung und kleinem Fenster wiederholen.
6. Stundenplanwoche und Suchfilter wechseln, navigieren und zurückkehren;
   Aktualitätsangabe, Offline-Hinweis und Fehlerkorrektur ohne neue Buchung prüfen.
7. Für eine Nutzerstudie die 20 Missionen aus `quality-missions.spec.ts` von echten
   Testpersonen durchführen lassen und Zeit/Klicks/Fehler/Abbruch separat erfassen.
   Automatische Testzeiten sind keine menschlichen Bedienzeiten. Keine Mailtexte,
   Suchbegriffe, Notiztexte oder Hochschul-Sessionlinks in Messberichte schreiben.

## Mitschreiben mit Mathe und Logik (07.10.2026)

Automatisch geprüft mit synthetischen Dokumenten und Chrome unter Windows;
Anleitung: [STUDY_WRITING](STUDY_WRITING.md). Auf dem tatsächlichen MacBook prüfen:

1. In einer kurzen Mitschrift Bruch, Wurzel, Potenz, Summenzeichen und Matrix
   ohne LaTeX-Quelltext ausfüllen. Tab/Shift+Tab, Pfeiltasten und ⌘+Enter im
   nativen macOS-Webview und Safari prüfen; keine verschluckten ersten Zeichen.
2. PDF auf Seite 80 öffnen, Pinch, Zweifinger-Panning, Seitenübersicht und
   Mitschrift kombinieren. Cursor, Markierungskoordinaten und Leseposition müssen
   erhalten bleiben. Mit kleinem MacBook-Fenster und geändertem Split wiederholen.
3. Verbindung trennen, Formeln und Tabellen schreiben, Entwurf wieder öffnen,
   dann speichern. Schriftarten/Formelwerkzeug müssen nach installierter PWA
   offline verfügbar sein; Entwurf und serverseitige Speicherung unterscheiden.
4. `(P + Q) · !R` mit UND-/ODER-/NICHT-Notation aus dem Unterricht vergleichen.
   Ergebnisse ausblenden, manuell ausfüllen und wieder einschalten; die eingefügte
   Tabelle bleibt eine gewöhnliche Tabelle, keine automatisch bewertete Prüfung.
5. Falls eine Bildschirmtastatur benutzt wird: öffnen, Ziffer und griechischen
   Buchstaben antippen, Tastatur schließen, Formel übernehmen. Vorschau und
   Einfügen müssen sichtbar bleiben; die native mobile Tastatur separat prüfen.
6. Einen kurzen tatsächlichen Unterrichtsausschnitt mitschreiben. Benötigte Zeit,
   ausgelassene Inhalte und Korrekturen mit der eigenen Handschrift vergleichen.
   Browser-Testzeiten beweisen keine Gleichheit mit menschlichem Schreibtempo.
   Keine Mitschrift oder persönlichen Unterrichtsdaten in QA-Berichte kopieren.

Handschriftliche OCR darf nicht als sichere Formelquelle behandelt werden.
Symbolische Umformung, DNF/KNF und Zahlensystem-Umrechnung sind kein Bestandteil
dieses Eingabe-Pakets. Vor einer neuen Veröffentlichung gelten die normalen
vollständigen Release- und Plattformprüfungen.

## Kalender vom 07.10.2026: MacBook und Alltag

1. Im neuen Wochenraster mit zwei Fingern vertikal scrollen. Datum, Stunden und
   Terminwahl dürfen nicht versehentlich wechseln. Tag/Woche/Liste mit der
   Tastatur bedienen; Termin öffnen, Escape, sichtbaren Fokus am Termin prüfen.
2. Eigene bekannte Stundenplanzeiten und Räume mit der Hochschulquelle vergleichen,
   einschließlich Gruppenfilter, Sommer-/Winterzeit und Veranstaltungen über
   Mitternacht. Ein Termin ohne Endzeit zeigt keine erfundene Dauer im Detail.
3. Bei 390 px Tag wählen, danach Liste öffnen. Alle Titel und Räume müssen in den
   Details lesbar sein. Im Monatskalender Tag wählen und die vollständige Fristenliste
   darunter prüfen; Monatsrand mit Pfeiltasten überschreiten und Heute nutzen.
4. Den kurzen Mitschreibvergleich aus dem Lernwerkzeuge-Abschnitt durchführen:
   Text, Formeln und freie Skizzen getrennt vergleichen. Tastaturhilfen allein
   belegen keine Gleichheit mit iPad/Pencil. Keine privaten Mitschriften protokollieren.

Automatische Fake-Abnahme: [Kalender-Bilder und Prüfungen](qa/calendar-apple-20261007/README.md).

## Mac-Beenden und Wiederöffnen – 15.10.2026

Nach dem installierten Update zweimal UniOS über Cmd+Q vollständig beenden und
wieder öffnen. Vorher offene Entwürfe speichern. Während die App geschlossen
ist, darf kein zu dieser App gehörender `uniosd`-Arbeiter Port 8000 halten. Nach
dem Öffnen müssen nativer Prozess, Supervisor und lauschender Arbeiter zur
neu installierten App gehören und das Hauptfenster öffnen. Die Rust-Tests
prüfen den echten Supervisor-/Arbeiter-Lebenszyklus; der installierte frische
Start und seine Prozesszuordnung wurden geprüft. Der reale GUI-Beenden-Pfad
bleibt offen, weil die Mac-Steuerung mit „native pipe startup failed“ ausfällt.
Keine Systemfreigaben oder Vertrauensregeln dafür ändern.

## Lokaler Modus ohne Server – 16.10.2026

Nur mit der installierten Desktop-App prüfbar (der Neustart läuft über das Tauri-Kommando
`restart_backend`). Frisch installiert, ohne vorhandenen UniOS-Ordner starten: Auf dem
Startbildschirm erscheinen „Demo ausprobieren“, „Nur auf diesem Gerät nutzen“ und
„Meine Hochschule verbinden“. „Nur auf diesem Gerät nutzen“ wählen. Die App startet neu
und zeigt die Hochschulwahl; Hochschule wählen, Moodle einrichten, eine Notiz anlegen.
App beenden und erneut öffnen: Daten und Modus bleiben. Es darf dabei keine
Serveradresse abgefragt werden. Eine bereits mit einem Server gekoppelte oder bereits
lokal genutzte Installation darf ihren Modus nicht ändern. Der Ablauf des Dienstes ist
automatisch durch `tests/test_desktop_local_mode.py` abgedeckt.
