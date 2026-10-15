// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useInitialSync, useMoodleLogin, useSetupSteps } from './setupHooks'

const api = vi.hoisted(() => ({ request: vi.fn(), openMoodleLoginWindow: vi.fn(), notifyConnectionsChanged: vi.fn() }))
vi.mock('@/api', () => ({ request: api.request, notifyConnectionsChanged: api.notifyConnectionsChanged }))
vi.mock('@/lib/desktop', () => ({ openMoodleLoginWindow: api.openMoodleLoginWindow }))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))

beforeEach(() => {
  api.request.mockReset()
  api.openMoodleLoginWindow.mockReset()
  api.notifyConnectionsChanged.mockReset()
})
afterEach(cleanup)

function loginResult(detail: object) {
  act(() => {
    window.dispatchEvent(new CustomEvent('unios-moodle-login-result', { detail }))
  })
}

it('refreshes connection warnings after a native sign-in succeeds', () => {
  renderHook(() => useMoodleLogin({ step: vi.fn(), reload: vi.fn(), desktop: true }))
  loginResult({ error: 'expired' })
  loginResult({ pending: true })
  expect(api.notifyConnectionsChanged).not.toHaveBeenCalled()
  loginResult({ connected: true })
  expect(api.notifyConnectionsChanged).toHaveBeenCalledOnce()
})

it('maps each reported Moodle login failure to its own message', () => {
  const reload = vi.fn()
  const { result } = renderHook(() => useMoodleLogin({ step: vi.fn(), reload, desktop: false }))
  loginResult({ error: 'expired' })
  expect(result.current.moodleError).toBe('moodleLoginExpired')
  loginResult({ error: 'keychain' })
  expect(result.current.moodleError).toBe('moodleLoginKeychainFailed')
  loginResult({ error: 'something-new' })
  expect(result.current.moodleError).toBe('moodleLoginFailed')
  loginResult({ pending: true })
  expect(result.current.moodlePending).toBe(true)
  expect(result.current.moodleError).toBe('')
  loginResult({ connected: true })
  expect(result.current.moodleError).toBe('')
  expect(reload).toHaveBeenCalledTimes(4)
})

it('opens the official login window right away in the desktop app', async () => {
  api.request.mockResolvedValue({ login_url: 'https://moodle.example.invalid/login' })
  api.openMoodleLoginWindow.mockResolvedValue(undefined)
  const reload = vi.fn()
  const steps = renderHook(() => useSetupSteps(reload))
  const { result } = renderHook(() => useMoodleLogin({ step: steps.result.current.step, reload, desktop: true }))
  await act(() => result.current.startMoodleLogin())
  expect(result.current.loginUrl).toBe('https://moodle.example.invalid/login')
  await waitFor(() => expect(result.current.moodleWindowOpened).toBe(true))
  expect(api.openMoodleLoginWindow).toHaveBeenCalledWith('https://moodle.example.invalid/login')
})

it('starts the first sync exactly once, even across re-renders, and reports a failure', async () => {
  api.request.mockRejectedValue(new Error('HTTP 503'))
  const reload = vi.fn()
  const { result, rerender } = renderHook((ready: boolean) => useInitialSync({ ready, reload }), {
    initialProps: false,
  })
  expect(api.request).not.toHaveBeenCalled()
  rerender(true)
  rerender(true)
  await waitFor(() => expect(result.current.syncing).toBe(false))
  expect(api.request).toHaveBeenCalledOnce()
  expect(result.current.syncError).toBe(true)
  expect(reload).toHaveBeenCalledOnce()
})

it('shows a step failure and clears it on the next step', async () => {
  const reload = vi.fn()
  const { result } = renderHook(() => useSetupSteps(reload))
  api.request.mockRejectedValueOnce(new Error('HTTP 500')).mockResolvedValueOnce({})
  await act(() => result.current.step('/api/setup/institution', { slug: 'x' }))
  expect(result.current.error).toBe('stepFailed')
  await act(() => result.current.step('/api/setup/institution', { slug: 'x' }))
  expect(result.current.error).toBe('')
  expect(reload).toHaveBeenCalledOnce()
})
