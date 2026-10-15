// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { calendarInput, calendarInputInstant, calendarInstant, calendarShift } from './calendarEditing'

const event = { id: 1, title: 'Study', starts_at: '2026-10-24T21:00:00Z', ends_at: '2026-10-25T01:00:00Z' }
describe('calendar editing in Berlin civil time', () => {
  it('rejects missing spring hours and preserves either occurrence of the repeated autumn hour', () => {
    expect(calendarInstant('2026-03-29', 150)).toBeNull()
    expect(calendarInstant('2026-10-25', 150, '2026-10-25T00:30:00Z')).toBe('2026-10-25T00:30:00.000Z')
    expect(calendarInstant('2026-10-25', 150, '2026-10-25T01:30:00Z')).toBe('2026-10-25T01:30:00.000Z')
  })
  it('retains either autumn offset when a stored reference includes seconds or milliseconds', () => {
    expect(calendarInputInstant('2026-10-25T02:35', '2026-10-25T00:30:45.123Z')).toBe('2026-10-25T00:35:00.000Z')
    expect(calendarInputInstant('2026-10-25T02:35', '2026-10-25T01:30:45.123Z')).toBe('2026-10-25T01:35:00.000Z')
  })
  it('keeps actual overnight duration when moving across a timezone change', () => {
    const moved = calendarShift(event, 2, -60, 'move')!
    expect(calendarInput(moved.starts_at)).toBe('2026-10-26T22:00')
    expect(Date.parse(moved.ends_at!) - Date.parse(moved.starts_at)).toBe(4 * 60 * 60_000)
  })
  it('resizes real endpoints, enforces a 15 minute minimum and preserves an unknown end on moves', () => {
    expect(calendarShift(event, 0, 30, 'end')!.ends_at).toBe('2026-10-25T01:30:00.000Z')
    expect(calendarShift({ ...event, ends_at: '2026-10-24T22:00:00Z' }, 0, -60, 'end')).toBeNull()
    expect(calendarShift({ ...event, ends_at: null }, 1, 15, 'move')!.ends_at).toBeNull()
  })
  it('formats editor fields in campus time and rolls midnight into the next civil day', () => {
    expect(calendarInputInstant('2026-10-26T09:15')).toBe('2026-10-26T08:15:00.000Z')
    expect(calendarInstant('2026-10-25', 1440)).toBe('2026-10-25T23:00:00.000Z')
    expect(calendarInputInstant('invalid')).toBeNull()
  })
})
