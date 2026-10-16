// SPDX-License-Identifier: AGPL-3.0-or-later

// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

// jsdom has no IndexedDB: an in-memory stand-in keeps the outbox code path active.
const memory = new Map<string, unknown>()
vi.mock('idb-keyval', () => ({
  createStore: () => 'store-token',
  get: vi.fn(async (key: string) => JSON.parse(JSON.stringify(memory.get(key) ?? null))),
  set: vi.fn(async (key: string, value: unknown) => {
    memory.set(key, JSON.parse(JSON.stringify(value)))
  }),
  del: vi.fn(async (key: string) => {
    memory.delete(key)
  }),
  keys: vi.fn(async () => [...memory.keys()]),
}))

const fetchMock = vi.fn()

function pending(id: string, createdAt: string) {
  memory.set(id, { id, kind: 'thought', body: id, created_at: createdAt, course_id: null, note_id: null })
}

beforeEach(() => {
  memory.clear()
  fetchMock.mockReset()
  vi.stubGlobal('indexedDB', {})
  vi.stubGlobal('fetch', fetchMock)
  vi.resetModules()
})
afterEach(() => vi.unstubAllGlobals())

async function setup() {
  const { markHostVerified, markHostReachable } = await import('./hostAvailability')
  const { setRuntimeVerified } = await import('./lib/runtimeAccess')
  setRuntimeVerified(true)
  markHostReachable(true)
  markHostVerified(5)
  const { queryClient } = await import('./offlineCache')
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()
  const availability = await import('./hostAvailability')
  return { invalidate, availability }
}

it('refreshes the jot list when a later entry fails after earlier ones were sent', async () => {
  const { invalidate } = await setup()
  pending('a', '2026-01-01T10:00:00Z')
  pending('b', '2026-01-01T11:00:00Z')
  fetchMock
    .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    .mockResolvedValueOnce(new Response('{}', { status: 500 }))
  const { flushJots, pendingJots } = await import('./jotQueue')
  await flushJots()
  expect((await pendingJots()).map((jot) => jot.id)).toEqual(['b'])
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['api', '/api/jots'] })
})

it('forgets the cached lease generation when the host reports it as stale', async () => {
  const { availability } = await setup()
  pending('a', '2026-01-01T10:00:00Z')
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'STALE_HOST' }), { status: 409 }))
  const { flushJots } = await import('./jotQueue')
  await flushJots()
  expect(availability.currentVerifiedGeneration()).toBeNull()
})
