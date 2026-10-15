<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Kurs-Schreibtisch und PDF-Mitschrift, 16.10.2026

Die Kursübersicht öffnet den letzten kursbezogenen Arbeitsplatz direkt im Reader.
PDF und Mitschrift beginnen mit gleich viel Platz. Eine schmale Navigation und
Lesen/Nebeneinander/Schreiben reduzieren den Platzbedarf um den Inhalt herum.
Der vorhandene Editor bleibt beim Ansichtswechsel bestehen. Entwürfe und
gespeicherte Notizen verwenden 16-Pixel-Fließtext; mobil öffnet eine volle
Mitschrift-Fläche. Quellenbezüge, Auswahlzitate, Formeln und Rechenraster bleiben
Teil des bisherigen Ablaufs.

Die dauerhafte Wiederaufnahme enthält begrenzte Quellen-/Seiten-/Notizkennungen,
keinen Notizinhalt. Ein Verbindungswechsel entfernt diesen Kontext. Die Kurs-ID
wird vor der Wiederaufnahme geprüft, auch bei paginierten Unterlagen.

## Lokale Prüfung

- Vitest: 171 Dateien, **1.438 Tests bestanden**.
- Typecheck, ESLint, i18n-Prüfung und Produktionsbuild bestanden.
- **72 Playwright-Fälle in einem gemeinsamen Lauf bestanden**: Kurs-Schreibtisch,
  bisheriger Arbeitsbereich, PDF-Auswahl und Zitate, Mitschrift-Auswahl,
  Leseposition/Zoom, Navigation und deren Scrollzustand sowie mathematisches
  Schreiben einschließlich Formeln und Raster.
- Screenshots in Light/Dark bei 1.440, 1.024 und 390 Pixeln visuell geprüft.
- Zwölf Lighthouse-Snapshots: Kurs und Entwurf jeweils **100**, gespeicherte
  Mitschrift jeweils **97 Accessibility**, ohne Lighthouse-Laufzeitfehler.
  Bei gespeicherten Notizen verbleibt ein Kontrastbefund im Editor; der
  Kurs-Snapshot nennt auf Desktop zusätzlich einen Hinweis zum zugänglichen Namen.
  Die Scores gelten für diese Ansichten, nicht als Gesamtaudit der Anwendung.

Alle Inhalte stammen aus lokalen erfundenen Fixtures. Kein Zugriff auf echte
Hochschulsysteme, Nutzerprofile oder persönliche Daten. Der Audit startet eigene
Fake-Dienste auf 8199/4199 und beendet ausschließlich seine eigenen Prozesse.

Reproduzieren ab Repository-Wurzel mit vorhandener Entwicklungsumgebung:

```sh
cd frontend
npm run typecheck
npm run lint
npm run i18n:check
npm run test
npm run build
npm run e2e:focused -- course-desk.spec.ts course-workspace.spec.ts reader-workspace.spec.ts reader-note-picker.spec.ts direct-course-workspace.spec.ts study-writing.spec.ts sidebar-workspace.spec.ts sidebar-scroll.spec.ts note-latex-typing.spec.ts writing-grid.spec.ts number-writing.spec.ts math-quick-access.spec.ts
cd ..
node scripts/audit_course_desk.mjs --fake-data
```

Die Lighthouse-Zusammenfassung enthält den SHA-256 des geprüften
`frontend/dist/index.html`: [lighthouse-summary.json](lighthouse-summary.json).
Dieser lokal nachgerechnete öffentliche Build-Prüfwert ist in der bestehenden
Secret-Scan-Baseline einzeln als Fehlalarm erfasst.

## Ansichten

| Zustand | Desktop hell / dunkel | Handy hell / dunkel |
| --- | --- | --- |
| Kursübersicht | [Hell](course-light-1440.png) / [Dunkel](course-dark-1440.png) | [Hell](course-light-390.png) / [Dunkel](course-dark-390.png) |
| Neue Mitschrift | [Hell](draft-light-1440.png) / [Dunkel](draft-dark-1440.png) | [Hell](draft-light-390.png) / [Dunkel](draft-dark-390.png) |
| Gespeicherte Mitschrift | [Hell](saved-note-light-1440.png) / [Dunkel](saved-note-dark-1440.png) | [Hell](saved-note-light-390.png) / [Dunkel](saved-note-dark-390.png) |

Laptop mit 1.024 Pixeln: Kurs [hell](course-light-1024.png) /
[dunkel](course-dark-1024.png), Mitschrift [hell](draft-light-1024.png) /
[dunkel](draft-dark-1024.png). Diese Bilder stammen aus dem Playwright-Lauf;
Lighthouse wurde bei 1.440 und 390 Pixeln ausgeführt.

## Grenzen

Keine Backend-/API-/Schemaänderung und keine neue Abhängigkeit. Backend-Vollsuite,
Docker-Smoke und ein erneutes vollständiges PWA-Audit gehören nicht zu diesem
Frontend-Paket. Kein Server-Deployment und keine native Installation durchgeführt.
Native Webview, Bildschirmtastatur, Trackpad/IME sowie tatsächlicher App-Neustart
sind unter [MANUELL_TESTEN](../../MANUELL_TESTEN.md) als offene Prüfung beschrieben.
