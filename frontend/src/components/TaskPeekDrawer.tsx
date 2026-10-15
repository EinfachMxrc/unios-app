// SPDX-License-Identifier: AGPL-3.0-or-later

import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, X } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { localDate, useApi } from '@/api'
import { Failure, Loading } from '@/components/State'
import { LinkedItems } from '@/components/LinkedItems'
import { PersonalTaskStatus } from '@/components/PersonalTaskStatus'
import { motionDuration } from '@/lib/motion'
import './TaskPeekDrawer.css'

export type PeekTarget = { kind: 'assignment' | 'deadline'; id: number }
type Peek = {
  kind: PeekTarget['kind']
  id: number
  title: string
  course_id: number | null
  course_name: string | null
  due_at: string | null
  source: string
  removed_upstream: boolean
  latest_submission_state: string | null
  assignment_id: number | null
  open_url: string
}

export function TaskPeekDrawer({
  target,
  onClose,
  detail,
}: {
  target: PeekTarget
  onClose: () => void
  detail?: ReactNode
}) {
  const { t } = useT('taskPeek')
  const dialog = useRef<HTMLDialogElement>(null)
  const closeTimer = useRef<number | null>(null)
  const closing = useRef(false)
  const path = `/api/peek/${target.kind === 'assignment' ? 'assignments' : 'deadlines'}/${target.id}`
  const { data, error, loading } = useApi<Peek>(path, { enabled: !detail })
  const requestClose = useCallback(() => {
    if (!dialog.current?.open || closing.current) return
    const duration = motionDuration(160)
    closing.current = true
    if (!duration) {
      dialog.current.close()
      return
    }
    dialog.current.classList.add('is-closing')
    closeTimer.current = window.setTimeout(() => dialog.current?.close(), duration)
  }, [])
  useEffect(() => {
    const current = dialog.current
    current?.showModal()
    return () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
      current?.close()
    }
  }, [])
  return (
    <dialog
      ref={dialog}
      className={`task-peek ${detail ? 'task-peek-detail' : ''}`}
      aria-label={t('dialogAria')}
      onClose={() => {
        if (closing.current) onClose()
      }}
      onCancel={(event) => {
        event.preventDefault()
        requestClose()
      }}
      onClick={(event) => {
        if (event.target === dialog.current) requestClose()
      }}
    >
      <div className="task-peek-content">
        <header>
          <span>
            {target.kind === 'assignment' ? t('assignmentKind') : t('deadlineKind')}
            {t('quickViewSuffix')}
          </span>
          <button type="button" aria-label={t('closeAria')} onClick={requestClose}>
            <X size={18} />
          </button>
        </header>
        {detail ??
          (loading && !data ? (
            <Loading />
          ) : error ? (
            <Failure message={error} />
          ) : (
            data && (
              <>
                <h2>{data.title}</h2>
                <PersonalTaskStatus
                  key={`${data.assignment_id ? 'assignment' : target.kind}:${data.assignment_id ?? target.id}`}
                  kind={data.assignment_id ? 'assignment' : target.kind}
                  id={data.assignment_id ?? target.id}
                  courseId={data.course_id}
                  removed={data.removed_upstream}
                />
                <dl className="task-peek-facts">
                  <div>
                    <dt>{t('courseLabel')}</dt>
                    <dd>{data.course_name ?? t('noCourseText')}</dd>
                  </div>
                  <div>
                    <dt>{t('dueLabel')}</dt>
                    <dd>{data.due_at ? localDate(data.due_at) : t('noDateSavedText')}</dd>
                  </div>
                  <div>
                    <dt>{t('sourceLabel')}</dt>
                    <dd>{data.source}</dd>
                  </div>
                  {data.latest_submission_state && (
                    <div>
                      <dt>{t('submissionLabel')}</dt>
                      <dd>{t('lastAttemptText', { state: data.latest_submission_state })}</dd>
                    </div>
                  )}
                </dl>
                {data.removed_upstream && <p className="task-peek-warning">{t('removedUpstreamWarning')}</p>}
                {data.assignment_id && <LinkedItems kind="assignment" id={String(data.assignment_id)} />}
                <Link className="task-peek-open" to={data.open_url} onClick={requestClose}>
                  {data.assignment_id ? t('openAssignmentLink') : t('openAllDeadlinesLink')} <ArrowRight size={15} />
                </Link>
              </>
            )
          ))}
      </div>
    </dialog>
  )
}
