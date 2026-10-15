Ergänzung zum Nutzerauftrag vom 01.10.2026 – eigener Server mit nativen Clients:
Der Nutzer hat den vollständigen Umzug auf seinen VPS und direkten HTTPS-Zugang ausdrücklich beauftragt und Tailscale für diesen Betrieb abgewählt. Im Servermodus ersetzen ein dauerhafter einzelner Host, widerrufbare Gerätekopplung und HTTPS die nachfolgenden Vorgaben zu wechselnden Laptop-Hosts und ausschließlich lokalem/Tailscale-Zugang. API, Materialien und iCal bleiben authentifiziert; keine frei zugänglichen Studiendaten. Der Server-Schlüsselbund wird mit einem separat provisionierten privaten Schlüssel verschlüsselt. Notizentwürfe und App-Oberfläche bleiben auf den Geräten; Änderungen gehen zum Server. Syncthing synchronisiert weder die aktive Server-Datenbank noch installierte Apps. Hochschul-MFA bleibt persönlich. Der lokale Altbetrieb gilt weiterhin für bestehende, noch nicht übernommene Installationen. Umsetzung und Betriebsgrenzen: docs/SERVER.md.

Bauauftrag: UniOS (finale Fassung)
Diese Datei liegt im Repo unter docs/BAUAUFTRAG.md und ist die einzige Wahrheit für das Projekt. Bei Widersprüchen zwischen dieser Datei und deinen Annahmen gilt diese Datei.
0. Deine Rolle und Arbeitsweise
Du bist ein erfahrener Full-Stack-Entwickler (Python und TypeScript) und baust UniOS, eine persönliche Studienplattform für die Hochschule Coburg. Ich (Marc) bin Informatik-Erstsemester und habe kaum eigene Programmierkenntnisse. Daraus folgen diese Regeln:
Arbeite die Phasen aus Abschnitt 32 strikt der Reihe nach ab. Eine Phase ist erst fertig, wenn alle Abnahmekriterien nachweislich erfüllt sind. Ob du nach einer Phase stoppst oder weitermachst, bestimmt mein Startauftrag.
Führe docs/PROGRESS.md: pro Phase erledigt, offen, wie getestet. Aktualisiere sie nach jedem größeren Schritt, damit jede neue Sitzung dort weitermachen kann.
Arbeite in Arbeitspaketen, nicht in Mikroschritten. Ein Paket ist eine zusammenhängende Funktion samt Backend, Frontend und Tests (zum Beispiel „PDF-Viewer mit Markierungen“). Ablauf pro Paket: kurz planen → vollständig umsetzen → gezielt prüfen nach Abschnitt 31.1 → ein lokaler Commit pro Paket (Conventional Commits, siehe Abschnitt 29). Bündele die fertigen Pakete einer Phase in höchstens einem regulären Push. Erst nach bestandenem Phasenend-Lauf pushen. Falls die Prüfung nach dem Push einen Fehler zeigt, korrigiere ihn gesammelt und pushe die Korrektur.
Nicht auf GitHub Actions warten, während lokale Arbeit sinnvoll weitergehen kann. Vor einem weiteren Push das CI-Ergebnis des letzten Pushs prüfen. Ist es rot, repariere den Fehler zuerst und bestätige die Korrektur lokal, bevor du neue Funktionen baust.
Lesbarer, modularer Code mit sinnvollen Kommentaren. Lieber einfach und verständlich als clever.
Code, Variablen und Identifier auf Englisch. README, Doku und UI-Texte auf Deutsch.
Wenn du von dieser Spec abweichen willst oder eine Architekturentscheidung unklar ist, frag mich vorher.
Triff keine Annahmen über die Systeme der HS Coburg, die du nicht prüfen kannst (URLs, Seitenstruktur, Kürzel, aktivierte Funktionen). Nutze Platzhalter im Hochschulprofil und trag in docs/MANUELL_TESTEN.md ein, was ich nachschauen muss.
Jede neue Abhängigkeit kurz begründen.
Niemals echte Zugangsdaten in Tests, Code, Fixtures oder Git. Du meldest dich nie bei echten Hochschulsystemen an.
1. Ziel
UniOS prüft meine Uni-Systeme regelmäßig, lädt neue Inhalte herunter, erkennt Änderungen, verwaltet alle Studienunterlagen versioniert, überwacht Fristen, Prüfungen und Abgaben, verknüpft Projekte, integriert Anki und stellt einer externen KI sauber aufbereiteten Kontext bereit.
Das Programm selbst erledigt nur deterministische Aufgaben: Sync, Download, Versionierung, Datenhaltung, Suche, Benachrichtigungen, Anki-Anbindung. Alles, was KI braucht (Karteikarten, Erklärungen, Übungsaufgaben, Lernpläne), passiert über eine definierte, optionale Schnittstelle (Abschnitt 19). Das Tool muss ohne jede KI voll nutzbar sein.
Zuerst baue ich es für mich. Es wird als Open-Source-Projekt unter AGPL-3.0-or-later veröffentlicht (Abschnitt 29), bei dem jede Person ihre eigene Instanz betreibt (keine gehostete Plattform für andere). Langfristig soll es auch für Studierende ohne Technikkenntnisse nutzbar werden.
2. Harte Regeln (nicht verhandelbar)
Keine Umgehung von MFA, CAPTCHA oder anderen Sicherheitsmaßnahmen. Logins macht der Nutzer selbst.
PRIMUSS ist ausschließlich lesend. Niemals Prüfungsanmeldungen, Abmeldungen oder andere schreibende Aktionen.
Nie Dateien löschen oder überschreiben. Geänderte Dateien bekommen eine neue Version, verschwundene werden nur markiert.
Keine Zugangsdaten, Tokens oder Session-URLs im Klartext in Code, Repo oder Logs. Secrets liegen in der OS-Keychain (keyring), ersatzweise in einer .env mit Rechten 600.
Standardmäßig keine Cloud-KI und kein LLM im Backend. Ein optionaler API-Adapter (Abschnitt 19.6) ist erlaubt, aber standardmäßig aus, nutzt den eigenen Schlüssel des Nutzers, hat ein hartes Budgetlimit und respektiert die KI-Freigabeliste.
Dashboard, API und iCal sind nie öffentlich im Internet. Zugriff nur lokal oder über Tailscale. Einzige Ausnahme: der MCP-Endpunkt darf auf ausdrücklichen Wunsch per Tunnel veröffentlicht werden, nur mit OAuth und nur mit freigegebenen Daten (Abschnitt 19.4).
Schonender Umgang mit den Hochschulsystemen: Anfragen sequentiell mit kleinen Pausen, Sync-Intervall konfigurierbar (Standard 60 min mit zufälligem Versatz ±5 min), Ruhezeiten (Standard 1–6 Uhr kein Sync).
Keine vorgetäuschte Genauigkeit. Bei zu wenig Daten wird Zu wenig Daten angezeigt, nie ein geratener Wert. Ein nicht eindeutig lesbarer Status ist Status unklar – bitte manuell prüfen.
Moodle-Abgaben nur nach expliziter Bestätigung (Abschnitt 22.3). Eigenständigkeitserklärungen werden nie automatisch akzeptiert. Die KI-Schnittstelle kann nie etwas abgeben.
Einzelnutzer-System. Keine Accounts für andere, keine Einladungen, kein Teilen von Daten. Über andere Personen werden nur Namen und optional GitHub-Benutzernamen gespeichert.
Keine persönlichen Daten im Repo. Keine echten Kursnamen, Dateien, Noten oder HTML-Seiten mit meinen Daten in Fixtures. Fixtures sind erfunden oder anonymisiert.
Höchstens ein schreibender Host gleichzeitig (Staffelstab, Abschnitt 3.2). Ohne Staffelstab startet eine Instanz keinen Sync und schreibt nicht in die Datenbank. Im Zweifel wird nicht übernommen.
3. Architektur und Betrieb
3.1 Host-Modell: genau ein Host, wechselbar
UniOS läuft immer auf genau einem Host-Gerät. Host werden können mein MacBook und mein Windows-PC (später weitere, zum Beispiel ein Raspberry Pi). Wer gerade Host ist, entscheidet der Staffelstab (3.2). Das Handy ist immer Zuschauer.
┌──────── Host (MacBook ODER Windows-PC – wer den Staffelstab hält) ────────┐
│                                                                            │
│  Scheduler ──► Sync Engine ──► Connectors (Moodle, PRIMUSS, mycampus, Mail)│
│                    │                                                       │
│                    ├──► Change Detection ──► File Store (<DATA_DIR>/uni)   │
│                    ├──► Text Extraction ──► Suche (SQLite FTS5)           │
│                    └──► SQLite (live in <LOCAL_DIR>, Snapshots in DATA_DIR)│
│                                                                            │
│  FastAPI: REST-API · React-PWA (statisch) · MCP-Server · iCal · CLI       │
│  Notifier (ntfy / Discord) · Health · Backups (restic) · Staffelstab      │
└──────────────────────────────▲─────────────────────────────────────────────┘
                               │ Tailscale (WireGuard, Ende-zu-Ende verschlüsselt)
          ┌────────────────────┼─────────────────────────┐
  Zweites Host-fähiges Gerät (Standby)              Smartphone
  · Syncthing Senden & Empfangen (nur via Tailscale) · PWA (installiert)
  · Snapshots aktuell, übernimmt bei Übergabe       · Push über ntfy
    oder Ausfall
  · Dashboard nur lesend, leitet zum Host weiter
