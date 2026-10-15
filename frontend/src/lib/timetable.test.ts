// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, it } from 'vitest'
import { timetableState, splitAppointmentTitle } from './timetable'
it('marks a class only inside its known interval and hides it exactly at its end', () => {
  const event = { starts_at: '2026-10-02T08:00:00Z', ends_at: '2026-10-02T09:30:00Z' }
  expect(timetableState(event, new Date('2026-10-02T07:59:59Z'))).toBe('future')
  expect(
    timetableState(
      { starts_at: '2026-10-02T08:00:00', ends_at: '2026-10-02T09:30:00' },
      new Date('2026-10-02T08:30:00Z'),
    ),
  ).toBe('current')
  expect(timetableState(event, new Date(event.starts_at))).toBe('current')
  expect(timetableState(event, new Date('2026-10-02T09:29:59Z'))).toBe('current')
  expect(timetableState(event, new Date(event.ends_at))).toBe('past')
  expect(timetableState({ ...event, ends_at: null }, new Date('2026-10-03T00:00:00Z'))).toBe('future')
})
it('separates the supplied location without inventing a lecture name', () => {
  expect(splitAppointmentTitle('Lecture · R101, Campus')).toEqual({ title: 'Lecture', location: 'R101, Campus' })
  expect(splitAppointmentTitle('Lecture')).toEqual({ title: 'Lecture', location: '' })
})
