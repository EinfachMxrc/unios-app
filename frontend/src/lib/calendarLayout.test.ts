// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, it } from 'vitest'
import {
  calendarColour,
  calendarDisplayDays,
  calendarFitHourPx,
  calendarHours,
  calendarSegments,
  calendarWeekStart,
  type CalendarAppointment,
} from './calendarLayout'

const event = (id: number, starts_at: string, ends_at: string | null): CalendarAppointment => ({
  id,
  title: `Fixture ${id}`,
  starts_at,
  ends_at,
})
it('anchors Monday without using the host timezone, across a year boundary', () => {
  expect(calendarWeekStart('2026-10-07')).toBe('2026-10-05')
  expect(calendarWeekStart('2027-01-03')).toBe('2026-12-28')
})
it('shows a five-day teaching week while keeping full weeks and weekend days explicit', () => {
  expect(calendarDisplayDays('2026-10-10', 'workweek')).toEqual([
    '2026-10-05',
    '2026-10-06',
    '2026-10-07',
    '2026-10-08',
    '2026-10-09',
  ])
  expect(calendarDisplayDays('2026-10-10', 'week')).toHaveLength(7)
  expect(calendarDisplayDays('2026-10-10', 'list')[6]).toBe('2026-10-11')
  expect(calendarDisplayDays('2026-10-10', 'day')).toEqual(['2026-10-10'])
  expect(calendarDisplayDays('2027-01-03', 'workweek')[4]).toBe('2027-01-01')
})
it('places Berlin winter and summer clock times at their civil hour', () => {
  expect(calendarSegments([event(1, '2026-01-05T08:00:00', '2026-01-05T09:30:00')], '2026-01-05')[0]).toMatchObject({
    start: 540,
    end: 630,
  })
  expect(calendarSegments([event(1, '2026-10-05T08:00:00Z', '2026-10-05T09:30:00Z')], '2026-10-05')[0]).toMatchObject({
    start: 600,
    end: 690,
  })
})
it('keeps overlapping appointments reachable and reuses lanes for touching intervals', () => {
  const segments = calendarSegments(
    [
      event(3, '2026-10-05T09:00:00Z', '2026-10-05T10:00:00Z'),
      event(1, '2026-10-05T08:00:00Z', '2026-10-05T11:00:00Z'),
      event(2, '2026-10-05T08:30:00Z', '2026-10-05T09:00:00Z'),
      event(4, '2026-10-05T11:00:00Z', '2026-10-05T12:00:00Z'),
    ],
    '2026-10-05',
  )
  expect(segments.map((segment) => [segment.event.id, segment.column, segment.columns])).toEqual([
    [1, 0, 2],
    [2, 1, 2],
    [3, 1, 2],
    [4, 0, 1],
  ])
})
it('clips a supplied overnight appointment onto both days and excludes an exact midnight end', () => {
  const overnight = event(1, '2026-10-05T21:30:00Z', '2026-10-05T23:30:00Z')
  expect(calendarSegments([overnight], '2026-10-05')[0]).toMatchObject({ start: 1410, end: 1440 })
  expect(calendarSegments([overnight], '2026-10-06')[0]).toMatchObject({ start: 0, end: 90 })
  expect(calendarSegments([event(2, '2026-10-05T21:30:00Z', '2026-10-05T22:00:00Z')], '2026-10-06')).toEqual([])
})
it('keeps a repeated DST hour visible and preserves the original instants', () => {
  const original = event(1, '2026-10-25T00:45:00Z', '2026-10-25T01:15:00Z')
  expect(calendarSegments([original], '2026-10-25')[0]).toMatchObject({ event: original, start: 165, end: 180 })
})
it('provides a visual slot for unknown durations without inventing an end time', () => {
  const original = event(1, '2026-10-05T08:00:00Z', null)
  expect(calendarSegments([original], '2026-10-05')[0]).toMatchObject({ event: original, start: 600, end: 630 })
  expect(calendarSegments([original], '2026-10-06')).toEqual([])
  expect(calendarSegments([event(2, 'invalid', null)], '2026-10-05')).toEqual([])
})
it('expands the visible time range for early and late appointments', () => {
  expect(calendarHours([])).toEqual({ start: 8, end: 18 })
  expect(
    calendarHours(calendarSegments([event(1, '2026-10-05T04:00:00Z', '2026-10-05T21:30:00Z')], '2026-10-05')),
  ).toEqual({ start: 6, end: 24 })
})
it('fits a complete teaching day without hiding lecture rooms or squeezing a full 24-hour range', () => {
  expect(calendarFitHourPx({ start: 8, end: 18 }, 460)).toBe(44)
  expect(calendarFitHourPx({ start: 8, end: 18 }, 660)).toBe(64)
  expect(calendarFitHourPx({ start: 0, end: 24 }, 460)).toBe(44)
  expect(calendarFitHourPx({ start: 8, end: 9 }, 760)).toBe(80)
  expect(calendarFitHourPx({ start: 8, end: 18 }, 400, 32)).toBe(38)
  expect(calendarFitHourPx({ start: 0, end: 24 }, 400, 32)).toBe(32)
})
it('gives one lecture the same colour after its room changes', () => {
  expect(calendarColour('Fixture Lecture · R101')).toBe(calendarColour('Fixture Lecture · R202'))
})
