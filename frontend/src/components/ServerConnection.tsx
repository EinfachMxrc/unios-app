// SPDX-License-Identifier: AGPL-3.0-or-later

import { clearWorkspace } from '@/lib/workspaceState'
import { useContext, useState, type ReactNode } from 'react'
import { useIsRestoring, useQuery } from '@tanstack/react-query'
import { Server, CheckCircle2 } from 'lucide-react'
import { useT } from '@/i18n/useT'
import { Panel, Loading } from '@/components/State'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/FormField'
import { ActionFeedback } from '@/components/ActionFeedback'
import { persister, queryClient } from '@/offlineCache'
import { clearCourseOfflineData } from '@/lib/courseOffline'
import { DevicesPanel } from '@/components/DevicesPanel'
import { OnboardingPage } from '@/pages/OnboardingPage'
import { restartNativeBackend } from '@/lib/releaseModes'
import { isDesktopApp } from '@/lib/desktop'
import { RuntimeModeContext, runtimeWritesAllowed, useRuntimeVerified } from '@/lib/runtimeAccess'
import { withManualBindingChange, manualWebLocksAvailable } from '@/lib/manualDraftCoordination'
import { prepareManualBindingChange, cancelRejectedManualBindingChange } from '@/lib/manualDraftPersistence'
import { settleManualWorkspaceReset } from '@/manualCardDraft'

type ClientState = { mode: 'client'; configured: boolean; server_url: string; keyring_available: boolean }

function useClientState() {
  const mode = useContext(RuntimeModeContext)
  const client = mode === null || mode === 'client'
  const query = useQuery({
    queryKey: ['native-client-status'],
    queryFn: async (): Promise<ClientState | null> => {
      const response = await fetch('/api/client/status')
      if (response.status === 404) return null
      if (!response.ok) throw new Error('CLIENT_STATUS_UNAVAILABLE')
      return response.json() as Promise<ClientState>
    },
    retry: false,
    // A local desktop endpoint remains reachable without external connectivity.
    networkMode: 'always',
    staleTime: 60_000,
    enabled: client,
  })
  return { ...query, data: client ? query.data : null, isPending: client && query.isPending }
}

export function ServerConnectionPanel({ state }: { state: ClientState }) {
  const { t } = useT('serverConnection')
  const verified = useRuntimeVerified()
  const [url, setUrl] = useState(state.server_url)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [renew, setRenew] = useState(false)
  async function pair(event: React.FormEvent) {
    event.preventDefault()
    if (!runtimeWritesAllowed()) {
      setError(t('unavailable'))
      return
    }
    setBusy(true)
    setError('')
    try {
      await withManualBindingChange(async () => {
        const fence = manualWebLocksAvailable() ? await prepareManualBindingChange() : null
        const response = await fetch('/api/client/pair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ server_url: url.trim(), pairing_secret: code.trim(), label: t('deviceLabel') }),
        })
        if (!response.ok) {
          if (response.status === 401 && fence) await cancelRejectedManualBindingChange(fence)
          setError(
            response.status === 401 ? t('invalidCode') : response.status === 409 ? t('bindingError') : t('unavailable'),
          )
          return
        }
        await clearCourseOfflineData()
        // Cached reads belong to the pairing that fetched them. Cancel them
        // before removing persistence so late responses cannot refill old data.
        await queryClient.cancelQueries({ queryKey: ['api'] })
        queryClient.removeQueries({ queryKey: ['api'] })
        await persister.removeClient()
        clearWorkspace()
        await settleManualWorkspaceReset()
        setCode('')
        await queryClient.invalidateQueries({ queryKey: ['native-client-status'] })
        await queryClient.invalidateQueries({ queryKey: ['api'] })
        setRenew(false)
      })
    } catch {
      setError(t('unavailable'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Panel title={t('title')}>
      <div className="flex items-start gap-3 mb-5">
        <Server size={24} className="shrink-0 mt-1" />
        <p className="muted-text">{t('description')}</p>
      </div>
      {state.configured && !renew ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2">
            <CheckCircle2 size={18} />
            {t('paired')}
          </p>
          <p className="muted-text break-all">{state.server_url}</p>
          <p className="muted-text">{t('offlineHint')}</p>
          <Button variant="outline" onClick={() => setRenew(true)}>
            {t('renew')}
          </Button>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            void pair(event)
          }}
          className="space-y-4"
        >
          <FormField label={t('address')} required>
            {(control) => (
              <input
                {...control}
                className="native-input"
                type="url"
                value={url}
                readOnly={Boolean(state.server_url)}
                onChange={(event) => setUrl(event.target.value)}
                autoComplete="url"
                placeholder="https://…"
                disabled={busy}
              />
            )}
          </FormField>
          <FormField label={t('code')} hint={t('codeHint')} error={error} required>
            {(control) => (
              <input
                {...control}
                className="native-input"
                type="password"
                value={code}
                onChange={(event) => {
                  setCode(event.target.value)
                  setError('')
                }}
                autoComplete="off"
                disabled={busy}
              />
            )}
          </FormField>
          {!state.keyring_available && <ActionFeedback tone="error" message={t('keyringUnavailable')} />}
          <Button type="submit" disabled={!verified || busy || !state.keyring_available || !url || !code}>
            {busy ? t('connecting') : t('connect')}
          </Button>
          {state.configured && (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setRenew(false)}>
              {t('cancel')}
            </Button>
          )}
        </form>
      )}
    </Panel>
  )
}

export function ClientSettings() {
  const { data } = useClientState()
  return data?.mode === 'client' ? (
    <>
      <ServerConnectionPanel state={data} />
      <DevicesPanel />
    </>
  ) : null
}

/** Records the choice in the companion service, then restarts it as the full local app. */
async function useLocal(): Promise<void> {
  const response = await fetch('/api/client/use-local', { method: 'POST' })
  if (!response.ok) throw new Error('USE_LOCAL_FAILED')
  await restartNativeBackend('normal')
}

export function ClientGate({ children }: { children: ReactNode }) {
  const status = useClientState()
  const restoring = useIsRestoring()
  const { t } = useT('serverConnection')
  const [connect, setConnect] = useState(false)
  if (restoring || status.isPending) return <Loading />
  if (status.data?.mode === 'client' && !status.data.configured && !connect)
    return (
      <OnboardingPage
        onStartDemo={() => restartNativeBackend('demo')}
        onConnect={() => setConnect(true)}
        onUseLocal={isDesktopApp() ? useLocal : undefined}
        demoAvailable={isDesktopApp()}
      />
    )
  if (status.data?.mode === 'client' && !status.data.configured)
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <p className="muted-text mb-2">{t('welcome')}</p>
        <h1 className="text-3xl font-semibold mb-8">{t('heading')}</h1>
        <ServerConnectionPanel state={status.data} />
      </main>
    )
  return children
}
