// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState } from 'react'
import { StudyInsertTools } from '@/components/editor/StudyInsertTools'
import { Link } from 'react-router-dom'
import { BookOpenCheck } from 'lucide-react'
import { useT } from '@/i18n/useT'
import type { Keys } from '@/i18n/useT'
import { localDate, request, useApi } from '@/api'
import { Empty, Failure, Loading, Panel } from '@/components/State'
import { Button } from '@/components/ui/button'
import { useApiMutation } from '@/hooks/useApiMutation'
import { useWritableHost } from '@/hooks/host'
import type { PracticeAttempt, PracticeItem } from '@/types'
import { LinkedItems } from '@/components/LinkedItems'
import { AssessmentInline, AssessmentQuestion } from '@/components/AssessmentQuestion'
import { useWorkspaceState, workspaceValue } from '@/lib/workspaceState'
import { ListPagination } from '@/components/ListPagination'
import './PracticePanel.css'

const difficultyKey: Record<PracticeItem['difficulty'], Keys<'learning'>> = {
  easy: 'difficultyEasy', medium: 'difficultyMedium', hard: 'difficultyHard',
}
const errorKindKey: Record<string, Keys<'learning'>> = {
  concept: 'errorKindConcept', calculation: 'errorKindCalculation', careless: 'errorKindCareless', other: 'errorKindOther',
}

