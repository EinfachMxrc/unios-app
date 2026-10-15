// SPDX-License-Identifier: AGPL-3.0-or-later

export default {
  changed: 'Prüfungstermin geändert', oldDate: 'Bisher: {{date}}', newDate: 'Jetzt: {{date}}',
  unknownDate: 'Noch kein bestätigter Termin', inspect: 'Lernplan prüfen', title: 'Lernplan neu planen',
  intro: 'Vergleiche die Termine. Erst mit deiner Bestätigung wird dein angenommener Lernplan angepasst.',
  phases: 'Lernphasen', blocks: 'Lernblöcke', before: 'Bisher', after: 'Vorschlag',
  block: '{{topic}} · {{minutes}} Minuten', phaseDates: '{{start}} bis {{end}}',
  history: '{{count}} bereits begonnene oder abgeschlossene Blöcke und abgeschlossene Phasen bleiben erhalten.',
  noHistory: 'Dauer, Inhalte und Quelle deiner Lernblöcke bleiben erhalten.',
  keepOfficial: 'Der offizielle Prüfungstermin wird nicht verändert. Andere angenommene Lernblöcke und Kalendertermine werden berücksichtigt.',
  unavailable: 'Kein sicheres Zeitfenster', confirm: 'Diese Termine übernehmen', cancel: 'Abbrechen', refresh: 'Vorschau aktualisieren',
  applying: 'Lernplan wird angepasst …', applied: 'Dein Lernplan wurde angepasst.',
  reason_undated: 'Ohne bestätigten Prüfungstermin bleibt dein bisheriger Lernplan erhalten.',
  reason_exam_past: 'Der Prüfungstermin liegt in der Vergangenheit. Es werden keine neuen Termine erzeugt.',
  reason_unchanged: 'Der Lernplan passt bereits zum aktuellen Prüfungstermin.',
  reason_history_only: 'Diese Phase gehört bereits zum Verlauf. Bereits begonnene oder abgeschlossene Arbeit wird nicht verschoben.',
  reason_phase_elapsed: 'Für mindestens eine angenommene Phase bleibt vor der neuen Prüfung kein zukünftiges Zeitfenster. Der Plan wird nicht teilweise geändert.',
  reason_no_slot: 'Mindestens ein Lernblock findet vor der Prüfung keinen freien Platz. Dein bestehender Plan bleibt vollständig erhalten.',
  readOnly: 'Zum Übernehmen muss dein Hauptgerät erreichbar und bereit sein.',
}
