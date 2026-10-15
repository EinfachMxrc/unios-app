// SPDX-License-Identifier: AGPL-3.0-or-later
import { useWorkspaceState } from '@/lib/workspaceState'
import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, ChevronLeft, ListChecks, Plus } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { request, useApi } from '@/api'
import { useT } from '@/i18n/useT'
import { useWritableHost } from '@/hooks/host'
import { Shell } from '@/components/Shell'
import { LearningTabs } from '@/components/LearningTabs'
import { Button } from '@/components/ui/button'
import { Empty, Failure, Loading } from '@/components/State'
import { OralAnswer } from '@/components/OralAnswer'
import { AssessmentInline, AssessmentQuestion } from '@/components/AssessmentQuestion'
import type { CoursesResponse } from '@/types'
import type { AssessmentKind, AssessmentTask, Exam } from './assessmentTypes'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'
import './AssessmentPage.css'

const kinds: AssessmentKind[] = ['multiple_choice', 'free_recall', 'symbolic_math', 'parsons', 'ordering', 'oral', 'matching', 'numeric']
const base = '/api/learning/assessment'
const confirmBody = { method: 'POST', body: JSON.stringify({ confirmed: true }) }

export function AssessmentPage() {
  const { t } = useT('assessment')
  const [params, setParams] = useSearchParams()
  const writable = useWritableHost()
  const id = Number(params.get('task')) || null
  const examId = Number(params.get('exam')) || null
  const [course, setCourse] = useWorkspaceState(`assessment:course:${params.get('course') ?? 'all'}`, params.get('course') ?? '')
  const [kind, setKind] = useState<AssessmentKind>('multiple_choice')
  const [question, setQuestion] = useState('')
  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState('')
  const [choices, setChoices] = useState('')
  const [expected, setExpected] = useState('')
  const [concepts, setConcepts] = useState('')
  const [expression, setExpression] = useState('')
  const [operation, setOperation] = useState('equivalent')
  const [level, setLevel] = useState('2')
  const [selected, setSelected] = useState<number[]>([])
  const [minutes, setMinutes] = useState('30')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [requestId, setRequestId] = useState<number | null>(Number(params.get('request')) || null)
  const [lastPage, setLastPage] = useState(params.get('page') ?? '1')
  const { data: courses } = useApi<CoursesResponse>('/api/courses')
  const { data: tasks, error, reload } = useApi<{ tasks: AssessmentTask[] }>(`${base}/tasks${course ? `?course_id=${course}` : ''}`)
  const { data: task, error: taskError, reload: reloadTask } = useApi<AssessmentTask>(`${base}/tasks/${id}`, { enabled: !!id, refetchInterval: id ? 3000 : undefined })
  const { data: runningExams } = useApi<{ exams: Exam[] }>(`${base}/exams`, { refetchInterval: 5000 })
  const { data: exam, error: examError, reload: reloadExam } = useApi<Exam>(`${base}/exams/${examId}`, { enabled: !!examId, refetchInterval: examId ? 1000 : undefined })
  const { data: section } = useApi<{ tasks: AssessmentTask[]; source_unchanged: boolean }>(`${base}/requests/${requestId}`, { enabled: !!requestId, refetchInterval: requestId ? 3000 : undefined })
  const { data: progress } = useApi<{ topics: { topic: string; level: number; practice_priority: number; correct: number; objective_attempts: number; misconceptions: number }[] }>(`${base}/progress${course ? `?course_id=${course}` : ''}`, { refetchInterval: 5000 })
  async function action(work: () => Promise<unknown>) { setBusy(true); setMessage(''); try { await work(); reload(); reloadTask(); reloadExam() } catch (cause) { setMessage(extractApiErrorMessage(cause)) } finally { setBusy(false) } }
  async function create() {
    await action(async () => {
      const ordered = ['ordering', 'parsons'].includes(kind)
      const result = await request<AssessmentTask>(`${base}/courses/${course}/tasks`, { method: 'POST', body: JSON.stringify({ type: kind, title, question, topic: topic || t('defaultTopic'), level: Number(level), choices: choices.split('\n').filter(Boolean), expected: ordered ? JSON.stringify(expected.split(',').map((value) => Number(value.trim()) - 1)) : kind === 'matching' ? JSON.stringify(expected.split('\n').filter(Boolean)) : expected, concepts: concepts.split('\n').filter(Boolean), expression, math_operation: operation }) })
      setParams({ task: String(result.id) })
    })
  }
  async function requestSection() {
    await action(async () => {
      const scope = params.get('note') ? { note_id: params.get('note') } : { version_id: Number(params.get('version')), first_page: Number(params.get('page') ?? 1), last_page: Number(lastPage) }
      const result = await request<{ id: number }>(`${base}/courses/${course}/requests`, { method: 'POST', body: JSON.stringify(scope) })
      setRequestId(result.id)
    })
  }
  function openTask(identifier: number) { setParams({ task: String(identifier), ...(examId ? { exam: String(examId) } : {}) }) }
  return <Shell title={t('title')}><LearningTabs /><div className="assessment-page">
    {!id && <header className="assessment-heading"><p>{t('intro')}</p><Link className="subtle-link" to="/coding">{t('codingLink')} →</Link></header>}
    {message && <p role="status">{message}</p>}{error && <Failure message={error} />}{taskError && <Failure message={taskError} />}
    {!examId && !!runningExams?.exams.length && <section className="assessment-exam-bar"><strong>{t('runningExams')}</strong>{runningExams.exams.map((item) => <Button key={item.id} variant="outline" onClick={() => setParams({ exam: String(item.id), task: String(item.task_ids.find((identifier) => !item.answered.includes(identifier)) ?? item.task_ids[0]) })}>{t('resumeExam', { number: item.id })}</Button>)}</section>}
    {exam && <section className="assessment-exam-bar"><div><strong>{t('examTitle')}</strong><p role="timer">{exam.state === 'running' ? t('timeRemaining', { minutes: Math.floor(exam.remaining_seconds / 60), seconds: String(exam.remaining_seconds % 60).padStart(2, '0') }) : t('examFinished')}</p><p>{t('answered', { count: exam.answered.length, total: exam.task_ids.length })}</p></div><div>{exam.task_ids.map((identifier, index) => <Button key={identifier} size="sm" variant={id === identifier ? 'default' : 'outline'} onClick={() => openTask(identifier)}>{index + 1}{exam.answered.includes(identifier) && <Check size={12} />}</Button>)}</div>{exam.state === 'running' && <Button disabled={!writable || busy} onClick={() => { if (window.confirm(t('finishConfirm'))) void action(() => request(`${base}/exams/${exam.id}/finish`, confirmBody)) }}>{t('finishExam')}</Button>}{exam.report && <p>{t('examScore', { points: exam.report.points, pending: exam.report.pending_points })}</p>}</section>}
    {id ? examId && (exam?.id !== examId || examError) ? examError ? <Failure message={examError} retry={reloadExam} /> : <Loading />
      : examId && !exam?.task_ids.includes(id) ? <Failure message={t('examTaskUnavailable')} />
        : task?.id === id ? <AssessmentWorkspace key={`${id}:${examId ?? ''}`} task={task} exam={examId ? exam ?? undefined : undefined} reload={() => { reloadTask(); reloadExam(); reload() }} /> : <Loading /> : <>
      {(params.get('version') || params.get('note')) && <section className="assessment-section-request"><h2>{t('sectionTitle')}</h2><p>{t('sectionDescription')}</p>{params.get('version') && <label>{t('lastPage')}<input type="number" min={Number(params.get('page') ?? 1)} max={Number(params.get('page') ?? 1) + 39} value={lastPage} onChange={(event) => setLastPage(event.target.value)} /></label>}<Button disabled={!writable || busy || !course} onClick={() => void requestSection()}>{t('requestSection')}</Button>{requestId && <><p role="status">{t('sectionPending')}</p>{section && !section.source_unchanged && <p>{t('sourceChanged')}</p>}<div className="assessment-task-grid">{section?.tasks.map((item) => <button key={item.id} className="assessment-task-card" onClick={() => openTask(item.id)}>{item.title}</button>)}</div></>}</section>}
      <details className="assessment-author"><summary><Plus size={16} />{t('createTitle')}</summary><form onSubmit={(event) => { event.preventDefault(); void create() }}>
        <div className="assessment-form-grid"><label>{t('course')}<select className="native-select" value={course} required onChange={(event) => setCourse(event.target.value)}><option value="">{t('chooseCourse')}</option>{courses?.courses.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{t('type')}<select className="native-select" value={kind} onChange={(event) => setKind(event.target.value as AssessmentKind)}>{kinds.map((item) => <option key={item} value={item}>{t(`types.${item}`)}</option>)}</select></label><label>{t('taskTitle')}<input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>{t('topic')}<input maxLength={120} value={topic} onChange={(event) => setTopic(event.target.value)} /></label><label>{t('level')}<select className="native-select" value={level} onChange={(event) => setLevel(event.target.value)}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{t(`levels.level${value}` as 'levels.level1')}</option>)}</select></label></div>
        <label>{t('question')}<textarea required value={question} maxLength={3000} onChange={(event) => setQuestion(event.target.value)} /></label>
        {['multiple_choice', 'ordering', 'parsons', 'matching'].includes(kind) && <label>{t('choices')}<textarea value={choices} onChange={(event) => setChoices(event.target.value)} /></label>}
        {kind === 'symbolic_math' ? <div className="assessment-form-grid"><label>{t('expression')}<input value={expression} maxLength={128} required onChange={(event) => setExpression(event.target.value)} /><small>{t('mathGrammar')}</small></label><label>{t('operation')}<select className="native-select" value={operation} onChange={(event) => setOperation(event.target.value)}>{['equivalent', 'derivative', 'roots'].map((item) => <option key={item} value={item}>{t(`operations.${item as 'equivalent'}`)}</option>)}</select></label></div> : ['free_recall', 'oral'].includes(kind) ? <label>{t('concepts')}<textarea value={concepts} onChange={(event) => setConcepts(event.target.value)} /></label> : <label>{t('expected')}<textarea aria-label={t('expected')} value={expected} onChange={(event) => setExpected(event.target.value)} /><small>{t('expectedHelp')}</small></label>}
        <p className="muted-text">{t('authorNote')}</p><Button disabled={!writable || busy || !course}>{t('create')}</Button>
      </form></details>
      <section className="assessment-library"><div className="assessment-library-heading"><h2>{t('yourTasks')}</h2><label>{t('filterCourse')}<select className="native-select" value={course} onChange={(event) => setCourse(event.target.value)}><option value="">{t('allCourses')}</option>{courses?.courses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
        {tasks?.tasks.length === 0 && <Empty icon={ListChecks} title={t('emptyTitle')} text={t('emptyText')} />}
        <div className="assessment-task-grid">{tasks?.tasks.map((item) => <article key={item.id} className="assessment-task-card"><button onClick={() => openTask(item.id)}><span>{t(`types.${item.type}`)}</span><h3>{item.title}</h3><p>{t(`levels.level${item.level}` as 'levels.level1')}</p><span>{item.status === 'proposed' ? t('proposal') : t('continue')}</span></button>{item.status === 'active' && !item.highest_hint && <label><input type="checkbox" checked={selected.includes(item.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, item.id] : selected.filter((value) => value !== item.id))} />{t('selectForExam')}</label>}</article>)}</div>
        {selected.length > 0 && <form className="assessment-exam-start" onSubmit={(event) => { event.preventDefault(); void action(async () => { const result = await request<Exam>(`${base}/exams`, { method: 'POST', body: JSON.stringify({ task_ids: selected, minutes: Number(minutes), confirmed: true }) }); setParams({ exam: String(result.id), task: String(selected[0]) }) }) }}><p>{t('examSelection', { count: selected.length })}</p><label>{t('minutes')}<input type="number" min={1} max={180} required value={minutes} onChange={(event) => setMinutes(event.target.value)} /></label><Button disabled={!writable || busy || selected.length > 30}>{t('startExam')}</Button></form>}
      </section>
      {!!progress?.topics.length && <section className="assessment-progress"><h2>{t('practiceNext')}</h2><p>{t('progressExplanation')}</p>{progress.topics.slice(0, 6).map((item) => <div key={`${item.topic}:${item.level}`}><span>{item.topic} · {t(`levels.level${item.level}` as 'levels.level1')}</span><span>{t('topicResult', { correct: item.correct, total: item.objective_attempts, misconceptions: item.misconceptions })}</span></div>)}</section>}
    </>}
  </div></Shell>
}

