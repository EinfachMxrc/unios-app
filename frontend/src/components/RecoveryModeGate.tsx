// SPDX-License-Identifier: AGPL-3.0-or-later
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { Loading } from './State'
import { Button } from './ui/button'
import { useT } from '@/i18n/useT'
import { DemoBanner } from '@/pages/OnboardingPage'
import { restartNativeBackend } from '@/lib/releaseModes'
import type { RecoveryStatus } from '@/pages/RecoveryPage'
import { RuntimeModeContext, setRuntimeVerified, useRuntimeVerified } from '@/lib/runtimeAccess'
import { markHostReachable, markHostUnverified } from '@/hostAvailability'
const RecoveryPage = lazy(() => import('@/pages/RecoveryPage'))
type Mode = 'pending' | 'normal' | 'client' | 'demo' | 'recovery' | 'failed'
const modeKey = 'unios-verified-runtime-mode-v1'
const verifiedModes = ['normal', 'client', 'demo', 'recovery']

/** Keep automatic writers unmounted while only a cached mode is known. */
export function RuntimeVerifiedOnly({ children }: { children: ReactNode }) {
  return useRuntimeVerified() ? children : null
}

/** Must mount before query persistence and all automatic outbox writers. */
export function RecoveryModeGate({ children }: { children: ReactNode }) {
  const { t } = useT('releaseOnboarding')
  const [mode, setMode] = useState<Mode>('pending')
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<RecoveryStatus>({ mode: 'pending' })
  const [readOnly, setReadOnly] = useState(false)
  useEffect(() => {
    setRuntimeVerified(false)
    markHostUnverified()
    const controller = new AbortController()
    let alive = true
    let responded = false
    const timeout = window.setTimeout(() => controller.abort(), 8000)
    void fetch('/api/recovery/status', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        responded = true
        if (response.status === 404) return { mode: 'normal' }
        if (!response.ok) throw new Error('mode unavailable')
        const value = await response.json() as { mode?: string }
        if (!verifiedModes.includes(value.mode ?? '')) throw new Error('unknown mode')
        try { window.localStorage.setItem(modeKey, value.mode!) } catch { /* Offline availability is optional when storage is blocked. */ }
        return value as RecoveryStatus
      }).then((value) => { if (alive) {
        setRuntimeVerified(value.mode !== 'recovery'); setReadOnly(false)
        setStatus(value); setMode(value.mode as Mode)
      } })
      .catch(() => {
        if (!alive) return
        // A browser may still have internet while this server is unreachable. Cached mode permits reads only.
        let cached: string | null = null
        if (!responded) {
          try { cached = window.localStorage.getItem(modeKey) } catch { /* No verified fallback. */ }
        }
        if (cached && verifiedModes.includes(cached)) {
          markHostReachable(false); setReadOnly(true)
          setStatus({ mode: cached }); setMode(cached as Mode)
        } else setMode('failed')
      })
      .finally(() => window.clearTimeout(timeout))
    const retry = () => { setRuntimeVerified(false); markHostUnverified(); setAttempt((value) => value + 1) }
    window.addEventListener('online', retry)
    return () => { alive = false; controller.abort(); window.clearTimeout(timeout); window.removeEventListener('online', retry); setRuntimeVerified(false) }
  }, [attempt])
  if (mode === 'pending') return <Loading />
  if (mode === 'failed') return <main className="release-onboarding"><p role="alert">{t('failed')}</p>
    <Button onClick={() => { setMode('pending'); setAttempt((value) => value + 1) }}>{t('retry')}</Button></main>
  if (mode === 'recovery') return <Suspense fallback={<Loading />}><RecoveryPage status={status} /></Suspense>
  return <RuntimeModeContext.Provider value={mode}>{readOnly && <aside className="release-demo-banner" role="status"><span>{t('cachedReadOnly')}</span><Button variant="outline" onClick={() => { setRuntimeVerified(false); setAttempt((value) => value + 1) }}>{t('retry')}</Button></aside>}{mode === 'demo' && <DemoBanner onExit={() => restartNativeBackend('normal')} />}{children}</RuntimeModeContext.Provider>
}
