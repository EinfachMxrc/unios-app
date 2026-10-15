// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { FileJson } from 'lucide-react'
import { useT } from '@/i18n/useT'
import type { TypedT } from '@/i18n/useT'
import { request, useApi } from '@/api'
import { Shell } from '@/components/Shell'
import { Empty, Failure, Loading, Panel } from '@/components/State'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useApiMutation, extractApiErrorMessage } from '@/hooks/useApiMutation'
import { useWritableHost } from '@/hooks/host'
import { useWorkspaceState, workspaceValue } from '@/lib/workspaceState'
import { ListPagination } from '@/components/ListPagination'
import { useAnchorScroll } from '@/hooks/useAnchorScroll'
import { AssessmentQuestion } from '@/components/AssessmentQuestion'
import './ExercisePage.css'

type Exercise = {
  question: string
  topic: string
  difficulty: 'easy' | 'medium' | 'hard'
  sample_solution: string
  solution_steps: string
  source_page: number | null
  choices: string[] | null
  correct_choice: number | null
}
type QueueItem = {
  id: number
  resource_id: number
  resource_name: string
  course_id: number
  course_name: string
  status: 'proposed' | 'approved' | 'rejected'
  exercise: Exercise
}

const QUEUE_PATH = '/api/ai/exercises'

function difficultyLabels(t: TypedT<'exerciseQueue'>): Record<Exercise['difficulty'], string> {
  return { easy: t('difficultyEasy'), medium: t('difficultyMedium'), hard: t('difficultyHard') }
}

