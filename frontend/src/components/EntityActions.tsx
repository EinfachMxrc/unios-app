// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from 'react'
import { request, useApi } from '@/api'
import { useWritableHost } from '@/hooks/host'
import { Button } from '@/components/ui/button'
import { Failure } from '@/components/State'
import { useT } from '@/i18n/useT'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'

type Definition = { id: string; requires_confirmation: boolean; input_schema: { required?: string[] } }
type Status = { state: string; completed: number; total: number; error_code: string | null }
type Result = { result: Status }

/** Resource maintenance consumes the registry; no separate action implementation in the UI. */
export function EntityActions({ resourceId }: { resourceId: number }) {
  const { t } = useT('entityActions')
  const writable = useWritableHost()
  const path = `/api/entities/resource/${resourceId}/actions`
  const { data: definitions } = useApi<Definition[]>(path)
  const { data: status, reload } = useApi<Result>(`${path}/resource.index_status`)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const running = ['queued', 'running', 'cancelling'].includes(status?.result.state ?? '')

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(reload, 1500)
    return () => window.clearInterval(timer)
  }, [running, reload])

  async function run(id: string) {
    setBusy(true)
    setError('')
    try {
      await request(`${path}/${id}`, { method: 'POST', body: JSON.stringify({ confirmed: true, input: {} }) })
      setConfirmation(null)
      reload()
    } catch (cause) {
      setError(extractApiErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label={t('title')} className="my-4">
      {running && (
        <div role="status" aria-live="polite">
          <p>{t('progress', { completed: status?.result.completed ?? 0, total: status?.result.total || '…' })}</p>
          <progress max={status?.result.total || 1} value={status?.result.completed ?? 0} />
        </div>
      )}
      {status?.result.state === 'cancelled' && <p role="status">{t('cancelled')}</p>}
      {status?.result.state === 'completed' && <p role="status">{t('completed')}</p>}
      {status?.result.state === 'failed' && <Failure message={t('failed')} />}
      <details>
        <summary>{t('title')}</summary>
        <p className="muted-text">{t('description')}</p>
        {definitions
          ?.filter(
            (action) =>
              action.requires_confirmation &&
              !action.input_schema.required?.length &&
              (running ? action.id === 'resource.cancel_indexing' : action.id === 'resource.reextract'),
          )
          .map((action) => (
            <Button
              key={action.id}
              size="sm"
              variant="outline"
              disabled={!writable || busy}
              onClick={() => setConfirmation(action.id)}
            >
              {action.id === 'resource.reextract' ? t('reextract') : t('cancel')}
            </Button>
          ))}
        {confirmation && (
          <div role="group" aria-label={t('confirm')}>
            <p>{t('confirmDescription')}</p>
            <Button size="sm" disabled={busy} onClick={() => void run(confirmation)}>
              {t('confirm')}
            </Button>{' '}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmation(null)}>
              {t('back')}
            </Button>
          </div>
        )}
      </details>
      {error && <Failure message={error} />}
    </section>
  )
}
