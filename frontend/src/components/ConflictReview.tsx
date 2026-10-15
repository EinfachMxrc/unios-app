// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useT } from '@/i18n/useT'
import type { TypedT } from '@/i18n/useT'
import { localDate, request, useApi } from '@/api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useWritableHost } from '@/hooks/host'

type Summary = {
  package_id: string
  detected_at: string
  losing_device: string
  winning_device: string
  action_count: number
  dashboard_actions_complete: boolean
  database_warning: string | null
  reviewed: boolean
}

type Action = {
  id: string
  method: string
  path: string
  recorded_at: string
  body: unknown
  body_state: string
  outcome: string
  replayed: boolean
  checked: boolean
}

type ActionPage = { package_id: string; total: number; actions: Action[] }

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function replayPayload(action: Action): Record<string, unknown> | null {
  const body = object(action.body)
  if (!body || action.body_state !== 'erfasst') return null
  if (action.method === 'PUT' && /^\/api\/ai\/access\/(category\/[a-z_]+|course\/\d+)$/.test(action.path)) {
    return typeof body.allowed === 'boolean' ? { allowed: body.allowed } : null
  }
  if (action.method === 'PATCH' && action.path === '/api/digest/preference') {
    return typeof body.enabled === 'boolean' ? { enabled: body.enabled } : null
  }
  if (action.method === 'PUT' && /^\/api\/courses\/\d+\/material\/scratchpad$/.test(action.path)) {
    return typeof body.body === 'string' && Number.isInteger(body.expected_revision)
      ? { body: body.body, expected_revision: body.expected_revision }
      : null
  }
  if (action.method === 'POST' && action.path === '/api/jots') {
    return typeof body.id === 'string' && /^[0-9a-f-]{36}$/i.test(body.id) && typeof body.body === 'string' &&
      typeof body.created_at === 'string' && ['thought', 'question', 'todo'].includes(String(body.kind))
      ? { id: body.id, kind: body.kind, body: body.body, created_at: body.created_at }
      : null
  }
  if (action.method === 'POST' && action.path === '/api/links') {
    const kinds = ['course', 'material', 'jot', 'note']
    return kinds.includes(String(body.from_type)) && kinds.includes(String(body.to_type)) &&
      Number.isInteger(body.from_id) && Number.isInteger(body.to_id) && body.relation === 'related'
      ? { from_type: body.from_type, from_id: body.from_id, to_type: body.to_type,
          to_id: body.to_id, relation: 'related' }
      : null
  }
  return null
}

function actionLabel(action: Action, t: TypedT<'conflictReview'>): string {
  if (action.path === '/internal/sync') return t('actionSync')
  if (action.path === '/internal/ai-outbox') return t('actionAiOutbox')
  if (action.path === '/internal/rebuild-index') return t('actionRebuildIndex')
  if (action.path === '/internal/rebuild-annotations') return t('actionRebuildAnnotations')
  if (action.path === '/internal/migrate-annotations') return t('actionMigrateAnnotations')
  if (action.path === '/internal/stale-sync-warning') return t('actionStaleSyncWarning')
  if (action.path === '/internal/deadline-warnings') return t('actionDeadlineWarnings')
  if (action.path === '/internal/weekly-digest') return t('actionWeeklyDigest')
  if (action.path === '/internal/backup') return t('actionBackup')
  if (action.method === 'GET' && action.path.startsWith('/api/ai/mcp/')) return t('actionAiAccessLogged')
  if (action.path.includes('/ai/access/')) return t('actionAiAccessGrant')
  if (action.path === '/api/digest/preference') return t('actionDigestPreference')
  if (action.path.includes('/material/scratchpad')) return t('actionScratchpad')
  if (action.path === '/api/jots') return t('actionJotSave')
  if (action.path === '/api/links') return t('actionLinkCreate')
  return t('actionGeneric')
}