function ProposalRow({ item, canWrite, open, onOpen }: { item: QueueItem; canWrite: boolean; open: boolean; onOpen: () => void }) {
  const { t } = useT('exerciseQueue')
  const difficulties = difficultyLabels(t)
  const [draft, setDraft] = useWorkspaceState<Exercise>(`exercise-proposal:${item.id}:draft`, item.exercise, { persist: false })
  const [baseline, setBaseline] = useWorkspaceState<Exercise>(`exercise-proposal:${item.id}:baseline`, item.exercise, { persist: false })
  const pendingKey = `exercise-proposal:${item.id}:pending`
  const [pending, setPending] = useWorkspaceState(pendingKey, false, { persist: false })
  const lastSource = useRef(JSON.stringify(item.exercise))
  useEffect(() => {
    const fingerprint = JSON.stringify(item.exercise)
    const changed = lastSource.current !== fingerprint
    lastSource.current = fingerprint
    if (changed && !pending && JSON.stringify(draft) === JSON.stringify(baseline)) {
      setBaseline(item.exercise)
      setDraft(item.exercise)
    }
  }, [item.exercise, pending, draft, baseline, setBaseline, setDraft])
  const save = useApiMutation(
    ({ status, snapshot }: { status: QueueItem['status']; snapshot: Exercise }) => request<QueueItem>(`${QUEUE_PATH}/${item.id}`, {
      method: 'PUT', body: JSON.stringify({ ...snapshot, status }),
    }),
    { invalidate: [QUEUE_PATH], onSuccess: (saved, { snapshot }) => {
      const current = workspaceValue(`exercise-proposal:${item.id}:draft`, snapshot, { persist: false })
      setBaseline(saved.exercise)
      if (JSON.stringify(current) === JSON.stringify(snapshot)) setDraft(saved.exercise)
    } },
  )
  const editable = canWrite && item.status === 'proposed' && !pending

  async function submit(status: QueueItem['status']) {
    if (!editable || workspaceValue(pendingKey, false, { persist: false })) return
    setPending(true)
    try { await save.mutateAsync({ status, snapshot: draft }) } catch { /* The mutation exposes its error below. */ }
    finally { setPending(false) }
  }

  function field(name: 'question' | 'topic' | 'difficulty' | 'sample_solution' | 'solution_steps', value: string) {
    setDraft((current) => ({ ...current, [name]: value }))
  }

  return (
    <article className="data-row exercise-proposal-row" id={`exercise-${item.id}`} tabIndex={-1}>
      {!open && <><h3 className="exercise-proposal-heading">{draft.topic || t('questionLabel')}</h3>
        <AssessmentQuestion text={draft.question} />
        <p className="row-subtitle">{item.course_name} · {difficulties[draft.difficulty]}</p>
        <Button size="sm" variant="outline" onClick={onOpen}>{t('openProposal')}</Button></>}
      {open && <>
      <p className="row-subtitle mb-3">
        <Link to={`/courses/${item.course_id}`}>{item.course_name}</Link> · {item.resource_name}
        {draft.source_page ? t('sourcePageSuffix', { page: draft.source_page }) : ''}
      </p>
      <div className="grid gap-3">
        <label className="grid gap-1 text-sm">{t('questionLabel')}
          <textarea className="native-select min-h-20 w-full" value={draft.question}
            onChange={(event) => field('question', event.target.value)} disabled={!editable} />
        </label>
        <details className="exercise-proposal-preview">
          <summary>{t('previewTaskLabel')}</summary>
          <AssessmentQuestion text={draft.question} />
        </details>
        <label className="grid gap-1 text-sm">{t('topicLabel')}
          <Input value={draft.topic} onChange={(event) => field('topic', event.target.value)} disabled={!editable} />
        </label>
        <label className="grid gap-1 text-sm">{t('difficultyLabel')}
          <select className="native-select" value={draft.difficulty}
            onChange={(event) => field('difficulty', event.target.value)} disabled={!editable}>
            {Object.entries(difficulties).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        {draft.choices && <fieldset className="grid gap-2 text-sm">
          <legend>{t('choicesLegend')}</legend>
          {draft.choices.map((choice, index) => <label key={index} className="flex items-center gap-2">
            <input type="radio" name={`correct-${item.id}`} checked={draft.correct_choice === index}
              onChange={() => setDraft((current) => ({ ...current, correct_choice: index }))} disabled={!editable} />
            <Input value={choice} aria-label={t('choiceAria', { number: index + 1 })}
              onChange={(event) => setDraft((current) => ({ ...current,
                choices: current.choices?.map((value, position) => position === index ? event.target.value : value) ?? null }))}
              disabled={!editable} />
          </label>)}
        </fieldset>}
        <label className="grid gap-1 text-sm">{t('sampleSolutionLabel')}
          <textarea className="native-select min-h-24 w-full" value={draft.sample_solution}
            onChange={(event) => field('sample_solution', event.target.value)} disabled={!editable} />
        </label>
        <label className="grid gap-1 text-sm">{t('solutionStepsLabel')}
          <textarea className="native-select min-h-24 w-full" value={draft.solution_steps}
            onChange={(event) => field('solution_steps', event.target.value)} disabled={!editable} />
        </label>
      </div>
      <p className="row-subtitle mt-2">{difficulties[draft.difficulty]} · {
        item.status === 'proposed' ? t('statusProposed') : item.status === 'approved' ? t('statusApproved') : t('statusRejected')
      }</p>
      {save.error && <p role="alert" className="text-destructive">{save.error}</p>}
      {item.status === 'proposed' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void submit('approved')}
            disabled={!editable || !draft.question.trim() || !draft.topic.trim()
              || !draft.sample_solution.trim() || !draft.solution_steps.trim()}>{t('approveButton')}</Button>
          <Button size="sm" variant="outline" onClick={() => void submit('proposed')}
            disabled={!editable}>{t('saveChangesButton')}</Button>
          <Button size="sm" variant="ghost" onClick={() => void submit('rejected')}
            disabled={!editable}>{t('rejectButton')}</Button>
        </div>
      )}
      </>}
    </article>
  )
}

