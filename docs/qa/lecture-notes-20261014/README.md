<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Mitschriften: Vorlesungsseiten und ältere Notizen

## Bedienung

1. PDF öffnen → **Mitschrift** → **Mitschrift öffnen**. Eine vorhandene
   Mitschrift dieses Kurses auswählen. Titelsuche und weitere Ergebnisse sind
   verfügbar; zur PDF verknüpfte Notizen stehen innerhalb jeder Ergebnisseite
   zuerst. Die Auswahl merkt sich die bestehende Notiz-UUID für den nächsten
   Programmstart. Ein noch nicht angelegter Entwurf bleibt beim Wechsel erhalten.
2. **Heute bearbeitet** öffnen, Datum und PDF-Seiten eingeben, beispielsweise
   `5-12, 18`, dann **Seiten festhalten**. Enter im Seitenfeld übernimmt die
   Seiten. Das erstellt einen Quellenblock im Notiztext, auch ohne eigene Prosa.
   Neue Notizen werden erst mit **Notiz anlegen** gespeichert; vorhandene Notizen
   verwenden den bestehenden Abgleich und die Versionshistorie.
3. **Auftrag für GPT kopieren** übernimmt den Quellenblock und kopiert einen
   Arbeitsauftrag mit Datum, exakter Materialversion und Seitenverweisen. Diesen
   Auftrag einem GPT mit freigegebenen UniOS-Quellen geben. Der Auftrag verlangt
   Quellenbelege, nennt fehlende Inhalte und erstellt zunächst einen Entwurf.
4. Außerhalb des PDF-Lesers: **Neue Notiz** → **Leere Mitschrift** entfernt nur
   die unveränderte Standardvorlage. Ein selbst geschriebener oder wiederhergestellter
   eigener Text bleibt erhalten. In **Heute bearbeitet** eine Kurs-PDF auswählen.

## Speicherung und Grenzen

- Datum, Quelle und Seiten sind portable Markdown-Quellenblöcke in der normalen
  Mitschrift. Tage und Materialversionen bleiben getrennt; erneutes Erfassen für
  denselben Tag und dieselbe Quelle aktualisiert deren Seiten. Eigene Ergänzungen
  innerhalb des Blocks und persönliche Querverweise bleiben erhalten.
- Die Auswahl älterer Mitschriften speichert ausschließlich Kurs-/Material-IDs
  und eine Notiz-UUID, begrenzt auf 160 Zuordnungen, an den bestehenden
  Kopplungsarbeitsbereich gebunden. Bei dessen Wechsel wird sie verworfen.
  Entfernte oder nicht zugängliche Notizen lassen sich über den Picker ersetzen.
  Während einer laufenden Neuanlage ist der Wechsel gesperrt.
- Quellenlinks beziehen sich auf PDF-Seitennummern und eine konkrete
  `ResourceVersion.id`. `lookup.fetch` löst `/material/ID?page=N` zur bereits
  veröffentlichten, unveränderlichen Quellenrevision auf. Ein späteres
  Materialupdate ersetzt diese Quelle nicht. Kurs-, Kategorie- und Gruppenrechte
  gelten weiterhin. Nicht indizierte oder gesperrte Quellen liefern 404.
- Je Erfassung maximal 200 Seiten. Im geöffneten PDF werden Seiten gegen dessen
  Umfang geprüft; bei der Kursauswahl steht dieser Umfang nicht zur Verfügung.
  Bei unvollständiger Materialliste zeigt die Auswahl den Hinweis, die benötigte
  PDF über den Kurs zu öffnen. Die GPT-Vorlage verlangt Abrufe in Batches von
  höchstens 50 Verweisen und das Nachladen gekürzter Quellen.
- „Bearbeitet“ beschreibt den Vorlesungsumfang; es bescheinigt kein eigenständig
  nachgewiesenes Können. Es gibt keinen automatischen KI-Aufruf. Für leere
  Notiztexte und die Quellen-Aliasse ist der aktualisierte Server nötig; ein
  bisheriger Server kann leere Notizen weiterhin ablehnen.

## Nachweise

Tests ausschließlich mit erfundenen Notizen und synthetischen PDFs; keine
Hochschulanmeldung, keine echten Notiz- oder Kopplungsdaten.

- Backend: leere Erstellung/Bearbeitung, Titel-/Größenlimits, unveränderliche
  Revisionen; GPT-Notizsuche mit üblichen Freigaben; alte Materialversion,
  Seitenauswahl, Fortsetzungen, nicht indizierte und widerrufene Quellen.
- Frontend: Metadaten-Roundtrip durch den Editor, persönliche Ergänzungen und
  Querverweise, Datum-/Bereichsvalidierung, Wiederaufnahme an der Kopplung,
  langsame Wiederherstellung, Such-/Seitenwechsel und laufende Speicherung.
- Browser: ältere Notiz auswählen/bearbeiten, Entwurf zurückholen, neuer
  Browser-Kontext ohne Session-Speicher; fehlende UUID ersetzen; explizit leere
  Notiz erstellen, füllen und leeren mit erhaltener Historie; zwei Vorlesungstage
  speichern/neuladen; Enter ohne versehentliche Neuanlage.
- Hell/Dunkel auf 1440 und 390 px: Quellenfelder und Notizauswahl. Screenshots in
  diesem Verzeichnis; frühere Lesergalerien bleiben erhalten.

Quellcode und Build werden lokal geprüft. Dieser Arbeitsstand installiert keine
neue Mac-App, aktualisiert keinen laufenden Server und führt keinen Push aus.

Abnahme: 1.366 Vitest-Fälle, 45 verschiedene Browserfälle und 66 gezielte
Backendfälle bestanden. Vollständiger Backendlauf: 1.276 bestanden, sechs
übersprungen, ein bekannter Fehler des temporären macOS-Signaturtests
(`tests/test_macos_signing.py:84`). Seine Testidentität wird nicht als gültig
erkannt; die Vertrauensrichtlinien wurden nicht verändert. Typecheck, ESLint,
73 Sprach-Namespaces, Build, OpenAPI-/API-Typen, Ruff und mypy bestanden.
Nach dem Gesamtlauf zwei Quellenregressionen geprüft: Das gültige Mindestbudget
liefert 422 statt eines internen Fehlers, wenn kein Abschnitt in die Antwort
passt; überlappende Seiten-/Vollabrufe verlieren keine frühen Abschnitte bei der
Fortsetzung.

Nach Zusammenführung mit dem Rechenraster (`28f5019`): 1.380 Frontendtests und
23 gemeinsame Browserfälle bestanden, Typecheck, ESLint, Sprachprüfung und Build
erneut bestätigt. Die Galerie zeigt den gemeinsamen Stand. Das Rechenraster
bleibt verfügbar; die bereits installierte Mac-Version wurde nicht ersetzt.
