// SPDX-License-Identifier: AGPL-3.0-or-later

export default {
  calendarSources: 'Was soll im Kalender erscheinen?',
  calendarExportAll: 'Alles auswählen',
  calendarExportTimetable: 'Nur Stundenplan',
  calendarChooseSource: 'Wähle mindestens eine Quelle.',
  calendarSource_timetable: 'Stundenplan',
  calendarSource_appointments: 'Weitere Hochschultermine',
  calendarSource_personal: 'Eigene Termine',
  calendarSource_deadlines: 'Abgaben und bestätigte Mail-Fristen',
  calendarSource_exams: 'Prüfungen',
  calendarSource_study: 'Lernblöcke',
  calendarSource_periods: 'Öffentliche Semesterfristen',

  rotateCalendarLink: 'Kalenderlink erneuern',
  confirmRotateCalendarLink:
    'Kalenderlink erneuern? Der bisherige Link funktioniert danach nicht mehr. Trage den neuen Link in deinen Kalender-Apps ein.',
  enterCodeText: 'Diesen Gerätecode in der UniOS-App auf dem anderen Gerät eingeben:',
  copyCodeButton: 'Gerätecode kopieren',
  panelTitle: 'Geräte',
  intro: 'Koppele dein Handy oder ein weiteres Gerät, um von dort auf deine Daten zuzugreifen.',
  pairDeviceButton: 'Gerät koppeln',
  openLinkText: 'Öffne diesen Link auf dem anderen Gerät:',
  copyLinkButton: 'Link kopieren',
  validUntilText: 'Gültig bis {{date}}',
  linkCopiedMessage: 'Link kopiert.',
  clipboardUnavailableMessage: 'Zwischenablage nicht verfügbar. Bitte den Link markieren und selbst kopieren.',
  lastActiveText: 'Zuletzt aktiv: {{date}}',
  signOutButton: 'Abmelden',
  emptyTitle: 'Noch kein Gerät',
  emptyText: 'Nach der Kopplung erscheint das Gerät hier.',
  confirmRevokeLocalText:
    'Dieses Gerät abmelden? Falls es dein aktuelles Gerät ist, wirst du sofort abgemeldet und musst dich neu koppeln.',
  confirmRevokeOtherText: '„{{label}}" abmelden? Das Gerät braucht danach einen neuen Kopplungslink.',
  calendarPanelTitle: 'Kalender',
  calendarIntro:
    'Abonniere Fristen, Prüfungen und Lernblöcke in deiner Kalender-App. Dieser Link ist geheim wie ein Passwort: Wer ihn kennt, kann deine Termine lesen.',
} as const
