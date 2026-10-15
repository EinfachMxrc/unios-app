// SPDX-License-Identifier: AGPL-3.0-or-later

export default {
  failureTitle: 'Daten konnten nicht geladen werden',
  failureGenericDetail: 'Bitte versuche es erneut. Falls das Problem bleibt, prüfe die Verbindung unter Einstellungen.',
  syncNeverTitle: 'Noch kein brauchbarer Uni-Sync',
  syncOverdueTitle: 'Uni-Sync ist überfällig',
  syncCurrentTitle: 'Synchronisation wieder aktuell',
  syncNeverDescription: 'Starte die Synchronisation und prüfe danach den Verbindungsstatus.',
  syncOverdueDescription:
    'Der letzte brauchbare Uni-Sync liegt {{hours}} Stunden zurück. Neue Inhalte und Fristen können fehlen.',
  syncRecoveredDescription: 'Nach {{hours}} Stunden Pause wurde wieder erfolgreich synchronisiert.',
  status: {
    success: 'Erfolgreich',
    ok: 'OK',
    warning: 'Warnung',
    error: 'Fehler',
    running: 'Läuft',
    paused: 'Pausiert',
    unknown: 'Unklar',
    not_configured: 'Nicht eingerichtet',
  },
} as const
