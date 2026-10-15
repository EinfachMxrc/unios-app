// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useT } from '@/i18n/useT'
import { localDate, request, useApi } from '@/api'
import { Shell } from '@/components/Shell'
import { Button } from '@/components/ui/button'
import { Empty, Failure, Loading } from '@/components/State'
import { safeAddonHref, type AddonView } from '@/addons/types'
import { extractApiErrorMessage } from '@/hooks/useApiMutation'
import './addons.css'

function FocusTimer({ duration, breakMinutes }: { duration: number; breakMinutes: number }) {
  const { t } = useT('addons')
  const [phase, setPhase] = useState<'work' | 'break'>('work')
  const [pausedSeconds, setPausedSeconds] = useState(duration * 60)
  const [deadline, setDeadline] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (deadline === null) return
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [deadline])
  const seconds = deadline === null ? pausedSeconds : Math.max(0, Math.ceil((deadline - now) / 1000))
  const finished = deadline !== null && seconds === 0

  function pause() {
    setPausedSeconds(seconds)
    setDeadline(null)
  }
  function start() {
    const remaining = seconds || (phase === 'work' ? duration : breakMinutes) * 60
    setPausedSeconds(remaining)
    setNow(Date.now())
    setDeadline(Date.now() + remaining * 1000)
  }
  function switchPhase() {
    const next = phase === 'work' ? 'break' : 'work'
    setPhase(next)
    setDeadline(null)
    setPausedSeconds((next === 'work' ? duration : breakMinutes) * 60)
  }
  function reset() {
    setDeadline(null)
    setPausedSeconds((phase === 'work' ? duration : breakMinutes) * 60)
  }

  return (
    <div className="addon-timer">
      <p className="addon-widget-kicker">{phase === 'work' ? t('focusTimerLabel') : t('breakLabel')}</p>
      <strong role="timer" aria-label={t('timerRemainingAria', { minutes: Math.floor(seconds / 60), seconds: seconds % 60 })}>
        {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}
      </strong>
      {finished && <p role="status">{t('timeUpMessage')}</p>}
      <div className="addon-timer-actions">
        <Button onClick={deadline === null ? start : pause}>{deadline === null ? t('startButton') : t('pauseButton')}</Button>
        <Button variant="outline" onClick={reset}>
          {t('resetButton')}
        </Button>
        <Button variant="outline" onClick={switchPhase}>
          {phase === 'work' ? t('startBreakButton') : t('continueWorkingButton')}
        </Button>
      </div>
    </div>
  )
}

export function AddonPage() {
  const { id } = useParams()
  return <AddonContent key={id} />
}

function AddonContent() {
  const { t } = useT('addons')
  const { id } = useParams()
  const { data, error, loading } = useApi<AddonView>(`/api/addons/pages/${encodeURIComponent(id ?? '')}`, {
    enabled: Boolean(id),
  })
  const [output, setOutput] = useState<{ title: string; body: string; fingerprint: string } | null>(null)
  const [running, setRunning] = useState(false)
  const [failure, setFailure] = useState('')
  const [executionFingerprint, setExecutionFingerprint] = useState('')
  async function execute() {
    if (!data) return
    const fingerprint = data.fingerprint
    if (!fingerprint) return
    setExecutionFingerprint(fingerprint)
    setRunning(true); setFailure('')
    try { const result = await request<{ title: string; body: string }>(`/api/addons/${encodeURIComponent(id ?? '')}/execute`, { method: 'POST', body: JSON.stringify({ fingerprint }) }); setOutput({ ...result, fingerprint }) }
    catch (cause) { setFailure(extractApiErrorMessage(cause)) }
    finally { setRunning(false) }
  }
  return (
    <Shell title={data?.title ?? t('defaultAddonTitle')}>
      <Link className="addon-back" to="/addons">
        {t('backToAllAddons')}
      </Link>
      {loading && !data && <Loading />}
      {error && <Failure message={error} />}
      {data && (
        <section className="addon-page-content" key={data.fingerprint}>
          <p className="addon-widget-kicker">{t('widgetKicker')}</p>
          <h2>{data.title}</h2>
          {data.runtime === 'wasm' && <><p>{t('wasmLimits')}</p><Button disabled={running} onClick={() => void execute()}>{running ? t('running') : t('execute')}</Button></>}
          {failure && executionFingerprint === data.fingerprint && <p role="alert">{failure}</p>}
          {output && output.fingerprint === data.fingerprint && <section role="status"><h3>{output.title}</h3><p className="whitespace-pre-wrap">{output.body}</p></section>}
          {data.body && <p>{data.body}</p>}
          {data.view === 'focus_timer' && (
            <FocusTimer duration={data.duration_minutes ?? 25} breakMinutes={data.break_minutes ?? 5} />
          )}
          {(data.view === 'courses' || data.view === 'study_blocks') &&
            (data.items?.length ? (
              <ul className="addon-page-list">
                {data.items.map((item, index) => {
                  const href = safeAddonHref(item.href)
                  return (
                    <li key={`${item.href}-${index}`}>
                      {href ? <Link to={href}>{item.label}</Link> : <span>{item.label}</span>}
                      {item.detail && <small>{localDate(item.detail)}</small>}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <Empty title={t('noEntriesTitle')} text={t('noEntriesDetail')} />
            ))}
        </section>
      )}
    </Shell>
  )
}