Zwei Ordner:
DATA_DIR: wird zwischen Host-fähigen Geräten per Syncthing gespiegelt. Enthält Uni-Dateien, Sidecars, Markierungen, Kursnotizen, Drop-Ordner, KI-Inbox/Outbox, Abgabe-Archiv, Staffelstab und Datenbank-Snapshots.
LOCAL_DIR: wird nie synchronisiert. Enthält die live genutzte SQLite-Datenbank (und im Lernmodus B die Anki-Collection), Caches und Logs.
Host-agnostisch: Kein Code darf ein Betriebssystem voraussetzen. Pfade über pathlib, Dateinamen Windows-sicher (Abschnitt 12).
Betrieb:
macOS: nativ als launchd-Dienst (deploy/macos/), kein Docker Desktop.
Windows: Hintergrunddienst über die Aufgabenplanung (deploy/windows/), startet bei Anmeldung und nach dem Aufwachen. Die Doku erklärt die nötigen Energieoptionen.
Linux: systemd (deploy/linux/) oder docker-compose.yml.
Ein Prozess: FastAPI liefert API, gebautes Frontend, MCP und iCal aus.
Catch-up: Nach Start, Übernahme oder Aufwachen holt der Scheduler verpasste Syncs sofort nach.
Lücken ehrlich zeigen: Ist kein Host-fähiges Gerät an, wird nicht gesynct. Das Dashboard zeigt Letzter Sync vor X Stunden, und bekannte kritische Fristen (Rückmeldung, Prüfungsanmeldung) werden beim letzten Sync vorab als Push-Erinnerung eingeplant.
Module sind lose gekoppelt. Jeder Connector implementiert dieselbe Schnittstelle (Abschnitt 6).
3.2 Staffelstab (Host-Lease), Übergabe und Übernahme
Staffelstab: Datei <DATA_DIR>/host/lease.json mit device_id, device_name, acquired_at, heartbeat_at und generation (fortlaufende Datenstand-Nummer). Der Host erneuert den Herzschlag alle 5 Minuten (konfigurierbar).
Nur der Halter schreibt: Scheduler, Sync, Datenbank-Schreibzugriffe, Dateiablage, Benachrichtigungen und Backups laufen nur auf dem Host. Andere Instanzen laufen im Standby: kein Scheduler, Oberfläche nur lesend mit Hinweis Host ist gerade: <Gerät>. Die PWA kennt alle Host-fähigen Geräte und verbindet sich automatisch mit dem aktuellen Host.
Datenbank nie live synchronisieren: Der Host schreibt regelmäßig (Standard alle 15 Minuten, immer bei Übergabe) einen konsistenten Snapshot über die SQLite-Backup-API nach <DATA_DIR>/host/snapshots/, mit generation und SHA-256. Alte Snapshots werden nach Regeln aufgeräumt (die letzten n behalten).
Geplante Übergabe (Button, unios host release, automatisch beim Herunterfahren oder Ruhezustand, soweit das Betriebssystem das meldet):
Scheduler stoppen, laufenden Sync sauber beenden.
Finaler Snapshot, generation + 1, Staffelstab freigeben.
Das andere Gerät (unios host acquire oder automatisch) wartet, bis Syncthing den Ordner als vollständig synchron meldet (Syncthing-REST-API), prüft den Snapshot-Hash, stellt die Datenbank daraus her, übernimmt den Staffelstab und startet mit Catch-up.
Automatische Übernahme bei Ausfall (für Standby-Geräte, Standard an, abschaltbar). Nur wenn alle Bedingungen erfüllt sind:
Herzschlag älter als die Schwelle (Standard 2 Stunden),
bisheriger Host ist über Tailscale nicht erreichbar (Health-Endpunkt),
der lokale Snapshot hat die höchste bekannte generation,
Syncthing meldet den Ordner als vollständig.
Sonst keine Übernahme, stattdessen ein Hinweis im Dashboard.
Zwei Hosts erkannt (zum Beispiel weil ein Gerät offline weiterlief): Die höhere generation gewinnt, bei Gleichstand das Gerät mit dem früheren acquired_at. Das unterlegene Gerät wechselt sofort in Standby und legt ein Konfliktpaket unter <DATA_DIR>/host/conflicts/<Zeitpunkt>/ an: alle Nutzeraktionen seit dem letzten gemeinsamen Snapshot (Freigaben, Zuordnungen, Einstellungen) als JSON-Ereignisliste. Das Dashboard zeigt eine laute Warnung und bietet an, die Aktionen einzeln nachzuspielen. Dateien gehen dabei nicht verloren, weil nie überschrieben wird. Markierungen sind ohnehin nur anhängende Ereignisdateien.
Pro Gerät einmal einrichten: Tokens und Sessions liegen in der Keychain jedes Host-fähigen Geräts. unios doctor prüft, ob das Gerät übernehmen könnte, und meldet fehlende Zugänge.
3.3 Netzwerk, Verschlüsselung und Zugriff
Tailscale auf allen Geräten. Dashboard per Tailscale Serve mit gültigem HTTPS-Zertifikat (Voraussetzung für die installierbare PWA).
Syncthing nur über Tailscale: globale Discovery, Relays und NAT-Traversal ausschalten, Geräteadressen fest auf die Tailscale-Namen setzen. Daten fließen damit nur direkt zwischen meinen Geräten, doppelt verschlüsselt (WireGuard plus Syncthing-TLS). Die Doku enthält eine Schritt-für-Schritt-Anleitung und unios doctor prüft die Einstellungen.
Der Tailscale-Koordinationsserver kennt nur Geräte und Schlüssel, nie Inhalte. Wer auch das nicht will, kann Headscale nutzen (nur dokumentieren).
Festplattenverschlüsselung: unios doctor warnt, wenn FileVault (macOS) bzw. BitLocker (Windows) nicht aktiv ist.
Ohne Tailscale funktioniert das Dashboard lokal auf dem Host unter localhost. Kein Grundfeature darf Tailscale zwingend voraussetzen, nur Mehrgeräte-Betrieb braucht es.
4. Tech-Stack
Zweck	Technologie
Backend-Sprache	Python 3.12+, Paketverwaltung mit uv
Backend / API	FastAPI, OpenAPI-Schema als Vertrag zum Frontend
Datenbank	SQLite via SQLModel/SQLAlchemy, Migrationen mit Alembic
Scheduler	APScheduler
Frontend	React + TypeScript + Vite
UI	Tailwind CSS + shadcn/ui, Icons: lucide-react
Datenabruf / Cache	TanStack Query, persistiert in IndexedDB (Offline)
Routing	React Router
API-Typen	openapi-typescript (Typen aus dem FastAPI-Schema generiert)
PWA	vite-plugin-pwa (Service Worker, Manifest, Offline-Cache)
Befehlspalette	cmdk
Moodle	Moodle Web Service API (Mobile-App-Token)
PRIMUSS / mycampus	Playwright nur für den Login, danach httpx + BeautifulSoup
Uni-Mail	IMAP (nur lesend) oder was die Hochschule anbietet – vorher mit mir klären
Textextraktion	markitdown und/oder PyMuPDF, python-pptx, python-docx
Suche	SQLite FTS5
MIME-Erkennung	filetype
Karteikarten	Modus A: AnkiConnect über lokalen anki-agent · Modus B: anki (PyPI, AGPL-3.0) als Engine, ts-fsrs für Offline-Vorschau
KI-Schnittstelle	MCP Python SDK (FastMCP) + dateibasierte Inbox/Outbox
CLI	Typer
Benachrichtigungen	ntfy und/oder Discord-Webhook
Kalender	icalendar
Validierung	Pydantic
Secrets	keyring (OS-Keychain), Fallback .env
Netzwerk	Tailscale (Serve), optional Tailscale Funnel nur für MCP
Datei-Spiegelung	Syncthing, nur über Tailscale, Status über die Syncthing-REST-API
Host-Koordination	eigener Staffelstab (Lease-Datei) + SQLite-Backup-API für Snapshots
Backups	restic
GitHub	GitHub REST API (httpx), fine-grained Token nur mit Leserechten
Tests	pytest, Playwright (End-to-End), Vitest (Frontend-Logik)
Qualität	ruff, mypy, eslint, tsc, prettier
Changelog	git-cliff
moodle-dl (GPL-3.0) darf als Vorlage oder Abhängigkeit für den SSO-Token-Flow genutzt werden, GPL-3.0 ist mit unserer AGPL-3.0 kompatibel. Übernahmeregeln in Abschnitt 29.
5. Projektstruktur
unios/
├── AGENTS.md                (harte Regeln für KI-Agents, siehe Abschnitt 29)
├── README.md                (Deutsch) · README.en.md
├── LICENSE (AGPL-3.0-or-later) · THIRD_PARTY_NOTICES.md · CHANGELOG.md · cliff.toml
├── pyproject.toml · uv.lock
├── docker-compose.yml
├── .env.example
├── alembic/
├── deploy/
│   ├── macos/               (launchd-Vorlagen)
│   ├── windows/             (Aufgabenplanung-Vorlagen)
│   └── linux/               (systemd-Vorlagen)
├── institutions/
│   └── hs-coburg.yaml       (Hochschulprofil, siehe Abschnitt 6)
├── app/
│   ├── main.py · config.py
│   ├── host/                (Staffelstab, Snapshots, Übergabe, Konfliktpakete)
│   ├── db/                  (Modelle, Session, Queries)
│   ├── connectors/
│   │   ├── base.py          (Connector-Schnittstelle)
│   │   ├── moodle/ · primuss/ · mycampus/ · mail/ · github/
│   ├── sync/                (Engine, Change Detection, Versionierung, Gruppenfilter)
│   ├── files/               (File Store, Pfadlogik, Namensbereinigung, Sidecars, Drop-Ordner)
│   ├── extract/             (Textextraktion, FTS-Index)
│   ├── notify/              (Push, Digest)
│   ├── calendar/
│   ├── watchdogs/           (Prüfungen, Rückmeldung)
│   ├── grades/              (Noten, ECTS, Was-wäre-wenn)
│   ├── cards/               (Warteschlange, Modus A: Agent-API, Modus B: integrierter Lernmodus)
│   ├── submissions/         (Abgabe-Check, Archiv, Abgabe-Flow)
│   ├── projects/            (Projekte, GitHub, Repo-Spiegelung)
│   ├── ai/                  (Freigabeliste, MCP, Inbox/Outbox, KI-Paket, Kostenrechner, API-Adapter)
│   ├── learning/
│   ├── annotations/         (Viewer-Backend, Markierungen, Übertragung auf neue Versionen, offene Fragen)
│   ├── notes/               (Kursnotizen, Schnellerfassung, Verknüpfungen)
│   ├── health/
│   ├── cli/
│   └── api/                 (REST-Routen)
├── frontend/
│   ├── src/ (pages, components, lib, api-types)
│   └── vite.config.ts
├── clients/
│   ├── anki_agent/
│   └── login_helper/
├── scripts/                 (install-mac.sh, install-windows.ps1, backup, tutorial-videos)
├── docs/
│   ├── BAUAUFTRAG.md · PROGRESS.md · MANUELL_TESTEN.md
│   ├── design/              (Referenzbilder, siehe 24.3a)
│   └── site/                (Projektseite für GitHub Pages, Phase 6)
└── tests/
    ├── fixtures/            (nur erfundene oder anonymisierte Daten)
    ├── fake_servers/        (lokale Fake-Server für Moodle, PRIMUSS, mycampus, Mail)
    └── e2e/                 (Playwright)
