// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState } from 'react'
import { ApiError, request } from '@/api'
import { useT } from '@/i18n/useT'
import type { CalendarAppointment } from '@/lib/calendarLayout'
import type { CalendarDraft } from '@/lib/calendarEditing'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'

export type CalendarChange = { event: CalendarAppointment | null; undo_id: string | null }

export function useCalendarMutation(onChanged: (change: CalendarChange, id?: number) => void) {
  const { t } = useT('deadlines')
  const lock = useRef(false)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<CalendarAppointment | null>(null)
  const [failure, setFailure] = useState('')
  const [conflict, setConflict] = useState(false)
  const [retryable, setRetryable] = useState(false)
  const [message, setMessage] = useState('')
  const [subject, setSubject] = useState<CalendarAppointment | null>(null)
  const [undo, setUndo] = useState<{ action: string; eventId?: number } | null>(null)
  const retry = useRef<(() => Promise<boolean>) | null>(null)

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(''), 2000)
    return () => window.clearTimeout(timer)
  }, [message])

  async function mutate(
    path: string,
    method: string,
    body?: object,
    event?: CalendarAppointment,
    draft?: CalendarDraft,
  ): Promise<boolean> {
    if (lock.current) return false
    lock.current = true
    setBusy(true)
    setFailure('')
    setMessage('')
    setConflict(false)
    setRetryable(false)
    retry.current = null
    setSubject(event ?? null)
    if (event && draft) setPending({ ...event, ...draft })
    try {
      const change = await request<CalendarChange>(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) })
      onChanged(change, event?.id ?? undo?.eventId)
      setUndo(change.undo_id ? { action: change.undo_id, eventId: change.event?.id ?? event?.id } : null)
      setMessage(t(path.endsWith('/undo') ? 'calendarUndone' : 'calendarSaved'))
      return true
    } catch (cause) {
      setFailure(extractApiErrorMessage(cause))
      const stale = cause instanceof ApiError && cause.status === 409
      setConflict(stale)
      if (stale) onChanged({ event: null, undo_id: null })
      // Retrying a new POST after a lost response could create a duplicate.
      // Existing events are revision guarded, so an unknown response cannot overwrite a newer edit.
      if (event && !stale && (!(cause instanceof ApiError) || cause.status >= 500)) {
        retry.current = () => mutate(path, method, body, event, draft)
        setRetryable(true)
      }
      return false
    } finally {
      setPending(null)
      setSubject(null)
      setBusy(false)
      lock.current = false
    }
  }
  return {
    busy,
    pending,
    subject,
    failure,
    conflict,
    retryable,
    message,
    undo,
    retryLast: () => retry.current?.() ?? Promise.resolve(false),
    clearFailure: () => {
      setFailure('')
      setConflict(false)
      setRetryable(false)
      retry.current = null
    },
    save: (draft: CalendarDraft, event?: CalendarAppointment) =>
      mutate(
        event ? `/api/timetable/events/${event.id}` : '/api/timetable/events',
        event ? 'PATCH' : 'POST',
        {
          ...draft,
          ...(event
            ? {
                revision: event.revision,
                ...(draft.scope && draft.scope !== 'single' ? { series_revision: event.series_revision } : {}),
              }
            : {}),
        },
        event,
        draft,
      ),
    remove: (event: CalendarAppointment) =>
      mutate(`/api/timetable/events/${event.id}`, 'DELETE', { revision: event.revision }, event),
    reset: (event: CalendarAppointment) =>
      mutate(`/api/timetable/events/${event.id}/reset`, 'POST', { revision: event.revision }, event),
    undoLast: () => (undo ? mutate(`/api/timetable/changes/${undo.action}/undo`, 'POST') : Promise.resolve(false)),
  }
}