function AssessmentWorkspace({ task, exam, reload }: { task: AssessmentTask; exam?: Exam; reload: () => void }) {
  const { t } = useT('assessment')
  const writable = useWritableHost()
  const [answer, setAnswer] = useWorkspaceState(`assessment:${exam?.id ?? 'practice'}:${task.id}:answer`, '', { persist: false })
  const [steps, setSteps] = useWorkspaceState(`assessment:${exam?.id ?? 'practice'}:${task.id}:steps`, '', { persist: false })
  const [confidence, setConfidence] = useWorkspaceState(`assessment:${exam?.id ?? 'practice'}:${task.id}:confidence`, '3', { persist: false })
  const [order, setOrder] = useWorkspaceState(`assessment:${exam?.id ?? 'practice'}:${task.id}:order`, task.choices.map((_, index) => index).reverse(), { persist: false })
  const [matches, setMatches] = useWorkspaceState<Record<number, string>>(`assessment:${exam?.id ?? 'practice'}:${task.id}:matches`, {}, { persist: false })
  const [hint, setHint] = useState('')
  const [definition, setDefinition] = useState<{ expected: string; concepts: string[] } | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const focusAfterAccept = useRef(false)
  const answerForm = useRef<HTMLFormElement>(null)
  const examRunning = exam?.state === 'running'
  const submitted = exam?.answered.includes(task.id)
  const blocked = !writable || busy || task.status !== 'active' || !!exam && (!examRunning || !!submitted || exam.remaining_seconds === 0)
  const blockedReason = !writable ? t('readOnlyAnswer') : task.status === 'proposed' ? t('acceptToAnswer')
    : task.status !== 'active' ? t('unavailableAnswer') : submitted ? t('submitted')
      : exam && (!examRunning || exam.remaining_seconds === 0) ? t('examAnswerClosed') : busy ? t('savingAnswer') : ''
  const latest = task.attempts[0]
  useEffect(() => {
    if (focusAfterAccept.current && !blocked) {
      focusAfterAccept.current = false
      answerForm.current?.querySelector<HTMLElement>('textarea:not(:disabled), input:not(:disabled), select:not(:disabled), button:not(:disabled)')?.focus()
    }
  }, [blocked])
  async function action(work: () => Promise<unknown>) { if (inFlight.current) return; inFlight.current = true; setBusy(true); setMessage(''); try { await work(); reload() } catch (cause) { setMessage(extractApiErrorMessage(cause)) } finally { inFlight.current = false; setBusy(false) } }
  async function submit() { if (blocked) return; await action(() => request(`${base}/tasks/${task.id}/answer`, { method: 'POST', body: JSON.stringify({ text: ['ordering', 'parsons'].includes(task.type) ? JSON.stringify(order) : task.type === 'matching' ? JSON.stringify(task.choices.map((_, index) => matches[index] ?? '')) : answer, steps: steps.split('\n').filter(Boolean), confidence: Number(confidence), session_id: exam?.id ?? null }) })) }
  function move(index: number, delta: number) { const next = [...order]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; setOrder(next) }
  async function ask(level: number) { if (level === 4 && !window.confirm(t('solutionConfirm'))) return; await action(async () => { const result = await request<{ text: string; available?: boolean }>(`${base}/tasks/${task.id}/hint`, { method: 'POST', body: JSON.stringify({ level, reveal_solution: level === 4 }) }); setHint(result.text || t('noHint')) }) }
  return <div className="assessment-workspace"><Link className="subtle-link" to="/assessment"><ChevronLeft size={15} />{t('back')}</Link>
    <header><span className="assessment-type">{t(`types.${task.type}`)} · {t(`levels.level${task.level}` as 'levels.level1')}</span><h2>{task.title}</h2>{task.topic && !examRunning && <p className="muted-text">{task.topic}</p>}</header>
    {task.status === 'proposed' && <section className="assessment-proposal"><div className="assessment-proposal-copy"><strong>{t('proposalStatus')}</strong><p>{t('proposalExplanation')}</p></div><div className="assessment-proposal-actions"><Button size="lg" disabled={!writable || busy} onClick={() => void action(async () => { await request(`${base}/tasks/${task.id}/accept`, confirmBody); focusAfterAccept.current = true })}>{t('accept')}</Button><Button variant="ghost" disabled={!writable || busy} onClick={() => { if (window.confirm(t('definitionConfirm'))) void action(async () => setDefinition(await request(`${base}/tasks/${task.id}/definition`, confirmBody))) }}>{t('reviewDefinition')}</Button></div>{definition && <div className="assessment-definition"><strong>{t('expected')}</strong><pre>{definition.expected || definition.concepts.join(' · ')}</pre></div>}</section>}
    <div className="assessment-layout"><section className="assessment-question"><h3>{t('question')}</h3><AssessmentQuestion text={task.question} />{task.expression && <code className="assessment-formula">{task.expression}</code>}{task.provenance.source && <Link className="subtle-link" to={task.provenance.source.url}>{t('openSource')} →</Link>}{!examRunning && task.mode !== 'exam' && <details className="assessment-help"><summary>{t('hints')}</summary><div className="assessment-help-actions">{[1, 2, 3].map((level) => <Button key={level} size="sm" variant="outline" disabled={blocked} onClick={() => void ask(level)}>{t('hintLevel', { level })}</Button>)}<Button size="sm" variant="ghost" disabled={blocked} onClick={() => void ask(4)}>{t('solution')}</Button></div>{hint && <div className="assessment-hint-content" role="status"><AssessmentQuestion text={hint} /></div>}</details>}</section>
      <section className="assessment-answer"><h3>{t('yourAnswer')}</h3>{blockedReason && <p className="assessment-blocked-note" id={`assessment-blocked-${task.id}`} role="status">{blockedReason}</p>}<form ref={answerForm} onSubmit={(event) => { event.preventDefault(); void submit() }} onKeyDown={event => {
        if (event.key !== 'Enter' || !event.ctrlKey && !event.metaKey || event.nativeEvent.isComposing || event.repeat || blocked) return
        event.preventDefault()
        event.currentTarget.requestSubmit()
      }}>
        {task.type === 'multiple_choice' ? <fieldset disabled={blocked} className="assessment-choices"><legend className="sr-only">{t('yourAnswer')}</legend>{task.choices.map((choice, index) => <label key={index}><input type="radio" name={`answer-${task.id}`} value={choice} checked={answer === choice} onChange={() => setAnswer(choice)} required /><AssessmentInline text={choice} /></label>)}</fieldset> : ['ordering', 'parsons'].includes(task.type) ? <ol className="assessment-order">{order.map((value, index) => <li key={value}>{task.type === 'parsons' ? <pre tabIndex={0}>{task.choices[value]}</pre> : <AssessmentInline text={task.choices[value]} />}<div className="assessment-order-controls"><Button type="button" variant="ghost" size="sm" aria-label={t('moveUp', { number: index + 1 })} disabled={blocked || index === 0} onClick={() => move(index, -1)}><ArrowUp size={16} /></Button><Button type="button" variant="ghost" size="sm" aria-label={t('moveDown', { number: index + 1 })} disabled={blocked || index === order.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} /></Button></div></li>)}</ol> : task.type === 'matching' ? <div className="assessment-matching">{task.choices.map((choice, index) => <label key={index}><AssessmentInline text={choice} /><select disabled={blocked} required className="native-select" value={matches[index] ?? ''} onChange={(event) => setMatches({ ...matches, [index]: event.target.value })}><option value="">{t('chooseMatch')}</option>{task.options?.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>)}</div> : <>
          {task.type === 'oral' && <OralAnswer disabled={blocked} onTranscript={setAnswer} />}
          <label>{task.type === 'oral' ? t('transcript') : t('answerLabel')}{task.type === 'numeric' ? <input type="text" value={answer} maxLength={8000} required disabled={blocked} aria-describedby={[`assessment-numeric-${task.id}`, blockedReason && `assessment-blocked-${task.id}`].filter(Boolean).join(' ')} onChange={(event) => setAnswer(event.target.value)} /> : <textarea rows={10} value={answer} maxLength={8000} required disabled={blocked} aria-describedby={blockedReason ? `assessment-blocked-${task.id}` : undefined} onChange={(event) => setAnswer(event.target.value)} />}</label>
          {task.type === 'numeric' && <p className="muted-text" id={`assessment-numeric-${task.id}`}>{t('numericAnswerHelp')}</p>}
          {task.type === 'symbolic_math' && <><p className="muted-text">{t('mathAnswerHelp')}</p><label>{t('steps')}<textarea rows={6} value={steps} disabled={blocked} aria-describedby={`assessment-steps-help-${task.id}`} onChange={(event) => setSteps(event.target.value)} /></label><small id={`assessment-steps-help-${task.id}`}>{t('stepsHelp')}</small></>}
        </>}
        <div className="assessment-answer-footer"><label className="assessment-confidence">{t('confidence')}<select className="native-select" disabled={blocked} value={confidence} onChange={(event) => setConfidence(event.target.value)}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{t(`confidenceLevels.level${value}` as 'confidenceLevels.level1')}</option>)}</select></label><Button type="submit" size="lg" aria-keyshortcuts="Control+Enter Meta+Enter" disabled={blocked}>{submitted ? t('submitted') : t('checkAnswer')}</Button></div><small className="assessment-answer-shortcut">{t(['free_recall', 'symbolic_math', 'oral'].includes(task.type) ? 'answerShortcut' : 'checkShortcut')}</small>
      </form>{message && <p role="alert">{message}</p>}
      {latest && !examRunning && <section className="assessment-result" role="status"><h3>{latest.report.correct === true ? t('correct') : latest.report.correct === false ? t('incorrect') : t('needsTutor')}</h3>{latest.report.misconception && <p>{t('misconception')}</p>}{latest.report.steps?.map((step, index) => <p key={index}>{t('stepResult', { number: index + 1, result: step.equivalent === true ? t('equivalent') : step.equivalent === false ? t('notEquivalent') : t('stepUnknown') })}</p>)}{task.type === 'symbolic_math' && <p className="muted-text">{t('mathLimit')}</p>}{latest.report.errors?.length ? <p>{t('errorCategories')}: {latest.report.errors.map((category) => t(`errors.${category as 'math_result'}`)).join(' · ')}</p> : null}<Button type="button" size="sm" variant="outline" disabled={!writable || busy} onClick={() => void action(() => request(`${base}/attempts/${latest.id}/feedback`, confirmBody))}>{t('requestFeedback')}</Button>{latest.feedback_requested && <p>{t('feedbackPending')}</p>}</section>}
      {!examRunning && task.reviews.filter((review) => review.attempt_id === latest?.id).map((review) => <article className="assessment-review" key={review.id}><strong>{review.status === 'proposed' ? t('reviewProposal') : t('reviewApproved')}</strong><AssessmentQuestion text={review.feedback} />{review.concepts_met.map((concept) => <p key={concept}><Check size={14} /><AssessmentInline text={concept} /></p>)}{review.followup && <><h4>{t('followup')}</h4><AssessmentQuestion text={review.followup} /></>}{review.status === 'proposed' && <Button type="button" size="sm" disabled={!writable || busy} onClick={() => void action(() => request(`${base}/reviews/${review.id}/accept`, confirmBody))}>{t('acceptFeedback')}</Button>}</article>)}
    </section></div>
  </div>
}
