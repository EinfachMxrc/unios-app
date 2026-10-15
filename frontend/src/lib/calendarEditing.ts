// SPDX-License-Identifier: AGPL-3.0-or-later
import { campusClock, shiftMenuDay } from './mensa'
import { timetableDate } from './timetable'
import type { CalendarAppointment } from './calendarLayout'

export type CalendarDraft = {
  title: string
  starts_at: string
  ends_at: string | null
  scope?: 'single' | 'future' | 'series'
}
export type CalendarEditMode = 'move' | 'start' | 'end'
export const CALENDAR_SNAP = 15

/** Explicit campus civil time; never depend on the device's timezone or silently normalize DST gaps. */
export function calendarInstant(day: string, minutes: number, reference?: string): string | null {
  const date = shiftMenuDay(day, Math.floor(minutes / 1440))
  const minute = ((minutes % 1440) + 1440) % 1440
  const wall = Date.parse(`${date}T00:00:00Z`) + minute * 60_000
  const candidates = [120, 60]
    .map((offset) => new Date(wall - offset * 60_000))
    .filter((instant) => {
      const clock = campusClock(instant, 'Europe/Berlin')
      return clock.day === date && clock.minutes === minute
    })
  if (!candidates.length) return null
  if (reference && candidates.length > 1) {
    const original = timetableDate(reference)
    const local = campusClock(original, 'Europe/Berlin')
    // campusClock has minute precision: exclude seconds/milliseconds from the
    // reference too, otherwise neither DST candidate matches its UTC offset.
    const referenceMinute = Math.floor(original.getTime() / 60_000) * 60_000
    const offset = Date.parse(`${local.day}T00:00:00Z`) + local.minutes * 60_000 - referenceMinute
    return (candidates.find((candidate) => wall - candidate.getTime() === offset) ?? candidates[0]).toISOString()
  }
  return candidates[0].toISOString()
}

export function calendarInput(value: string): string {
  const clock = campusClock(timetableDate(value), 'Europe/Berlin')
  return `${clock.day}T${String(Math.floor(clock.minutes / 60)).padStart(2, '0')}:${String(clock.minutes % 60).padStart(2, '0')}`
}

export function calendarInputInstant(value: string, reference?: string): string | null {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)) return null
  return calendarInstant(value.slice(0, 10), Number(value.slice(11, 13)) * 60 + Number(value.slice(14, 16)), reference)
}

/** A move keeps the actual duration, including overnight appointments and a DST transition. */
export function calendarShift(
  event: CalendarAppointment,
  dayDelta: number,
  minuteDelta: number,
  mode: CalendarEditMode,
): CalendarDraft | null {
  const start = campusClock(timetableDate(event.starts_at), 'Europe/Berlin')
  if (mode === 'move') {
    const begins = calendarInstant(shiftMenuDay(start.day, dayDelta), start.minutes + minuteDelta, event.starts_at)
    if (!begins) return null
    return {
      title: event.title,
      starts_at: begins,
      ends_at: event.ends_at
        ? new Date(
            Date.parse(begins) + timetableDate(event.ends_at).getTime() - timetableDate(event.starts_at).getTime(),
          ).toISOString()
        : null,
    }
  }
  const endpoint = mode === 'start' ? event.starts_at : event.ends_at
  const end = endpoint
    ? campusClock(timetableDate(endpoint), 'Europe/Berlin')
    : { day: start.day, minutes: start.minutes + 30 }
  const instant = calendarInstant(end.day, end.minutes + minuteDelta, endpoint ?? event.starts_at)
  if (!instant) return null
  const draft = {
    title: event.title,
    starts_at: mode === 'start' ? instant : event.starts_at,
    ends_at: mode === 'end' ? instant : event.ends_at,
  }
  if (
    draft.ends_at &&
    timetableDate(draft.ends_at).getTime() - timetableDate(draft.starts_at).getTime() < CALENDAR_SNAP * 60_000
  )
    return null
  return draft
}

export function calendarSlot(day: string, from: number, to: number): CalendarDraft | null {
  const starts_at = calendarInstant(day, from),
    ends_at = calendarInstant(day, to)
  return starts_at && ends_at ? { title: '', starts_at, ends_at } : null
}
