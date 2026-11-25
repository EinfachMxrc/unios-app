<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Neuaufbau der Arbeitsbereiche: Bedienung, Oberfläche und Backend

Stand: 25.11.2026. Grundlage ist ein Abgleich mit einem vergleichbaren
Open-Source-Studienwerkzeug (AGPL, Quellcode und Seitenbeschreibung öffentlich).
Übernommen werden Ideen und Abläufe, kein Code. Jedes Paket wird einzeln
umgesetzt, mit Tests, Screenshots (Hell/Dunkel, Desktop/390 px) und eigenem Commit.

## Was UniOS bereits besser kann und behalten muss

- PDF-Leser mit Markierungen, Zitaten auf Seitenebene und Mitschrift daneben.
- Automatischer Moodle-Abgleich inklusive Abgabeprüfung, Gruppenzuordnung und Versionsverlauf.
- Integrierte Karteikarten mit FSRS-Planung, Übungen, Programmieraufgaben, Prüfungsmodus.
- Offline-Betrieb, Geräteübergabe, eingebaute Sicherung mit Wiederherstellung, Agenten-Zugriff (MCP).

## Pakete in Reihenfolge

| Nr. | Bereich | Heute in UniOS | Ziel (Bedienung) | Backend |
| --- | --- | --- | --- | --- |
| 1 | Termine und Fristen | Eine Seite stapelt nächste Frist, Umschalter, Stundenplan-Karte mit Mini-Monat und Quellen | Kalender als eigene Seite: eine Kopfzeile (Heute, Pfeile, Zeitraum mit KW, Tag/Arbeitswoche/Woche/Monat, Neuer Termin), Monatsansicht, Tasten T, ←/→, 1–4, C. Fristen als eigene Liste, gruppiert nach Überfällig, Heute, Diese Woche, Nächste Woche, Später, Ohne Datum, Erledigt, mit Restzeit und Kurs-Chip | Gruppierte Fristen-Abfrage; persönlicher Abgabestatus (nicht begonnen, in Arbeit, abgegeben, bewertet) mit Abgleich zur Moodle-Prüfung |
| 2 | Aufgaben | Liste mit Gruppen, Schnelleingabe, Dialog | Übersicht nach Fälligkeit oder Board nach Status (Ziehen ändert Status), Filter und „Als Ansicht speichern“, Unteraufgaben, J/K zum Blättern, Restzeit-Chips | Unteraufgaben (`parent_id`), Reihenfolge, Labels, gespeicherte Ansichten über vorhandene Sammlungen |
| 3 | Kurse und Moodle | Kurskarten, Kursseite mit Banner, Unterlagen, Aufgaben, Notizen | Kurse nach Semester gruppiert, Karte zeigt nächste Veranstaltung, Abgaben-Fortschritt und nächste Prüfung. Kursseite als Zentrale mit Kacheln (Nächste Veranstaltung, Nächste Prüfung, Offene Abgaben, Kursnote) und Reitern Inhalte, Aufgaben, Noten, Ankündigungen; überall „In Moodle öffnen“ | Kurs-Zusammenfassung in einer Abfrage; Noten und Forenbeiträge je Kurs lesend |
| 4 | Notizen und Schnellnotizen | Liste links, Editor rechts; Schnellnotizen als Formular mit Liste | Notizen als Tabelle (Titel, Vorschau, Kurs, zuletzt bearbeitet, sortierbar) plus „Weiterschreiben“. Schnellnotizen mit Voreinstellungen Offen, Eingearbeitet, Diese Woche, Alle; „Einarbeiten“ macht aus einer Schnellnotiz eine Notiz | Kurze, lesbare Kennungen je Eintrag (z. B. NOT-12) für Suche und Links; Status „eingearbeitet“ |
| 5 | Suche und Befehle | Befehlspalette plus eigene Suchseite mit vier Auswahlfeldern | Eine gerankte Trefferliste, Typ-Reiter per Tab, Filter `in:Kurs` und `#label` als Chips, Strg+Enter öffnet im neuen Tab; Schnell öffnen (Strg+P, nur Titel) und Befehle (Strg+Umschalt+P) | Vereinheitlichte Suchabfrage mit Ranking und Zeitbudget über alle Eintragsarten |
| 6 | Lernen und Karteikarten | Lernübersicht mit Karten, Stapel als Liste | Stapel als Kacheln (Bereit zum Lernen, Alles erledigt) mit Neu/Lernen/Fällig; Stapelseite mit großen Zahlen, Kartenraster und „Karten schreiben“; Lernsitzung mit Fortschrittsbalken, Bewertungstasten 1–4 mit Intervall, Z für Rückgängig | Stapel-Zusammenfassung je Kurs/Prüfung |
| 7 | Prüfungen und Noten | Prüfungsmodus und Notenseite getrennt | Prüfungen als Zeitstrahl mit „Als Nächstes“ und Tagen bis zur Prüfung; Noten als Bericht mit Gesamtschnitt, Semesterbändern, Gewichten und bearbeitbaren Noten | Prüfungs-Entität mit Status und Verknüpfung zu Stapeln und Lernblöcken |
| 8 | Einstellungen | Lange Seite mit verschachtelten Bereichen | Flache Kategorienliste mit Suchfeld, Zeilen aus Titel, Hilfe und Schalter; Verbindungen und Sicherung auf einen Blick; Tastenkürzel-Editor | Stabile Schlüssel je Einstellung |
| 9 | Dateien, Angepinntes, Papierkorb | Eigene Dateien als Liste, Papierkorb als Liste | Dateien als Kachelraster mit Typ-Icon und Ablageleiste; Angepinnt als eigene Seite über alle Bereiche; Papierkorb als Tabelle mit Filter | Anpinnen für alle Eintragsarten |
| 10 | Rahmen und Detailseiten | Neuer Rahmen steht | Einklappbare Seitenleiste, die beim Zeigen an den Rand hereingleitet; rechte Detailleiste auf Eintragsseiten (Eigenschaften, Verknüpfungen); Kontextmenüs; „Was ist neu“ nach Updates | Beziehungen zwischen allen Eintragsarten (vorhandene Links erweitern) |

## Regeln für jedes Paket

- Bestehende Funktionen bleiben erhalten; was wegfällt, wird im Changelog genannt.
- Neue Daten nur mit Migration und Test; vor dem Einspielen am echten Bestand eine geprüfte Sicherung.
- UI-Texte über i18n (Deutsch und Englisch), Tastatur und Screenreader prüfen.
- Abnahme: pytest, ruff, mypy, Typecheck, Lint, Vitest, betroffene Playwright-Abläufe, Screenshots.
