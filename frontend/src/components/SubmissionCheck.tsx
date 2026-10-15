// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { useT } from '@/i18n/useT'
import type { TypedT } from '@/i18n/useT'
import { localDate, request, useApi } from '@/api'
import { Button } from '@/components/ui/button'
import { useApiMutation } from '@/hooks/useApiMutation'
import { useWritableHost } from '@/hooks/host'
import type { SubmissionAttempt as Attempt, SubmissionCheckView as Check } from '@/types'

function statusLabels(t: TypedT<'submission'>): Record<Check['status'], string> {
  return {
    none: t('statusNone'),
    draft: t('statusDraft'),
    submitted: t('statusSubmitted'),
    graded: t('statusGraded'),
    unclear: t('statusUnclear'),
  }
}

function remainingTime(value: string, t: TypedT<'submission'>): string {
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`
  const end = new Date(normalized).getTime()
  const minutes = Math.ceil((end - Date.now()) / 60_000)
  if (!Number.isFinite(minutes)) return t('remainingUnknown')
  if (minutes <= 0) return t('deadlinePassed')
  if (minutes >= 24 * 60) return t('remainingDays', { count: Math.ceil(minutes / (24 * 60)) })
  if (minutes >= 60) return t('remainingHours', { count: Math.ceil(minutes / 60) })
  return t('remainingMinutes', { count: minutes })
}

export function SubmissionCheck({
  assignmentId,
  projectArchive,
}: {
  assignmentId: number
  projectArchive?: { projectId: number; head: string }
}) {
  const { t } = useT('submission')
  const labels = statusLabels(t)
  const { data, reload } = useApi<Check | null>(`/api/submissions/${assignmentId}`)
  const { data: control } = useApi<{ enabled: boolean }>('/api/submissions/control')
  const { data: lastAttempt, reload: reloadAttempt } = useApi<Attempt | null>(
    `/api/submissions/${assignmentId}/attempts/latest`,
  )
  const canWrite = useWritableHost()
  const [fresh, setFresh] = useState<Check | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [finalSubmit, setFinalSubmit] = useState(false)
  const [freshAttempt, setFreshAttempt] = useState<Attempt | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [acceptStatement, setAcceptStatement] = useState(false)
  const [replaceExisting, setReplaceExisting] = useState(false)
  const check = fresh ?? data
  const attempt = freshAttempt ?? lastAttempt

  const refresh = useApiMutation(() => request<Check>(`/api/submissions/${assignmentId}/check`, { method: 'POST' }), {
    onSuccess: (result) => {
      setFresh(result)
      reload()
    },
  })

  const prepare = useApiMutation(
    async () => {
      const form = new FormData()
      selectedFiles.forEach((file) => form.append('files', file))
      form.append('final_submit', String(finalSubmit))
      return request<Attempt>(`/api/submissions/${assignmentId}/prepare`, { method: 'POST', body: form })
    },
    {
      onSuccess: (result) => {
        setFreshAttempt(result)
        setConfirmed(false)
        setAcceptStatement(false)
        setReplaceExisting(false)
        reloadAttempt()
      },
    },
  )

  const chooseProjectArchive = useApiMutation(
    async () => {
      if (!projectArchive) throw new Error(t('noArchiveLinkedError'))
      const response = await fetch(`/api/projects/${projectArchive.projectId}/mirror/archive`, {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      if (!response.ok || !response.headers.get('content-type')?.startsWith('application/zip')) {
        throw new Error(t('zipLoadFailedError'))
      }
      if (response.headers.get('x-unios-archive-head') !== projectArchive.head) {
        throw new Error(t('archiveChangedError'))
      }
      const declaredSize = Number(response.headers.get('content-length') ?? '0')
      if (declaredSize > 30_000_000) throw new Error(t('zipTooLargeError'))
      const content = await response.blob()
      if (content.size > 30_000_000) throw new Error(t('zipTooLargeError'))
      return new File([content], `projekt-${projectArchive.projectId}-${projectArchive.head.slice(0, 12)}.zip`, {
        type: 'application/zip',
      })
    },
    {
      onSuccess: (file) => setSelectedFiles([file]),
    },
  )

  const submit = useApiMutation(
    async () => {
      if (!attempt || !confirmed) throw new Error(t('confirmFirstError'))
      return request<Attempt>(`/api/submissions/${assignmentId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          attempt_id: attempt.id,
          confirmed,
          accept_statement: acceptStatement,
          replace_existing: replaceExisting,
        }),
      })
    },
    {
      onSuccess: (result) => {
        setFreshAttempt(result)
        reloadAttempt()
        reload()
      },
    },
  )

  const busy = refresh.pending || prepare.pending || chooseProjectArchive.pending || submit.pending
  const error = refresh.error ?? prepare.error ?? chooseProjectArchive.error ?? submit.error ?? ''

  return (
    <div className="mt-2 grid gap-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span>
          {check
            ? t('statusLine', { status: labels[check.status], date: localDate(check.checked_at) })
            : t('notCheckedYetText')}
        </span>
        <Button size="sm" variant="outline" disabled={!canWrite || busy} onClick={() => refresh.mutate()}>
          {busy ? t('checkingButton') : t('checkStatusButton')}
        </Button>
      </div>
      {check?.warning && <strong className="text-destructive">{check.warning}</strong>}
      {check?.extension_at && <span>{t('extensionText', { date: localDate(check.extension_at) })}</span>}
      {check?.cutoff_at && <span>{t('cutoffText', { date: localDate(check.cutoff_at) })}</span>}
      {check?.group_members_pending !== null && check?.group_members_pending !== undefined && (
        <span>{t('pendingGroupMembersText', { count: check.group_members_pending })}</span>
      )}
      {check?.grade && <span>{t('gradeText', { grade: check.grade })}</span>}
      {check?.feedback && <span>{t('feedbackText', { feedback: check.feedback })}</span>}
      {check?.archive_files !== null && check?.archive_files !== undefined && (
        <span>{t('archivedFilesText', { count: check.archive_files })}</span>
      )}
      {check?.timestamp_status?.status === 'ok' && (
        <span>
          {t('timestampOkText', {
            url: check.timestamp_status.tsa_url,
            date: localDate(check.timestamp_status.requested_at!),
          })}
        </span>
      )}
      {check?.timestamp_status?.status === 'failed' && (
        <span className="muted-text">{t('timestampFailedText', { error: check.timestamp_status.error })}</span>
      )}
      {control?.enabled && canWrite && attempt?.state !== 'started' && (
        <div className="mt-2 grid gap-2 rounded-xl border p-3">
          <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
            {showForm ? t('closeFormButton') : t('prepareSubmissionButton')}
          </Button>
          {showForm && attempt?.state !== 'prepared' && (
            <div className="grid gap-2">
              {projectArchive && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => chooseProjectArchive.mutate()}>
                  {t('chooseProjectArchiveButton')}
                </Button>
              )}
              <label>
                {t('chooseFilesLabel')}
                <input
                  type="file"
                  multiple
                  onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
                />
              </label>
              {selectedFiles.length > 0 && (
                <span>{t('selectedFilesText', { files: selectedFiles.map((file) => file.name).join(', ') })}</span>
              )}
              <label>
                <input
                  type="checkbox"
                  checked={finalSubmit}
                  onChange={(event) => setFinalSubmit(event.target.checked)}
                />{' '}
                {t('finalSubmitLabel')}
              </label>
              <Button size="sm" disabled={busy || !selectedFiles.length} onClick={() => prepare.mutate()}>
                {busy ? t('checkingButton') : t('checkFilesButton')}
              </Button>
            </div>
          )}
        </div>
      )}
      {attempt?.state === 'prepared' && control?.enabled && (
        <div className="mt-2 grid gap-2 rounded-xl border p-3">
          <strong>{t('reviewBeforeSendTitle')}</strong>
          <span>{t('assignmentLine', { course: attempt.course_name, assignment: attempt.assignment_name })}</span>
          <span>{attempt.will_be_submitted ? t('willBeSubmittedText') : t('staysDraftText')}</span>
          {attempt.due_at && (
            <span>
              {t('dueLine', { date: localDate(attempt.due_at), remaining: remainingTime(attempt.due_at, t) })}
            </span>
          )}
          {attempt.cutoff_at && <span>{t('cutoffLine', { date: localDate(attempt.cutoff_at) })}</span>}
          <span>{t('validUntilText', { date: localDate(attempt.expires_at) })}</span>
          {attempt.files.map((file) => (
            <span key={file.name} className="break-all">
              {t('fileLine', { name: file.name, size: Math.ceil(file.size / 1024), sha: file.sha256 })}
            </span>
          ))}
          {['draft', 'submitted'].includes(attempt.existing_status) && (
            <label className="text-destructive">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(event) => setReplaceExisting(event.target.checked)}
              />
              {attempt.existing_status === 'draft' ? t('replaceDraftLabel') : t('replaceSubmissionLabel')}
            </label>
          )}
          {attempt.statement_required && (
            <label>
              <span className="block whitespace-pre-wrap">{attempt.statement_text}</span>
              <input
                type="checkbox"
                checked={acceptStatement}
                onChange={(event) => setAcceptStatement(event.target.checked)}
              />
              {t('acceptStatementLabel')}
            </label>
          )}
          <label>
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            {t('confirmLabel')}
          </label>
          <Button
            disabled={
              !canWrite ||
              busy ||
              !confirmed ||
              (attempt.statement_required && !acceptStatement) ||
              (['draft', 'submitted'].includes(attempt.existing_status) && !replaceExisting)
            }
            onClick={() => submit.mutate()}
          >
            {busy ? t('sendingButton') : t('sendNowButton')}
          </Button>
        </div>
      )}
      {attempt?.state === 'completed' && (
        <strong>{attempt.result_status === 'draft' ? t('completedDraftText') : t('completedSubmittedText')}</strong>
      )}
      {(attempt?.state === 'unclear' || attempt?.state === 'failed') && (
        <strong role="alert" className="text-destructive">
          {attempt.warning ?? t('defaultWarningText')}
        </strong>
      )}
      {attempt?.state === 'started' && (
        <strong role="alert" className="text-destructive">
          {t('interruptedText')}
        </strong>
      )}
      {attempt?.assignment_url && ['started', 'unclear', 'failed'].includes(attempt.state) && (
        <a href={attempt.assignment_url} target="_blank" rel="noreferrer">
          {t('checkInMoodleLink')}
        </a>
      )}
      {error && (
        <span role="alert" className="text-destructive">
          {error}
        </span>
      )}
    </div>
  )
}
