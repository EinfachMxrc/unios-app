// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState } from 'react'
import { ApiError, request } from '@/api'
import { useT } from '@/i18n/useT'
import { AssessmentQuestion } from '@/components/AssessmentQuestion'
import { Button } from '@/components/ui/button'
import { useWritableHost } from '@/hooks/host'
import { useApiMutation } from '@/hooks/useApiMutation'
import { calendarInput, calendarInputInstant } from '@/lib/calendarEditing'
import { FormField } from '@/components/FormField'
import type { Assignment } from '@/types'
import { queryClient } from '@/offlineCache'
import './PersonalTaskStatus.css'

export function AssignmentDeadline({ item, onSaved, showDescription = true }: { item: Assignment; onSaved: () => void; showDescription?: boolean }) {
  const { t } = useT('courses')
  const { t: task } = useT('ownTaskSupport')
  const { t: calendar } = useT('deadlines')
  const canWrite = useWritableHost()
  const [date, setDate] = useState(() => item.due_at ? calendarInput(item.due_at) : '')
  const [delivery, setDelivery] = useState(item.delivery || 'unknown')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const save = useApiMutation<unknown, string>(dueAt => request(`/api/assignments/${item.id}/deadline`, { method: 'POST', body: JSON.stringify({
    due_at: dueAt,
    expected_due_at: item.due_at && !/(?:Z|[+-]\d\d:\d\d)$/.test(item.due_at) ? `${item.due_at}Z` : item.due_at,
    delivery,
  }) }), { onSuccess: () => {
    onSaved(); setMessage(task('deadlineSaved'))
    for (const path of ['/api/overview', '/api/deadlines', '/api/assignments/unresolved']) {
      void queryClient.invalidateQueries({ queryKey: ['api', path] })
    }
  } })
  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(''), 2000)
    return () => window.clearTimeout(timer)
  }, [message])
  async function confirm() {
    if (!canWrite || save.pending) return
    const instant = calendarInputInstant(date, item.due_at ?? undefined)
    if (!instant) { setError(task('invalidTime')); return }
    setError(''); setMessage('')
    try {
      await save.mutateAsync(instant)
    } catch (cause) { if (cause instanceof ApiError && cause.status === 409) onSaved() }
  }
  return <>
    {item.delivery === 'in_person' && <span className="row-subtitle">{t('deliveryInPerson')}</span>}
    {item.due_origin === 'text' && <span className="row-subtitle">{t('deadlineFromText')}</span>}
    {item.due_origin === 'confirmed' && <span className="row-subtitle">{t('deadlineConfirmed')}</span>}
    {showDescription && item.description && <details><summary>{t('assignmentText')}</summary><AssessmentQuestion text={item.description} /></details>}
    {(item.due_note || canWrite) && !item.removed_upstream && <details>
      <summary>{item.due_at ? t('adjustDeadline') : t('confirmDeadline')}</summary>
      {item.due_note && <blockquote>{item.due_note}</blockquote>}
      {!item.due_at && item.due_note && <p className="muted-text">{t('deadlineAmbiguous')}</p>}
      {canWrite && <form className="assignment-deadline-form" aria-busy={save.pending} onSubmit={(event) => { event.preventDefault(); void confirm() }}>
        <FormField label={t('dueLabel')} required hint={calendar('calendarTimezone')} error={error}>{control => <input {...control}
          className="native-input" type="datetime-local" step={60} value={date} disabled={save.pending} onChange={(event) => { setDate(event.target.value); setError('') }} />}</FormField>
        <FormField label={t('deliveryLabel')}>{control => <select {...control} className="native-select" value={delivery} disabled={save.pending} onChange={(event) => setDelivery(event.target.value)}>
          <option value="unknown">{t('deliveryUnknown')}</option><option value="in_person">{t('deliveryInPerson')}</option><option value="online">{t('deliveryOnline')}</option>
        </select>}</FormField>
        <Button type="submit" disabled={save.pending || !date}>{save.pending ? task('saving') : t('confirmDeadline')}</Button>
      </form>}
      {save.error && <p className="personal-task-error" role="alert">{save.error}</p>}
      {message && <p className="assignment-deadline-feedback" role="status">{message}</p>}
    </details>}
  </>
}