6. Hochschulprofile und Connector-Schnittstelle
Damit das Projekt später an anderen Hochschulen nutzbar ist, steht nichts Hochschulspezifisches im Code.
Hochschulprofil institutions/<slug>.yaml: Name, Moodle-URL, PRIMUSS-Basis-URL und Hochschulkürzel, mycampus-URL, Mail-Server, CSS-Selektoren für HTML-Connectoren, bekannte öffentliche Fristen-Seiten, Notensystem und Notengewichtung laut Prüfungsordnung. Unbekannte Werte sind Platzhalter mit Kommentar TODO: von Marc prüfen.
Connector-Schnittstelle in connectors/base.py: einheitliche Methoden (check_auth, list_courses, fetch_changes, download, health) und ein einheitliches Ergebnisformat. Neue Systeme (zum Beispiel ILIAS an einer anderen Hochschule) lassen sich als Plugin ergänzen, ohne die Sync Engine anzufassen.
Jeder Connector ist einzeln aktivierbar und deaktivierbar.
6.1 Spätere UniOS Extensions
Connectoren für externe Datenquellen und Addons für neue Funktionen oder Ansichten bleiben getrennte Verträge. Auf Marcs spätere Anweisung wird eine begrenzte, deklarative Addon API v1 bereits jetzt gebaut: lokaler Katalog, `ExtensionManifestV1`, `ExtensionPermission`, Freigaben und feste UI-Erweiterungspunkte. Community-Code erhält keinen direkten Zugriff auf React, Browser-Speicher, Datenbank oder allgemeine API. Eine ausführbare Addon-Laufzeit oder ein öffentlicher Store braucht zuvor nachgewiesene Isolation und gehört nicht zur deklarativen v1. [EXTENSIONS.md](EXTENSIONS.md) beschreibt den tatsächlich unterstützten Vertrag.
7. Moodle-Connector
Zugriff über die Moodle Web Service API mit dem Token der Mobile-App (moodle_mobile_app), nicht über HTML-Scraping. Die Moodle-App funktioniert an der HS Coburg, die Web Services sind also aktiv.
Token-Einrichtung über den SSO-Launch-Flow der Mobile-App: Ich logge mich einmal im Browser inklusive MFA ein, der Token landet in der Keychain. Läuft er ab, zeigt das Dashboard Moodle-Token erneuern und schickt eine Benachrichtigung.
Beim Start mit core_webservice_get_site_info prüfen, welche Funktionen verfügbar sind, fehlende sauber behandeln.
Relevante Funktionen (sofern verfügbar):
core_enrol_get_users_courses: alle Kurse, neue Kurse automatisch erkennen
core_course_get_contents: Abschnitte, Module, Dateien (timemodified, filesize, fileurl, Sichtbarkeit)
core_course_get_updates_since: nur Änderungen abfragen
mod_assign_get_assignments: Aufgaben und Fristen
mod_assign_get_submission_status: Abgabestatus, Note, Feedback
mod_forum_get_forum_discussions: Ankündigungen
core_calendar_get_action_events_by_timesort: Termine und Fristen
core_group_get_course_user_groups: meine Gruppen pro Kurs (für den Gruppenfilter)
Nur für die Abgabefunktion (22.3): webservice/upload.php, mod_assign_save_submission, mod_assign_submit_for_grading
Alle Dateitypen unterstützen: PDF, PPTX, DOCX, XLSX, ZIP, Quellcode, Bilder usw.
Externe Links als Ressource vom Typ link speichern, nicht crawlen.
7.1 Gruppenfilter (Kurse mit mehreren Gruppen)
Manche Moodle-Kurse enthalten Material für mehrere Gruppen verschiedener Dozenten (Beispiel: Mathe-Vorbereitungskurs). Drei Fälle:
Echte Moodle-Gruppen mit Einschränkung: Moodle liefert fremdes Material gar nicht oder als nicht verfügbar (uservisible: false). Automatisch behandeln, keine Frage an mich.
Alles sichtbar, aber nach Dozent oder Gruppe sortiert (zum Beispiel Abschnitte „Gruppe Müller“, „Gruppe Schmidt“): Das Dashboard stellt einmalig eine Zuordnungsfrage pro Kurs: „Welche Abschnitte gehören zu deiner Gruppe?“, mit Vorschlag nach Namensmuster. Taucht später ein neuer, nicht zugeordneter Abschnitt auf, wird erneut gefragt.
Gemischt: beide Regeln kombinieren.
Verhalten:
Standard: alles herunterladen, Material fremder Gruppen aber als other_group markieren. Es erscheint nicht in „Heute neu“, löst keine Push-Nachricht aus, geht nicht an die KI und nicht in Anki-Vorschläge. Im Kurs ist es unter „Zusatzmaterial anderer Gruppen“ sichtbar.
Pro Kurs Option „Fremde Gruppen gar nicht laden“.
Die Zuordnung ist jederzeit im Dashboard änderbar.
Gehört zu Phase 1, weil sie beim ersten Sync greift.
8. PRIMUSS, mycampus und Login-Helper
Login-Helper (clients/login_helper, läuft auf dem Host oder einem anderen Gerät):
Öffnet über Playwright einen echten, sichtbaren Browser.
Ich logge mich selbst ein und bestätige MFA.
Der Helper übergibt die Session (Cookies bzw. storageState und bei PRIMUSS die Session-URL) an den Server.
Der Server nutzt diese Session für lesende Abfragen mit httpx.
Läuft die Session ab: Dashboard zeigt Hochschul-Login erforderlich, Push-Benachrichtigung.
PRIMUSS (nur lesend):
PRIMUSS ist zentral gehostet, die Hochschule wird über ein Kürzel ausgewählt. Bekanntes URL-Muster aus anderen Projekten: https://www3.primuss.de/cgi-bin/sesam/index.pl?FH=<kürzel>&Session=<…>&User=<…>&Portal=1. Das Kürzel für Coburg ist unbekannt und kommt ins Hochschulprofil (von mir prüfen lassen).
Die Session steckt in der URL. Solche URLs werden nie geloggt, nie in Fehlermeldungen oder Screenshots-Dateinamen übernommen. Baue einen Log-Filter, der Session= und User= automatisch schwärzt, und teste ihn.
Nach dem Login reichen httpx + BeautifulSoup (klassische CGI-Seiten). Playwright nur für Login und Nachweis-Screenshots.
Inhalte: Prüfungen, Anmeldephasen und Fristen, Anmeldestatus je Prüfung, Noten, Bescheinigungen, Rückmeldestatus.
Fristen aus dem System lesen, nicht hardcoden. Ergänzend öffentliche Fristen-Seiten der Hochschule (URL im Profil) als zweite Quelle.
Nach jeder Abfrage des Anmeldestatus einen Screenshot mit Zeitstempel als Nachweis speichern.
mycampus:
Veranstaltungen, Stundenplan, News, Termine, soweit vorhanden.
Duplikate vermeiden: Moodle ist maßgeblich für Kursinhalte, PRIMUSS für Prüfungen und Noten.
Seitenstrukturen von PRIMUSS und mycampus kennst du nicht. Selektoren stehen im Hochschulprofil. Für Tests baust du plausible, erfundene HTML-Seiten und Fake-Server. Ich liefere später anonymisiertes Beispiel-HTML.
9. Uni-Mail-Connector (nur lesend)
Liest das Hochschul-Postfach nur lesend (IMAP oder was die Hochschule anbietet, vorher klären).
Zweck: Mails von Prüfungsamt, Studierendenservice, Dozenten und Moodle-Benachrichtigungen als Quelle für Fristen und Hinweise erkennen.
Filter per Absender-Regeln im Profil. Erkannte Mails erscheinen im Aktivitätsverlauf und können Fristen vorschlagen (nie automatisch eintragen, ich bestätige).
Kein Versand, kein Löschen, kein Verschieben, kein Als-gelesen-Markieren.
Mailinhalte gehen standardmäßig nicht an die KI (Freigabeliste, 19.2).
10. Sync Engine und Scheduler
Ablauf pro Sync-Lauf:
Session/Token prüfen → Kurse abrufen → neue Kurse erkennen
→ Änderungen abfragen (updates_since / timemodified / filesize)
→ Gruppenfilter anwenden → nur neue oder geänderte Dateien herunterladen → Hash prüfen
→ Versionen, Sidecars und Changes speichern → Text extrahieren → Suchindex aktualisieren
→ Benachrichtigungen auslösen → sync_run protokollieren
Nie bei jedem Lauf alles neu herunterladen.
Jeder Lauf wird in sync_runs protokolliert: Start, Ende, Status, Anzahl Kurse, Ressourcen, Änderungen, Fehler.
Ein fehlgeschlagener Connector blockiert die anderen nicht.
Immer nur ein Sync gleichzeitig (Lock).
Manueller Sync per Button, Befehlspalette und CLI.
11. Change Detection und Versionierung
Pro Datei: Dateiname, Kurs, Quelle, Abschnitt, URL (ohne Session-Parameter), Download-Zeitpunkt, Größe, SHA-256, Versionsnummer, zuletzt gesehen, MIME-Type, Moodle-timemodified, Gruppenzuordnung.
Gleicher Name, anderer Hash: neue Version, Change updated. Alte Version bleibt.
04_Schleifen/
├── 2026-10-12_04_Schleifen.pdf
└── 2026-10-15_04_Schleifen.pdf
Datei verschwindet aus Moodle: lokal behalten, markieren als Nicht mehr auf Moodle vorhanden (removed_upstream).
Gleicher Hash, andere Quelle: nicht doppelt speichern, beide Referenzen erfassen.
Change-Typen: new, updated, removed_upstream, restored, metadata_changed.
12. Dateiablage
Struktur spiegelt die Moodle-Kursabschnitte:
<DATA_DIR>/uni/Semester_1/Programmieren_1/<Abschnittsname>/<Datei>
Fallback bei fehlendem Abschnitt: Sonstiges.
Semesterzuordnung pro Kurs konfigurierbar und im Dashboard änderbar.
Dateinamen bereinigen für Linux, macOS und Windows (Syncthing-Spiegelung): keine <>:"/\|?*, keine Punkte oder Leerzeichen am Ende, Längenbegrenzung, Unicode-Normalisierung (NFC), keine reservierten Windows-Namen (CON, NUL …).
Nie überschreiben, nie löschen (Regel 3).
12.1 Sidecar-Metadaten und Wiederaufbau
Neben jeder Datei liegt eine kleine Metadaten-Datei (<datei>.unios.json) mit Quelle, Kurs, Abschnitt, Hash, Version und Zeitpunkten.
unios rebuild-index baut die Datenbank für Ressourcen und Versionen allein aus dem Ordner neu auf. Damit ist die Datenbank nie ein Single Point of Failure.
Abnahme: Datenbank löschen, rebuild-index ausführen, alle Dateien und Versionen sind wieder da.
12.2 Drop-Ordner
<DATA_DIR>/drop/ für eigene Dateien (Altklausuren, Fotos von Tafelbildern, Mitschriften).
Neue Dateien werden erkannt, ich ordne sie im Dashboard einem Kurs und Abschnitt zu, dann werden sie wie Moodle-Dateien versioniert, extrahiert und durchsuchbar. Quelle manual.
13. Datenbank
SQLite als Source of Truth (live in LOCAL_DIR, siehe 3.1), Migrationen mit Alembic. Mindestens diese Tabellen mit sauberen Fremdschlüsseln:
institutions, semesters, courses, course_sections, section_group_assignments,
resources, resource_versions, resource_texts (FTS5), assignments, deadlines,
announcements, calendar_events, mails, exams, exam_registrations, grades,
modules_ects, sync_runs, changes, notifications, anki_card_queue, anki_cards,
anki_reviews, learning_topics, learning_progress, study_blocks, exercises,
exercise_attempts, ai_exports, ai_imports, ai_share_rules, ai_usage,
annotations, annotation_anchors, course_notes, jots, links, connector_health, submissions, submission_files,
submission_attempts, projects, project_members, project_links, project_tasks,
repo_snapshots, host_events, sync_conflicts, review_log_buffer, settings
links ist eine generische Verknüpfungstabelle (from_type, from_id, to_type, to_id, relation), mit der sich beliebige Objekte verbinden lassen: Vorlesung ↔ Übungsblatt ↔ Notiz ↔ Prüfung ↔ Projekt.
14. Textextraktion und Suche
Nach jedem Download Text extrahieren (PDF, PPTX, DOCX, Quellcode), seitenweise bzw. folienweise speichern.
Zusätzlich eine Markdown-Version pro Dokument (für die KI-Schnittstelle).
Volltextsuche mit SQLite FTS5 über Unterlagen, Markierungskommentare, offene Fragen, Kursnotizen und Schnellerfassungen: Treffer mit Kurs, Datei, Seite und Snippet, Filter nach Kurs, Semester und Typ.
Gescannte PDFs ohne Textebene markieren (no_text_layer). OCR vorerst nicht.
15. Benachrichtigungen, Kalender und Digest
Kanäle: ntfy und/oder Discord-Webhook, konfigurierbar. Push-Texte sind neutral und enthalten nie Noten oder Inhalte, nur Hinweise mit Link (zum Beispiel „Neue Bewertung verfügbar“).
Auslöser: neue Dateien (gebündelt pro Sync-Lauf), neue Aufgaben, Deadline-Warnungen (7, 3, 1 Tag vorher, konfigurierbar), Prüfungsanmeldephase geöffnet oder bald endend, Rückmeldefrist, Login oder Token läuft ab, Connector-Fehler, Abgabe nur als Entwurf, Gruppenmitglieder haben noch nicht bestätigt, neue Bewertung, lange kein Sync.
Deadline-Warnungen entfallen, sobald eine Aufgabe nachweislich eingereicht ist.
iCal-Feed (nur lokal/Tailscale) mit Deadlines, Prüfungen, Anmelde- und Rückmeldefristen.
Sonntags-Digest (optional, Standard an): eine Nachricht am Sonntagabend mit der Woche davor und der Woche danach: neue Materialien pro Kurs, anstehende Fristen, Anki-Stand, offene Zuordnungsfragen.
16. Watchdogs (nur lesend)
16.1 Prüfungsanmeldung
Während einer Anmeldephase zeigt das Dashboard prominent:
Prüfungsanmeldung – endet in 3 Tagen          [Zu PRIMUSS →]

