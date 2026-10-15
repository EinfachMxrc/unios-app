// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Plus, WandSparkles } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { request, useApi, localDate } from '@/api'
import { Shell } from '@/components/Shell'
import { Button } from '@/components/ui/button'
import { useWritableHost } from '@/hooks/host'
import type { CoursesResponse } from '@/types'
import { Failure, Loading } from '@/components/State'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'
import './RulesPage.css'

type Trigger = 'new_material' | 'deadline_soon' | 'weak_topic'
type Action = 'pin' | 'notify' | 'pin_notify'
type Config = { name: string; trigger: Trigger; action: Action; course_id: number | null;
  days: number | null; max_percent: number | null; enabled: boolean }
type Rule = Config & { id: number; revision: number }
type Preview = { total: number; items: Array<{ object_id: string; object_type: string; title: string;
  course_name: string | null; url: string }>; action_description: string }
type Audit = { id: number; rule_id: number; rule_name: string; title: string; url: string;
  action: Action; created_at: string; undone_at: string | null }

const initial: Config = { name: '', trigger: 'new_material', action: 'pin', course_id: null,
  days: 1, max_percent: null, enabled: false }

export function RulesPage() {
  const { t } = useT('rules')
  const triggerNames: Record<Trigger, string> = { new_material: t('triggerNewMaterial'), deadline_soon: t('triggerDeadlineSoon'),
    weak_topic: t('triggerWeakTopic') }
  const canWrite = useWritableHost()
  const { data: rules, error: rulesInitialError, refreshError: rulesRefreshError, loading: rulesLoading, reload: reloadRules } = useApi<Rule[]>('/api/rules')
  const { data: audit, error: auditInitialError, refreshError: auditRefreshError, loading: auditLoading, reload: reloadAudit } = useApi<Audit[]>('/api/rules/audit')
  const rulesError = rulesInitialError ?? rulesRefreshError
  const auditError = auditInitialError ?? auditRefreshError
  const { data: courses } = useApi<CoursesResponse>('/api/courses?all_semesters=true')
  const [selected, setSelected] = useState<Rule | null>(null)
  const [config, setConfig] = useState<Config>(initial)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [initialized, setInitialized] = useState(false)
  const generation = useRef(0)
  const selection = useRef<number | null>(null)
  const dirty = !!selected && (Object.keys(initial) as Array<keyof Config>).some(key => config[key] !== selected[key])

  useEffect(() => {
    if (rules && !initialized) {
      setInitialized(true)
      if (rules[0]) { selection.current = rules[0].id; setSelected(rules[0]); setConfig(rules[0]) }
    }
  }, [rules, initialized])

  function choose(rule: Rule | null) {
    generation.current += 1; selection.current = rule?.id ?? null
    setSelected(rule); setConfig(rule ?? initial); setPreview(null); setError(''); setMessage('')
  }
  function change<K extends keyof Config>(key: K, value: Config[K]) {
    generation.current += 1
    setConfig((current) => ({ ...current, [key]: value })); setPreview(null); setMessage('')
  }
  function changeTrigger(trigger: Trigger) {
    generation.current += 1
    setConfig({ ...config, trigger, days: trigger === 'weak_topic' ? null : trigger === 'new_material' ? 1 : 7,
      max_percent: trigger === 'weak_topic' ? 70 : null })
    setPreview(null)
  }
  async function showPreview() {
    const ticket = generation.current
    setBusy(true); setError('')
    try { const result = await request<Preview>('/api/rules/preview', { method: 'POST', body: JSON.stringify(config) }); if (ticket === generation.current) setPreview(result) }
    catch (cause) { setError(extractApiErrorMessage(cause)) }
    finally { setBusy(false) }
  }
  async function save() {
    const ticket = generation.current
    const identity = selected?.id ?? null
    setBusy(true); setError(''); setMessage('')
    try {
      const next = await request<Rule>(selected ? `/api/rules/${selected.id}` : '/api/rules', {
        method: selected ? 'PUT' : 'POST',
        body: JSON.stringify({ ...config, ...(selected ? { expected_revision: selected.revision } : {}) }),
      })
      if (selection.current === identity) {
        selection.current = next.id; setSelected(next)
        if (ticket === generation.current) { setConfig(next); setMessage(t('ruleSavedMessage')) }
      }
      reloadRules(); reloadAudit()
    } catch (cause) { setError(extractApiErrorMessage(cause)) }
    finally { setBusy(false) }
  }
  async function run() {
    if (!selected || dirty || busy) return
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await request<{ created: number }>(`/api/rules/${selected.id}/run`, { method: 'POST' })
      setMessage(t('matchesProcessedMessage', { count: result.created }))
      reloadAudit()
    } catch (cause) { setError(extractApiErrorMessage(cause)) }
    finally { setBusy(false) }
  }
  async function disable() {
    if (!selected) return
    setBusy(true); setError('')
    try {
      await request(`/api/rules/${selected.id}`, { method: 'DELETE' })
      choose(null); reloadRules(); setMessage(t('ruleDisabledMessage'))
    } catch (cause) { setError(extractApiErrorMessage(cause)) }
    finally { setBusy(false) }
  }
  async function undo(id: number) {
    setError('')
    try { await request(`/api/rules/audit/${id}/undo`, { method: 'POST' }); reloadAudit() }
    catch (cause) { setError(extractApiErrorMessage(cause)) }
  }

  return <Shell title={t('pageTitle')}>
    <div className="rules-intro"><span>{t('introKicker')}</span><h2>{t('introTitle')}</h2>
      <p>{t('introText')}</p></div>
    <div className="rules-layout"><aside className="rules-list"><div><strong>{t('myRulesTitle')}</strong>
      <button type="button" aria-label={t('newRuleAria')} onClick={() => choose(null)}><Plus size={16} /></button></div>
      {rules?.map((rule) => <button type="button" key={rule.id} className={selected?.id === rule.id ? 'active' : ''}
        onClick={() => choose(rule)}><strong>{rule.name}</strong><small>{triggerNames[rule.trigger]} · {rule.enabled ? t('statusActive') : t('statusPaused')}</small></button>)}
      {rulesError && <Failure message={rulesError} retry={reloadRules} />}
      {rulesLoading && !rules ? <Loading /> : !rulesError && !rules?.length && <p>{t('noRulesText')}</p>}
    </aside><div className="rules-main"><section className="rules-builder">
      <div className="rules-builder-header"><WandSparkles size={18} /><div><strong>{selected ? t('editRuleTitle') : t('newRuleTitle')}</strong>
        <span>{t('builderHint')}</span></div></div>
      <label>{t('nameLabel')}<input value={config.name} maxLength={120} placeholder={t('namePlaceholder')}
        onChange={(event) => change('name', event.target.value)} /></label>
      <div className="rules-when"><span>{t('whenLabel')}</span><div className="rules-fields"><label>{t('triggerLabel')}<select className="native-select"
        value={config.trigger} onChange={(event) => changeTrigger(event.target.value as Trigger)}>
        {Object.entries(triggerNames).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>{t('courseLabel')}<select className="native-select" value={config.course_id ?? ''}
          onChange={(event) => change('course_id', event.target.value ? Number(event.target.value) : null)}>
          <option value="">{t('allCoursesOption')}</option>{courses?.courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}</select></label>
        {config.trigger === 'weak_topic' ? <label>{t('belowMeasurementLabel')}<input type="number" min="0" max="100" value={config.max_percent ?? 70}
          onChange={(event) => change('max_percent', Number(event.target.value))} />%</label>
          : <label>{config.trigger === 'new_material' ? t('fromLastDaysLabel') : t('dueInDaysLabel')}<input type="number"
            min="1" max="30" value={config.days ?? 1} onChange={(event) => change('days', Number(event.target.value))} /></label>}</div></div>
      <div className="rules-then"><span>{t('thenLabel')}</span><label>{t('actionLabel')}<select className="native-select" value={config.action}
        onChange={(event) => change('action', event.target.value as Action)}><option value="pin">{t('actionPin')}</option>
        <option value="notify">{t('actionNotify')}</option><option value="pin_notify">{t('actionPinNotify')}</option></select></label>
        <small>{t('actionHint')}</small></div>
      <label className="rules-enabled"><input type="checkbox" checked={config.enabled}
        onChange={(event) => change('enabled', event.target.checked)} /> {t('enabledLabel')}</label>
      <div className="rules-actions"><Button variant="outline" disabled={busy || !config.name.trim()} onClick={() => void showPreview()}>
        {t('dryRunButton')}</Button><Button disabled={!canWrite || busy || !config.name.trim()} onClick={() => void save()}>
        {selected ? t('saveChangesButton') : t('saveRuleButton')}</Button>
        {selected && <><Button variant="ghost" disabled={!canWrite || busy || dirty} onClick={() => void run()}>{t('runNowButton')}</Button>
          <Button variant="ghost" disabled={!canWrite || busy} onClick={() => void disable()}>{t('disableButton')}</Button></>}</div>
      {error && <p role="alert" className="text-destructive">{error}</p>}{message && <p role="status">{message}</p>}
      {dirty && <p role="status">{t('saveBeforeRun')}</p>}
    </section>
      {preview && <section className="rules-preview"><div><h3>{t('previewTitle')}</h3><span>{t('matchingResultsLabel', { count: preview.total })}</span></div>
        <p>{t('actionDescriptionLabel', { description: preview.action_description })}</p>{preview.items.map((item) => <div key={`${item.object_type}-${item.object_id}`}>
          <Link to={item.url}>{item.title} <ArrowRight size={13} /></Link><small>{item.course_name ?? t('noCourseLabel')}</small></div>)}
        {!preview.total && <p>{t('noMatchesText')}</p>}</section>}
      <section className="rules-audit"><h3>{t('historyTitle')}</h3>{audit?.map((item) => <div key={item.id}>
        <div><small>{localDate(item.created_at)}</small><strong>{item.rule_name}</strong><Link to={item.url}>{item.title}</Link></div>
        {item.undone_at ? <span>{t('pinRemovedText')}</span> : item.action !== 'notify' && <button type="button" disabled={!canWrite}
          onClick={() => void undo(item.id)}>{t('removePinButton')}</button>}</div>)}
        {auditError && <Failure message={auditError} retry={reloadAudit} />}
        {auditLoading && !audit ? <Loading /> : !auditError && !audit?.length && <p>{t('noHistoryText')}</p>}</section>
    </div></div>
  </Shell>
}