export function PracticePanel({ courseId, workspaceKey = 'overview', previewLimit }: { courseId?: number; workspaceKey?: string; previewLimit?: number } = {}) {
  const { t } = useT('learning')
  const scope = courseId ? `?course_id=${courseId}` : ''
  const { data, error: initialError, refreshError, loading, reload } = useApi<PracticeItem[]>(`/api/learning/practice${scope}`)
  const error = initialError ?? refreshError
  const { data: history, reload: reloadHistory } = useApi<PracticeAttempt[]>(`/api/learning/practice/history${scope}`)
  const canWrite = useWritableHost()
  const key = `practice:${courseId ?? 'all'}:${workspaceKey}`
  const [query, setQuery] = useWorkspaceState(`${key}:query`, '')
  const [offset, setOffset] = useWorkspaceState(`${key}:offset`, 0)
  const filtered = (data ?? []).filter(item => !query.trim() ||
    [item.question, item.topic, item.course_name].some(value => value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))
  const limit = previewLimit ?? 10
  const startOffset = previewLimit ? 0 : Math.min(offset, Math.max(0, Math.floor((filtered.length - 1) / limit) * limit))
  const [activeId, setActiveId] = useWorkspaceState<number | null>(`${key}:active`, null, {
    persist: false,
    valid: (value): value is number | null => value === null || typeof value === 'number' && Number.isSafeInteger(value) && value > 0,
  })
  const [startedAt, setStartedAt] = useWorkspaceState(`${key}:startedAt`, 0, { persist: false })
  const [answer, setAnswer] = useWorkspaceState(`${key}:answer`, '', { persist: false, valid: (value): value is string => typeof value === 'string' && value.length <= 8000 })
  const [revealed, setRevealed] = useWorkspaceState(`${key}:revealed`, false, { persist: false })
  const [errorKind, setErrorKind] = useWorkspaceState(`${key}:errorKind`, 'concept', { persist: false })
  const [busy, setBusy] = useWorkspaceState(`${key}:pending`, false, { persist: false })
  useEffect(() => {
    if (activeId === null || !answer.trim()) return
    // Unsent answers deliberately remain in RAM. Keep the native unload warning
    // until the matching attempt is acknowledged, including while its save is pending.
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [activeId, answer])
  const [message, setMessage] = useState('')
  const answerField = useRef<HTMLTextAreaElement>(null)
  const active = data?.find((item) => item.id === activeId)
  const pageItems = filtered.slice(startOffset, startOffset + limit)
  const visible = active && !pageItems.some(item => item.id === active.id) ? [active, ...pageItems] : pageItems

  function start(item: PracticeItem) {
    if (workspaceValue(`${key}:pending`, false, { persist: false })) return
    setActiveId(item.id)
    setStartedAt(Date.now())
    setAnswer('')
    setRevealed(false)
    setErrorKind('concept')
    setMessage('')
  }

  const save = useApiMutation(
    (snapshot: { id: number; answer: string; startedAt: number; correct: boolean; errorKind: string }) => {
      return request(`/api/learning/practice/${snapshot.id}/attempt`, {
        method: 'POST',
        body: JSON.stringify({
          answer: snapshot.answer.trim(), correct: snapshot.correct, error_kind: snapshot.correct ? null : snapshot.errorKind,
          duration_seconds: Math.min(14_400, Math.max(0, Math.round((Date.now() - snapshot.startedAt) / 1000))),
        }),
      })
    },
    {
      onSuccess: (_, snapshot) => {
        const currentId = workspaceValue<number | null>(`${key}:active`, null, { persist: false,
          valid: (value): value is number | null => value === null || typeof value === 'number' })
        if (currentId === snapshot.id && workspaceValue(`${key}:answer`, '', { persist: false }) === snapshot.answer
          && workspaceValue(`${key}:startedAt`, 0, { persist: false }) === snapshot.startedAt) {
          setMessage(t('practiceSaved'))
          setActiveId(null)
        }
        reload()
        reloadHistory()
      },
    },
  )
  async function submit(correct: boolean) {
    if (!active || workspaceValue(`${key}:pending`, false, { persist: false })) return
    setBusy(true)
    try { await save.mutateAsync({ id: active.id, answer, startedAt, correct, errorKind }) }
    catch { /* The mutation exposes its error below. */ }
    finally { setBusy(false) }
  }
  const feedback = save.error ?? message

  return (
    <div className="practice-panel mb-5">
      <Panel title={t('practiceTitle')} action={<BookOpenCheck size={20} />}>
        <p className="muted-text mb-4">{t('practiceIntro')}</p>
        {!previewLimit && <input type="search" className="course-material-search" value={query}
          maxLength={200} aria-label={t('practiceSearch')} placeholder={t('practiceSearch')}
          onChange={event => { setOffset(0); setQuery(event.target.value) }} />}
        {feedback && <p className="mb-4 text-sm" role={save.error ? "alert" : "status"}>{feedback}</p>}
        {error && data && <Failure message={error} />}
        {loading && !data ? <Loading /> : error && !data ? <Failure message={error} /> : !data?.length ? (
          <Empty title={t('practiceEmptyTitle')} text={t('practiceEmptyText')} />
        ) : !visible.length ? (
          <Empty title={t('practiceNoMatches')} text={t('practiceSearch')} />
        ) : (
          <div className="row-list">
            {visible.map((item) => (
              <article className="data-row practice-item" key={item.id} id={`practice-${item.id}`}>
                <p className="row-subtitle">
                  <Link to={`/courses/${item.course_id}`}>{item.course_name}</Link> · {item.topic} · {t(difficultyKey[item.difficulty])}
                </p>
                <div className="practice-question mt-2"><AssessmentQuestion text={item.question} /></div>
                <p className="row-subtitle mt-1">{item.resource_name}{item.source_page ? ` · ${t('practicePageHint', { page: item.source_page })}` : ''}
                  {item.attempt_count ? ` · ${t('practiceAttemptCount', { count: item.attempt_count })}` : ''}
                  {item.last_correct === null ? '' : item.last_correct ? ` · ${t('practiceLastCorrect')}` : ` · ${t('practiceLastIncorrect')}`}
                </p>
                {activeId !== item.id ? (
                  <Button size="sm" variant="outline" className="mt-3" disabled={busy} onClick={() => start(item)}>
                    {t('practiceStart')}
                  </Button>
                ) : (
                  <div className="mt-4 grid gap-3">
                    {item.exercise_id && <LinkedItems kind="exercise" id={String(item.exercise_id)} />}
                    {item.choices ? <fieldset className="grid gap-2 text-sm" disabled={revealed || busy}>
                      <legend className="mb-2">{t('practiceChooseAnswer')}</legend>
                      {item.choices.map((choice, index) => <label key={index} className="flex items-start gap-2 rounded-lg border border-border p-3">
                        <input type="radio" name={`practice-${item.id}`} value={choice} checked={answer === choice}
                          onChange={() => setAnswer(choice)} /><AssessmentInline text={choice} />
                      </label>)}
                    </fieldset> : <><label className="grid gap-2 text-sm">{t('practiceAnswerLabel')}
                      <textarea ref={answerField} className="native-select min-h-28 w-full" value={answer}
                        maxLength={8000} onChange={(event) => setAnswer(event.target.value)}
                        disabled={revealed || busy} />
                    </label><StudyInsertTools field={answerField} value={answer} maxLength={8000} onChange={setAnswer} disabled={revealed || busy} /></>}
                    {!revealed ? (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" disabled={!answer.trim()} onClick={() => setRevealed(true)}>{t('practiceShowSolution')}</Button>
                        <Button size="sm" variant="ghost" onClick={() => setActiveId(null)}>{t('practiceCancel')}</Button>
                      </div>
                    ) : (
                      <>
                        <div className="rounded-lg border border-border bg-background p-3">
                          <strong className="text-sm">{t('practiceSampleSolution')}</strong>
                          <div className="mt-2 text-sm"><AssessmentQuestion text={item.sample_solution} /></div>
                          <strong className="mt-3 block text-sm">{t('practiceSolutionSteps')}</strong>
                          <div className="mt-1 text-sm"><AssessmentQuestion text={item.solution_steps} /></div>
                        </div>
                        {item.choices && item.correct_choice !== null ? <div className="grid gap-2">
                          <p className="text-sm"><AssessmentInline text={t('practiceCorrectAnswerLabel', { answer: item.choices[item.correct_choice] })} /></p>
                          <Button size="sm" disabled={!canWrite || busy}
                            onClick={() => void submit(answer === item.choices![item.correct_choice!])}>{t('practiceSaveResultButton')}</Button>
                        </div> : <><p className="text-sm">{t('practiceCompareQuestion')}</p>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" disabled={!canWrite || busy} onClick={() => void submit(true)}>{t('practiceCorrectSave')}</Button>
                          <label className="grid gap-1 text-sm">{t('practiceErrorKindLabel')}
                            <select className="native-select" value={errorKind}
                              onChange={(event) => setErrorKind(event.target.value)} disabled={!canWrite || busy}>
                              {Object.entries(errorKindKey).map(([value, key]) => <option value={value} key={value}>{t(key)}</option>)}
                            </select>
                          </label>
                          <Button size="sm" variant="outline" disabled={!canWrite || busy}
                            onClick={() => void submit(false)}>{t('practiceIncorrectSave')}</Button>
                        </div></>}
                      </>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
        {!previewLimit && <ListPagination page={{ offset: startOffset, limit, total: filtered.length,
          has_more: startOffset + limit < filtered.length }} onPage={setOffset} />}
        {previewLimit && (data?.length ?? 0) > previewLimit && <Button asChild variant="outline" size="sm" className="mt-3">
          <Link to={`/learning?practice=all${courseId ? `&course_id=${courseId}` : ''}#learning-practice`}>{t('practiceAll')}</Link></Button>}
      </Panel>
      {history && history.length > 0 && (
        <div className="mt-5"><Panel title={t('practiceHistoryTitle')}>
          <div className="row-list">{history.slice(0, 10).map((attempt) => (
            <div className="data-row practice-history-item" key={attempt.id}>
              <strong className="text-sm">{attempt.topic} · {attempt.correct ? t('practiceHistoryCorrect') : t('practiceHistoryIncorrect')}</strong>
              <p className="row-subtitle">{attempt.course_name} · {localDate(attempt.attempted_at)}
                {attempt.error_kind ? ` · ${errorKindKey[attempt.error_kind] ? t(errorKindKey[attempt.error_kind]) : attempt.error_kind}` : ''}
              </p>
              <div className="mt-1 text-sm"><AssessmentQuestion text={attempt.question} /></div>
              <div className="muted-text mt-1 text-sm"><AssessmentQuestion text={t('practiceYourAnswer', { answer: attempt.answer })} /></div>
            </div>
          ))}</div>
        </Panel></div>
      )}
    </div>
  )
}
