// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { nextDeadline, splitEvents } from './deadlineOverview'

describe('next official deadline', () => {
  const item = (id: number, due_at: string) => ({ id, due_at, title: `Fixture ${id}`, course_id: null, assignment_id: null, url: null })
  it('finds the earliest future instant without changing feed order or mistaking invalid dates for deadlines', () => {
    const entries = [item(1, '2026-10-25T02:30:00+01:00'), item(2, 'invalid'), item(3, '2026-10-25T02:30:00+02:00'), item(4, '2026-10-24T12:00:00Z')]
    expect(nextDeadline(entries, Date.parse('2026-10-25T00:00:00Z'))?.id).toBe(3)
    expect(entries.map(entry => entry.id)).toEqual([1, 2, 3, 4])
  })
  it('does not invent an upcoming task from past deadlines', () => {
    expect(nextDeadline([item(1, '2026-10-08T00:00:00Z')], Date.parse('2026-10-09T00:00:00Z'))).toBeUndefined()
    expect(nextDeadline([], Date.now())).toBeUndefined()
  })
  it('treats stored timestamps without offsets as UTC, consistent with the rendered campus time', () => {
    const entries = [item(1, '2026-10-25T02:00:00')]
    expect(nextDeadline(entries, Date.parse('2026-10-25T01:00:00Z'))?.id).toBe(1)
    expect(nextDeadline(entries, Date.parse('2026-10-25T03:00:00Z'))).toBeUndefined()
  })
})

describe('splitEvents', () => {
  const now = Date.parse('2026-10-12T10:00:00Z')
  const event = (id: number, starts_at: string, ends_at: string | null = null) => ({ id, title: `e${id}`, starts_at, ends_at })

  it('keeps only events that have not ended, soonest first, and lists past ones newest first', () => {
    const { upcoming, past } = splitEvents([
      event(1, '2026-07-17T13:00:00Z'),
      event(2, '2026-10-20T08:00:00Z'),
      event(3, '2026-10-12T09:00:00Z', '2026-10-12T11:00:00Z'),
      event(4, '2026-09-30T08:00:00Z'),
      event(5, '2026-10-13T08:00:00Z'),
    ], now)
    expect(upcoming.map(item => item.id)).toEqual([3, 5, 2])
    expect(past.map(item => item.id)).toEqual([4, 1])
  })

  it('treats an event without an end as over once it has started', () => {
    const { upcoming, past } = splitEvents([event(1, '2026-10-12T09:59:00Z')], now)
    expect(upcoming).toEqual([])
    expect(past.map(item => item.id)).toEqual([1])
  })
})
