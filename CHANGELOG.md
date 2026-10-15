<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Änderungen

## 0.1.28 – Navigation, Kursnamen und Kalender (15.10.2026)

- Formelanzeige und Syntaxhervorhebung in Aufgabenbeschreibungen werden erst bei Bedarf geladen; das Startpaket hält die bestehende Größengrenze wieder ein.
- Im Markdown-Quelltext bleibt die Schreibposition beim schnellen Weitertippen nach Tab/Enter korrekt; spätes Zurücksetzen des Cursors entfällt.
- Seitenleiste behält beim Wechsel von Uni-Mail und anderen Bereichen ihren Scrollstand.
- Mensabilder bleiben beim Filtern erhalten, begrenzter Server-Cache und passende Ersatzflächen für fehlende Fotos.
- Eigene Kurs-Anzeigenamen, beständige Aktivitätsfilter und Dokumentlinks mit Nachbarn und dreifachem Hervorheben.
- Benachrichtigungsmenü mit Ungelesen-Filter und einzelnen Gelesen-Schaltern; zusätzliche Uli-Reaktionen.
- Termine einzeln, ab diesem Datum oder als Wochenserie bearbeiten; Quellen für iCal gezielt auswählen.
- Geordnetes Beenden des eigenen Mac-Hintergrunddienstes; präzisere Moodle-Zugriffshinweise bei nachweisbar vollständigen Antworten.
- Zehn öffentliche Dependency-PRs gebündelt: SQLAlchemy, filelock, Typer, Ruff, mypy, React Query, Playwright, React-Vite-Plugin, typescript-eslint und Prettier.
- Sieben nachgelieferte Updates ergänzt: MathLive mit Sicherheitskorrekturen, lucide-react, FastAPI, jsdom, Anthropic, Radix UI und Tauri-Frontend-API.
- Qualitätsmatrix und native Paket-Workflows im öffentlichen Repository ergänzt.

## Unveröffentlicht – Papierkorb, Dateien in der App, eingebautes Backup (13.10.2026)

- Papierkorb: Notizen und Schnellnotizen lassen sich löschen. Direkt danach bietet UniOS „Rückgängig“ an; unter „Mehr → Papierkorb“ liegt alles Gelöschte, bis man es wiederherstellt oder nach einer Rückfrage endgültig löscht (auch alles auf einmal). Gelöschtes verschwindet aus Listen, Suche, Zitaten und Wiki-Links und kommt beim Wiederherstellen unverändert zurück; eine gelöschte Vorlesungsnotiz legt der nächste Moodle-Abgleich nicht neu an.
- Dateien in der App ansehen: Code-Dateien aus den Kursen (Python, Java, C …) öffnen mit Zeilennummern, Hervorhebung, Umbruch und Kopierknopf; CSV als Tabelle (auch mit Semikolon aus deutschem Excel); Bilder mit Originalgröße auf Knopfdruck; Videos und Audio mit Player; Word-Dateien seitenweise und Excel-Tabellen mit Blättern, ohne Office oder LibreOffice. Herunterladen bleibt unter „Mehr“.
- Datensicherung eingebaut (Einstellungen → Daten): einmal einen Ordner wählen (Vorschläge für OneDrive und Dokumente), dann sichert UniOS täglich Datenbank, Notizen, Markierungen, Unterlagen und die nötigen Einstellungen, ohne Restic. Sicherungen holen verpasste Tage nach, alte werden nach deiner Wahl gelöscht. Wiederherstellen nach Eintippen von „WIEDERHERSTELLEN“ beim nächsten Start; der vorherige Stand wird beiseitegelegt. Anmeldedaten und Sitzungen landen nie in der Sicherung.
- Behoben: Ein offenes „Mehr“-Menü in der Unterlagenliste blieb offen und verdeckte die nächste Zeile; es schließt jetzt beim Öffnen eines anderen und beim Klick daneben.

## Unveröffentlicht – Uli zum Anfassen und Zitate an der genauen Stelle (12.10.2026)

