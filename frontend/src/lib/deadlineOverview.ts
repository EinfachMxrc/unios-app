// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DeadlinesResponse } from '@/types'
import { timetableDate } from '@/lib/timetable'

export function nextDeadline(deadlines: DeadlinesResponse['deadlines'], now: number) {
  const instant = (value: string) => timetableDate(value).getTime()
  return deadlines.filter(item => Number.isFinite(instant(item.due_at)) && instant(item.due_at) >= now)
    .sort((left, right) => instant(left.due_at) - instant(right.due_at))[0]
}

type TimedEvent = { starts_at: string; ends_at: string | null }

/**
 * Events still ahead (or running), soonest first, and events already over,
 * most recent first. An event without an end is over once it has started.
 */
export function splitEvents<T extends TimedEvent>(events: readonly T[], now: number) {
  const instant = (value: string) => timetableDate(value).getTime()
  const end = (item: T) => instant(item.ends_at ?? item.starts_at)
  const upcoming = events.filter(item => end(item) >= now)
    .sort((left, right) => instant(left.starts_at) - instant(right.starts_at))
  const past = events.filter(item => end(item) < now)
    .sort((left, right) => instant(right.starts_at) - instant(left.starts_at))
  return { upcoming, past }
}
