// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef, useState } from 'react'
import { request, notifyConnectionsChanged } from '@/api'
import { useBusyAction } from '@/hooks/useBusyAction'
import { useT, type TypedT } from '@/i18n/useT'
import { openMoodleLoginWindow } from '@/lib/desktop'

type SetupKey = Parameters<TypedT<'setup'>>[0]

/** One setup step at a time: a request that reloads the setup status, or a failure message. */
export function useSetupSteps(reload: () => void) {
  const { t } = useT('setup')
  const { busy, error, setError, run } = useBusyAction()

  /** Runs `action` with the shared busy state; a failure shows `failure`. */
  const guard = (action: () => Promise<void>, failure: SetupKey) => run(action, t(failure))

  function step<T>(path: string, body?: object, after?: (result: T) => void) {
    return guard(async () => {
      const result = await request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) })
      after?.(result)
      reload()
    }, 'stepFailed')
  }

  return { busy, error, setError, guard, step }
}

const LOGIN_ERRORS: Record<string, SetupKey> = {
  expired: 'moodleLoginExpired',
  keychain: 'moodleLoginKeychainFailed',
  service: 'moodleLoginServiceFailed',
}

/**
 * Moodle sign-in: start a login on the official page, open it in a desktop
 * window, and follow the result the native shell reports. A pasted callback or
 * token stays as a fallback for browsers.
 */
export function useMoodleLogin({
  step,
  reload,
  desktop,
}: {
  step: ReturnType<typeof useSetupSteps>['step']
  reload: () => void
  desktop: boolean
}) {
  const { t } = useT('setup')
  const [loginUrl, setLoginUrl] = useState('')
  const [moodleError, setMoodleError] = useState('')
  const [moodlePending, setMoodlePending] = useState(false)
  const [moodleOpening, setMoodleOpening] = useState(false)
  const [moodleWindowOpened, setMoodleWindowOpened] = useState(false)
  const [callback, setCallback] = useState('')
  const [manualToken, setManualToken] = useState('')

  useEffect(() => {
    function loginResult(event: Event) {
      const detail = (event as CustomEvent<{ connected?: boolean; pending?: boolean; error?: string }>).detail
      setMoodlePending(detail?.pending === true)
      if (detail?.pending) {
        setMoodleError('')
        return
      }
      setMoodleError(detail?.connected ? '' : t(LOGIN_ERRORS[detail?.error ?? ''] ?? 'moodleLoginFailed'))
      if (detail?.connected) notifyConnectionsChanged()
      reload()
    }
    window.addEventListener('unios-moodle-login-result', loginResult)
    return () => window.removeEventListener('unios-moodle-login-result', loginResult)
  }, [reload, t])

  async function openLoginWindow(url: string) {
    setMoodleOpening(true)
    setMoodleError('')
    setMoodleWindowOpened(false)
    try {
      await openMoodleLoginWindow(url)
      setMoodleWindowOpened(true)
    } catch {
      setMoodleError(t('loginWindowFailed'))
    } finally {
      setMoodleOpening(false)
    }
  }

  async function startMoodleLogin() {
    setMoodleError('')
    setLoginUrl('')
    await step<{ login_url: string }>('/api/setup/moodle/start', {}, (result) => {
      setLoginUrl(result.login_url)
      if (desktop) void openLoginWindow(result.login_url)
    })
  }

  return {
    loginUrl,
    moodleError,
    moodlePending,
    moodleOpening,
    moodleWindowOpened,
    callback,
    setCallback,
    manualToken,
    setManualToken,
    startMoodleLogin,
  }
}

/** Starts the first sync exactly once, as soon as the program is confirmed and Moodle is connected. */
export function useInitialSync({ ready, reload }: { ready: boolean; reload: () => void }) {
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState(false)
  const started = useRef(false)
  useEffect(() => {
    if (!ready || started.current) return
    started.current = true
    setSyncing(true)
    void request('/api/sync', { method: 'POST' })
      .then(() => setSyncError(false))
      .catch(() => setSyncError(true))
      .finally(() => {
        reload()
        setSyncing(false)
      })
  }, [ready, reload])
  return { syncing, syncError }
}