export function ExercisePage() {
  const { t } = useT('exerciseQueue')
  const { data, error: initialError, refreshError, loading, reload } = useApi<QueueItem[]>(QUEUE_PATH)
  const error = initialError ?? refreshError
  const { data: outbox, reload: reloadOutbox } = useApi<{ pending: number }>('/api/ai/outbox/status')
  const canWrite = useWritableHost()
  const [raw, setRaw] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const location = useLocation()
  const navigate = useNavigate()
  const target = Number(/^#exercise-(\d+)$/.exec(location.hash)?.[1]) || null
  const [active, setActive] = useState<number | null>(null)
  const [query, setQuery] = useWorkspaceState('exercise-proposals:query', '')
  const [offset, setOffset] = useWorkspaceState('exercise-proposals:offset', 0)
  const [reviewedOffset, setReviewedOffset] = useWorkspaceState('exercise-reviewed:offset', 0)
  const matching = (data ?? []).filter(item => item.id === target || !query.trim() ||
    [item.exercise.question, item.exercise.topic, item.course_name].some(text => text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))
  const open = matching.filter((item) => item.status === 'proposed')
  const reviewed = matching.filter((item) => item.status !== 'proposed')
  const limit = 10
  const pageOffset = (items: QueueItem[], fallback: number) => {
    const index = items.findIndex(item => item.id === target)
    return index >= 0 ? Math.floor(index / limit) * limit : Math.min(fallback, Math.max(0, Math.floor((items.length - 1) / limit) * limit))
  }
  const openOffset = pageOffset(open, offset)
  const decidedOffset = pageOffset(reviewed, reviewedOffset)
  useAnchorScroll(Boolean(data))

  function leaveTarget() {
    if (target) void navigate(`${location.pathname}${location.search}`, { replace: true })
  }

  async function importExercises() {
    setBusy(true)
    setFeedback('')
    try {
      await request(`${QUEUE_PATH}/import`, { method: 'POST', body: JSON.stringify(JSON.parse(raw)) })
      setRaw('')
      reload()
      setFeedback(t('importedFeedback'))
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
      const result = await request<{ exercises: number; cards: number; explanations: number; rejected: number; duplicates: number }>(
        '/api/ai/outbox/process', { method: 'POST' },
      )
      setFeedback(t('outboxSummary', { exercises: result.exercises, cards: result.cards, explanations: result.explanations, rejected: result.rejected }))
      reload()
      reloadOutbox()
    } catch (cause) {
      setFeedback(extractApiErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell title={t('pageTitle')} eyebrow={t('pageEyebrow')}>
      <p className="exercise-queue-intro muted-text mb-5">{t('pageIntro', { open: open.length, reviewed: reviewed.length })}</p>
      <details className="mb-5"><summary>{t('importPanelTitle')}</summary>
      <Panel title={t('importPanelTitle')} action={<FileJson size={20} />}>
        <label className="mb-3 grid gap-2 text-sm">{t('chooseJsonFileLabel')}
          <Input type="file" accept=".json,application/json" disabled={!canWrite || busy}
            onChange={(event) => void readFile(event.target.files?.[0])} />
        </label>
        <label className="grid gap-2 text-sm">{t('pasteJsonLabel')}
          <textarea className="native-select min-h-32 w-full" value={raw}
            onChange={(event) => setRaw(event.target.value)} disabled={!canWrite || busy} />
        </label>
        <Button className="mt-3" disabled={!canWrite || busy || !raw.trim()}
          onClick={() => void importExercises()}>{t('reviewProposalsButton')}</Button>
        <p className="muted-text mt-3">{t('pendingOutboxText', { count: outbox?.pending ?? 0 })}</p>
        <Button className="mt-2" variant="outline" disabled={!canWrite || busy || !outbox?.pending}
          onClick={() => void collectOutbox()}>{t('collectNowButton')}</Button>
        {feedback && <p className="mt-2 text-sm" role="status">{feedback}</p>}
      </Panel>
      </details>
      <Input type="search" value={query} aria-label={t('searchProposals')} placeholder={t('searchProposals')}
        maxLength={200} onChange={event => { leaveTarget(); setQuery(event.target.value); setOffset(0); setReviewedOffset(0) }} />
      <div className="mt-5">
        <Panel title={t('reviewPanelTitle')}>
          {error && data && <Failure message={error} />}
          {loading && !data ? <Loading /> : error && !data ? <Failure message={error} /> : open.length ? (
            <div className="grid gap-4">{open.slice(openOffset, openOffset + limit).map((item) => <ProposalRow key={item.id} item={item} canWrite={canWrite}
              open={(active ?? target) === item.id} onOpen={() => setActive(item.id)} />)}</div>
          ) : <Empty title={t('emptyProposalsTitle')} text={t('emptyProposalsText')} />}
          <ListPagination page={{ offset: openOffset, limit, total: open.length, has_more: openOffset + limit < open.length }} onPage={next => { leaveTarget(); setOffset(next) }} />
        </Panel>
      </div>
      {reviewed.length > 0 && <div className="mt-5"><Panel title={t('decidedPanelTitle')}>
        <div className="grid gap-4">{reviewed.slice(decidedOffset, decidedOffset + limit).map((item) => <ProposalRow key={item.id} item={item} canWrite={false}
          open={(active ?? target) === item.id} onOpen={() => setActive(item.id)} />)}</div>
        <ListPagination page={{ offset: decidedOffset, limit, total: reviewed.length, has_more: decidedOffset + limit < reviewed.length }} onPage={next => { leaveTarget(); setReviewedOffset(next) }} />
      </Panel></div>}
    </Shell>
  )
}
