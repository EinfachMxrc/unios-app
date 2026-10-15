// SPDX-License-Identifier: AGPL-3.0-or-later
import { activeIntlLocale } from '@/api'

export type RoomConfig = { url: string | null; rooms: string[]; start_times: string[]; durations: number[] }
export type BookingSelection = { day: string; persons: number; startTime: string; duration: number; room: string }
export type RoomSnapshot = { heading: string; message: string; canBook: boolean }
export type RoomAvailability =
  { status: 'offered'; snapshot: RoomSnapshot } | { status: 'advance-limit' | 'unknown' | 'login-required' | 'failed' }
export type RoomOffer = { room: string; selection: BookingSelection; checkedAt: number }
export type RoomCheck = RoomOffer & {
  status: 'available' | 'conflict' | 'unknown'
  source: 'portal-offer' | 'portal-query' | 'user-confirmed'
}

// Observations survive page navigation, but never imply a shared/live occupancy feed.
let sessionChecks: RoomCheck[] = []

export function roomChecks(): RoomCheck[] {
  return [...sessionChecks]
}

export function sameRoomSlot(left: BookingSelection, right: BookingSelection): boolean {
  return (
    left.day === right.day &&
    left.startTime === right.startTime &&
    left.duration === right.duration &&
    left.persons === right.persons
  )
}

export function rememberRoomCheck(check: RoomCheck): RoomCheck[] {
  sessionChecks = [
    check,
    ...sessionChecks.filter(
      (previous) => previous.room !== check.room || !sameRoomSlot(previous.selection, check.selection),
    ),
  ].slice(0, 100)
  return roomChecks()
}

/** Only the exact requested interval/person count is checked; no adjacent slots become free. */
export function checkForRoom(checks: RoomCheck[], room: string, selection: BookingSelection): RoomCheck | undefined {
  return checks.find((check) => check.room === room && sameRoomSlot(check.selection, selection))
}

export function matchesRooms(query: string): boolean {
  return /\b(raum|räume|raumbuchung|raumreservierung|arbeitsraum|arbeitsräume|room|rooms|booking)\b/i.test(query.trim())
}

export function validSelection(selection: BookingSelection, config: RoomConfig): boolean {
  const day = new Date(`${selection.day}T12:00:00Z`)
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(selection.day) &&
    Number.isFinite(day.getTime()) &&
    day.toISOString().slice(0, 10) === selection.day &&
    Number.isSafeInteger(selection.persons) &&
    selection.persons > 0 &&
    selection.persons <= 1000 &&
    config.start_times.includes(selection.startTime) &&
    config.durations.includes(selection.duration) &&
    (!selection.room || config.rooms.includes(selection.room))
  )
}

/** A screenshot-proven offer is not a reservation. Unknown text/other slots never become available. */
export function parseRoomOffer(
  snapshot: RoomSnapshot,
  selection: BookingSelection,
  config: RoomConfig,
  now = Date.now(),
): RoomOffer | null {
  if (
    !validSelection(selection, config) ||
    snapshot.canBook !== true ||
    typeof snapshot.heading !== 'string' ||
    typeof snapshot.message !== 'string' ||
    snapshot.heading.length > 200 ||
    snapshot.message.length > 200
  )
    return null
  const heading = /^Raumbuchung am (\d{2})\.(\d{2})\. (\d{2}:\d{2}) für (?:(\d):([03]0) h|(30) min)$/.exec(
    snapshot.heading.trim(),
  )
  const room = /^Der Raum ([\w-]+) steht zur Verfügung\.$/.exec(snapshot.message.trim())?.[1]
  if (!heading || !room || !config.rooms.includes(room) || (selection.room && selection.room !== room)) return null
  const [, day, month, start, hours, minutes, halfHour] = heading
  if (
    `${month}-${day}` !== selection.day.slice(5) ||
    start !== selection.startTime ||
    (halfHour ? Number(halfHour) : Number(hours) * 60 + Number(minutes)) !== selection.duration
  )
    return null
  // The source omits the year. Keep the user's selected year explicit; never infer it from today's date.
  return { room, selection: { ...selection }, checkedAt: now }
}

export function offerFresh(offer: RoomOffer, now = Date.now()): boolean {
  return now >= offer.checkedAt && now - offer.checkedAt < 120_000
}

export function roomDay(day: string): string {
  return new Intl.DateTimeFormat(activeIntlLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00Z`))
}

export function roomEnd(selection: BookingSelection): string {
  const [hour, minute] = selection.startTime.split(':').map(Number)
  const end = hour * 60 + minute + selection.duration
  return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`
}
