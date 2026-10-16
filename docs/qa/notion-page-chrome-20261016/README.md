<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Seitenköpfe und Editorleiste, 16.10.2026

Paket 2 aus `docs/NOTION_UMBAU.md`, ausschließlich synthetische Fake-Daten.
Titel, Beschreibung und Hauptaktionen liegen gemeinsam im Seitenkopf. Auf dem
Handy stehen die Aktionen in einer eigenen, umbrechenden Zeile. Sammlungen
haben eine Überschrift statt einer zusätzlichen Einführungsüberschrift.

Die Formatierung bleibt per Maus und Tastatur zugänglich: Beim Lesen sind die
zusätzlichen Knöpfe verborgen, beim Hover oder Fokus in der Notiz sichtbar.
Bausteine und Ansichtswechsel bleiben erreichbar. Kein Text verliert durch eine
pauschale Opazität Kontrast. Die vorhandenen Tastenkürzel bleiben wirksam.

`page-chrome.spec.ts` prüft vier Abläufe einschließlich Notizerstellung,
Tastaturfokus, formatierter Markdown-Ausgabe und Bildschirmbreiten. Zusammen mit
Kurs-Schreibtisch, Note-Studio und Sammlungen bestanden alle 24 Fälle. Typecheck,
ESLint und Build bestanden. Zwölf Screenshots für Kurse, Notizen und Sammlungen
in Hell/Dunkel bei 1.440/390 Pixeln, selbst visuell geprüft, kein Seitenüberlauf.
Die vollständige Integration folgt nach den restlichen Umbaupaketen; keine
native Installation, kein Hochschulzugriff und kein Deployment durchgeführt.
