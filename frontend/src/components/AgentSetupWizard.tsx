// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { request, useApi } from '@/api'
import { useT } from '@/i18n/useT'
import { useWritableHost } from '@/hooks/host'
import { Button } from './ui/button'
import { Failure, Loading } from './State'
import './AgentSetupWizard.css'

export const agentCategories = ['course_material', 'notes', 'deadlines', 'learning_questions', 'projects',
  'timetable', 'exercises', 'learning_state', 'coding_tutor', 'project_code', 'submission_status', 'mail', 'exam_status'] as const
type Category = typeof agentCategories[number]
export type AgentAccess = { courses: { id: number; name: string; allowed: boolean }[]; categories: Record<string, boolean> }

/** Disable transport before changing grants: a partially saved selection never becomes active. */
export async function applyAgentSelection(access: AgentAccess, courses: number[], categories: Category[]) {
  await request('/api/ai/mcp/state', { method: 'PUT', body: JSON.stringify({ enabled: false }) })
  for (const course of access.courses) {
    await request(`/api/ai/access/course/${course.id}`, { method: 'PUT', body: JSON.stringify({ allowed: courses.includes(course.id) }) })
  }
  for (const category of Object.keys(access.categories)) {
    await request(`/api/ai/access/category/${category}`, { method: 'PUT', body: JSON.stringify({ allowed: categories.some((selected) => selected === category) }) })
  }
  await request('/api/ai/connection', { method: 'POST' })
}

export function AgentSetupWizard() {
  const { t } = useT('releaseOnboarding')
  const canWrite = useWritableHost()
  const { data: access, loading, error, reload } = useApi<AgentAccess>('/api/ai/access')
  const { data: state, reload: reloadState } = useApi<{ configured: boolean; enabled: boolean }>('/api/ai/mcp/state')
  const [courses, setCourses] = useState<number[]>([])
  const [categories, setCategories] = useState<Category[]>(['course_material', 'notes', 'deadlines'])
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  async function save() {
    if (!access || !courses.length || !categories.length) return
    setBusy(true); setMessage(''); setFailed(false)
    try { await applyAgentSelection(access, courses, categories); setMessage(t('connected')); setStep(3) }
    catch { setFailed(true); setMessage(t('permissionFailed')) }
    finally { setBusy(false); reload(); reloadState() }
  }
  async function revoke() {
    setBusy(true); setMessage(''); setFailed(false)
    try {
      await request('/api/ai/mcp/state', { method: 'PUT', body: JSON.stringify({ enabled: false }) })
      setMessage(t('revoked')); setStep(0)
    } catch { setFailed(true); setMessage(t('failed')) }
    finally { setBusy(false); reloadState() }
  }
  async function copy() {
    setBusy(true); setMessage(''); setFailed(false)
    try {
      const connection = await request<{ client_config: unknown }>('/api/ai/connection')
      await navigator.clipboard.writeText(JSON.stringify({ mcpServers: { unios: connection.client_config } }, null, 2))
      setMessage(t('copied'))
    } catch { setFailed(true); setMessage(t('failed')) }
    finally { setBusy(false) }
  }
  return <section className="agent-setup" aria-labelledby="agent-setup-title">
    <header><ShieldCheck size={24} aria-hidden="true" /><div><h2 id="agent-setup-title">{t('workTitle')}</h2><p>{t('workIntro')}</p></div></header>
    {loading && !access ? <Loading /> : error ? <Failure message={error} /> : access && <>
      <p className="agent-setup-state">{state?.enabled ? t('enabled') : t('disabled')}</p>
      {state?.enabled && <details className="agent-setup-current" open>
        <summary>{t('currentAccess')}</summary>
        <ul>{access.courses.filter((course) => course.allowed).map((course) => <li key={course.id}>{course.name}</li>)}</ul>
        <ul>{agentCategories.filter((category) => access.categories[category]).map((category) => <li key={category}>{t(category)}</li>)}</ul>
      </details>}
      <fieldset disabled={busy || !canWrite}>
        {step === 0 && <><legend>{t('courses')}</legend>
          {!access.courses.length && <p>{t('noCourses')}</p>}
          <div className="agent-setup-options">{access.courses.map((course) => <label key={course.id}>
            <input type="checkbox" aria-label={t('selectCourseForWork', { name: course.name })} checked={courses.includes(course.id)} onChange={(event) => setCourses(event.target.checked ? [...courses, course.id] : courses.filter((id) => id !== course.id))} />
            <span>{course.name}</span></label>)}</div>
          <Button disabled={!courses.length} onClick={() => setStep(1)}>{t('review')}</Button>
        </>}
        {step === 1 && <><legend>{t('categories')}</legend>
          <div className="agent-setup-options">{agentCategories.filter((category) => category in access.categories).map((category) => <label key={category}>
            <input type="checkbox" checked={categories.includes(category)} onChange={(event) => setCategories(event.target.checked ? [...categories, category] : categories.filter((key) => key !== category))} />
            <span>{t(category)}</span></label>)}</div><p>{t('sensitive')}</p>
          <div className="agent-setup-actions"><Button variant="outline" onClick={() => setStep(0)}>{t('back')}</Button><Button disabled={!categories.length} onClick={() => setStep(2)}>{t('review')}</Button></div>
        </>}
        {(step === 2 || step === 3) && <><legend>{t('permissions')}</legend>
          <p>{t('selection', { courses: courses.length, categories: categories.length })}</p>
          <ul>{access.courses.filter((course) => courses.includes(course.id)).map((course) => <li key={course.id}>{course.name}</li>)}</ul>
          <ul>{categories.map((category) => <li key={category}>{t(category)}</li>)}</ul><p>{t('forbidden')}</p>
          <div className="agent-setup-actions">
            <Button variant="outline" onClick={() => setStep(1)}>{t('edit')}</Button>
            {step === 2 && <Button onClick={() => void save()}>{busy ? t('saving') : t('activate')}</Button>}
            {step === 3 && state?.enabled && <Button onClick={() => void copy()}>{t('copy')}</Button>}
          </div>
        </>}
      </fieldset>
      {state?.enabled && <Button variant="outline" disabled={busy || !canWrite} onClick={() => void revoke()}>{t('revoke')}</Button>}
    </>}
    {message && <p role={failed ? 'alert' : 'status'}>{message}</p>}
  </section>
}
