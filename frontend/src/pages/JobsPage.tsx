// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import './ProductPlatform.css'
import { localDate, request, useApi } from '@/api'
import { Shell } from '@/components/Shell'
import { Button } from '@/components/ui/button'
import { Failure, ListRows } from '@/components/State'
import { useWritableHost } from '@/hooks/host'
import { useT } from '@/i18n/useT'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'

type Kind = 'index' | 'ocr' | 'sync' | 'backup' | 'ai' | 'corpus' | 'coding'
type Status = 'queued' | 'running' | 'cancelling' | 'cancelled' | 'completed' | 'failed' | 'interrupted'
type Job = {
  id: string
  kind: Kind
  target_id: number | null
  state: Status
  completed: number
  total: number
  error_code: string | null
  created_at: string
}

export function JobsPage() {
  const { t } = useT('activity')
  const { data, error, reload } = useApi<Job[]>('/api/jobs', { refetchInterval: 2000 })
  const writable = useWritableHost()
  const [kind, setKind] = useState<Kind>('backup')
  const [target, setTarget] = useState('')
  const [targetQuery, setTargetQuery] = useState('')
  const { data: targets } = useApi<Array<{ id: number; label: string }>>(
    `/api/jobs/targets?kind=${kind}&q=${encodeURIComponent(targetQuery)}`,
    { enabled: ['index', 'ocr', 'ai'].includes(kind) },
  )
  const [mode, setMode] = useState('cards')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const targeted = ['index', 'ocr', 'ai'].includes(kind)
  async function submit(path: string, body: unknown) {
    if (!window.confirm(t('jobConfirm'))) return
    setBusy(true)
    setMessage('')
    try {
      await request(path, { method: 'POST', body: JSON.stringify(body) })
      reload()
    } catch (cause) {
      setMessage(extractApiErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Shell title={t('jobs')}>
      <div className="jobs-page">
        <p>{t('jobExplanation')}</p>
        <form
          className="page-actions"
          onSubmit={(event) => {
            event.preventDefault()
            void submit('/api/jobs', {
              kind,
              ...(targeted ? { target_id: Number(target) } : {}),
              mode,
              confirmed: true,
            })
          }}
        >
          <label>
            {t('jobKind')}
            <select
              className="native-select"
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as Kind)
                setTarget('')
                setTargetQuery('')
              }}
            >
              {(['backup', 'index', 'ocr', 'sync', 'ai', 'corpus'] as const).map((value) => (
                <option key={value} value={value}>
                  {t(`jobKinds.${value}`)}
                </option>
              ))}
            </select>
          </label>
          {targeted && (
            <label>
              {t(kind === 'ai' ? 'jobCourse' : kind === 'index' ? 'jobMaterial' : 'jobVersion')}
              <input
                type="search"
                aria-label={t('jobTargetSearch')}
                value={targetQuery}
                onChange={(event) => setTargetQuery(event.target.value)}
              />
              <select
                className="native-select"
                required
                value={target}
                onChange={(event) => setTarget(event.target.value)}
              >
                <option value="">{t('chooseTarget')}</option>
                {targets?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {kind === 'ai' && (
            <label>
              {t('jobMode')}
              <select className="native-select" value={mode} onChange={(event) => setMode(event.target.value)}>
                <option value="cards">{t('cardsMode')}</option>
                <option value="exercises">{t('exercisesMode')}</option>
              </select>
            </label>
          )}
          <Button disabled={!writable || busy} type="submit">
            {t('startJob')}
          </Button>
        </form>
        {error && <Failure message={error} />}
        {message && <p role="alert">{message}</p>}
        <ListRows>
          {data?.map((job) => (
            <article className="data-row" key={job.id}>
              <div>
                <h2>{t(`jobKinds.${job.kind}`)}</h2>
                <p>
                  {t(`jobStates.${job.state}`)} · {localDate(job.created_at)}
                </p>
                {job.total > 0 && (
                  <label>
                    {job.completed} / {job.total}
                    <progress value={job.completed} max={job.total} />
                  </label>
                )}
                {job.state === 'running' && !job.total && <progress aria-label={t('jobWorking')} />}
                <details>
                  <summary>{t('jobDetails')}</summary>
                  <p>
                    {job.id}
                    {job.target_id !== null ? ` · ${job.target_id}` : ''}
                  </p>
                  {job.error_code && <p>{job.error_code}</p>}
                </details>
              </div>
              {['queued', 'running'].includes(job.state) && (
                <Button
                  disabled={!writable || busy}
                  variant="outline"
                  onClick={() => void submit(`/api/jobs/${job.id}/cancel`, { confirmed: true })}
                >
                  {t('cancelJob')}
                </Button>
              )}
              {['failed', 'cancelled', 'interrupted'].includes(job.state) && (
                <Button
                  disabled={!writable || busy}
                  variant="outline"
                  onClick={() => void submit(`/api/jobs/${job.id}/retry`, { confirmed: true })}
                >
                  {t('retryJob')}
                </Button>
              )}
            </article>
          ))}
        </ListRows>
      </div>
    </Shell>
  )
}
