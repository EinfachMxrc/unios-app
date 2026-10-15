// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { useEffect } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RuntimeModeContext, runtimeWritesAllowed, setRuntimeVerified } from '@/lib/runtimeAccess'
import { RecoveryModeGate } from './RecoveryModeGate'
import { ClientGate, ClientSettings } from './ServerConnection'

vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))
const clients: QueryClient[] = []
beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
afterEach(() => {
  cleanup(); clients.splice(0).forEach(client => client.clear()); onlineManager.setOnline(true)
  localStorage.clear(); setRuntimeVerified(false); vi.unstubAllGlobals(); vi.restoreAllMocks()
})

function renderMode(mode: 'normal' | 'client' | 'demo', cached?: object) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  if (cached) client.setQueryData(['native-client-status'], cached)
  render(<QueryClientProvider client={client}><RuntimeModeContext.Provider value={mode}>
    <ClientGate><div>Available workspace</div></ClientGate><ClientSettings />
  </RuntimeModeContext.Provider></QueryClientProvider>)
}

it('opens a verified normal workspace without probing the absent desktop endpoint', () => {
  renderMode('normal')
  expect(screen.getByText('Available workspace')).toBeTruthy()
  expect(fetch).not.toHaveBeenCalled()
})

it('still discovers configured client state when the startup gate resolved client mode', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ mode: 'client', configured: true,
    server_url: 'https://synthetic.invalid', keyring_available: true }), { status: 200 }))
  // ClientSettings mounts pairing/device UI after a positive result; isolate
  // this startup check from its unrelated device queries.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  render(<QueryClientProvider client={client}><RuntimeModeContext.Provider value="client">
    <ClientGate><div>Available workspace</div></ClientGate>
  </RuntimeModeContext.Provider></QueryClientProvider>)
  expect(screen.queryByText('Available workspace')).toBeNull()
  await waitFor(() => expect(screen.getByText('Available workspace')).toBeTruthy())
  expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/client/status')
})

it('does not let a cached client record gate a newly resolved demo runtime', () => {
  renderMode('demo', { mode: 'client', configured: false, server_url: '', keyring_available: true })
  expect(screen.getByText('Available workspace')).toBeTruthy()
  expect(screen.queryByText('welcome')).toBeNull()
  expect(fetch).not.toHaveBeenCalled()
})

it('opens a configured local client without waiting for the browser to become online', async () => {
  onlineManager.setOnline(false)
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ mode: 'client', configured: true,
    server_url: 'https://synthetic.invalid', keyring_available: true }), { status: 200 }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  render(<QueryClientProvider client={client}><RuntimeModeContext.Provider value="client">
    <ClientGate><div>Available workspace</div></ClientGate>
  </RuntimeModeContext.Provider></QueryClientProvider>)
  await screen.findByText('Available workspace')
  expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/client/status')
})

it('keeps cached client reads available and writes disabled when local status is unreachable offline', async () => {
  onlineManager.setOnline(false)
  localStorage.setItem('unios-verified-runtime-mode-v1', 'client')
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  vi.mocked(fetch).mockRejectedValue(new TypeError('synthetic offline status'))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  render(<QueryClientProvider client={client}><RecoveryModeGate>
    <ClientGate><div>Available workspace</div></ClientGate>
  </RecoveryModeGate></QueryClientProvider>)
  await screen.findByText('Available workspace')
  expect(screen.getByRole('status').textContent).toContain('cachedReadOnly')
  expect(runtimeWritesAllowed()).toBe(false)
  expect(vi.mocked(fetch).mock.calls.some(([url]) => url === '/api/client/status')).toBe(true)
})

it('waits for persisted reads before mounting background writers in normal mode', async () => {
  const started = vi.fn()
  function BackgroundWriter() { useEffect(() => { started() }, []); return <div>Available workspace</div> }
  let finish!: (value: undefined) => void
  const restore = new Promise<undefined>(resolve => { finish = resolve })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  render(<PersistQueryClientProvider client={client} persistOptions={{ persister: {
    restoreClient: () => restore, persistClient: async () => undefined, removeClient: async () => undefined,
  } }}><RuntimeModeContext.Provider value="normal"><ClientGate><BackgroundWriter /></ClientGate>
  </RuntimeModeContext.Provider></PersistQueryClientProvider>)
  expect(screen.queryByText('Available workspace')).toBeNull()
  expect(started).not.toHaveBeenCalled()
  await act(async () => { finish(undefined) })
  await screen.findByText('Available workspace')
  expect(started).toHaveBeenCalledOnce()
  expect(fetch).not.toHaveBeenCalled()
})