- Uli reagiert: Beim Darüberfahren (oder mit der Tastatur) öffnet Uli die Augen, auch nachts; die Pupillen folgen dem Mauszeiger. Ein Klick lässt Uli winken und etwas Passendes sagen, danach Tipps. Wer schnell viermal klickt, macht Uli schwindelig. Bei reduzierter Bewegung bleiben die Sprüche, die Animationen entfallen.
- Zitate aus der Mitschrift öffnen das PDF an der genauen Stelle: Der Leser scrollt zum zitierten Satz und hebt ihn hervor. Neue Zitate merken sich die Position; bei älteren sucht UniOS den Satz auf der Seite. Das klappt auch direkt aus der Mitschrift neben dem PDF, während man schreibt, und ein zweiter Klick auf dieselbe Quelle springt erneut hin.
- Behoben: Links auf UniOS-Seiten (etwa die Quelle unter einem Zitat) öffneten in der Desktop-App den Browser. Sie bleiben jetzt überall in der App; nur fremde Webseiten öffnen im Browser.
- Behoben: In der Desktop-App konnte ein Link auf eine fremde Seite ohne „neuer Tab“ (etwa „Quelle“ in der Terminliste) das App-Fenster selbst zu Moodle wechseln lassen, ohne Weg zurück. Fremde Seiten öffnen jetzt immer im Browser, die App bleibt stehen.
- Nachweisbilder bei Noten öffnen in einem Fenster in UniOS statt im Browser.
- Behoben: Auf schmalen Handys (320 px) ließen sich „Erweiterungen“ und „myCampus“ seitlich verschieben; Dateifeld und Reiter passen jetzt in die Breite.
- Verbindungskatalog: Rechte stehen lesbar da („Kurse lesen“ statt nur `courses.read`), in klaren Gruppen; leere Gruppen zeigen „Keine“.

## Unveröffentlicht – Leser und ruhigeres Erscheinungsbild (11.10.2026)

