// SPDX-License-Identifier: AGPL-3.0-or-later

import { useApi } from '@/api'
import { campusClock } from '@/lib/mensa'
import { type CalendarAppointment } from '@/lib/calendarLayout'
import { timetableDate } from '@/lib/timetable'

export type TimetableStatus = { subscribed: boolean; last_error: string }

/** Today's appointments from the same endpoint the full timetable reads. */
export function useTodayAppointments(day: string, enabled: boolean) {
  const status = useApi<TimetableStatus>('/api/timetable/status', { enabled, refetchInterval: 60_000 })
  const events = useApi<CalendarAppointment[]>(`/api/timetable/events?day=${day}`, {
    enabled,
    refetchInterval: 60_000,
  })
  // A cached or proxied answer that is not a list must not take the start page down.
  const today = (Array.isArray(events.data) ? events.data : []).filter(
    (event) => campusClock(timetableDate(event.starts_at), 'Europe/Berlin').day === day,
  )
  return {
    appointments: today,
    // null while unknown (loading or offline).
    subscribed: status.data ? status.data.subscribed : null,
    loading: events.loading,
    error: events.error ?? events.refreshError ?? status.error ?? (status.data?.last_error || null),
    reload: () => {
      status.reload()
      events.reload()
    },
  }
}
