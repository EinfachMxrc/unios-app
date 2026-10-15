// SPDX-License-Identifier: AGPL-3.0-or-later
export function timetableDate(value: string): Date {
  return new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`)
}
export function timetableState(
  event: { starts_at: string; ends_at: string | null },
  now: Date,
): 'past' | 'current' | 'future' {
  const start = timetableDate(event.starts_at).getTime()
  const end = event.ends_at ? timetableDate(event.ends_at).getTime() : null
  if (end !== null && end <= now.getTime()) return 'past'
  if (end !== null && start <= now.getTime() && now.getTime() < end) return 'current'
  return 'future'
}
export function splitAppointmentTitle(value: string): { title: string; location: string } {
  const split = value.lastIndexOf(' · ')
  return split < 0 ? { title: value, location: '' } : { title: value.slice(0, split), location: value.slice(split + 3) }
}
