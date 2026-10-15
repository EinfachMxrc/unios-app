<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Gemeinsame Zustands- und Navigationskarte

Stand: Produkt0.1.22, Quellrevision `05e56cfad86b110e2d1be505adad2b58e3ab6d2a`.
Nur Code und erfundene Browserprofile; keine privaten App-Daten.

| Eigentümer | Schreibende Aktion | Ergebnis / Rücksetzungen |
| --- | --- | --- |
| preferences.ts | setModule, setAdvanced, setDensity, setLanguage | Nur das jeweilige Feld ändern, lokale Einstellung speichern, Abonnenten benachrichtigen; keine Fachobjekte ändern |
| lib/workspaceState.ts | rememberWorkspace(key,value,persistent) | Nur Schlüssel ersetzen, auf160 Einträge begrenzen, optional Sessionstorage bis768KiB; Abonnenten dieses Schlüssels benachrichtigen |
| lib/workspaceState.ts | clearWorkspace | Zuletzt geöffnete Objekte, sämtliche UI-Schlüssel, Sessionstorage und dauerhaften letzten Lernhandle löschen; sämtliche Abonnenten und workspace-cleared-Ereignis auslösen |
| lib/studyResume.ts | rememberStudySession | Begrenzt validierten Kurs/Block/Zyklus-Handle, Modus, Quellenversion, Seite und Notiz-ID speichern; keinen Notizkörper schreiben |
| lib/recentObjects.ts | rememberObject / clearRecentObjects | Nur letzte Ressourcenliste ändern / vollständig zurücksetzen |
| components/WorkspaceNavigation.tsx | navigate, Route-Effekt | Historienposition/Control-Fokus speichern; bei neuem Weg Window-Scroll zurücksetzen und H1 fokussieren; bei POP Position/Fokus wiederherstellen |
| components/WorkspaceNavigation.tsx | passiveReaderPage | Nur REPLACE mit readerPageSync, gleicher Route/Hash und allein geänderter gültiger page auf block/cycle als passive Metadaten behandeln; course fehlt in der aktuellen Routeprüfung |
| pages/FocusWorkspacePage.tsx | choose | Gewählten Modus/Quelle/Notiz speichern, anschließend zu entsprechendem Fokuspfad navigieren; Seitennummer aus Quellenkontext übernehmen |
| pages/FocusWorkspacePage.tsx | reportPage | Ausschließlich page in aktueller Query ersetzen, REPLACE mit readerPageSync; Reader meldet keinen neuen fachlichen Arbeitsplatz |
| components/NavigationIntent.tsx | Hover/Focus auf Link | Nur Zielroute/API vorbereiten; keine Mutationen, Editor- oder Dateiinhalte vorladen |
| components/ServerConnection.tsx | erfolgreiche pair-Antwort | clearWorkspace, manuellen Draft-Bindungswechsel abschließen, Code leeren, Querycache invalidieren; bewusst erst nach erfolgreicher Kopplung |
| HostContext / runtimeAccess | verfügbare Laufzeit/Writer-Grenze | Globale Schreibfreigabe und Onlineprüfung; fachliche Speicherung muss zusätzlich die Serverrevision beachten |
| React Query / Offline-Outboxes | erfolgreicher ACK, Invalidate, Replay | Fachantwort und Cache gehören zu Ressource/Server; Draft- oder Eingabetext darf durch einen alten ACK nicht als neuer Stand quittiert werden |

Die globale Karte ist vollständig für die geteilten Navigations-/UI-Stores des
Reviews. Jeder Seitenreview ergänzt lokale States (Draft, dirty, selection,
pending, cursor) am untersuchten Clickpath. Besonders prüfen: spätere Setter,
Route-Effekte, Mutation-ACKs und Serverwechsel dürfen neuere Texte oder einen
beabsichtigten Eingabefokus nicht unbeabsichtigt zurücksetzen.

`sidebarCatalog.ts` besitzt gemeinsame Route-/Label-/Modulzuordnung;
`sidebarLayout.ts` entscheidet Pins; `MorePage.tsx` filtert Gruppen und Unterseiten.
Standard: fünf Hauptwege Heute/Kurse/Lernen/Notizen/Termine. AI/Projekte/Noten/Mail
sind standardmäßig ausgeschaltet; Erweiterungen aktiviert, Werkzeuge unter Mehr
eingeklappt. Inspektionsbilder mit allen Modulen sind ausdrücklich kein Beleg,
dass diese vollständige Menge standardmäßig sichtbar ist.
