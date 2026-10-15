<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# UniOS-Dokumentation

## UniOS verwenden

- [Installation und Alpha-Downloads](../README.md)
- [Erste Schritte und einfache Navigation](ALPHA_FOCUS.md)
- [Notizen und Editor](NOTE_STUDIO.md)
- [Räume und Buchung](ROOM_BOOKING.md)
- [Mail-Verbindungen](MAIL_FORWARDING.md)
- [Datenschutz und Freigaben](TRUST.md)
- [Manuelle Geräte- und Kontoprüfung](MANUELL_TESTEN.md)

## Entwickeln

- [Verbindlicher Bauauftrag](BAUAUFTRAG.md) und [Fortschritt](PROGRESS.md)
- [Architektur](ARCHITEKTUR.md)
- [Navigation und UI-Struktur](NAVIGATION_CLEANUP.md)
- [Einstiegshürden und Studienabläufe](ENTRY_BARRIERS.md)
- [Design-System](DESIGN_SYSTEM.md) und [UI-Grundsätze](UI_PRINCIPLES.md)
- [Agent Gateway](AGENT_GATEWAY.md), [Corpus-Skalierung](AGENT_CORPUS_SCALE.md), [Entity Actions](ENTITY_ACTIONS.md)
- [Lern- und Prüfungsengine](ASSESSMENT_ENGINE.md)
- [Neue Hochschule](ADD_UNIVERSITY.md) und [Übersetzungen](TRANSLATING.md)
- [Erweiterungen](EXTENSIONS.md) und [Verbindungen](CONNECTOR_PLUGINS.md)

## Betreiben und veröffentlichen

- [Server](SERVER.md), [Dienste](SERVICES.md), [Programmier-Runner](RUNNER.md)
- [Desktop-Pakete](DESKTOP_PACKAGES.md) und [Veröffentlichung](PUBLISHING.md)
- [Release-Abnahme und offene Grenzen](RELEASE_READINESS.md)
- [Release-Labor](RELEASE_LAB.md), [Performance-Budgets](PERFORMANCE_BUDGETS.md)
- [Visuelle Prüfung](VISUAL_AUDIT_2026-10-04.md) und [Roadmap](ROADMAP.md)

Die bestehenden Dokumentpfade bleiben gültig. Alte ZIP-Stände und Testverzeichnisse
im OneDrive-Arbeitsordner gehören nicht zur ausgelieferten Anwendung. Sie wurden
nicht gelöscht, eingelesen oder ins Repository aufgenommen. Aktive Tests verwenden
isolierte temporäre Daten, pytest `tmp_path`/`tmp_path_factory` und Fake-Dienste.