Programmieren 1        ✅ angemeldet
Grundlagen Informatik  ✅ angemeldet
Englisch 1             ❌ nicht angemeldet
Warnungen 7, 3 und 1 Tag vor Ende, per Dashboard und Push.
Button direkt zu PRIMUSS. Die Anmeldung mache ich selbst. Danach liest das System den Status erneut und speichert einen Screenshot mit Zeitstempel.
Nicht eindeutig lesbar: Status unklar – bitte manuell prüfen.
16.2 Rückmeldung
Erkennt Rückmeldezeitraum und -status (PRIMUSS, öffentliche Fristen-Seite, Uni-Mail).
Warnt früh und eskalierend, solange die Rückmeldung nicht als erledigt erkannt ist. Weil zeitweise kein Host-fähiges Gerät an sein kann, werden Erinnerungen vorab eingeplant (Abschnitt 3.1).
Bezahlt oder gemeldet wird nie automatisch.
17. Noten und ECTS
Übersicht aller Module mit ECTS, Note, Versuch und Status (aus PRIMUSS, manuell ergänzbar).
ECTS-Fortschritt pro Semester und gesamt.
Durchschnitt nach der Gewichtung der Prüfungsordnung, die im Hochschulprofil bzw. in den Einstellungen hinterlegt wird. Keine geratene Gewichtung: fehlt sie, wird der einfache ECTS-gewichtete Schnitt angezeigt und klar so beschriftet.
Was-wäre-wenn: Ich trage hypothetische Noten für offene Module ein und sehe den resultierenden Schnitt. Hypothetische Werte sind klar markiert und werden nie mit echten verwechselt.
Noten sind sensibel: nie in Push-Texten, nie an die KI ohne ausdrückliche Freigabe.
18. Karteikarten: offizielles Anki oder integrierter Lernmodus
Zwei Modi, wählbar im Einrichtungsassistenten und jederzeit änderbar. Standard für mich ist Modus A.
18.1 Gemeinsam für beide Modi
Kartenwarteschlange (anki_card_queue) mit proposed → approved → pushed bzw. rejected.
Decks: Uni::<Kursname>.
Tags (verbindlich ab Tag 1): uni::<kurs-slug>::<themen-slug> plus semester::<n>.
Notiztypen UniOS Basic und UniOS Cloze mit den Feldern Front/Text, Back/Extra, Course, Topic, Semester, SourceFile, SourcePage, CreatedAt, UniOSId.
Gegen Kartenflut: höchstens 15 neue Vorschläge pro Ressource (konfigurierbar). Die Preview zeigt die Menge in der Warteschlange im Vergleich zum Tageslimit für neue Karten.
Preview-Flow: ansehen, einzeln bearbeiten, annehmen oder ablehnen, Sammelfreigabe. Kein Auto-Approve.
Die Lerndaten (Abschnitt 20) werden in beiden Modi gleich ausgewertet.
18.2 Modus A: offizielles Anki
Angebunden über AnkiConnect, das nur bei geöffnetem Anki Desktop läuft.
anki-agent (clients/anki_agent, auf jedem Gerät mit Anki möglich, spricht immer mit dem aktuellen Host):
prüft, ob AnkiConnect erreichbar ist,
holt freigegebene Karten und legt sie in Anki an, vorher Duplikatcheck (findNotes),
meldet die Note-IDs zurück,
liest Review-Daten (cardsInfo, getReviewsOfCards) und schickt sie an den Host.
Die Synchronisation zwischen Geräten erledigt AnkiWeb.
18.3 Modus B: integrierter Lernmodus
Engine: die offizielle Anki-Bibliothek (anki auf PyPI, AGPL-3.0) für Collection, Notiztypen, Planung mit FSRS sowie Import und Export von .apkg. Der Lernalgorithmus wird nicht nachgebaut.
Die Collection liegt in LOCAL_DIR und wird wie die Datenbank nur als Snapshot zwischen Host-fähigen Geräten übertragen (Abschnitt 3.2).
Eigene Lernoberfläche in React, im Design der App: Lernen mit Tastatur und Touch (Nochmal, Schwer, Gut, Einfach), Kartenbrowser, Editor, Statistiken. Ziel: angenehmer und moderner als Anki Desktop.
Offline auf dem Handy: Die PWA lädt die fälligen Karten des Tages vor. Offline gegebene Bewertungen werden als Review-Log gepuffert und beim nächsten Kontakt an den Host übertragen und eingespielt (nur anhängen, daher konfliktfrei). Für offline gelernte Karten berechnet die PWA vorläufige Intervalle mit ts-fsrs (MIT). Maßgeblich ist die Neuberechnung auf dem Host.
Wechsel zwischen den Modi: A → B per .apkg-Import inklusive Lernhistorie, soweit das Format sie enthält. B → A per .apkg-Export. Beides mit Vorschau und ohne Datenverlust (vorher automatischer Snapshot).
AnkiWeb: Modus B synchronisiert nicht mit AnkiWeb, außer das ist nachweislich zulässig. Nicht annehmen, mich fragen.
Code und Ideen aus Anki dürfen übernommen werden, Regeln in Abschnitt 29.
19. KI-Schnittstelle
19.1 Stufenmodell
Die KI ist optional. Das Tool funktioniert ohne sie vollständig.
Stufe	Für wen	Wie
0 – keine KI	alle	Sync, Fristen, Suche, Anki-Verwaltung ohne KI
1 – KI-Paket	wer ein Chat-Abo hat (ChatGPT, Claude …)	Knopf „KI-Paket erstellen“: fertiges Paket aus Material + Anleitung zum Kopieren oder als ZIP, Antwort wird per Einfügen oder Datei-Upload zurückgespielt
2 – MCP	Fortgeschrittene	KI greift direkt über den MCP-Server zu (19.4)
3 – API-Adapter	wer es automatisch will	eigener API-Schlüssel, Budgetlimit (19.6)
Alle Stufen nutzen dasselbe Ergebnisformat (19.5). Standard für mich ist Stufe 2 mit ChatGPT Work, im Rhythmus 1–2× pro Woche.
19.2 Freigabeliste (Datenschutz)
Die KI sieht standardmäßig nur Kursmaterial und Lerndaten (Anki-Stand, Themen, Übungen).
Standardmäßig freigegeben sind zusätzlich die „Verstehe ich nicht“-Stellen samt Frage, weil sie Lerndaten sind.
Standardmäßig gesperrt: Noten, PRIMUSS-Daten, Mails, Markierungskommentare, Kursnotizen, Abgaben, Projektdaten, Material fremder Gruppen.
Jede Kategorie und jeder Kurs ist einzeln freigebbar oder sperrbar (zum Beispiel wenn ein Dozent die Weitergabe seiner Skripte untersagt).
Die Freigabeliste gilt für alle Stufen gleichermaßen und wird serverseitig durchgesetzt, nicht nur in der Oberfläche.
19.3 KI-Paket (Stufe 1)
Erzeugt ein Paket für einen Kurs, einen Zeitraum oder ausgewählte Ressourcen: Markdown-Texte, Metadaten, das JSON-Schema aus 19.5 und eine fertige Anleitung („Erstelle höchstens 15 Karten pro Dokument im folgenden Format …“).
Eigene Paketvariante „Offene Fragen erklären“: enthält die markierten Stellen mit Kontext und Frage (21.3) und die Anleitung, jede Stelle verständlich zu erklären.
Ausgabe als kopierbarer Text (bei kleinen Paketen) oder ZIP.
Rückweg: Antwort ins Dashboard einfügen oder als Datei hochladen, Validierung wie 19.5.
19.4 MCP-Server (Stufe 2)
FastMCP-Server, standardmäßig aus, nur mit Token bzw. OAuth. Tools:
list_courses()
get_changes(since)
get_resource_text(resource_id, pages=None)
search(query, course=None)
get_deadlines(days=14)
get_exam_status() (nur wenn freigegeben)
get_learning_status(course=None)
get_anki_status()
get_submission_status(course=None) (nur wenn freigegeben)
get_projects() (nur wenn freigegeben)
submit_anki_candidates(payload): landet als proposed in der Warteschlange, nie direkt in Anki
submit_exercises(payload)
Regeln:
Die Tool-Beschreibungen und Server-Instructions enthalten die Arbeitsanweisungen (Kartenlimit, Schema, Themen-Slugs), damit jede KI ohne eigenen Prompt korrekt arbeitet. Zusätzlich liefert das Dashboard einen fertigen Anweisungstext zum Einfügen in ein ChatGPT- oder Claude-Projekt.
Kein Zugriff auf die Abgabefunktion, keine schreibenden Aktionen außer den beiden submit_*-Tools.
Zwei Anbindungswege:
Lokal (stdio/localhost): für Clients, die lokale MCP-Server unterstützen (zum Beispiel Claude Desktop). Einfachster Weg.
Remote über HTTPS: ChatGPT verbindet sich nur mit öffentlich erreichbaren HTTPS-Servern (Custom Connector im Entwicklermodus, abhängig vom Tarif). Dafür wird ausschließlich der MCP-Endpunkt per Tailscale Funnel oder Cloudflare Tunnel veröffentlicht, mit OAuth 2.1 (inkl. Dynamic Client Registration) und einer Bestätigungsseite mit PIN auf dem Host. Dashboard, API und iCal bleiben privat. Eine Anleitung dafür gehört in die Doku, die konkreten ChatGPT-Menüpfade nicht hart in den Code schreiben, sie ändern sich.
Jeder MCP-Zugriff wird protokolliert (wer, wann, welches Tool, welche Ressourcen) und ist im Dashboard einsehbar. Ein Not-Aus-Schalter sperrt den Endpunkt sofort.
19.5 Dateibasierte Inbox/Outbox und verbindliches Format
<DATA_DIR>/ai/inbox/     ← UniOS schreibt Kontextpakete
<DATA_DIR>/ai/outbox/    ← KI-Ergebnisse
<DATA_DIR>/ai/outbox/processed/
<DATA_DIR>/ai/outbox/rejected/   (mit Fehlerdatei)
Kartenvorschläge (alle Stufen, validiert mit Pydantic, ungültige Dateien nach rejected/ mit Fehlerbeschreibung):
{
  "schema_version": 1,
  "generated_by": "chatgpt-work",
  "generated_at": "2026-10-12T18:30:00+02:00",
  "source": { "resource_id": 123, "version": 2 },
  "cards": [
    {
      "card_type": "basic",
      "front": "Was ist der Unterschied zwischen while und do-while?",
      "back": "do-while prüft die Bedingung erst nach dem ersten Durchlauf ...",
      "course": "prog1",
      "topic": "schleifen",
      "source_page": 12,
      "confidence": "high"
    }
  ]
}
Für Übungsaufgaben analog ein eigenes Schema: Aufgabe, Thema, Schwierigkeit, Musterlösung, Lösungsweg. unios schema gibt beide Schemas als JSON Schema aus.
19.6 Kostenrechner und API-Adapter (Stufe 3, optional)
Kostenrechner (funktioniert ohne Schlüssel und ohne Netzwerk):
Zählt lokal die Tokens aller freigegebenen Inhalte (Schätzung per Tokenizer oder Zeichenheuristik, klar als Schätzung beschriftet). Es wird nichts an einen Anbieter geschickt.
Zeigt zwei Zahlen pro Modell: einmalig für den aktuellen Bestand und laufend pro Woche anhand der durchschnittlichen neuen Inhalte, jeweils mit und ohne Batch-Rabatt.
Preise stehen in einer Konfigurationsdatei (config/ai_prices.yaml) mit Stand-Datum, nie im Code. Veraltete Preise (älter als 90 Tage) werden markiert.
API-Adapter:
Standardmäßig aus. Eigener Schlüssel des Nutzers in der Keychain.
Hartes Monatsbudget: Vor jedem Aufruf wird die voraussichtliche Menge geprüft, bei Überschreitung wird nicht gesendet. Verbrauch in ai_usage.
Respektiert die Freigabeliste, erzeugt exakt das Format aus 19.5, Ergebnisse landen als proposed in der Warteschlange.
Anbieter über eine kleine Adapter-Schnittstelle austauschbar.
20. Lerndaten und Lernblöcke
Pro Thema (learning_topics, abgeleitet aus den Anki-Tags):
topic: Java Schleifen
anki_retention: 83 %      (erst ab Mindestanzahl Reviews)
exercise_accuracy: 71 %   (erst ab Mindestanzahl Versuchen)
last_review: 2026-10-12
confidence: medium
Mindestdatenmengen konfigurierbar, darunter Zu wenig Daten.
Jeder Aufgabenversuch speichert Aufgabe, Thema, Schwierigkeit, Zeitpunkt, Antwort, richtig/falsch, Lösungsweg, Fehlerart.
Lernblöcke vor Prüfungen: Aus Prüfungsterminen und schwachen Themen schlägt das System Lernblöcke vor (Thema, Dauer, Zeitraum). Ich nehme sie an oder verwerfe sie, angenommene Blöcke erscheinen im iCal-Feed. Rein regelbasiert, keine KI nötig.
Wochenübersicht: was gelernt, was offen, was schwach.
21. Arbeiten im Material, Schnellerfassung und Verknüpfungen
Statt eines eigenen Notiz-Editors wird direkt im Lernmaterial gearbeitet. Ein separater Markdown-Editor pro Kurs entfällt.
21.1 Dokument-Viewer mit Markierungen
Viewer in der App für PDFs, auf Basis von PDF.js. Die konkrete Bibliothek für Markierungen wählst du nach Lizenz (AGPL-kompatibel), Pflegezustand und Bedienbarkeit aus und begründest die Wahl kurz.
PowerPoint und Word werden für die Anzeige im Hintergrund in PDF umgewandelt (zum Beispiel LibreOffice headless). Die Umwandlung ist eine abgeleitete Ansichtsdatei, das Original bleibt unverändert. Ist keine Umwandlung möglich, bietet der Viewer den Download an.
Funktionen:
Text markieren (wenige Farben),
Kommentar an eine Markierung hängen,
Stelle als „Verstehe ich nicht“ kennzeichnen, optional mit kurzer Frage,
Markierung später als „Verstanden“ abhaken,
Seitenleiste mit allen Markierungen des Dokuments, Sprung zur Stelle.
Tastatur und Maus am Desktop, Touch auf dem Handy. Handschrift und Stifteingabe sind nicht Teil dieses Auftrags.
21.2 Speicherung (nie in die PDF schreiben)
Markierungen werden nicht in die Originaldatei geschrieben (Regel 3). Sie liegen daneben unter <DATA_DIR>/annotations/<resource>.jsonl als nur anhängendes Ereignisprotokoll (anlegen, ändern, erledigen, löschen als Ereignis). Das ist Syncthing-freundlich und nachvollziehbar. Die Datenbank hält nur einen Index.
Jede Markierung speichert ihre Position mehrfach: Seite und Koordinaten und den markierten Text mit etwas Kontext davor und danach (Textanker nach dem Muster des W3C-Web-Annotation-Modells).
Neue Version einer Datei: Das System überträgt Markierungen anhand des Textankers automatisch auf die neue Version. Was sich nicht eindeutig zuordnen lässt, erscheint in einer Liste „Markierungen prüfen“ mit Vorschau der alten Stelle. Nie stillschweigend verwerfen.
Export: „Kopie mit Markierungen exportieren“ erzeugt eine neue PDF-Datei mit eingebrannten Markierungen (zum Beispiel mit PyMuPDF), das Original bleibt unberührt.
Offline: Markierungen, die offline auf einem Gerät gesetzt werden, werden wie Schnellerfassungen gepuffert und später übertragen.
21.3 Offene Fragen
Alle „Verstehe ich nicht“-Stellen werden pro Kurs gesammelt: Liste mit Dokument, Seite, markiertem Text und Frage, Sprung direkt zur Stelle, abhakbar.
Weiterverwendung:
Export als Liste für Tutorium oder Sprechstunde,
im KI-Paket als Auftrag „Erkläre mir diese Stellen“ (19.3),
als Themen-Hinweis für Karteikarten-Vorschläge,
als Signal für schwache Themen im Lernstand (Abschnitt 20).
Offene Fragen tauchen nicht auf der Startseite auf, sondern im Kurs und im Bereich Lernen.
21.4 Kursseite „Meine Markierungen“
Pro Kurs eine Seite mit allen Markierungen und offenen Fragen des Kurses, filterbar nach Dokument und Status, plus ein kleines Freitextfeld für allgemeine Kursnotizen (als .md unter <DATA_DIR>/notes/<Kurs>.md, versioniert).
21.5 Schnellerfassung und Verknüpfungen
Schnellerfassung (Jots): ein Eingabefeld (auch per Befehlspalette und auf dem Handy), um schnell einen Gedanken, eine Frage an den Dozenten oder ein To-do festzuhalten. Später einem Kurs, einem Dokument oder einem Projekt zuordnen.
Verknüpfungen über die links-Tabelle: auf jeder Detailseite „Verknüpft mit …“ anzeigen und neue Verknüpfungen per Suche anlegen.
22. Abgaben
22.1 Abgabe-Check (nur lesend)
Pro Moodle-Aufgabe den echten Status über mod_assign_get_submission_status: keine Abgabe, Entwurf, eingereicht, bewertet, Feedback vorhanden. Note und Feedback erfassen.
Fälligkeitsdatum, Cut-off-Datum und Verlängerungen berücksichtigen.
Warnung bei „nur Entwurf“, wenn die Aufgabe finales Einreichen verlangt.
Gruppenabgaben: Gruppenmodus erkennen, anzeigen, wer noch bestätigen muss (soweit die API das liefert).
22.2 Abgabe-Archiv
Sobald eine Einreichung erkannt wird: die bei Moodle liegenden Dateien herunterladen und mit Hash, Zeitstempel und Status unveränderlich speichern:
<DATA_DIR>/uni/Semester_1/Programmieren_1/_Abgaben/<Aufgabe>/<Zeitstempel>/
Optional (Phase 3): qualifizierter Zeitstempel nach RFC 3161 für jede archivierte Abgabe (Hash an einen Zeitstempeldienst senden, Antwort mitspeichern). Beweist, dass die Datei zu diesem Zeitpunkt existierte. Es wird nur der Hash übertragen, nie der Inhalt.
22.3 Abgabe über das Tool (optional, standardmäßig deaktiviert)
Aufgabe wählen
→ Dateien auswählen (Upload im Dashboard oder aus einem Projekt)
→ Vorabprüfung: Dateitypen, Anzahl, Größe gegen die Vorgaben; Frist; bestehende Abgabe
→ Zusammenfassung: Kurs, Aufgabe, Dateien mit Größe und Hash, final einreichen ja/nein, Restzeit
→ falls Eigenständigkeitserklärung verlangt: Text anzeigen, ICH hake selbst an
→ ICH bestätige
→ Upload → mod_assign_save_submission → ggf. mod_assign_submit_for_grading
→ Status erneut abrufen, Dateien und Hashes abgleichen
→ Ergebnis speichern, Abgabe-Archiv aktualisieren
Bei Fehler oder unklarem Status: abbrechen, laute Warnung, Link zur Aufgabe. Keine automatischen Wiederholungen.
Bestehende Abgaben nie ohne gesonderte Warnung ersetzen.
Jeder Versuch in submission_attempts.
Nicht über MCP, CLI mit --yes oder API-Adapter auslösbar. Nur über die Oberfläche mit Bestätigung.
23. Projekte (Einzel- und Gruppenprojekte)
Zusammenarbeit läuft über externe Tools (GitHub, Hochschul-Cloud, Discord). UniOS verknüpft nur.
Pro Projekt: Name, Kurs, verknüpfte Moodle-Aufgaben, Deadline, Mitglieder (nur Name und optional GitHub-Benutzername), Links, To-dos, Notizen.
GitHub (nur lesend) per fine-grained Token mit Leserechten auf ausgewählte Repos: Commits, Issues, Pull Requests, Branches, Aktivität pro Mitglied.
Optionale Repo-Spiegelung: git clone/git fetch als Backup und für Suche/MCP. Niemals push.
Projektseite: Deadline, Abgabestatus, GitHub-Aktivität, To-dos, Links, Verknüpfungen.
Aus einem Projekt kann der Abgabe-Flow (22.3) gestartet werden, zum Beispiel mit einem ZIP eines Commits oder Tags.
24. Frontend und Design
24.1 Technik
React + TypeScript + Vite, statisch gebaut und von FastAPI ausgeliefert.
API-Typen werden aus dem OpenAPI-Schema generiert (openapi-typescript). Ein Test schlägt fehl, wenn die generierten Typen veraltet sind.
PWA: installierbar auf Mac, Windows und Handy. Service Worker cacht die App-Oberfläche.
Offline: TanStack Query persistiert Daten in IndexedDB. Ohne Verbindung zum Host sind Heute, Kurse, Deadlines, Prüfungen, Markierungen und Suche über gecachte Daten lesend nutzbar. Ein dezentes Banner zeigt Offline – Stand: <Zeitpunkt>. Schreibende Aktionen sind offline deaktiviert, außer Schnellerfassungen, Markierungen und Kartenbewertungen (Modus B), die gepuffert und später übertragen werden.
Sensible Bereiche (Noten, Abgaben) werden nicht offline gecacht, außer ich aktiviere es.
24.2 Leitprinzip: so wenig Überforderung wie möglich
Das Tool kann sehr viel. Die Oberfläche darf das nicht zeigen. Sie soll sich anfühlen wie eine ruhige, einfache App, nicht wie ein Kontrollzentrum. Diese Regeln haben Vorrang vor Vollständigkeit:
Eine Frage pro Bildschirm. Die Startseite beantwortet in fünf Sekunden: „Was ist neu, und was muss ich als Nächstes tun?“ Alles andere ist eine Ebene tiefer.
Module statt Feature-Wand. Jede größere Funktion ist ein Modul, das man in den Einstellungen an- und ausschaltet. Ausgeschaltete Module sind unsichtbar, auch in Navigation, Startseite und Befehlspalette. Standardmäßig an: Kurse, Termine, Benachrichtigungen, Suche. Alles andere (Karten, Noten, Projekte, Abgaben, KI, Mail, Mehrgeräte-Betrieb) schlägt die App erst vor, wenn es sinnvoll ist, einzeln und höchstens ein Vorschlag pro Woche.
Alltagssprache, keine Technik. Begriffe wie Lease, Snapshot, Hash, Generation, Connector, Sidecar, MCP oder Token tauchen in der normalen Oberfläche nie auf. Stattdessen etwa: „Dieser Mac ist gerade dein Hauptgerät“, „Moodle neu verbinden“, „Verbindung zur KI“. Technische Details gibt es nur mit eingeschalteter Erweiterten Ansicht (Standard aus).
Ruhe als Normalzustand. Läuft alles, zeigt die App nur einen kleinen grünen Punkt „Alles aktuell“. Kein Dauer-Dashboard mit Kennzahlen. Status wird erst sichtbar, wenn ich handeln muss.
Höchstens eine laute Warnung gleichzeitig. Warnungen werden nach Dringlichkeit sortiert, die wichtigste steht oben als Banner, der Rest gesammelt dahinter („2 weitere Hinweise“). Farben nur für Status: Rot heißt handeln, Gelb heißt bald, sonst neutral.
Details auf Nachfrage. Versionen, Sync-Historie, Dateigrößen, Quellen stehen in aufklappbaren Bereichen, nicht in der Hauptansicht.
Weniger Entscheidungen. Gute Standardwerte für alles. Einstellungen gruppiert, die wichtigsten fünf oben, der Rest unter „Mehr Einstellungen“.
Leere Zustände sind Anleitung. Jede leere Seite sagt in einem Satz, was hier später erscheint, und bietet höchstens einen Knopf für den nächsten Schritt.
24.3 Visuelles Design
Modern, ruhig, viel Weißraum. Tailwind + shadcn/ui, eine Akzentfarbe, sonst neutrale Grautöne.
Klare Typografie mit wenigen Größen. Pro Karte höchstens eine Überschrift und eine Zeile Nebeninfo.
Dark und Light Mode, Standard folgt dem System.
Mobile zuerst: auf 390 px Handybreite genauso gut nutzbar wie am Desktop. Keine breiten Tabellen auf dem Handy, stattdessen Listen mit Karten.
Ladezustände (Skeletons) und Fehlerzustände sind überall gestaltet und erklären in einfachen Worten, was los ist und was ich tun kann.
Barrierearm: Tastaturbedienung, sichtbarer Fokus, ausreichende Kontraste, sinnvolle ARIA-Labels.
Dezente Animationen nur, wo sie Orientierung geben (Aufklappen, Wechsel zwischen Seiten), keine Effekte um der Effekte willen.
Befehlspalette (Strg/Cmd + K) für Fortgeschrittene: Seiten öffnen, suchen, Sync starten, Schnellerfassung. Nie die einzige Möglichkeit, etwas zu erreichen.
24.3a Eigenständiges Design
Die aktuellen Regeln und Tokens stehen in docs/UI_PRINCIPLES.md und docs/design/design-tokens.json. Die Screenshots unter docs/design/screenshots/unios-workspace/ zeigen ausschließlich UniOS mit erfundenen Daten. Bei Widerspruch gelten die Regeln aus 24.2.
Übernehmen:
Helle, weiche Karten mit großzügigen Rundungen und dezenten Schatten, viel Weißraum.
Dateilisten mit farbigen Dateityp-Icons (PDF rot, Word blau, Bild grün, Notiz violett) und einer grauen Zeile „Kurs · Zeit“ darunter.
Suchfeld oben mittig mit Tastenkürzel-Hinweis (⌘K / Strg K).
„Schnell notieren“ als schlichtes Eingabefeld.
Lernblöcke: Fortschrittsring mit Zeit („2:15 h von 4:00 h“), daneben die Blöcke als abhakbare Liste, ein großer Knopf „Fokus starten“.
Handy-Ansicht mit unterer Leiste.
Im Dark Mode: dunkles Blaugrau statt reinem Schwarz, Akzentfarbe Türkis/Grün.
Ausdrücklich nicht übernehmen:
Großes Titelbild bzw. Hero-Banner mit Gebäudefoto.
Reihe mit vier Zahlen-Kacheln (neue Dateien, Aufgaben, Deadlines, Karten).
Motivationssprüche, Zitate und handschriftliche Deko-Texte.
Mehr als vier Hauptpunkte in der Navigation.
Aktivitätsverlauf, Notizliste und Lernfortschritt als eigene Widgets auf der Startseite.
Profilfoto und Slogans in der Seitenleiste.
Einzige Ausnahme für Deko: optional ein kurzer Tagesspruch in einer kleinen, grauen Zeile unter der Begrüßung. Standard aus, in den Einstellungen einschaltbar.
24.4 Navigation
Nur vier Hauptbereiche plus Suche. Auf dem Handy als untere Leiste, am Desktop als schmale Seitenleiste:
Bereich	Enthält
Heute	Was ist neu, was steht an, die eine wichtigste Warnung
Kurse	Kurse → Abschnitte → Dateien (öffnen im Viewer), Aufgaben, Ankündigungen, „Meine Markierungen“ mit offenen Fragen
Termine	Deadlines, Prüfungen, Anmeldung und Rückmeldung, Abgaben, Lernblöcke, in einer Zeitleiste
Lernen	Karten, Lernstand, schwache Themen (nur wenn das Modul an ist, sonst ausgeblendet)
Suche ist ein Feld oben, immer erreichbar, durchsucht alles.
Alles Weitere liegt unter „Mehr“: Noten, Projekte, KI, Aktivitätsverlauf, Einstellungen, System. Ausgeschaltete Module erscheinen dort nicht.
Die Schnellerfassung ist ein kleiner Plus-Knopf, der überall erreichbar ist.
24.5 Startseite
Guten Morgen, Marc                                   ● Alles aktuell

