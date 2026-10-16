// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { requestResponse } from './api'
import { markHostVerified } from './hostAvailability'
import { setRuntimeVerified } from './lib/runtimeAccess'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  setRuntimeVerified(true)
  markHostVerified(7)
})
afterEach(() => vi.unstubAllGlobals())

it('returns a non-JSON body unread and sends the host lease with the write', async () => {
  fetchMock.mockResolvedValue(new Response('# Lernpaket', { status: 200, headers: { 'Content-Type': 'text/plain' } }))
  const response = await requestResponse('/api/ai/package', { method: 'POST', body: JSON.stringify({ mode: 'cards' }) })
  expect(await response.text()).toBe('# Lernpaket')
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  expect((init.headers as Record<string, string>)['X-UniOS-Lease-Generation']).toBe('7')
  expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
})

it('keeps the offline write lock for package downloads too', async () => {
  setRuntimeVerified(false)
  await expect(requestResponse('/api/ai/package', { method: 'POST', body: '{}' })).rejects.toThrow()
  expect(fetchMock).not.toHaveBeenCalled()
})

it('turns a server refusal into the readable detail', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: 'Kurs nicht freigegeben' }), { status: 403 }))
  await expect(requestResponse('/api/ai/package', { method: 'POST', body: '{}' })).rejects.toThrow(
    'Kurs nicht freigegeben',
  )
})

it('noteStaleHost drops the cached generation for 423 and STALE_HOST, but not for other conflicts', async () => {
  const { noteStaleHost } = await import('./api')
  const { currentVerifiedGeneration } = await import('./hostAvailability')
  await noteStaleHost(new Response('{}', { status: 409 }))
  await noteStaleHost(new Response(JSON.stringify({ detail: 'Version veraltet' }), { status: 409 }))
  expect(currentVerifiedGeneration()).toBe(7)
  await noteStaleHost(new Response(JSON.stringify({ detail: 'STALE_HOST' }), { status: 409 }))
  expect(currentVerifiedGeneration()).toBeNull()
  markHostVerified(7)
  await noteStaleHost(new Response('{}', { status: 423 }))
  expect(currentVerifiedGeneration()).toBeNull()
})
