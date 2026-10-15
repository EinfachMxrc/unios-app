// SPDX-License-Identifier: AGPL-3.0-or-later
import { campusClock, shiftMenuDay } from './mensa'
import { splitAppointmentTitle, timetableDate } from './timetable'

export type CalendarAppointment = {
  id: number
  title: string
  starts_at: string
  ends_at: string | null
  series_revision?: string | null
  series_count?: number
  series_adjusted?: boolean
  revision?: string
  personal?: boolean
  adjusted?: boolean
  original_starts_at?: string | null
  original_ends_at?: string | null
}
export type CalendarSegment = {
  event: CalendarAppointment
  start: number
  end: number
  column: number
  columns: number
}
export type CalendarView = 'day' | 'workweek' | 'week' | 'list'

export function calendarWeekStart(day: string): string {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay()
  return shiftMenuDay(day, -((weekday + 6) % 7))
}

export function calendarDisplayDays(day: string, view: CalendarView): string[] {
  if (view === 'day') return [day]
  const start = calendarWeekStart(day)
  return Array.from({ length: view === 'workweek' ? 5 : 7 }, (_, index) => shiftMenuDay(start, index))
}

/** Civil clock coordinates in the campus timezone, including overnight continuations. */
export function calendarSegments(events: CalendarAppointment[], day: string): CalendarSegment[] {
  const segments: CalendarSegment[] = []
  for (const event of events) {
    const startDate = timetableDate(event.starts_at)
    if (!Number.isFinite(startDate.getTime())) continue
    const start = campusClock(startDate, 'Europe/Berlin')
    const endDate = event.ends_at ? timetableDate(event.ends_at) : null
    const end =
      endDate && Number.isFinite(endDate.getTime()) && endDate > startDate
        ? campusClock(endDate, 'Europe/Berlin')
        : null
    if (start.day > day || (end ? end.day < day || (end.day === day && end.minutes === 0) : start.day !== day)) continue
    const from = start.day < day ? 0 : start.minutes
    const to = end ? (end.day > day ? 1440 : end.minutes) : Math.min(1440, from + 30)
    // Repeated DST hours and very short appointments still get a reachable visual slot.
    segments.push({ event, start: from, end: Math.min(1440, Math.max(from + 15, to)), column: 0, columns: 1 })
  }
  segments.sort((a, b) => a.start - b.start || b.end - a.end || a.event.id - b.event.id)
  let cluster: CalendarSegment[] = [],
    clusterEnd = -1
  function finish() {
    const ends: number[] = []
    for (const segment of cluster) {
      let column = ends.findIndex((end) => end <= segment.start)
      if (column < 0) column = ends.length
      ends[column] = segment.end
      segment.column = column
    }
    for (const segment of cluster) segment.columns = ends.length
  }
  for (const segment of segments) {
    if (segment.start >= clusterEnd) {
      finish()
      cluster = []
      clusterEnd = -1
    }
    cluster.push(segment)
    clusterEnd = Math.max(clusterEnd, segment.end)
  }
  finish()
  return segments
}

export function calendarHours(segments: CalendarSegment[]): { start: number; end: number } {
  return {
    start: Math.max(0, Math.min(8, ...segments.map((segment) => Math.floor(segment.start / 60)))),
    end: Math.min(24, Math.max(18, ...segments.map((segment) => Math.ceil(segment.end / 60)))),
  }
}

/** Fit the displayed teaching hours, with a compact floor for the focused overview. */
export function calendarFitHourPx(hours: { start: number; end: number }, height: number, minimum = 44): number {
  return Math.max(minimum, Math.min(80, (height - 20) / Math.max(1, hours.end - hours.start)))
}

/** Stable per-course colours; room changes must not recolour a lecture. */
export function calendarColour(title: string): number {
  let hash = 0
  for (const char of splitAppointmentTitle(title).title) hash = (Math.imul(hash, 31) + char.codePointAt(0)!) | 0
  return Math.abs(hash % 5)
}
