// SPDX-License-Identifier: AGPL-3.0-or-later

import type { CalendarAppointment } from '@/lib/calendarLayout'
import { timetableState } from '@/lib/timetable'
import { timetableDate } from '@/lib/timetable'

export type NextSession =
  | { kind: 'running'; event: CalendarAppointment }
  | { kind: 'soon'; event: CalendarAppointment; minutes: number }
  | { kind: 'later'; event: CalendarAppointment }

const SOON_MINUTES = 90

/** The appointment that matters right now: the running one, otherwise the next one today. */
export function nextSession(appointments: readonly CalendarAppointment[], now: Date): NextSession | null {
  const ordered = [...appointments].sort(
    (a, b) => timetableDate(a.starts_at).getTime() - timetableDate(b.starts_at).getTime(),
  )
  const running = ordered.find((event) => timetableState(event, now) === 'current')
  if (running) return { kind: 'running', event: running }
  const event = ordered.find((item) => timetableDate(item.starts_at).getTime() > now.getTime())
  if (!event) return null
  const minutes = Math.ceil((timetableDate(event.starts_at).getTime() - now.getTime()) / 60_000)
  return minutes <= SOON_MINUTES ? { kind: 'soon', event, minutes } : { kind: 'later', event }
}
