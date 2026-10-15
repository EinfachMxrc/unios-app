// SPDX-License-Identifier: AGPL-3.0-or-later

import { useWorkspaceState } from '@/lib/workspaceState'
import { lazy, Suspense, useRef, useState } from 'react'
import { Check, ChevronLeft, Code2, Play, Plus, Save, Square, X } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { request, useApi } from '@/api'
import { useT } from '@/i18n/useT'
import { useWritableHost } from '@/hooks/host'
import { Shell } from '@/components/Shell'
import { LearningTabs } from '@/components/LearningTabs'
import { Button } from '@/components/ui/button'
import { Empty, Failure, Loading } from '@/components/State'
import { AssessmentCode, AssessmentQuestion } from '@/components/AssessmentQuestion'
import type { CoursesResponse } from '@/types'
import type { Language, Task, Template } from './codingTypes'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'
import './CodingPage.css'

const CodeEditor = lazy(() => import('@/components/coding/CodeEditor').then((module) => ({ default: module.CodeEditor })))

function localKey(task: Task) { return `unios:coding-draft:v1:${task.id}:${task.created_at}` }
function recovery(task: Task): { revision: number; files: Record<string, string> } | null {
  try {
    const value = JSON.parse(localStorage.getItem(localKey(task)) ?? 'null')
    if (!value || !Number.isInteger(value.revision) || typeof value.files !== 'object' || !value.files) return null
    if (Object.keys(value.files).length > 8 || JSON.stringify(value.files).length > 256 * 1024) return null
    if (Object.values(value.files).some((body) => typeof body !== 'string')) return null
    return value
  } catch { return null }
}

