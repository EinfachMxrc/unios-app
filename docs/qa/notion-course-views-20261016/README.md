<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Gespeicherte Kursansichten und Seitenvorschauen

Paket 3 aus `docs/NOTION_UMBAU.md`. Nur lokale, erfundene Testdaten.

Kurs → Ansichten zeigt die bestehenden Sammlungen mit genau diesem Kursfilter.
Filter und Ergebnisse stammen aus denselben APIs wie die Sammlungsseite. Die
lokale Darstellung und Auswahl überstehen Wechsel und Neuladen dieses Fensters;
sie ändern die gespeicherte Filterdefinition nicht. Verwalten öffnet die richtige
Sammlung per ID; Erstellen übernimmt den Kurs. Fehler des Katalogs blockieren
weder den Kurs noch die anderen Kursbereiche.

Jeder Ergebniseintrag kann separat im Seitenblatt geöffnet werden. Notizen zeigen
den echten Text und kennzeichnen einen vorhandenen lokalen Entwurf. PDFs werden
mit dem vorhandenen lokalen PDF-Worker gerendert; die Vorschau führt einen eigenen
Seitenstand. Weitere Inhaltstypen zeigen Fakten und einen direkten Link in ihre
vollständige Ansicht. Ein expliziter weiterer Tab verwendet die gemeinsame
Navigation aus Paket 1. Die Vorschau ist lesend, Schließen und Escape führen
zum auslösenden Element zurück.

`course-views.spec.ts`: fünf neue Fälle, einschließlich gemeinsamer Filter,
Kursgrenzen, echter PDF-Vorschau, Wiederaufnahme, Deep-Link, Erstellfilter und
Katalogfehler. Zusammen mit den drei Sammlungs- und sieben Kurs-Schreibtisch-
Fällen bestanden alle 15. Die neuen fünf und die beiden visuellen Fälle wurden
nach der Prüfung erneut ausgeführt. Acht Screenshots zeigen Ansicht/Vorschau
in Hell/Dunkel bei 1.440/390 Pixeln; Animationen sind vor der Aufnahme beendet.
Typecheck, ESLint, Übersetzungen, Build und bestehende Budgets bestanden;
zehn gezielte Modell-/Tab-Unitfälle ebenfalls. Keine API-/Schemaänderung,
keine zusätzliche Abhängigkeit, kein Zugriff auf persönliche Daten.

Die gemeinsame Gesamtabnahme und native Geräteprüfung folgen nach Paket 4.