- Neue Befehlspalette im Spotlight-Stil: große Suchzeile, Treffer mit Typsymbol und markiertem Suchbegriff, sichtbare Enter-Aktion, Tastenzeile; Schnellerfassung bleibt im selben Fenster.
- PDF-Leiste neu gruppiert: Seiten, Zoom mit Prozentanzeige und Mitschrift links, kompakte Suche rechts.
- „Heute“ mit Fokuskarte für den nächsten Lernschritt; Seitenleiste als abgesetzte Fläche.
- Notizen ohne doppelten Leerzustand; Auswahlfelder im App-Stil.
- PDF-Zoom als Eingabefeld; der Seitensprung öffnet mit markierter Seitenzahl.
- Filter in der Befehlspalette nach Typ und Kurs.
- Uli, die UniOS-Eule: auf „Heute“, in „Lernen“ und in leeren Notizen, mit Stimmung nach Tageszeit und Lernlage; Emoji an den Zählern auf „Heute“.
- PDF-Seitenzahl wird an Ort und Stelle bearbeitet; Taste G springt zur Seite.
- „Lernen“ aufgeräumt: keine doppelte Karteikarten-Karte, leere Lernblöcke ausgeblendet.
- Kleinere Korrekturen auf Kurse, Karteikarten, Studientag, Eingang, System und Noten.
- Termine: Die Liste zeigt nur noch kommende und laufende Termine; vergangene liegen hinter „Vergangene Termine“.
- Behoben: Der myCampus-Import las die Überschrift des Kommentarformulars („Neuen Kommentar hinzufügen“) als Termin. Solche Einträge entfernt der nächste Abgleich.
- Moodle-Seiten (wie „Tagebuch“) und Markdown-Dateien öffnen jetzt als lesbarer Text in UniOS statt nur zum Herunterladen; „Mitschrift dazu anlegen“ direkt dort.
- Behoben: Das „Mehr“-Menü in Kurslisten wurde von der Karte abgeschnitten.
- PDF-Suche: Strg/⌘+F öffnet sie, Enter und Umschalt+Enter springen zwischen Trefferseiten, ein Zähler zeigt die Position.
- Seitenübersicht: Miniaturen zeigen Suchtreffer und Markierungen pro Seite und bleiben beim Lesen unter der Leiste.
- Behoben: Suchauszüge zeigten Klammern der Volltextsuche (【…】).
- Pinch-Zoom im PDF läuft während der Geste als reine Bildschirm-Skalierung und ordnet die Seiten erst am Ende einmal neu an. Cmd/Strg `+`, `−` und `0` zoomen das PDF statt der ganzen App.
- „Zitiert in“: Das PDF zeigt pro Seite, welche Mitschriften diese Stelle zitieren. Ein Klick springt zur Seite oder öffnet die Notiz neben dem PDF.
- Cmd/Strg+Shift+B blendet die Mitschrift neben dem PDF ein und aus.
- Neutrales Farbschema: graue Seite, weiße bzw. anthrazitfarbene Arbeitsflächen, Farbe nur für Hauptaktion, Auswahl und Status. Schmale Scrollbalken in beiden Designs.
- Heute zeigt die Begrüßung als einzige Überschrift; im Split-View passt der Notiztitel ins Panel.
- Rund 500 Zeilen ungenutztes CSS, überschriebene Farbdefinitionen und tote Hilfsfunktionen entfernt.
- Ruhigeres Mitschreiben: eine statt zwei Editorleisten, die beim Lesen zurücktritt; LaTeX-Hilfe unter dem Text, Block-Werkzeuge in der Fußzeile, maßvollere Überschriften.
- Mitschrift neben dem PDF ohne Kartenrahmen und doppelte Kursangabe; kompakte Leiste in schmalen Spalten.
- Notizliste als ruhige Zeilen; kleinere Seitentitel auf allen Seiten; Eingang ohne zweite Großüberschrift.
- Ein Klick in eine gespeicherte Notiz öffnet den Editor; Links, Textauswahl und alte Versionen bleiben unberührt.
- Behoben: Nach „Zurück“ landete der Cursor im Editor am Textende statt an der zuletzt bearbeiteten Stelle.
- 59 ungenutzte Übersetzungsschlüssel und drei nur noch von Tests genutzte Funktionen entfernt.
- Behoben: Neuladen oder geteilte Links auf „Noten“ und den Fokus-Arbeitsbereich lieferten 404 statt der App.
- Fehlermeldungen zeigen nur noch den Text, ohne vorangestelltes „Error:“.
- Behoben: Der Download des KI-Pakets umging die Schreibsperre des Geräts.
- Ein Fehler beim Anlegen eines Semesters erscheint direkt am Formular.
- Behoben: Kurz nach dem Öffnen einer Seite wurde die Seitenleiste einmal ersetzt; ein dort geöffneter Dialog schloss sich wieder. Die Seite lädt jetzt parallel zum Start.
- Behoben: Auf dem Handy mit großer Schrift lagen die Kurseinstellungen außerhalb des Bildschirms; die Kopfzeile der Kursseite bricht jetzt um.
- KI-Schnittstellen prüfen Kursfreigaben für ganze Listen mit einer Datenbankabfrage statt einer pro Eintrag.

## 0.1.19 – Release-Vorbereitung (03.10.2026)

- Einstieg mit getrenntem Demo-Semester, echten Beispiel-PDFs und Lernkarten; eigene Hochschulverbindung bleibt getrennt.
- Rettungsmodus ohne Connectoren, Scheduler und Migrationen; begrenzte, geprüfte Datenbankkopie und verifizierter Export von Notizen/Originaldateien.
- Sichtbare Sicherung, tatsächlicher Datenbank-/Index-/Verbindungszustand und Diagnoseexport ohne Studieninhalte.
- Native Updateprüfung für Stable/Beta/Nightly mit Signatur, Mindestversion, Schema-Kompatibilität und frischer Sicherung. Öffentliche Kanäle werden erst nach Geräteabnahme freigegeben.
- Geführte Work-Freigabe, Import-Assistent für Markdown, Notizen-CSV und Dateien sowie Wege zu Anki/iCal. Nutzungszähler sind lokal und ausdrücklich freiwillig.
- Connector-Vorlagen, Beitrags-/Sicherheitsregeln, Hochschul-Kompatibilitätsmatrix und ehrliche Release-Abnahme.
- Release Lab mit synthetischen Prüfungen, separater Belegprüfung, Retrieval-Messung und geprüften Issue-Entwürfen. Kein öffentlicher Release und kein Ersatz für Tests auf frischen Geräten.

## Lesefluss und visuelle Überarbeitung (26.09.2026)