export function ConflictReview() {
  const { t } = useT('conflictReview')
  const canWrite = useWritableHost()
  const { data: packages, reload } = useApi<Summary[]>('/api/host/conflicts')
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<ActionPage | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function open(packageId: string, offset = 0) {
    setBusy(true)
    setMessage('')
    try {
      const page = await request<ActionPage>(`/api/host/conflicts/${packageId}?offset=${offset}&limit=50`)
      setSelected(packageId)
      setDetail((current) => offset && current?.package_id === packageId
        ? { ...page, actions: [...current.actions, ...page.actions] }
        : page)
    } catch {
      setMessage(t('notOpenedError'))
    } finally {
      setBusy(false)
    }
  }

  async function replay(action: Action) {
    const payload = replayPayload(action)
    if (!selected || !payload || !canWrite || action.replayed) return
    if (!window.confirm(t('confirmReplayText'))) return
    setBusy(true)
    setMessage('')
    try {
      await request(action.path, { method: action.method, body: JSON.stringify(payload) })
      await request(`/api/host/conflicts/${selected}/${action.id}/replayed`, { method: 'POST' })
      setDetail((current) => current && ({
        ...current,
        actions: current.actions.map((item) => item.id === action.id ? { ...item, replayed: true } : item),
      }))
      setMessage(t('replayedMessage'))
    } catch {
      setMessage(t('replayFailedMessage'))
    } finally {
      setBusy(false)
    }
  }

  async function check(action: Action) {
    if (!selected || !canWrite || action.replayed || action.checked) return
    if (!window.confirm(t('confirmCheckText'))) return
    setBusy(true)
    setMessage('')
    try {
      await request(`/api/host/conflicts/${selected}/${action.id}/checked`, { method: 'POST' })
      setDetail((current) => current && ({
        ...current,
        actions: current.actions.map((item) => item.id === action.id ? { ...item, checked: true } : item),
      }))
      setMessage(t('checkedMessage'))
    } catch {
      setMessage(t('checkFailedMessage'))
    } finally {
      setBusy(false)
    }
  }

  async function finishReview() {
    if (!selected || !detail || detail.package_id !== selected || detail.actions.length !== detail.total ||
        !detail.actions.every((item) => item.replayed || item.checked) || !canWrite) return
    if (!window.confirm(t('confirmFinishText'))) return
    setBusy(true)
    setMessage('')
    try {
      await request(`/api/host/conflicts/${selected}/reviewed`, { method: 'POST' })
      reload()
      setMessage(t('finishedMessage'))
    } catch {
      setMessage(t('finishFailedMessage'))
    } finally {
      setBusy(false)
    }
  }

  if (!packages?.length) return null
  const pending = packages.some((item) => !item.reviewed)
  return (
    <Alert role={pending ? 'alert' : 'status'} className="mb-5">
      <AlertTriangle size={18} />
      <AlertTitle>{pending ? t('pendingTitle') : t('reviewedTitle')}</AlertTitle>
      <AlertDescription>
        <p>{pending ? t('pendingIntro') : t('reviewedIntro')}</p>
        <div className="mt-3 grid gap-3">
          {packages.map((item) => (
            <div key={item.package_id}>
              <strong>{item.losing_device} · {localDate(item.detected_at)}</strong>
              <p>{t('packageSummaryLine', { count: item.action_count, device: item.winning_device })}</p>
              {item.reviewed && <p>{t('reviewCompleteText')}</p>}
              {!item.dashboard_actions_complete && <p>{t('incompleteLogWarning')}</p>}
              {item.database_warning && <p>{item.database_warning}</p>}
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void open(item.package_id)}>
                {t('viewChangesButton')}
              </Button>
            </div>
          ))}
        </div>
        {message && <p className="mt-3" role="status">{message}</p>}
        {selected && detail?.package_id === selected && (
          <div className="mt-4 grid gap-3">
            {detail.actions.map((action) => (
              <div className="rounded-lg border p-3" key={action.id}>
                <strong>{actionLabel(action, t)}</strong>
                <p>{localDate(action.recorded_at)} · {action.outcome === 'unklar' ? t('resultUnclearText') : t('savedThenText')}</p>
                <details className="mt-2">
                  <summary>{t('inspectDetailsSummary')}</summary>
                  <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify({
                    method: action.method, path: action.path, body: action.body,
                  }, null, 2)}</pre>
                </details>
                {action.replayed ? <p>{t('appliedOnDeviceText')}</p> : action.checked ? (
                  <p>{t('individuallyCheckedText')}</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {replayPayload(action) && canWrite && (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void replay(action)}>
                        {t('applyChangeButton')}
                      </Button>
                    )}
                    {canWrite && (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void check(action)}>
                        {t('individuallyCheckedButton')}
                      </Button>
                    )}
                    {!canWrite && <p>{t('readOnlyCheckHintText')}</p>}
                  </div>
                )}
              </div>
            ))}
            {detail.actions.length < detail.total && (
              <Button variant="outline" disabled={busy} onClick={() => void open(selected, detail.actions.length)}>
                {t('showMoreButton')}
              </Button>
            )}
            {detail.actions.length === detail.total && detail.actions.every((item) => item.replayed || item.checked) &&
              canWrite && !packages.find((item) => item.package_id === selected)?.reviewed && (
              <Button variant="outline" disabled={busy} onClick={() => void finishReview()}>
                {t('finishReviewButton')}
              </Button>
            )}
          </div>
        )}
      </AlertDescription>
    </Alert>
  )
}
