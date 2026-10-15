// SPDX-License-Identifier: AGPL-3.0-or-later
// Invented classes, rooms and deadlines shared by browser checks and visual audits.
export const calendarNow = '2026-10-07T08:30:00Z'
export const calendarStatus = {
  subscribed: true,
  name: 'Fixture timetable',
  keyring_available: true,
  last_success_at: calendarNow,
  last_error: '',
  event_count: 9,
  session_link: false,
  through: null,
}
export const calendarEvents = [
  {
    id: 9001,
    title: 'Mathematik · R101, Fictional Campus',
    starts_at: '2026-10-05T06:00:00Z',
    ends_at: '2026-10-05T07:30:00Z',
  },
  { id: 9002, title: 'Programmieren · R203', starts_at: '2026-10-05T08:00:00Z', ends_at: '2026-10-05T09:30:00Z' },
  { id: 9003, title: 'Digitale Systeme · R105', starts_at: '2026-10-06T07:00:00Z', ends_at: '2026-10-06T08:30:00Z' },
  {
    id: 9004,
    title: 'Mathematik · R101, Fictional Campus',
    starts_at: '2026-10-07T08:00:00Z',
    ends_at: '2026-10-07T09:30:00Z',
  },
  { id: 9005, title: 'Übungsgruppe · R102', starts_at: '2026-10-07T08:45:00Z', ends_at: '2026-10-07T09:45:00Z' },
  { id: 9006, title: 'Programmieren · R203', starts_at: '2026-10-07T11:00:00Z', ends_at: '2026-10-07T12:30:00Z' },
  { id: 9007, title: 'English Workshop · R301', starts_at: '2026-10-08T08:00:00Z', ends_at: '2026-10-08T09:30:00Z' },
  { id: 9008, title: 'Digitale Systeme · R105', starts_at: '2026-10-09T07:00:00Z', ends_at: '2026-10-09T08:30:00Z' },
  { id: 9009, title: 'Projektarbeit · Lab 2', starts_at: '2026-10-09T11:00:00Z', ends_at: null },
]
export const calendarDeadlines = {
  deadlines: [
    {
      id: 901,
      title: 'Mathematik Übungsblatt',
      course_id: 1,
      assignment_id: null,
      due_at: '2026-10-07T21:59:00Z',
      url: null,
    },
    {
      id: 902,
      title: 'Programmieren Aufgabe',
      course_id: 2,
      assignment_id: null,
      due_at: '2026-10-07T16:00:00Z',
      url: null,
    },
    {
      id: 903,
      title: 'Projektbericht',
      course_id: null,
      assignment_id: null,
      due_at: '2026-10-07T18:00:00Z',
      url: null,
    },
    {
      id: 904,
      title: 'Digitale Systeme Übung',
      course_id: 3,
      assignment_id: null,
      due_at: '2026-10-15T16:00:00Z',
      url: null,
    },
  ],
  courses: { '1': 'Mathematik', '2': 'Programmieren', '3': 'Digitale Systeme' },
  events: [],
}
