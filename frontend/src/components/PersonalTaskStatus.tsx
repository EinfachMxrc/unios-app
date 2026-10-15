// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState } from 'react'
import { Check, Circle, Loader2, Minus, Undo2 } from 'lucide-react'
import { ApiError, request, useApi } from '@/api'
import { useWritableHost } from '@/hooks/host'
import { useApiMutation } from '@/hooks/useApiMutation'
import { useT } from '@/i18n/useT'
import { queryClient } from '@/offlineCache'
import { taskWorkflowPayload, type TaskMetadata, type TaskWorkflowStatus } from '@/lib/taskWorkflow'
import './PersonalTaskStatus.css'

export function PersonalTaskStatus({ kind, id, courseId, removed = false }: {
  kind: 'assignment' | 'deadline'; id: number; courseId?: number | null; removed?: boolean
}) {
  const { t } = useT('ownTaskSupport')
  const path = `/api/metadata/${kind}/${id}`
  const { data, error, reload } = useApi<TaskMetadata>(path)
  const canWrite = useWritableHost()
  const locked = useRef(false)
  const [undo, setUndo] = useState<{ status: TaskWorkflowStatus; revision: number } | null>(null)
  const [message, setMessage] = useState('')
  const change = useApiMutation<TaskMetadata, { base: TaskMetadata; status: TaskWorkflowStatus }>(
    variables => request<TaskMetadata>(path, { method: 'PUT', body: JSON.stringify(taskWorkflowPayload(variables.base, variables.status)) }),
    { invalidate: ['/api/overview', '/api/deadlines', '/api/projects',
      `/api/peek/${kind === 'assignment' ? 'assignments' : 'deadlines'}/${id}`,
      ...(courseId ? [`/api/courses/${courseId}`] : [])],
    onSuccess: updated => queryClient.setQueryData(['api', path], updated) },
  )
  useEffect(() => { setUndo(null); setMessage('') }, [path])
  useEffect(() => {
    if (undo && data && undo.revision !== data.revision) setUndo(null)
  }, [data, undo])
  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(''), 2000)
    return () => window.clearTimeout(timer)
  }, [message])

  async function apply(status: TaskWorkflowStatus, reversing = false) {
    if (!data || locked.current || !canWrite || removed) return
    if (reversing && (!undo || undo.revision !== data.revision)) { setUndo(null); return }
    locked.current = true
    setMessage(''); setUndo(null)
    try {
      const updated = await change.mutateAsync({ base: data, status })
      if (!reversing) setUndo({ status: data.workflow_status, revision: updated.revision })
      setMessage(t(reversing ? 'undone' : 'saved'))
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) reload()
      // useApiMutation retains the error next to the controls.
    } finally { locked.current = false }
  }

  return <section className="personal-task-status" aria-label={t('title')} aria-busy={change.pending}>
    <h3>{t('title')}</h3>
    {error ? <p className="personal-task-error" role="alert">{error}<button type="button" onClick={reload}>{t('retry')}</button></p>
      : !data ? <p role="status">{t('loading')}</p> : <>
      <div className="personal-task-switch" role="group" aria-label={t('title')}>
        {(['open', 'working', 'done'] as const).map(status => {
          const Icon = status === 'done' ? Check : status === 'working' ? Minus : Circle
          return <button type="button" key={status} aria-pressed={data.workflow_status === status}
            disabled={!canWrite || removed || change.pending || data.workflow_status === status}
            onClick={() => void apply(status)}><Icon size={15} aria-hidden="true" />{t(status)}</button>
        })}
      </div>
      <div className="personal-task-feedback"><span role="status">{change.pending && <Loader2 size={14} aria-hidden="true" />}{change.pending ? t('saving') : message}</span>
        {undo && <button type="button" disabled={!canWrite || removed || change.pending} onClick={() => void apply(undo.status, true)}><Undo2 size={14} aria-hidden="true" />{t('undo')}</button>}
      </div>
      {change.error && <p className="personal-task-error" role="alert">{change.error}</p>}
    </>}
  </section>
}
