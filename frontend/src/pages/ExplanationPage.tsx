// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FileJson } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { request, useApi } from '@/api'
import { Shell } from '@/components/Shell'
import { Empty, Failure, Loading, Panel } from '@/components/State'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useApiMutation, extractApiErrorMessage } from '@/hooks/useApiMutation'
import { useWritableHost } from '@/hooks/host'

type ExplanationItem = {
  id: number
  question_id: string
  question: string
  course_id: number
  course_name: string
  resource_name: string
  status: 'proposed' | 'approved' | 'rejected'
  answer: string
  generated_by: string
}

const path = '/api/ai/explanations'

function ExplanationRow({ item, canWrite }: { item: ExplanationItem; canWrite: boolean }) {
  const { t } = useT('explanations')
  const [answer, setAnswer] = useState(item.answer)
  const decide = useApiMutation(
    (status: 'approved' | 'rejected') => request(`${path}/${item.id}`, { method: 'PUT', body: JSON.stringify({ status, answer }) }),
    { invalidate: [path, '/api/learning/questions'] },
  )
  const editable = item.status === 'proposed' && canWrite && !decide.pending

  return <article className="data-row block">
    <p className="row-subtitle mb-2">
      {item.course_id ? <Link to={`/courses/${item.course_id}`}>{item.course_name}</Link> : item.course_name} · {item.resource_name} ·{' '}
      {item.status === 'proposed' ? t('statusProposed') : item.status === 'approved' ? t('statusApproved') : t('statusRejected')}
    </p>
    {item.course_id ? <Link to={`/learning?all=1#question-${item.question_id}`}>{item.question}</Link> : item.question}
    <label className="mt-3 grid gap-2 text-sm">{t('explanationLabel')}
      <textarea className="native-select min-h-28 w-full" value={answer}
        onChange={(event) => setAnswer(event.target.value)} disabled={!editable} />
    </label>
    <p className="row-subtitle mt-2">{t('generatedByHint', { generator: item.generated_by })}</p>
    {decide.error && <p role="alert" className="text-destructive">{decide.error}</p>}
    {item.status === 'proposed' && <div className="mt-3 flex gap-2">
      <Button size="sm" disabled={!editable || !answer.trim()} onClick={() => decide.mutate('approved')}>{t('approveButton')}</Button>
      <Button size="sm" variant="ghost" disabled={!editable} onClick={() => decide.mutate('rejected')}>{t('rejectButton')}</Button>
    </div>}
  </article>
}

export function ExplanationPage() {
  const { t } = useT('explanations')
  const { data, error, loading, reload } = useApi<ExplanationItem[]>(path)
  const { data: outbox, reload: reloadOutbox } = useApi<{ pending: number }>('/api/ai/outbox/status')
  const canWrite = useWritableHost()
  const [raw, setRaw] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const proposed = data?.filter((item) => item.status === 'proposed') ?? []
  const reviewed = data?.filter((item) => item.status !== 'proposed') ?? []

  async function importAnswers() {
    setBusy(true)
    setFeedback('')
    try {
      const result = await request<{ created: number }>(`${path}/import`, {
        method: 'POST', body: JSON.stringify(JSON.parse(raw)),
      })
      setRaw('')
      reload()
      setFeedback(t('importedFeedback', { count: result.created }))
    } catch (cause) {
      setFeedback(extractApiErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function readFile(file: File | undefined) {
    if (!file) return
    if (file.size > 1_000_000) {
      setFeedback(t('jsonTooLargeError'))
      return
    }
    setRaw(await file.text())
    setFeedback('')
  }

  async function collectOutbox() {
    setBusy(true)
    setFeedback('')
    try {
      const result = await request<{ explanations: number; cards: number; exercises: number; rejected: number }>('/api/ai/outbox/process', {
        method: 'POST',
      })
      setFeedback(t('outboxSummary', { explanations: result.explanations, cards: result.cards, exercises: result.exercises, rejected: result.rejected }))
      reload()
      reloadOutbox()
    } catch (cause) {
      setFeedback(extractApiErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return <Shell title={t('pageTitle')} eyebrow={t('pageEyebrow')}>
    <p className="muted-text mb-5">{t('pageIntro')}</p>
    <Panel title={t('importPanelTitle')} action={<FileJson size={20} />}>
      <label className="mb-3 grid gap-2 text-sm">{t('chooseJsonFileLabel')}
        <Input type="file" accept=".json,application/json" disabled={!canWrite || busy}
          onChange={(event) => void readFile(event.target.files?.[0])} />
      </label>
      <label className="grid gap-2 text-sm">{t('pasteJsonLabel')}
        <textarea className="native-select min-h-28 w-full" value={raw}
          onChange={(event) => setRaw(event.target.value)} disabled={!canWrite || busy} />
      </label>
      <Button className="mt-3" disabled={!canWrite || busy || !raw.trim()}
        onClick={() => void importAnswers()}>{t('reviewAnswersButton')}</Button>
      <p className="muted-text mt-3">{t('pendingOutboxText', { count: outbox?.pending ?? 0 })}</p>
      <Button className="mt-2" variant="outline" disabled={!canWrite || busy || !outbox?.pending}
        onClick={() => void collectOutbox()}>{t('collectNowButton')}</Button>
      {feedback && <p className="mt-2 text-sm" role="status">{feedback}</p>}
    </Panel>
    <div className="mt-5"><Panel title={t('reviewPanelTitle')}>
      {loading && !data ? <Loading /> : error ? <Failure message={error} /> : proposed.length ? (
        <div className="grid gap-4">{proposed.map((item) => <ExplanationRow item={item} key={item.id} canWrite={canWrite} />)}</div>
      ) : <Empty title={t('emptyTitle')} text={t('emptyText')} />}
    </Panel></div>
    {reviewed.length > 0 && <div className="mt-5"><Panel title={t('decidedPanelTitle')}>
      <div className="grid gap-4">{reviewed.map((item) => <ExplanationRow item={item} key={item.id} canWrite={false} />)}</div>
    </Panel></div>}
  </Shell>
}
