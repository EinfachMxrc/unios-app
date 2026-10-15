<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Alpha-Fokus ab 04.10.2026

Marc hat Alpha-Feinschliff und Corpus-Ausbau beauftragt. Für neue sichtbare
Funktionsbereiche gilt ein Feature Freeze. Dies ersetzt Reihenfolge und
Zuständigkeiten der historischen September-Roadmap.

## Einfach anfangen

Standard: **Heute → Kurse → Lernen → Notizen → Termine**, auf Desktop und Handy in derselben
Reihenfolge. Mobil ist „Mehr“ nur in der Kopfleiste erreichbar. Leere Bibliothek und Kursverknüpfungen nehmen
im einfachen Standard keinen Platz ein. Neue Notizen, Suche und Benachrichtigungen
bleiben erreichbar.

„Mehr“ enthält Mensa, Räume, Eingang und die übrigen
Studienwerkzeuge. KI-Freigaben, Aufträge, Marketplace, Addons und Systemfunktionen
liegen im aufklappbaren Abschnitt „Verbindungen und Werkzeuge“. Im erweiterten Modus
öffnet sich dieser Abschnitt standardmäßig.

Gespeicherte Anpassungen bleiben erhalten. Den neuen Standard erhält man über
**Seitenleiste anpassen → Standard wiederherstellen**. Hinzufügen, Verschieben,
Ausblenden und Einschalten von Kursverknüpfungen bleiben möglich.

Der Suchkurzbefehl zeigt auf Windows/Linux „Strg K“ beziehungsweise „Ctrl K“,
auf macOS „⌘ K“. Tastatursteuerung und Escape funktionieren weiterhin.

Die Kalendernavigation auf dem Handy trennt den Datumsbereich von der gemeinsamen
Zeile für Zurück, Weiter und Heute. Notizentwürfe können nach dem Neuladen den
Editor wechseln, ohne eine bereits zerstörte Editorinstanz anzusprechen.

## Qualität während des Freeze

- Navigation: sichtbare Übergänge, bestehende Browserhistory, konsistente Auswahl.
- Aufgaben, Kalender, Editor: vorhandene Abläufe vereinfachen, keine zusätzlichen
  Produktbereiche für Konkurrenzvergleiche einführen.
- Corpus: Rechte, Belege, Trefferqualität, begrenzte Nutzlasten und gemessene
  Skalierung über die bestehenden acht Werkzeuge verbessern.
- Oberfläche: Dark/Light, Desktop/390 px und Hauptabläufe mit Fake-Daten prüfen.
  Browser-Screenshots belegen kein natives Sleep-/Keychain-/Updateverhalten.

Die veröffentlichte **0.1.19 Alpha1** bleibt ein unveränderlicher Release.
Dieser Entwicklungsstand ersetzt weder ihre Installer noch ihren Tag.
Der ursprüngliche Fokus-/UX-Pass benötigte keine Migration. Die folgende
Budget-/Corpus-Härtung bereitet zwei Migrationen vor; siehe
[aktueller Prüfstand](RELEASE_READINESS.md).

## Nachweise

- [Corpus-Ausbau, Messungen und Grenzen](AGENT_CORPUS_SCALE.md)
- [Agent-Gateway-Vertrag](AGENT_GATEWAY.md)
- [Sichtprüfung mit künstlichen Daten](qa/alpha-focus-20261004/README.md)
