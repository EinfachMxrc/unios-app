// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import i18n from '@/i18n'
import releaseUpdates from '@/i18n/locales/de/releaseUpdates'
import { DesktopReleaseUpdates } from './DesktopReleaseUpdates'

const bridge = vi.hoisted(() => ({ invoke: vi.fn(), snapshot: vi.fn(), relaunch: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: bridge.invoke }))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: bridge.relaunch }))
vi.mock('@/components/ReleaseSafetyPanel', () => ({ snapshotBeforeUpdate: bridge.snapshot }))
vi.mock('@/hooks/host', () => ({ useWritableHost: () => true }))
vi.mock('@/lib/desktop', () => ({ isDesktopApp: () => true }))
i18n.addResourceBundle('de', 'releaseUpdates', releaseUpdates)

beforeEach(() => {
  vi.stubEnv('VITE_UNIOS_UPDATES_ENABLED', 'true')
  bridge.invoke.mockReset()
  bridge.snapshot.mockReset()
  bridge.relaunch.mockReset()
  bridge.invoke.mockResolvedValue({
    available: true,
    version: '0.1.19',
    channel: 'stable',
    notes: '',
    schema_change: false,
  })
  bridge.snapshot.mockResolvedValue({ status: 'ok', created_at: new Date().toISOString() })
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllEnvs()
})

it('does not expose updates in unsigned builds', () => {
  vi.stubEnv('VITE_UNIOS_UPDATES_ENABLED', 'false')
  const result = render(<DesktopReleaseUpdates />)
  expect(result.container.textContent).toBe('')
  expect(bridge.invoke).not.toHaveBeenCalled()
})
it('fails closed before native install when snapshot fails', async () => {
  bridge.snapshot.mockRejectedValue(new Error('fictional backup failure'))
  render(<DesktopReleaseUpdates />)
  fireEvent.click(screen.getByRole('button', { name: releaseUpdates.check }))
  fireEvent.click(await screen.findByRole('button', { name: releaseUpdates.install }))
  await waitFor(() => expect(bridge.snapshot).toHaveBeenCalledOnce())
  expect(bridge.invoke).toHaveBeenCalledOnce()
  expect(bridge.relaunch).not.toHaveBeenCalled()
})
it('clears checked version on channel change and installs only after snapshot', async () => {
  const steps: string[] = []
  bridge.snapshot.mockImplementation(async () => {
    steps.push('snapshot')
    return { status: 'ok' }
  })
  bridge.invoke.mockImplementation(async (command: string) => {
    if (command === 'install_release_update') {
      steps.push('install')
      return
    }
    return { available: true, version: '0.1.19', channel: 'beta', notes: '', schema_change: false }
  })
  render(<DesktopReleaseUpdates />)
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'beta' } })
  fireEvent.click(screen.getByRole('button', { name: releaseUpdates.check }))
  await screen.findByRole('button', { name: releaseUpdates.install })
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'nightly' } })
  expect(screen.queryByRole('button', { name: releaseUpdates.install })).toBeNull()
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'beta' } })
  fireEvent.click(screen.getByRole('button', { name: releaseUpdates.check }))
  fireEvent.click(await screen.findByRole('button', { name: releaseUpdates.install }))
  await waitFor(() => expect(bridge.relaunch).toHaveBeenCalledOnce())
  expect(steps).toEqual(['snapshot', 'install'])
  expect(bridge.invoke).toHaveBeenLastCalledWith('install_release_update', { channel: 'beta', version: '0.1.19' })
})
