// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react'
import { useT } from '@/i18n/useT'
import { calendarInput, calendarInputInstant, type CalendarDraft } from '@/lib/calendarEditing'
import type { CalendarAppointment } from '@/lib/calendarLayout'
import { FormField } from './FormField'
import { Button } from './ui/button'

export function CalendarEventForm({
  event,
  draft,
  busy,
  onSave,
  onCancel,
}: {
  event: CalendarAppointment | null
  draft: CalendarDraft
  busy: boolean
  onSave: (draft: CalendarDraft) => Promise<void>
  onCancel: () => void
}) {
  const { t } = useT('deadlines')
  const [title, setTitle] = useState(draft.title)
  const [start, setStart] = useState(calendarInput(draft.starts_at))
  const [end, setEnd] = useState(draft.ends_at ? calendarInput(draft.ends_at) : '')
  const [error, setError] = useState('')
  const [scope, setScope] = useState<'single' | 'future' | 'series'>('single')
  return (
    <form
      className="calendar-edit-form"
      onSubmit={(submit) => {
        submit.preventDefault()
        const begins = calendarInputInstant(start, draft.starts_at)
        const finishes = end ? calendarInputInstant(end, draft.ends_at ?? undefined) : null
        if (!begins || (end && !finishes)) {
          setError(t('calendarInvalidTime'))
          return
        }
        if ((finishes && Date.parse(finishes) <= Date.parse(begins)) || (!finishes && (!event || event.personal))) {
          setError(t('calendarInvalidRange'))
          return
        }
        setError('')
        void onSave({
          title: title.trim(),
          starts_at: begins,
          ends_at: finishes,
          ...(event?.series_revision ? { scope } : {}),
        })
      }}
    >
      <FormField label={t('calendarEventTitle')} required>
        {(control) => (
          <input
            {...control}
            className="native-input"
            autoFocus
            value={title}
            maxLength={500}
            disabled={busy}
            onChange={(change) => setTitle(change.target.value)}
          />
        )}
      </FormField>
      <FormField label={t('calendarStarts')} required hint={t('calendarTimezone')}>
        {(control) => (
          <input
            {...control}
            className="native-input"
            type="datetime-local"
            step={60}
            value={start}
            disabled={busy}
            onChange={(change) => setStart(change.target.value)}
          />
        )}
      </FormField>
      <FormField label={t('calendarEnds')} required={!event || !!event.personal} error={error}>
        {(control) => (
          <input
            {...control}
            className="native-input"
            type="datetime-local"
            step={60}
            value={end}
            disabled={busy}
            onChange={(change) => setEnd(change.target.value)}
          />
        )}
      </FormField>
      {event?.series_revision && (
        <FormField label={t('calendarEditScope')} hint={t('calendarSeriesHint', { count: event.series_count ?? 0 })}>
          {(control) => (
            <select
              {...control}
              className="native-select"
              value={scope}
              disabled={busy}
              onChange={(change) => setScope(change.target.value as typeof scope)}
            >
              <option value="single">{t('calendarScopeSingle')}</option>
              <option value="future">{t('calendarScopeFuture')}</option>
              <option value="series">{t('calendarScopeSeries')}</option>
            </select>
          )}
        </FormField>
      )}
      {event && !event.personal && <p className="calendar-event-origin">{t('calendarPersonalAdjustment')}</p>}
      <div className="calendar-edit-actions">
        <Button type="submit" disabled={busy || !title.trim()}>
          {t(busy ? 'calendarSaving' : 'calendarSave')}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          {t('timetableCancel')}
        </Button>
      </div>
    </form>
  )
}
