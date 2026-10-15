// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from 'react'
import { localDate, request, useApi } from '@/api'
import { useT } from '@/i18n/useT'
import { useWritableHost } from '@/hooks/host'
import { queryClient } from '@/offlineCache'
import { Button } from '@/components/ui/button'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'

type Action = { id: string; kind: string; created_at: string; undone_at: string | null; undoable: boolean }

export function LocalActions({ courseId, kind, entityId, compact = false, disabled = false, onRestored }: {
  courseId?: string; kind?: string; entityId?: string; compact?: boolean; disabled?: boolean; onRestored?: () => Promise<void>
}) {
  const { t } = useT('activity')
  const writable = useWritableHost()
  const query = new URLSearchParams()
  if (courseId) query.set('course_id', courseId)
  if (kind) query.set('kind', kind)
  if (entityId) query.set('entity_id', entityId)
  const { data, reload } = useApi<Action[]>(`/api/local-actions?${query}`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    window.addEventListener('unios:local-change', reload)
    return () => window.removeEventListener('unios:local-change', reload)
  }, [reload])
  async function undo(id: string) {
    setBusy(true); setError('')
    try {
      await request(`/api/local-actions/${id}/undo`, { method: 'POST' })
      await onRestored?.()
      await queryClient.invalidateQueries({ queryKey: ['api'] })
    } catch (cause) { setError(extractApiErrorMessage(cause)) }
    finally { setBusy(false) }
  }
  const rows = compact ? data?.filter(row => row.undoable).slice(0, 1) : data
  if (!rows?.length) return null
  return <section aria-label={t('localHistory')} className="my-4">
    {!compact && <h2>{t('localHistory')}</h2>}
    {!compact && <p className="muted-text">{t('undoDescription')}</p>}
    <div data-keyboard-list>{rows.map(row => <div key={row.id} className="data-row">
      {!compact && <span>{localDate(row.created_at)} · {t(row.kind === 'note' ? 'noteEdited' : row.kind === 'intake' ? 'intakeEdited' : row.kind === 'topic_merge' ? 'topicsMerged' : row.kind === 'calendar' ? 'calendarEdited' : 'relationRemoved')}</span>}
      {row.undone_at ? <span>{t('restored')}</span> : <Button size="sm" variant="outline" disabled={!writable || busy || disabled || !row.undoable} onClick={() => void undo(row.id)}>{t('undo')}</Button>}
    </div>)}</div>
    {error && <p role="alert">{error}</p>}
  </section>
}