export function CodingPage() {
  const { t } = useT('coding')
  const [params, setParams] = useSearchParams()
  const activeId = Number(params.get('task')) || null
  const writable = useWritableHost()
  const { data: courses } = useApi<CoursesResponse>('/api/courses')
  const { data: catalog, error } = useApi<{ templates: { id: Template; title: string; topic: string }[] }>('/api/learning/coding/templates')
  const [after, setAfter] = useState(0)
  const { data: tasks, reload } = useApi<{ tasks: Task[]; next_after: number | null }>(`/api/learning/coding/tasks?after=${after}`)
  const { data: runner, reload: reloadRunner } = useApi<{ ready: boolean }>('/api/learning/coding/runner')
  const { data: detail, error: detailError, reload: reloadDetail } = useApi<Task>(`/api/learning/coding/tasks/${activeId}`, { enabled: activeId !== null, refetchInterval: activeId ? 2000 : undefined })
  const [course, setCourse] = useWorkspaceState('coding:course', '')
  const [language, setLanguage] = useState<Language>('java')
  const [template, setTemplate] = useState<Template>('reverse')
  const [difficulty, setDifficulty] = useState('easy')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function create() {
    setBusy(true)
    try {
      const result = await request<Task>(`/api/learning/coding/courses/${course}/tasks`, { method: 'POST', body: JSON.stringify({ template, language, difficulty }) })
      reload()
      setParams({ task: String(result.id) })
    } catch (cause) { setMessage(extractApiErrorMessage(cause)) } finally { setBusy(false) }
  }
  return <Shell title={t('title')}>
    <LearningTabs />
    <div className="coding-page">
      <div className="coding-heading"><p className="muted-text">{t('intro')}</p><span className={`coding-runner ${runner?.ready ? 'ready' : ''}`}>{runner?.ready ? t('runnerReady') : t('runnerMissing')}</span></div>
      {!runner?.ready && <details className="coding-runner-help"><summary>{t('runnerSetup')}</summary><p>{t('runnerExplanation')}</p><Button size="sm" variant="outline" onClick={reloadRunner}>{t('runnerCheck')}</Button></details>}
      {error && <Failure message={error} />}
      {detailError && <Failure message={detailError} />}
      {message && <p role="status">{message}</p>}
      {activeId && detail?.id === activeId ? <CodingWorkspace key={detail.id} task={detail} runnerReady={!!runner?.ready} onReload={() => { reloadDetail(); reload() }} /> : <>
        <form className="coding-create" onSubmit={(event) => { event.preventDefault(); void create() }}>
          <div><h2>{t('newTask')}</h2><p className="muted-text">{t('templateIntro')}</p></div>
          <div className="coding-create-fields">
            <label>{t('course')}<select className="native-select" value={course} onChange={(event) => setCourse(event.target.value)} required><option value="">{t('chooseCourse')}</option>{courses?.courses.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>{t('language')}<select className="native-select" value={language} onChange={(event) => setLanguage(event.target.value as Language)}>{(['java', 'python', 'javascript'] as const).map((item) => <option key={item} value={item}>{t(`languages.${item}`)}</option>)}</select></label>
            <label>{t('template')}<select className="native-select" value={template} onChange={(event) => setTemplate(event.target.value as Template)}>{catalog?.templates.map((item) => <option key={item.id} value={item.id}>{t(`templates.${item.id === 'count_zero' ? 'countZero' : item.id}`)}</option>)}</select></label>
            <label>{t('difficulty')}<select className="native-select" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>{(['easy', 'medium', 'hard'] as const).map((item) => <option key={item} value={item}>{t(`difficultyLevels.${item}`)}</option>)}</select></label>
          </div>
          <Button disabled={!writable || !course || busy}><Plus size={16} />{t('create')}</Button>
        </form>
        <section className="coding-library"><h2>{t('yourTasks')}</h2>{tasks?.tasks.length === 0 && <Empty title={t('emptyTitle')} text={t('emptyDescription')} icon={Code2} />}
          <div className="coding-task-grid">{tasks?.tasks.map((task) => <button key={task.id} className="coding-task-card" onClick={() => setParams({ task: String(task.id) })}><span className="coding-language">{t(`languages.${task.language}`)}</span><h3>{task.title}</h3><p>{task.learning_goal}</p><span>{task.status === 'proposed' ? t('proposal') : task.status === 'archived' ? t('archived') : t('openTask')}</span></button>)}</div>
          <div className="coding-pagination">{after > 0 && <Button variant="ghost" onClick={() => setAfter(0)}>{t('firstTasks')}</Button>}{tasks?.next_after && <Button variant="outline" onClick={() => setAfter(tasks.next_after!)}>{t('moreTasks')}</Button>}</div>
        </section>
      </>}
    </div>
  </Shell>
}

function CodingWorkspace({ task, runnerReady, onReload }: { task: Task; runnerReady: boolean; onReload: () => void }) {
  const { t } = useT('coding')
  const writable = useWritableHost()
  const initial = recovery(task)
  const [files, setFiles] = useState(initial?.files ?? task.files)
  const [dirty, setDirty] = useState(!!initial)
  const [recoveryAvailable, setRecoveryAvailable] = useState(!!initial)
  const [editGeneration, setEditGeneration] = useState(0)
  const draft = useRef({ files: initial?.files ?? task.files, revision: initial?.revision ?? task.draft_revision, generation: 0, dirty: !!initial })
  const operationPending = useRef(false)
  const [filename, setFilename] = useWorkspaceState(`coding:${task.id}:file`, Object.keys(initial?.files ?? task.files)[0])
  const [newFilename, setNewFilename] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [hint, setHint] = useState<{ level: number; text: string; solution: boolean } | null>(null)
  const [feedbackLevel, setFeedbackLevel] = useState('1')
  const [selectedAttempt, setSelectedAttempt] = useState<number | null>(null)
  const [diff, setDiff] = useState(false)
  const [startedJobId, setJobId] = useState<string | null>(null)
  const [runGeneration, setRunGeneration] = useState<number | null>(null)
  const { data: past } = useApi<{ files: Record<string, string> }>(`/api/learning/coding/attempts/${selectedAttempt}`, { enabled: selectedAttempt !== null })
  const { data: progress } = useApi<{ topics: { template: Template; attempts: number; solved: number; without_hints: number }[] }>(`/api/learning/coding/progress?course_id=${task.course_id}`, { refetchInterval: 5000 })
  const attempt = task.attempts.find((row) => row.id === selectedAttempt) ?? task.attempts[0]
  const jobId = task.attempts.find((row) => ['queued', 'running'].includes(row.state))?.job_id ?? startedJobId
  const running = task.attempts.some((row) => ['queued', 'running'].includes(row.state))
  function persistDraft() {
    try {
      localStorage.setItem(localKey(task), JSON.stringify({ revision: draft.current.revision, files: draft.current.files }))
      setRecoveryAvailable(true)
    } catch { setRecoveryAvailable(false); setMessage(t('localDraftFailed')) }
  }
  function changeFiles(next: Record<string, string>) {
    draft.current = { ...draft.current, files: next, generation: draft.current.generation + 1, dirty: true }
    setEditGeneration(draft.current.generation)
    setFiles(next)
    setDirty(true)
    persistDraft()
  }
  function draftSnapshot() { return { ...draft.current, files: { ...draft.current.files } } }
  async function save(snapshot = draftSnapshot()) {
    const result = await request<{ revision: number }>(`/api/learning/coding/tasks/${task.id}/draft`, { method: 'POST', body: JSON.stringify({ expected_revision: snapshot.revision, files: snapshot.files }) })
    // The ACK advances the baseline, but only its own edit generation is saved.
    const unchanged = draft.current.generation === snapshot.generation
    const stored = recovery(task)
    const ownsRecovery = stored?.revision === snapshot.revision && JSON.stringify(stored.files) === JSON.stringify(draft.current.files)
    draft.current = { ...draft.current, revision: result.revision, dirty: !unchanged }
    setDirty(!unchanged)
    if (!unchanged) {
      if (!stored || ownsRecovery) persistDraft()
      else { setRecoveryAvailable(false); setMessage(t('localDraftConflict')) }
    }
    else {
      try {
        // Another mounted editor/window may have replaced this recovery entry.
        if (ownsRecovery) localStorage.removeItem(localKey(task))
      } catch { setMessage(t('localDraftFailed')) }
    }
    return result.revision
  }
  async function action(operation: () => Promise<unknown>) {
    if (operationPending.current) return
    operationPending.current = true
    setBusy(true); setMessage('')
    try { await operation(); onReload() } catch (cause) { setMessage(extractApiErrorMessage(cause)) } finally { operationPending.current = false; setBusy(false) }
  }
  async function run() {
    if (busy || running || !runnerReady || !writable || task.status !== 'active') return
    const snapshot = draftSnapshot()
    await action(async () => {
      if (snapshot.dirty) await save(snapshot)
      const result = await request<{ job_id: string }>(`/api/learning/coding/tasks/${task.id}/run`, { method: 'POST', body: JSON.stringify({ files: snapshot.files, confirmed: true }) })
      setJobId(result.job_id); setRunGeneration(snapshot.generation); setSelectedAttempt(null)
    })
  }
  async function askHint(level: number) {
    if (level === 4 && !window.confirm(t('solutionConfirm'))) return
    await action(async () => setHint(await request(`/api/learning/coding/tasks/${task.id}/hint`, { method: 'POST', body: JSON.stringify({ level, reveal_solution: level === 4 }) })))
  }
  return <div className="coding-workspace">
    <Link className="coding-back" to="/coding"><ChevronLeft size={16} />{t('back')}</Link>
    <header className="coding-task-heading"><div><span className="coding-language">{t(`languages.${task.language}`)} · {t(`difficultyLevels.${task.difficulty as 'easy'}`)}</span><h2>{task.title}</h2><p>{task.learning_goal}</p></div><span className="muted-text">{t('progressSummary', { solved: progress?.topics.reduce((sum, row) => sum + row.solved, 0) ?? 0, attempts: progress?.topics.reduce((sum, row) => sum + row.attempts, 0) ?? 0 })}</span></header>
    {message && <p role="alert" className="coding-message">{message}</p>}
    {task.status === 'proposed' && <div className="coding-proposal"><p>{t('proposalExplanation')}</p><Button disabled={!writable || busy} onClick={() => void action(() => request(`/api/learning/coding/tasks/${task.id}/accept`, { method: 'POST', body: JSON.stringify({ confirmed: true }) }))}>{t('acceptTask')}</Button></div>}
    <div className="coding-layout">
      <aside className="coding-brief"><h3>{t('task')}</h3>{task.story && <AssessmentQuestion text={task.story} />}<AssessmentQuestion text={task.contract} /><p className="coding-signature">{t('signature')}</p><h3>{t('examples')}</h3>{task.public_tests.map((test) => <div className="coding-example" key={test.name}><code>{JSON.stringify(test.input)} → {JSON.stringify(test.expected)}</code></div>)}<details><summary>{t('validation')}</summary><p>{t('validationDescription')}</p>{task.rubric.map((item) => <AssessmentQuestion key={item} text={item} />)}</details>
        <div className="coding-hints"><h3>{t('hints')}</h3><p>{t('hintIntro')}</p>{[1, 2, 3].map((level) => <Button key={level} size="sm" variant="outline" disabled={!writable || busy || task.status !== 'active'} onClick={() => void askHint(level)}>{t(`hintLevels.level${level}` as 'hintLevels.level1')}</Button>)}<button className="coding-solution-link" disabled={!writable || busy || task.status !== 'active'} onClick={() => void askHint(4)}>{t('showSolution')}</button>{hint && <div className="coding-hint" role="status"><>{hint.solution ? <AssessmentCode text={hint.text} language={task.language} /> : <AssessmentQuestion text={hint.text} />}</></div>}</div>
      </aside>
      <section className="coding-ide" aria-label={t('editor')}>
        <div className="coding-filebar" role="tablist" aria-label={t('files')}>{Object.keys(files).map((name) => <button key={name} role="tab" aria-selected={name === filename} onClick={() => setFilename(name)}>{name}</button>)}</div>
        <div className="coding-editor-toolbar"><span className="muted-text">{dirty ? t(recoveryAvailable ? 'draftLocal' : 'draftUnsaved') : t('draftSaved')}</span><Button size="sm" variant="ghost" disabled={!writable || busy || !dirty || task.status !== 'active'} onClick={() => void action(() => save())}><Save size={15} />{t('save')}</Button>{past && <label><input type="checkbox" checked={diff} onChange={(event) => setDiff(event.target.checked)} />{t('compare')}</label>}</div>
        <Suspense fallback={<Loading />}><CodeEditor readOnly={!writable || task.status !== 'active'} value={files[filename] ?? ''} filename={filename} language={task.language} label={t('editorLabel', { filename })} onChange={(value) => changeFiles({ ...files, [filename]: value })} onRun={() => void run()} original={diff ? past?.files[filename] ?? '' : undefined} /></Suspense>
        <details className="coding-add-file"><summary>{t('addFile')}</summary><form onSubmit={(event) => { event.preventDefault(); if (!writable || task.status !== 'active' || !newFilename || !newFilename.endsWith('.' + { java: 'java', python: 'py', javascript: 'js' }[task.language]) || ['Main.java', 'main.py', 'main.js'].includes(newFilename) || files[newFilename] !== undefined || !/^[A-Za-z][A-Za-z0-9_]{0,63}\.(java|py|js)$/.test(newFilename) || Object.keys(files).length >= 8) { setMessage(t('invalidFilename')); return } changeFiles({ ...files, [newFilename]: '' }); setFilename(newFilename); setNewFilename('') }}><label>{t('filename')}<input value={newFilename} onChange={(event) => setNewFilename(event.target.value)} /></label><Button size="sm" disabled={!writable || busy || task.status !== 'active'}>{t('add')}</Button></form></details>
        <div className="coding-runbar"><span>{t('shortcut')}</span>{running && jobId && <Button size="sm" variant="outline" onClick={() => void action(() => request(`/api/jobs/${jobId}/cancel`, { method: 'POST', body: JSON.stringify({ confirmed: true }) }))}><Square size={14} />{t('cancel')}</Button>}<Button disabled={!writable || busy || running || !runnerReady || task.status !== 'active'} onClick={() => void run()}><Play size={15} />{running ? t('running') : t('run')}</Button></div>
        {runGeneration !== null && runGeneration !== editGeneration && <p role="status" className="muted-text">{t('runUsesEarlierDraft')}</p>}
        <section className="coding-results" aria-label={t('results')}>
          <div className="coding-results-heading"><h3>{t('results')}</h3>{task.attempts.length > 0 && <label>{t('attempt')}<select className="native-select" value={selectedAttempt ?? task.attempts[0].id} onChange={(event) => setSelectedAttempt(Number(event.target.value))}>{task.attempts.map((item, index) => <option key={item.id} value={item.id}>{t('attemptNumber', { number: task.attempts.length - index })}</option>)}</select></label>}</div>
          {!attempt && <p className="muted-text">{t('runFirst')}</p>}
          {attempt && <><p role="status">{attempt.state === 'completed' ? t('testSummary', { passed: attempt.report.passed ?? 0, total: attempt.report.total ?? 0 }) : t(`states.${attempt.state as 'queued'}`)}</p>{attempt.report.checks?.map((test) => <div className={`coding-test ${test.passed ? 'passed' : 'failed'}`} key={test.name}>{test.passed ? <Check size={16} /> : <X size={16} />}<span>{t(`categories.${test.category as 'normal'}`)}{!test.public && <small>{t('hidden')}</small>}</span><span className="muted-text">{test.runtime_ms != null ? t('runtime', { time: Math.round(test.runtime_ms) }) : ''}</span>{test.public && <details><summary>{t('testDetails')}</summary><pre>{t('expected')}: {JSON.stringify(test.expected)}{ '\n' }{t('actual')}: {JSON.stringify(test.actual)}{ '\n' }{test.console}{test.compiler}</pre></details>}</div>)}</>}
        </section>
      </section>
    </div>
    {attempt?.state === 'completed' && <section className="coding-feedback"><div><h3>{t('feedback')}</h3><p>{t('feedbackIntro')}</p><label>{t('feedbackLevel')}<select className="native-select" value={feedbackLevel} onChange={(event) => setFeedbackLevel(event.target.value)}>{[1, 2, 3].map((level) => <option key={level} value={level}>{t(`hintLevels.level${level}` as 'hintLevels.level1')}</option>)}</select></label><Button disabled={!writable || busy} onClick={() => void action(() => request(`/api/learning/coding/attempts/${attempt.id}/feedback`, { method: 'POST', body: JSON.stringify({ level: Number(feedbackLevel) }) }))}>{t('requestFeedback')}</Button>{attempt.feedback_requested && <p role="status">{t('feedbackPending')}</p>}</div><div>{task.reviews.filter((review) => review.attempt_id === attempt.id).map((review) => <article key={review.id}><span className="coding-language">{review.status === 'proposed' ? t('reviewProposal') : t('reviewApproved')}</span><AssessmentQuestion text={review.feedback} />{review.file && <p>{review.file} · {t('line', { number: review.line ?? 1 })}</p>}{review.status === 'proposed' && <Button size="sm" disabled={!writable || busy} onClick={() => void action(() => request(`/api/learning/coding/reviews/${review.id}/accept`, { method: 'POST', body: JSON.stringify({ confirmed: true }) }))}>{t('acceptReview')}</Button>}{review.status === 'approved' && review.next_template && <Button size="sm" disabled={!writable || busy} onClick={() => void action(async () => { await request(`/api/learning/coding/courses/${task.course_id}/tasks`, { method: 'POST', body: JSON.stringify({ template: review.next_template, language: task.language, difficulty: task.difficulty, topic_id: task.topic_id }) }); setMessage(t('nextReady')) })}>{t('nextTask')}</Button>}</article>)}</div></section>}
  </div>
}