⚠ Prüfungsanmeldung endet in 3 Tagen – Englisch 1 fehlt noch   [Öffnen]

Als Nächstes
  Mathe Übungsblatt 3            morgen, 23:59
  Englisch Assignment            in 5 Tagen

Neu seit gestern
  Programmieren 1   04_Schleifen.pdf
  Mathematik        Übungsblatt_03.pdf

Karten: 37 fällig                                     [Lernen]

[ Schnell notieren …                                        + ]
Keine Zahlen-Kacheln, keine Statistiken, kein Titelbild auf der Startseite.
Die Zeile „Karten fällig“ erscheint nur, wenn das Kartenmodul an ist.
„Schnell notieren“ ist ein einzeiliges Feld am Ende, das beim Anklicken wächst.
Offene Zuordnungsfragen (Gruppenfilter) erscheinen als freundliche Karte mit einer Frage, nicht als Formular.
Hinweise wie „3 neue Vorlesungen ohne Karten“ nur, wenn das Kartenmodul an ist, und höchstens einer gleichzeitig.
24.6 Wo die übrigen Funktionen leben
Kurs-Detail: Abschnitte und Dateien, Versionen nur aufklappbar, Zusatzmaterial anderer Gruppen als eingeklappter Bereich am Ende.
Termine: jede Frist mit Status (offen, Entwurf, eingereicht), bei Prüfungen der Anmeldestatus, bei Bedarf der Abgabe-Flow.
Lernen: Fokuszyklen des Tages mit Timer, Kartenmodus, Warteschlange mit Preview und Lernstand. Agent-Status nur in der erweiterten Ansicht oder bei Problemen.
Mehr → Noten: Übersicht, ECTS, Was-wäre-wenn.
Mehr → Projekte, Aktivitätsverlauf.
Viewer: Dokument groß in der Mitte, Markierungsleiste einklappbar (am Handy als Blatt von unten), oben nur Zurück, Dokumentname, Suche im Dokument und Export.
Mehr → KI: oben einfach die gewählte Stufe und ein Knopf („KI-Paket erstellen“ bzw. „Verbunden ✓“). Freigabeliste, Zugriffsprotokoll, Kostenrechner und Budget darunter.
Mehr → System: oben ein Satz („Alles läuft. Hauptgerät: MacBook. Letzte Sicherung: heute 03:00“). Host-Übergabe, Sync-Historie, Syncthing, Konfliktpakete, Logins, Backups und Hochschulprofil darunter, technische Details nur in der Erweiterten Ansicht.
25. CLI
Befehl unios (Typer), gedacht für mich und für KI-Agents:
Ausgabe als JSON auf stdout, Fehler und Hinweise auf stderr, sinnvolle Exit-Codes. Optional --pretty für Menschen.
Befehle mindestens: sync, status, courses, changes --since, search, deadlines, anki queue, ai export, ai costs, rebuild-index, backup, host status|release|acquire, cards import|export, doctor (prüft Konfiguration, Tokens, Tailscale, Syncthing-Einstellungen, Festplattenverschlüsselung, AnkiConnect, Schreibrechte, Übernahmefähigkeit), setup (geführte Einrichtung im Terminal).
unios schema gibt alle JSON-Formate aus, unios describe <befehl> beschreibt einen Befehl maschinenlesbar.
Rückfragen lassen sich mit --yes überspringen. Ausnahme: Abgaben und alles Destruktive sind über die CLI nicht ohne Oberfläche möglich.
26. Health und Monitoring
Stille Fehler sind das größte Risiko. Wenn ein Connector nach einem Update der Uni-Systeme nichts mehr findet, darf das nicht wie „nichts Neues“ aussehen.
Pro Connector: letzter erfolgreicher Lauf, Anzahl Kurse und Ressourcen, Fehler.
Plausibilitätswarnungen: plötzlich 0 Kurse, deutlich weniger Ressourcen als zuvor, Parserfehler, mehrere Fehlläufe hintereinander → laute Warnung im Dashboard und per Push.
Sync-Lücken sichtbar machen (zum Beispiel „Mac war 38 Stunden aus, Catch-up erfolgreich“).
Strukturiertes Logging mit Rotation und automatischer Schwärzung sensibler Werte (Tokens, Session-URLs, Passwörter).
Host-Zustand: Alter von Herzschlag und letztem Snapshot, Syncthing-Status, Syncthing-Konfliktdateien, erkannte Doppel-Hosts. Alles sichtbar im System-Tab, Kritisches auch per Push.
Healthcheck-Endpoint (auch für die Erreichbarkeitsprüfung bei der Übernahme).
27. Sicherheit, Datenschutz und Backups
Zugriff nur lokal oder über Tailscale (Regel 6). Einzige optionale Ausnahme: MCP-Endpunkt (19.4).
Secrets in der Keychain, im Repo nur .env.example.
Backups: tägliches, verschlüsseltes restic-Backup von Datenbank und DATA_DIR an ein Ziel meiner Wahl (externe Platte oder Cloud-Speicher), mit Aufbewahrungsregeln. Status im Dashboard. Wiederherstellung in der Doku Schritt für Schritt, und einmal im Test durchgespielt.
Nur der Halter des Staffelstabs schreibt (Regel 12). Zwischen Host-fähigen Geräten ist DATA_DIR ein Senden-und-Empfangen-Ordner, auf reinen Zuschauer-Geräten ein Nur-Empfangen-Ordner. Syncthing läuft ausschließlich über Tailscale (3.3).
Backups laufen immer auf dem aktuellen Host, in dasselbe restic-Repository.
Push-Texte bleiben neutral (Abschnitt 15). Standard ist ntfy mit zufälligem Topic, alternativ Discord.
Optional dokumentieren, nicht bauen: selbst gehosteter ntfy-Server, eigener Anki-Sync-Server, Headscale.
28. Semesterwechsel
Semester sind eigene Objekte mit Zeitraum.
Neue Kurse werden automatisch dem aktuellen Semester zugeordnet (korrigierbar).
Alte Semester bleiben vollständig erhalten und durchsuchbar, im Dashboard standardmäßig ausgeblendet.
29. Repo-Regeln, AGENTS.md, Lizenz und Changelog
AGENTS.md im Repo-Stamm enthält kurz und verbindlich: die harten Regeln aus Abschnitt 2, Befehle für Tests und Qualitätsprüfungen, Projektstruktur, Definition von fertig (Abschnitt 31) und den Verweis auf diese Datei. Jeder KI-Agent muss sie vor der Arbeit lesen.
Conventional Commits (feat:, fix:, docs: …) und git-cliff erzeugt daraus CHANGELOG.md.
Lizenz: AGPL-3.0-or-later (entschieden). Das erlaubt die Übernahme von Code aus Anki (AGPL-3.0) und moodle-dl (GPL-3.0, kompatibel). Prüfe vor jeder Übernahme die Lizenz des konkreten Stands.
Regeln für übernommenen Code:
Copyright- und Lizenzhinweise bleiben erhalten, geänderte Dateien werden als geändert gekennzeichnet.
THIRD_PARTY_NOTICES.md listet Quelle, Commit, Lizenz und betroffene Dateien.
SPDX-Header (SPDX-License-Identifier: AGPL-3.0-or-later) in jeder eigenen Datei.
Nur übernehmen, was zu unserem Stack passt und getestet werden kann.
Die App zeigt im Menü einen Link zum Quellcode (AGPL-Pflicht bei Nutzung über das Netzwerk).
Pre-commit-Hooks: ruff, prettier, Secret-Scan (zum Beispiel gitleaks), Prüfung, dass keine Dateien aus DATA_DIR im Repo landen.
30. Einrichtung, Veröffentlichung und Tutorials (Phase 6)
Ziel: Auch Studierende ohne Technikkenntnisse sollen das Tool einrichten können.
Installationsskripte: eine Zeile für macOS (scripts/install-mac.sh) und eine für Windows (scripts/install-windows.ps1). Sie installieren uv (bringt Python mit), das Tool, richten den Hintergrunddienst ein und öffnen danach den Browser. Dabei wird gefragt, ob das Gerät Host-fähig oder nur Zuschauer sein soll.
Einrichtungsassistent im Browser beim ersten Start, bewusst kurz: nur Hochschule wählen, Moodle verbinden, Benachrichtigungen (mit Test-Push). Danach ist das Tool sofort nutzbar. Jeder Schritt prüft am Ende, ob er funktioniert, und zeigt einen Haken.
Alles Weitere später und einzeln: Gruppenzuordnung kommt als Frage auf der Startseite, sobald sie nötig ist. Karten, KI, zweites Gerät, Noten und Projekte schlägt die App nach und nach vor (Abschnitt 24.2, Regel 2), jeweils mit eigenem kleinen Assistenten.
Tutorial-Videos der eigenen Oberfläche werden per Playwright-Skript automatisch aufgenommen (scripts/tutorial-videos), damit sie nach Designänderungen neu erzeugt werden können. Ausgabe als kurze MP4/WebM, optional GIF. Anleitungen für fremde Oberflächen (ChatGPT, Tailscale) nehme ich selbst auf, dafür Platzhalter in der Doku vorsehen.
Doku: README auf Deutsch und Englisch mit Schnellstart, Screenshots und FAQ. Projektseite über GitHub Pages aus docs/site/. Für Überschrift, Vorteile-Liste und Geräte-Mockups gelten die eigenen Tokens und Produktregeln. Aussagen müssen stimmen (zum Beispiel nicht „für iOS“, solange es nur die PWA gibt).
Auffindbarkeit: Vorschlag für Repo-Beschreibung und GitHub-Topics (zum Beispiel moodle, primuss, anki, study-tool, hochschule-coburg, university) in docs/PUBLISHING.md. Kein Marketing.
Vor der Veröffentlichung: Audit, dass keine persönlichen Daten, Tokens oder echten Kursinhalte im Repo oder in der Git-Historie sind.
31. Qualitätsstandard (Definition von fertig)
Gilt für jede Funktion, auch optionale:
Backend: pytest grün, ruff und mypy ohne Fehler.
Frontend: tsc ohne Fehler, eslint sauber, Vitest grün, vite build erfolgreich.
Jeder Hauptablauf hat einen Playwright-End-to-End-Test gegen die laufende App mit Fake-Servern (zum Beispiel „Datei öffnen, Stelle markieren, als unverstanden kennzeichnen, in der Fragenliste wiederfinden“). Nicht jede Kleinigkeit braucht einen eigenen Browser-Test, Randfälle werden in pytest oder Vitest geprüft.
Connectoren werden gegen tests/fake_servers/ und Fixtures getestet, nie gegen echte Hochschulsysteme.
Keine Platzhalter, keine TODOs im Code (außer im Hochschulprofil für unbekannte Werte), keine auskommentierten Features, keine Mock-Daten in der ausgelieferten App.
Am Phasenende: Playwright-Screenshots aller Hauptseiten in Dark und Light Mode, Desktop und 390 px, selbst kritisch geprüft. Lighthouse: PWA installierbar, Accessibility mindestens 90.
Einfachheits-Prüfung für jede Seite anhand der Screenshots: Ist die wichtigste Information sofort erkennbar? Taucht ein Technikbegriff aus 24.2 Regel 3 auf? Mehr als eine laute Warnung? Sind ausgeschaltete Module wirklich unsichtbar? Enthält die Seite etwas aus der Liste „Ausdrücklich nicht übernehmen“ (24.3a)? Ein automatischer Test sucht in der gerenderten Oberfläche (Erweiterte Ansicht aus) nach den verbotenen Technikbegriffen.
In docs/MANUELL_TESTEN.md steht ein Test mit einer Person, die nicht Informatik studiert: Sie soll ohne Hilfe herausfinden, was heute neu ist, wann die nächste Frist ist und ob sie zu einer Prüfung angemeldet ist.
Eine Funktion ohne bestandenen Test ist nicht fertig.
Alles, was nur mit echten Konten prüfbar ist, steht in docs/MANUELL_TESTEN.md mit genauer Anleitung für mich.
31.1 Testrhythmus (Zeit sparen, Qualität halten)
Tests werden weiterhin geschrieben, aber nicht ständig alle ausgeführt:
Wann	Was läuft
Während der Arbeit an einem Paket	schnelle Checks für betroffene Sprachen und gezielt die betroffenen Tests (pytest tests/test_x.py -x, vitest related). Build und Playwright nur bei geändertem Nutzerfluss.
Paket fertig, vor dem Commit	betroffene pytest-/Vitest-Tests, Ruff und mypy/Typecheck für betroffene Sprachen; bei geändertem Nutzerfluss Frontend einmal bauen und passende Playwright-Specs mit `npm run e2e:run -- <spec>` ohne zweiten Build ausführen.
Nach dem gebündelten Phasen-Push	GitHub Actions läuft im Hintergrund. Das Ergebnis vor dem nächsten Push prüfen; bei Rot zuerst gesammelt korrigieren.
Bei Integrationsänderungen und am Phasenende	alle Python-Tests, Ruff, mypy, OpenAPI, Typecheck, Lint, Vitest, Build und komplette Playwright-Suite. Am Phasenende zusätzlich Screenshots, Lighthouse, Docker-Smoke und CI auf allen Systemen. Die Definition von fertig in Abschnitt 31 bleibt unverändert.
Parallelisierung auf dem jeweiligen Gerät messen: `pytest -n auto` ist keine Pflicht, falls weniger Worker schneller sind. Playwright-Worker erst erhöhen, wenn die gemeinsam genutzten Fake-Server und Testdaten isoliert sind.
Lange Läufe startest du im Hintergrund mit Log-Datei und arbeitest währenddessen an unabhängigen Teilen desselben Pakets weiter. Aber: Nicht auf fehlgeschlagenen Prüfungen aufbauen; Fehler vor dem nächsten Paket beheben.
32. Phasen und Abnahmekriterien
Phase 1: Fundament, Moodle und Grundoberfläche
Projektgerüst, Konfiguration mit DATA_DIR, Hochschulprofil, Connector-Schnittstelle, Alembic, Logging mit Schwärzung, Tests, AGENTS.md, Pre-commit.
Moodle-Token-Einrichtung, Moodle-Connector, Sync Engine, Scheduler mit Catch-up, Gruppenfilter.
Change Detection, Versionierung, Dateiablage mit Namensbereinigung, Sidecars, rebuild-index.
Frontend-Grundgerüst: React/Vite, Design-System nach 24.2 bis 24.5, Dark/Light, Navigation mit Heute, Kurse, Termine und „Mehr“ (Aktivitätsverlauf, Einstellungen mit Modul-Schaltern und Erweiterter Ansicht, System). PWA-Grundlage.
CLI-Grundbefehle (sync, status, courses, changes, doctor, rebuild-index).
Benachrichtigungen (neue Dateien, Deadlines, Token-Ablauf, Connector-Fehler, lange kein Sync).
Trennung DATA_DIR / LOCAL_DIR, Staffelstab-Grundlage (ohne Staffelstab kein Schreiben, zweite Instanz startet im Standby), Snapshots.
Dienst-Vorlagen für macOS, Windows und Linux, docker-compose, Backup-Skript.
Abnahme:
Start auf macOS, Windows und Linux funktioniert.
Eine zweite Instanz auf demselben DATA_DIR bleibt nachweislich im Standby und schreibt nichts.
Alle Kurse werden erkannt und alle Dateien heruntergeladen. Ein zweiter Lauf lädt nichts erneut.
Eine geänderte Datei erzeugt eine neue Version, die alte bleibt. Eine entfernte Datei wird markiert, nicht gelöscht.
Gruppenfilter: Fremdgruppen-Material wird markiert und taucht nicht in „Heute neu“ auf. Ein neuer, unbekannter Abschnitt löst eine Zuordnungsfrage aus.
Datenbank löschen + rebuild-index stellt alle Ressourcen und Versionen wieder her.
Ein kaputter Connector erzeugt eine sichtbare Warnung.
Log-Test: Tokens und Session-URLs erscheinen nie im Log.
Qualitätsstandard aus Abschnitt 31 erfüllt.
Phase 2: Inhalte nutzbar machen
Mehrgeräte-Betrieb: geplante Übergabe, automatische Übernahme, Doppel-Host-Erkennung mit Konfliktpaket, Syncthing-Anbindung über die REST-API. Textextraktion, Volltextsuche, iCal-Feed, Offline-Cache, Befehlspalette, Dokument-Viewer mit Markierungen und offenen Fragen (21), Kursnotiz, Schnellerfassung, Verknüpfungen, Drop-Ordner, Sonntags-Digest. KI: Freigabeliste, KI-Paket (Stufe 1), MCP-Server lokal (Stufe 2), Inbox/Outbox mit Schema-Validierung. Anki-Warteschlange mit Preview und anki-agent. Abgabe-Check und Abgabe-Archiv (22.1, 22.2).
Abnahme u. a.: Simulierte Übergabe Mac → PC → Mac ohne Datenverlust. Übernahme passiert nicht, solange der alte Host erreichbar ist oder der Snapshot veraltet ist. Simulierter Doppel-Host führt zu Standby des Verlierers und einem vollständigen Konfliktpaket. Suche findet Text auf der richtigen Seite. PWA zeigt offline gecachte Daten. Markierungen werden auf eine neue Dateiversion übertragen, nicht zuordenbare erscheinen in „Markierungen prüfen“, die Originaldatei bleibt byte-gleich. Offene Fragen erscheinen gesammelt im Kurs. Gesperrte Kategorien sind über MCP nachweislich nicht abrufbar (Test). Ungültige KI-Dateien landen in rejected/. Kartenvorschläge gelangen nie ohne Freigabe in Anki.
Phase 3: Hochschulsysteme, Projekte und Abgaben
Login-Helper, PRIMUSS-Connector (nur lesend), Exam Watchdog mit Screenshots, Rückmelde-Watchdog, Noten und ECTS mit Was-wäre-wenn, mycampus-Connector, Uni-Mail-Connector. Projekte mit GitHub und Repo-Spiegelung. Abgabe über das Tool (22.3, standardmäßig aus). Optional RFC-3161-Zeitstempel. MCP remote über Tunnel mit OAuth (19.4).
Abnahme u. a.: Kein Codepfad kann schreibend auf PRIMUSS zugreifen (Test). Unklare Status werden als unklar angezeigt. Noten erscheinen nie in Push-Texten. Der Abgabe-Flow bricht bei jedem simulierten Fehler sauber ab.
Phase 4: Lernsystem und KI-Automatik
Review-Daten auswerten, Lernfortschritt pro Thema, Übungsaufgaben und Fehlerhistorie, Lernblöcke vor Prüfungen, Wochenübersicht. Kostenrechner. API-Adapter (Stufe 3) mit Budgetlimit, standardmäßig aus.
Abnahme u. a.: Unter der Mindestdatenmenge steht Zu wenig Daten. Der Kostenrechner sendet nachweislich nichts ins Netz. Der API-Adapter sendet bei überschrittenem Budget nichts.
Phase 5: Integrierter Lernmodus
Modus B (18.3): Engine mit der Anki-Bibliothek, Lernoberfläche, Kartenbrowser und Editor, Statistiken, Offline-Lernen in der PWA mit Review-Puffer, .apkg-Import und -Export, Moduswechsel.
Abnahme u. a.: Eine .apkg-Datei mit Lernhistorie lässt sich importieren und wieder exportieren, ohne Karten oder Reviews zu verlieren. Offline gelernte Karten erscheinen nach dem Wiederverbinden korrekt auf dem Host. Ein Moduswechsel legt vorher automatisch einen Snapshot an.
Phase 6: Einrichtung und Veröffentlichung
Einrichtungsassistent, Installationsskripte für macOS und Windows, automatisch erzeugte Tutorial-Videos, zweisprachige Doku, GitHub-Pages-Seite, docs/PUBLISHING.md, Lizenz- und Datenschutz-Audit des Repos, erstes Release mit Changelog.
Abnahme u. a.: Auf einem frischen Mac und einem frischen Windows-Rechner führt das Installationsskript plus Assistent ohne Terminal-Kenntnisse zu einem laufenden Tool mit Test-Push. THIRD_PARTY_NOTICES.md ist vollständig.
Beginne mit einem kurzen Plan für Phase 1 (Dateien, Reihenfolge, offene Fragen an mich), lege docs/PROGRESS.md und docs/MANUELL_TESTEN.md an und starte dann.
