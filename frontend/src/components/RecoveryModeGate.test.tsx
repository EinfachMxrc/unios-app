// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import i18n from '@/i18n'
import releaseOnboarding from '@/i18n/locales/de/releaseOnboarding'
import { RecoveryModeGate, RuntimeVerifiedOnly } from './RecoveryModeGate'
import { request } from '@/api'
import { markHostVerified } from '@/hostAvailability'
import { runtimeWritesAllowed } from '@/lib/runtimeAccess'
import { HostContext, useWritableHost } from '@/hooks/host'
import type { HostStatus } from '@/types'
vi.mock('@/pages/RecoveryPage', () => ({ default: () => <div data-testid="recovery" /> }))
i18n.addResourceBundle('de', 'releaseOnboarding', releaseOnboarding)
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear() })
function backgroundWork() { return <div data-testid="normal" /> }
it('does not mount background children in recovery and does not use the persistence/API hook', async () => {
  const started = vi.fn()
  function AutomaticWriter() { useEffect(started, []); return backgroundWork() }
  const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ mode: 'recovery' }) })
  vi.stubGlobal('fetch', fetcher)
  render(<RecoveryModeGate><AutomaticWriter /></RecoveryModeGate>)
  expect(await screen.findByTestId('recovery')).toBeTruthy()
  expect(screen.queryByTestId('normal')).toBeNull()
  expect(started).not.toHaveBeenCalled()
  expect(fetcher).toHaveBeenCalledOnce()
  expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'same-origin', cache: 'no-store' })
})
it('keeps writers stopped if mode discovery fails and allows an explicit retry', async () => {
  localStorage.setItem('unios-verified-runtime-mode-v1', 'normal')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValueOnce({ status: 404 }))
  render(<RecoveryModeGate>{backgroundWork()}</RecoveryModeGate>)
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.queryByTestId('normal')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
  expect(await screen.findByTestId('normal')).toBeTruthy()
})
it('restores only a previously verified mode from this origin for offline reading', async () => {
  localStorage.setItem('unios-verified-runtime-mode-v1', 'client')
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
  render(<RecoveryModeGate>{backgroundWork()}</RecoveryModeGate>)
  expect(await screen.findByTestId('normal')).toBeTruthy()
  expect(runtimeWritesAllowed()).toBe(false)
})
it('shows cached reads while the browser stays online, blocks all mutations and starts writers only after verification', async () => {
  localStorage.setItem('unios-verified-runtime-mode-v1', 'normal')
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  const started = vi.fn()
  function AutomaticWriter() { useEffect(started, []); return null }
  function Editor() { return <button disabled={!useWritableHost()}>Änderung speichern</button> }
  const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('server unreachable'))
  vi.stubGlobal('fetch', fetcher)
  render(<RecoveryModeGate>{backgroundWork()}<HostContext.Provider value={{ mode: 'host' } as HostStatus}><Editor /></HostContext.Provider><RuntimeVerifiedOnly><AutomaticWriter /></RuntimeVerifiedOnly></RecoveryModeGate>)
  expect(await screen.findByTestId('normal')).toBeTruthy()
  expect(screen.getByRole('status').textContent).toContain('Gespeicherte Inhalte bleiben lesbar')
  expect(started).not.toHaveBeenCalled()
  // Even a reachable GET and a previously verified host lease cannot grant writes without mode verification.
  fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ mode: 'host', generation: 42 }) })
  await act(async () => { await expect(request('/api/host')).resolves.toEqual({ mode: 'host', generation: 42 }) })
  expect((screen.getByRole('button', { name: 'Änderung speichern' }) as HTMLButtonElement).disabled).toBe(true)
  await expect(request('/api/notes', { method: 'POST', body: '{}' })).rejects.toThrow()
  expect(fetcher).toHaveBeenCalledTimes(2)
  fetcher.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ mode: 'normal' }) })
  fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
  await waitFor(() => expect(started).toHaveBeenCalledOnce())
  expect(runtimeWritesAllowed()).toBe(true)
  expect(screen.queryByRole('status')).toBeNull()
  act(() => { markHostVerified(43) })
  expect((screen.getByRole('button', { name: 'Änderung speichern' }) as HTMLButtonElement).disabled).toBe(false)
  fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 1 }) })
  await expect(request('/api/notes', { method: 'POST', body: '{}' })).resolves.toEqual({ id: 1 })
  expect(fetcher.mock.calls[3][1]).toMatchObject({ method: 'POST' })
})
it('does not invent a mode for an offline first run or override a malformed server response', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
  const first = render(<RecoveryModeGate>{backgroundWork()}</RecoveryModeGate>)
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.queryByTestId('normal')).toBeNull()
  first.unmount()
  localStorage.setItem('unios-verified-runtime-mode-v1', 'normal')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ mode: 'unknown' }) }))
  render(<RecoveryModeGate>{backgroundWork()}</RecoveryModeGate>)
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.queryByTestId('normal')).toBeNull()
})