- Der PDF-Reader zeigt Seiten fortlaufend und lädt sichtbare Seiten nach Bedarf. Scrollen, Suche, Seitensprung, Zoom und Markierungen bleiben zusammen nutzbar.
- Die Startseite zeigt Fristen und neue Inhalte zuerst; Kurse erscheinen als kompakte Liste, und PDF-Dateinamen öffnen direkt den Reader.
- Im Kurs folgen Unterlagen, Aufgaben und Notizen vor Gruppeneinstellungen. Weitere Werkzeuge sind einklappbar; aus dem PDF kann eine Mitschrift mit richtigem Kursbezug angelegt werden.
- Die blauen Kleinüberschriften und großen Tageskacheln wurden entfernt. Heller und dunkler Modus verwenden ruhige Grauwerte und einen gedämpften Aktionsakzent.

## Neugestaltung des Studienraums (26.09.2026)

- Dunkle, feste Arbeitsleiste mit Kurszugriff; helle und dunkle Flächen in Blau, Schiefer und Papierweiß.
- Neue Tagesübersicht mit tatsächlichen Kennzahlen und direkten Wegen zu Kursen und Notizen.
- Zusammenhängende Notizansicht, ruhiger PDF-Arbeitsbereich und kompakter gegliederte Lernseite.
- Termine zeigen Fristen und Kalenderereignisse vor den Einstellungen der Datenquellen.
- Gestaltungsregeln, Tokens und eine interaktive Vorschau unter `docs/design/` dokumentiert.
- Die Seitenleiste hat jetzt aufklappbare Bereiche und Kursunterseiten. Breite und Sichtbarkeit lassen sich ändern und bleiben nach dem Neuladen erhalten.

## Arbeitsbereich und Wissensfunktionen (26.09.2026)

- Ruhigere Oberfläche in warmem Hell und Graphit-Dunkel mit Dokumentfokus, kompakter Seitenleiste und mobiler Vierer-Navigation.
- Versionierte Markdown-Notizen mit YAML-Metadaten, Editor, automatisch vorbereiteten Mitschriften für eindeutig benannte neue Vorlesungen, anklickbaren `[[Wikilinks]]` und erklärten lokalen Vorschlägen für verwandte Notizen.
- `Strg/⌘+K` durchsucht direkt Inhalte; PDF-Treffer öffnen die genannte Seite. Optional von Moodle gelieferte Forentexte sind nach Bereinigung auch lokal durchsuchbar. Termine haben Tabelle, Board, Zeitleiste und Kalender; ECTS erscheinen zusätzlich als Semestermatrix. Ein Zeitrechner zeigt Eingaben und Rechenweg.
- Eindeutige Fristdaten aus Unterlagen gelangen als Quellenbeleg in eine Freigabeliste. Der Kalender ändert sich erst nach Bestätigung. Installierte Hochschul-Konnektoren können einzeln aktiviert werden.

## 0.1.0 – Veröffentlichung vorbereitet

- Lokale Studienoberfläche mit Moodle-Abgleich, versionierten Unterlagen, Suche, PDF-Markierungen, Terminen, Projekten und Lernbereich.
- Integrierter Anki-Lernmodus mit `.apkg`-Import und -Export, Offline-Bewertungen und automatischem Snapshot vor Moduswechseln.
- Einrichtungsassistent und Installationsskripte für macOS und Windows; Moodle-Mobile-SSO kehrt über ein lokal registriertes URL-Schema zur App zurück.
- Lesende PRIMUSS- und mycampus-Connectoren bleiben auf geprüfte Hochschulprofile begrenzt. Für Coburg sind Prüfungs-, Noten-, Rückmelde- und Stundenplanfelder noch nicht fachlich abgenommen und deshalb nicht aktiviert.
- Statische Projektseite und ein automatisch erzeugtes Tutorial mit erfundenen Daten.

**Freigabestand:** Noch keine veröffentlichte Release-Kennung. Die Installation auf frischen Geräten, der echte automatische Moodle-Rückruf, die vollständige Phasenabnahme und die Prüfung der Designreferenzen vor öffentlicher Sichtbarkeit stehen aus. Maßgeblich sind [docs/PROGRESS.md](docs/PROGRESS.md) und [docs/PUBLISHING.md](docs/PUBLISHING.md).
