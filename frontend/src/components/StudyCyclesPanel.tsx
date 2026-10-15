// SPDX-License-Identifier: AGPL-3.0-or-later

import { RotateCcw } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n/useT'
import { localDate, request, useApi } from '@/api'
import { Empty, Failure, Loading, Panel } from '@/components/State'
import { Button } from '@/components/ui/button'
import { useApiMutation } from '@/hooks/useApiMutation'
import { useWritableHost } from '@/hooks/host'
import { focusPath } from '@/lib/learningFocus'
import { ExamImpactDialog } from './ExamImpactDialog'

type Cycle = { id: number; exam_id: number; exam_title: string; course_name: string; phase_label: string;
  starts_at: string; ends_at: string; topic_names: string[]; review_goal: number;
  attempt_goal: number; reviews_done: number; attempts_done: number;
  progress_percent: number | null; status: 'proposed' | 'accepted'; exam_changed: boolean;
  exam_at_snapshot: string; current_exam_at: string | null;
  new_exam_materials: { id: number; name: string }[] }

export function StudyCyclesPanel() {
  const { t } = useT('learning')
  const { t: impact } = useT('examImpact')
  const [impactCycle, setImpactCycle] = useState<number | null>(null)
  const [impactSaved, setImpactSaved] = useState(false)
  const impactTrigger = useRef<HTMLButtonElement | null>(null)
  const { data, error, loading } = useApi<Cycle[]>('/api/learning/cycles')
  const canWrite = useWritableHost()
  const decide = useApiMutation(
    ({ id, action }: { id: number; action: 'accept' | 'reject' }) =>
      request(`/api/learning/cycles/${id}/${action}`, { method: 'POST' }),
    { invalidate: ['/api/learning/cycles'] },
  )
  const shownExams = new Set<number>()
  const impactCycles = new Set((data ?? []).filter(cycle => {
    if (cycle.status !== 'accepted' || !cycle.exam_changed || new Date(cycle.ends_at).getTime() <= Date.now() || shownExams.has(cycle.exam_id)) return false
    shownExams.add(cycle.exam_id); return true
  }).map(cycle => cycle.id))
  function closeImpact() {
    setImpactCycle(null)
    requestAnimationFrame(() => impactTrigger.current?.focus())
  }

  return <Panel title={t('cyclesTitle')} action={<RotateCcw size={19} />}>
    <p className="muted-text mb-4">{t('cyclesIntro')}</p>
    {decide.error && <p role="alert" className="text-destructive">{decide.error}</p>}
    {impactSaved && <p role="status">{impact('applied')}</p>}
    {loading && !data ? <Loading /> : error ? <Failure message={error} /> : data?.length ?
      <div className="row-list study-cycle-list">{data.map((cycle) => <article className="data-row study-cycle" key={cycle.id}>
        <div className="min-w-0 flex-1">
          <span className="row-subtitle">{cycle.course_name} · {cycle.exam_title}</span>
          <strong>{cycle.phase_label}</strong>
          <p className="text-sm">{t('cyclesUntil', { date: localDate(cycle.ends_at), topics: cycle.topic_names.join(', ') || t('cyclesTopicsPending') })}</p>
          {cycle.new_exam_materials.length > 0 && <p className="row-subtitle">
            {t('cyclesNewExamMaterials')} {cycle.new_exam_materials.map((item, index) => <span key={item.id}>
              {index > 0 ? ', ' : ''}<Link to={`/material/${item.id}`}>{item.name}</Link>
            </span>)}
          </p>}
          {cycle.exam_changed && <div className="study-cycle-exam-change"><strong>{impact('changed')}</strong>
            <p>{impact('oldDate', { date: localDate(cycle.exam_at_snapshot) })}</p>
            <p>{impact('newDate', { date: cycle.current_exam_at ? localDate(cycle.current_exam_at) : impact('unknownDate') })}</p>
            {impactCycles.has(cycle.id) && <Button size="sm" variant="outline" onClick={event => {
              impactTrigger.current = event.currentTarget; setImpactSaved(false); setImpactCycle(cycle.id)
            }}>{impact('inspect')}</Button>}
          </div>}
          {cycle.progress_percent === null ? <p className="row-subtitle">{t('cyclesNoGoals')}</p>
            : <div className="study-cycle-progress"><progress value={cycle.progress_percent} max={100} aria-label={t('cyclesProgressAriaLabel', { phase: cycle.phase_label })} />
              <span>{cycle.progress_percent} %</span>
              <small>{t('cyclesProgressDetail', {
                reviewsDone: cycle.reviews_done, reviewGoal: cycle.review_goal,
                attemptsDone: cycle.attempts_done, attemptGoal: cycle.attempt_goal,
              })}</small></div>}
          {cycle.status === 'proposed' ? <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" disabled={!canWrite || decide.pending || cycle.exam_changed}
              onClick={() => decide.mutate({ id: cycle.id, action: 'accept' })}>{t('cyclesAccept')}</Button>
            <Button size="sm" variant="outline" disabled={!canWrite || decide.pending}
              onClick={() => decide.mutate({ id: cycle.id, action: 'reject' })}>{t('cyclesReject')}</Button>
          </div> : <div className="mt-2 flex flex-wrap items-center gap-3"><p className="row-subtitle">{t('cyclesAccepted')}</p>
            {cycle.status === 'accepted' && <Button size="sm" asChild><Link to={focusPath({ kind: 'cycle', id: cycle.id })}>{t('focusStart')}</Link></Button>}
          </div>}
        </div>
      </article>)}</div> : <Empty icon={RotateCcw} title={t('cyclesEmptyTitle')}
        text={t('cyclesEmptyText')} />}
    {impactCycle !== null && <ExamImpactDialog cycleId={impactCycle} onClose={closeImpact}
      onApplied={() => { setImpactSaved(true); closeImpact() }} />}
  </Panel>
}
