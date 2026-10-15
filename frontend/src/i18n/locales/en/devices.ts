// SPDX-License-Identifier: AGPL-3.0-or-later

export default {
  calendarSources: 'What should appear in the calendar?',
  calendarExportAll: 'Select everything',
  calendarExportTimetable: 'Timetable only',
  calendarChooseSource: 'Choose at least one source.',
  calendarSource_timetable: 'Timetable',
  calendarSource_appointments: 'Other university appointments',
  calendarSource_personal: 'Personal appointments',
  calendarSource_deadlines: 'Deadlines and confirmed mail dates',
  calendarSource_exams: 'Exams',
  calendarSource_study: 'Study blocks',
  calendarSource_periods: 'Public semester deadlines',

  rotateCalendarLink: 'Renew calendar link',
  confirmRotateCalendarLink:
    'Renew the calendar link? The previous link will stop working. Update your calendar apps with the new link.',
  enterCodeText: 'Enter this device code in the UniOS app on the other device:',
  copyCodeButton: 'Copy device code',
  panelTitle: 'Devices',
  intro: 'Pair your phone or another device to access your data from there.',
  pairDeviceButton: 'Pair device',
  openLinkText: 'Open this link on the other device:',
  copyLinkButton: 'Copy link',
  validUntilText: 'Valid until {{date}}',
  linkCopiedMessage: 'Link copied.',
  clipboardUnavailableMessage: 'Clipboard not available. Please select the link and copy it yourself.',
  lastActiveText: 'Last active: {{date}}',
  signOutButton: 'Sign out',
  emptyTitle: 'No device yet',
  emptyText: 'The device appears here after pairing.',
  confirmRevokeLocalText:
    "Sign out this device? If it's your current device, you'll be signed out immediately and need to pair again.",
  confirmRevokeOtherText: 'Sign out "{{label}}"? The device will need a new pairing link afterward.',
  calendarPanelTitle: 'Calendar',
  calendarIntro:
    'Subscribe to deadlines, exams and study blocks in your calendar app. This link is secret like a password: whoever knows it can read your schedule.',
} as const
