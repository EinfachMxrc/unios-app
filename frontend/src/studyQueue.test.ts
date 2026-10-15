// SPDX-License-Identifier: AGPL-3.0-or-later

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// idb-keyval needs a real IndexedDB, which jsdom does not provide. Replace it
// with an in-memory stand-in so the module-under-test's "storage available"
// branch runs in tests instead of always falling back to "no storage".
const memory = new Map<string, unknown>()
let databaseWrites: Promise<unknown> = Promise.resolve()
function copy(value: unknown) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}
vi.mock('idb-keyval', () => ({
  createStore: () => 'store-token',
  // IDB returns a structured clone, never a shared in-memory array reference.
  get: vi.fn(async (key: string) => copy(memory.get(key))),
  set: vi.fn(async (key: string, value: unknown) => {
    memory.set(key, copy(value))
  }),
  update: vi.fn((key: string, updater: (value: unknown) => unknown) => {
    const next = databaseWrites.then(() => { memory.set(key, copy(updater(copy(memory.get(key))))) })
    databaseWrites = next.catch(() => undefined)
    return next
  }),
}))

describe('studyQueue (offline review queue)', () => {
  beforeEach(() => {
    memory.clear()
    databaseWrites = Promise.resolve()
    vi.stubGlobal('indexedDB', {})
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('queues a review while offline and reports it as pending', async () => {
    const { queueReview, pendingReviewCount } = await import('./studyQueue')
    const { markHostReachable } = await import('./hostAvailability')
    markHostReachable(false)
    const result = await queueReview(42, 3)
    expect(result.pending).toBe(1)
    expect(result.estimate).toBeInstanceOf(Date)
    await expect(pendingReviewCount()).resolves.toBe(1)
  })

  it('durably queues ratings without crypto.randomUUID', async () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })
    const { queueReview } = await import('./studyQueue')
    const result = await queueReview(42, 3)
    expect(result.review.review_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(memory.get('pending-v1')).toEqual([result.review])
  })

  it('accumulates several queued reviews in order', async () => {
    const { queueReview, pendingReviewCount } = await import('./studyQueue')
    const { markHostReachable } = await import('./hostAvailability')
    markHostReachable(false)
    await queueReview(1, 2)
    await queueReview(2, 4)
    await expect(pendingReviewCount()).resolves.toBe(2)
  })

  it('preserves concurrent offline ratings from independent window modules', async () => {
    const first = await import('./studyQueue')
    vi.resetModules()
    const second = await import('./studyQueue')
    await Promise.all([first.queueReview(11, 2, undefined, 42), second.queueReview(22, 4, undefined, 43)])
    expect(await first.pendingReviewCount()).toBe(2)
    expect(new Set(await second.pendingReviewCardIds())).toEqual(new Set([11, 22]))
    const durable = memory.get('pending-v1') as Array<{ review_id: string }>
    expect(new Set(durable.map(entry => entry.review_id)).size).toBe(2)
  })

  it('preserves another window append while acknowledging only the old review UUID', async () => {
    const first = await import('./studyQueue')
    const { markHostReachable, markHostVerified } = await import('./hostAvailability')
    const { setRuntimeVerified } = await import('./lib/runtimeAccess')
    await first.queueReview(11, 2, undefined, 42)
    markHostReachable(true); markHostVerified(1); setRuntimeVerified(true)
    let release!: (value: unknown) => void
    const held = new Promise(resolve => { release = resolve })
    const fetcher = vi.fn().mockReturnValueOnce(held).mockResolvedValue({
      ok: false, status: 503, json: async () => ({ detail: 'Synthetisch später fortsetzen' }),
    })
    vi.stubGlobal('fetch', fetcher)
    const flushing = first.flushReviews()
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    vi.resetModules()
    const second = await import('./studyQueue')
    const appending = second.queueReview(22, 4, undefined, 43)
    release({ ok: true })
    await appending
    await expect(flushing).rejects.toThrow('Synthetisch später fortsetzen')
    expect(await second.pendingReviewCardIds()).toEqual([22])
    expect(await second.pendingReviewCount()).toBe(1)
  })

  it('retains the exact pending UUID if its acknowledgement transaction aborts', async () => {
    const { queueReview, flushReviews, pendingReviewCount } = await import('./studyQueue')
    await queueReview(11, 3, undefined, 42)
    const durable = copy(memory.get('pending-v1'))
    const { markHostReachable, markHostVerified } = await import('./hostAvailability')
    const { setRuntimeVerified } = await import('./lib/runtimeAccess')
    markHostReachable(true); markHostVerified(1); setRuntimeVerified(true)
    const fetcher = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetcher)
    const { update } = await import('idb-keyval')
    const originalUpdate = vi.mocked(update).getMockImplementation()!
    vi.mocked(update).mockImplementationOnce(originalUpdate)
      .mockRejectedValueOnce(new Error('Synthetisch abgebrochene IDB-Transaktion'))
    await expect(flushReviews()).rejects.toThrow('Synthetisch abgebrochene IDB-Transaktion')
    expect(memory.get('pending-v1')).toEqual((durable as object[]).map(entry => ({ ...entry, upload_started: true })))
    expect(await pendingReviewCount()).toBe(1)
    expect(await flushReviews()).toBe(0)
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual(JSON.parse(fetcher.mock.calls[0][1].body))
  })

  it('does not replace an unreadable queue with a falsely empty one', async () => {
    const malformed = { recovery: 'Synthetischer unlesbarer Bestand' }
    memory.set('pending-v1', malformed)
    const { queueReview, pendingReviewCount } = await import('./studyQueue')
    await expect(queueReview(11, 3)).rejects.toThrow()
    await expect(pendingReviewCount()).rejects.toThrow()
    expect(memory.get('pending-v1')).toEqual(malformed)
  })

  it('persists a parent scope and restores pending card IDs across module reload', async () => {
    const { queueReview } = await import('./studyQueue')
    await queueReview(7, 3, undefined, 42)
    await queueReview(8, 2)
    const entries = memory.get('pending-v1') as { card_id: number; study_deck_id?: number }[]
    expect(entries[0]).toMatchObject({ card_id: 7, study_deck_id: 42 })
    expect(entries[1]).not.toHaveProperty('study_deck_id')
    vi.resetModules()
    const { pendingReviewCardIds } = await import('./studyQueue')
    expect(await pendingReviewCardIds()).toEqual([7, 8])
  })

  it('rejects invalid new scope IDs before persisting an unreplayable review', async () => {
    const { queueReview, pendingReviewCount } = await import('./studyQueue')
    await expect(queueReview(7, 3, undefined, 0)).rejects.toThrow()
    await expect(queueReview(7, 3, undefined, 1.5)).rejects.toThrow()
    expect(await pendingReviewCount()).toBe(0)
  })

  it('replays legacy entries unchanged and invalidates all deck reads once after a batch', async () => {
    const legacy = { card_id: 1, rating: 3, review_id: crypto.randomUUID(), offline: true,
      reviewed_at: '2026-10-07T12:00:00Z' }
    memory.set('pending-v1', [legacy])
    const { queueReview, flushReviews } = await import('./studyQueue')
    await queueReview(2, 4, undefined, 42)
    const { markHostReachable, markHostVerified } = await import('./hostAvailability')
    const { setRuntimeVerified } = await import('./lib/runtimeAccess')
    const { queryClient } = await import('./offlineCache')
    markHostReachable(true); markHostVerified(1); setRuntimeVerified(true)
    const paths = ['/api/anki/study/due', '/api/anki/study/due?deck=Uni%3A%3AA',
      '/api/anki/study/due?deck=Uni%3A%3AB', '/api/anki/study/stats', '/api/anki/study/status',
      '/api/learning/topics', '/api/learning/weekly', '/api/learning/cycles', '/api/overview', '/api/courses']
    paths.forEach(path => queryClient.setQueryData(['api', path], { synthetic: true }))
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const fetcher = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetcher)
    expect(await flushReviews()).toBe(0)
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(legacy)
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({ card_id: 2, study_deck_id: 42 })
    expect(invalidate).toHaveBeenCalledTimes(1)
    paths.forEach(path => expect(queryClient.getQueryState(['api', path])?.isInvalidated).toBe(path !== '/api/courses'))
    queryClient.clear()
  })

  it('invalidates deck snapshots after partial replay while retaining the failed review', async () => {
    const { queueReview, flushReviews, pendingReviewCardIds } = await import('./studyQueue')
    await queueReview(1, 3, undefined, 42)
    await queueReview(2, 3, undefined, 42)
    const { markHostReachable, markHostVerified } = await import('./hostAvailability')
    const { setRuntimeVerified } = await import('./lib/runtimeAccess')
    const { queryClient } = await import('./offlineCache')
    markHostReachable(true); markHostVerified(1); setRuntimeVerified(true)
    const path = '/api/anki/study/due?deck=Uni%3A%3AB'
    queryClient.setQueryData(['api', path], { synthetic: true })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true })
      .mockResolvedValue({ ok: false, status: 409, json: async () => ({ detail: 'Synthetic order conflict' }) }))
    await expect(flushReviews()).rejects.toThrow('Synthetic order conflict')
    expect(await pendingReviewCardIds()).toEqual([2])
    expect(queryClient.getQueryState(['api', path])?.isInvalidated).toBe(true)
    queryClient.clear()
  })

  it('flushes queued reviews to the host one at a time and drains the queue', async () => {
    const { queueReview, flushReviews } = await import('./studyQueue')
    const { markHostReachable, markHostVerified } = await import('./hostAvailability')
    markHostReachable(false)
    await queueReview(1, 2)
    await queueReview(2, 4)
    markHostReachable(true)
    // A verified lease generation is required for mutations; seed it directly
    // so the flush loop does not also need to mock a GET /api/host round trip.
    markHostVerified(1)
    const { setRuntimeVerified } = await import('./lib/runtimeAccess')
    setRuntimeVerified(true)
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
    const remaining = await flushReviews()
    expect(remaining).toBe(0)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('stops flushing and keeps the remaining queue on a server error', async () => {
    const { queueReview, flushReviews, pendingReviewCount } = await import('./studyQueue')
    const { markHostReachable, markHostVerified } = await import('./hostAvailability')
    markHostReachable(false)
    await queueReview(1, 2)
    await queueReview(2, 4)
    markHostReachable(true)
    markHostVerified(1)
    const { setRuntimeVerified } = await import('./lib/runtimeAccess')
    setRuntimeVerified(true)
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ detail: 'Konflikt' }) })
    vi.stubGlobal('fetch', fetchMock)
    await expect(flushReviews()).rejects.toThrow('Konflikt')
    await expect(pendingReviewCount()).resolves.toBe(2)
  })
  it('keeps queued reviews intact until runtime mode is verified, even with an online host lease', async () => {
    const { queueReview, flushReviews, pendingReviewCount } = await import('./studyQueue')
    const { markHostReachable, markHostVerified } = await import('./hostAvailability')
    markHostReachable(false)
    await queueReview(1, 2)
    markHostReachable(true); markHostVerified(1)
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    expect(await flushReviews()).toBe(1)
    expect(fetcher).not.toHaveBeenCalled()
    expect(await pendingReviewCount()).toBe(1)
  })
  it('allows the next durable rating while HTTP is held and coalesces concurrent flushes', async () => {
    const { queueReview, flushReviews, pendingReviewCount } = await import('./studyQueue')
    const { markHostReachable, markHostVerified } = await import('./hostAvailability')
    const { setRuntimeVerified } = await import('./lib/runtimeAccess')
    markHostReachable(false)
    await queueReview(1, 2)
    markHostReachable(true); markHostVerified(1); setRuntimeVerified(true)
    let release!: (value: unknown) => void
    const held = new Promise(resolve => { release = resolve })
    const fetcher = vi.fn().mockReturnValueOnce(held).mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetcher)
    const flushing = flushReviews()
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    expect(flushReviews()).toBe(flushing)
    await expect(queueReview(2, 4)).resolves.toMatchObject({ pending: 2 })
    expect(await pendingReviewCount()).toBe(2)
    release({ ok: true })
    expect(await flushing).toBe(0)
    expect(fetcher).toHaveBeenCalledTimes(2)
    const bodies = fetcher.mock.calls.map(call => JSON.parse(call[1].body))
    expect(bodies.map(body => body.card_id)).toEqual([1, 2])
    expect(new Set(bodies.map(body => body.review_id)).size).toBe(2)
  })

  it('undoes a never-uploaded last UUID offline and rejects an older UUID without deleting it', async () => {
    const { queueReview, undoReview, pendingReviewCardIds } = await import('./studyQueue')
    const { markHostReachable } = await import('./hostAvailability')
    markHostReachable(false)
    const first = await queueReview(1, 3)
    const second = await queueReview(2, 4)
    await expect(undoReview(first.review)).rejects.toThrow()
    expect(await pendingReviewCardIds()).toEqual([1, 2])
    await expect(undoReview(second.review)).resolves.toEqual({ pending: 1, card: null })
    expect(await pendingReviewCardIds()).toEqual([1])
  })

  it('requires a confirmed host undo once another window has claimed this UUID for upload', async () => {
    const { queueReview, undoReview, pendingReviewCount, flushReviews } = await import('./studyQueue')
    const { markHostReachable, markHostVerified } = await import('./hostAvailability')
    const { setRuntimeVerified } = await import('./lib/runtimeAccess')
    const queued = await queueReview(1, 3)
    markHostReachable(true); markHostVerified(1); setRuntimeVerified(true)
    let release!: (value: unknown) => void
    const held = new Promise(resolve => { release = resolve })
    const fetcher = vi.fn().mockReturnValueOnce(held).mockResolvedValueOnce({ ok: true, status: 200,
      json: async () => ({ review_id: queued.review.review_id, card: null }) })
    vi.stubGlobal('fetch', fetcher)
    const uploading = flushReviews()
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    expect((memory.get('pending-v1') as Array<{ upload_started: boolean }>)[0].upload_started).toBe(true)
    await expect(undoReview(queued.review)).resolves.toEqual({ pending: 0, card: null })
    expect(fetcher.mock.calls[1][0]).toBe('/api/anki/study/reviews/undo')
    release({ ok: false, status: 409, json: async () => ({ detail: 'Canceled UUID' }) })
    expect(await uploading).toBe(0)
    expect(await pendingReviewCount()).toBe(0)
  })

  it('retains an attempted UUID when host undo fails and never replays its canceled intent', async () => {
    const { queueReview, undoReview, flushReviews, pendingReviewCount } = await import('./studyQueue')
    const { markHostReachable, markHostVerified } = await import('./hostAvailability')
    const { setRuntimeVerified } = await import('./lib/runtimeAccess')
    const queued = await queueReview(1, 3)
    memory.set('pending-v1', [{ ...queued.review, upload_started: true }])
    markHostReachable(true); markHostVerified(1); setRuntimeVerified(true)
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 503,
      json: async () => ({ detail: 'Synthetic undo acknowledgement interruption' }) })
    vi.stubGlobal('fetch', fetcher)
    await expect(undoReview(queued.review)).rejects.toThrow('Synthetic undo acknowledgement interruption')
    expect(await pendingReviewCount()).toBe(1)
    await expect(flushReviews()).rejects.toThrow('Synthetic undo acknowledgement interruption')
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[1][0]).toBe('/api/anki/study/reviews/undo')
    expect((memory.get('pending-v1') as Array<{ undo_requested: boolean }>)[0].undo_requested).toBe(true)
  })

  it('preserves the pending UUID if a server returns a different undo identity', async () => {
    const { queueReview, undoReview, pendingReviewCount } = await import('./studyQueue')
    const { markHostReachable, markHostVerified } = await import('./hostAvailability')
    const { setRuntimeVerified } = await import('./lib/runtimeAccess')
    const queued = await queueReview(1, 3)
    memory.set('pending-v1', [{ ...queued.review, upload_started: true }])
    markHostReachable(true); markHostVerified(1); setRuntimeVerified(true)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200,
      json: async () => ({ review_id: 'different-synthetic-uuid', card: null }) }))
    await expect(undoReview(queued.review)).rejects.toThrow()
    expect(await pendingReviewCount()).toBe(1)
  })

  it('preserves a durable undo intent if original answer ACK follows a failed concurrent undo', async () => {
    const { queueReview, undoReview, flushReviews, pendingReviewCount } = await import('./studyQueue')
    const { markHostReachable, markHostVerified } = await import('./hostAvailability')
    const { setRuntimeVerified } = await import('./lib/runtimeAccess')
    const queued = await queueReview(1, 3)
    markHostReachable(true); markHostVerified(1); setRuntimeVerified(true)
    let release!: (value: unknown) => void
    const held = new Promise(resolve => { release = resolve })
    const interrupted = { ok: false, status: 503, json: async () => ({ detail: 'Synthetic undo interruption' }) }
    const fetcher = vi.fn().mockReturnValueOnce(held).mockResolvedValueOnce(interrupted).mockResolvedValueOnce(interrupted)
    vi.stubGlobal('fetch', fetcher)
    const uploading = flushReviews()
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    await expect(undoReview(queued.review)).rejects.toThrow('Synthetic undo interruption')
    release({ ok: true })
    await expect(uploading).rejects.toThrow('Synthetic undo interruption')
    expect(await pendingReviewCount()).toBe(1)
    expect((memory.get('pending-v1') as Array<{ undo_requested: boolean }>)[0].undo_requested).toBe(true)
    expect(fetcher.mock.calls.map(call => call[0])).toEqual([
      '/api/anki/study/reviews', '/api/anki/study/reviews/undo', '/api/anki/study/reviews/undo',
    ])
    fetcher.mockResolvedValueOnce({ ok: true, status: 200,
      json: async () => ({ review_id: queued.review.review_id, card: null }) })
    expect(await flushReviews()).toBe(0)
  })

  it('retires only an exactly confirmed unavailable undo while preserving later reviews', async () => {
    const { queueReview, undoReview, flushReviews, pendingReviewCount } = await import('./studyQueue')
    const { markHostReachable, markHostVerified } = await import('./hostAvailability')
    const { setRuntimeVerified } = await import('./lib/runtimeAccess')
    markHostReachable(true); markHostVerified(1); setRuntimeVerified(true)
    const queued = await queueReview(1, 3)
    const rejected = { ok: false, status: 409, json: async () => ({ code: 'UNDO_UNAVAILABLE',
      detail: `UNDO_UNAVAILABLE:${queued.review.review_id}: Synthetic unchanged applied answer` }) }
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce(rejected)
    vi.stubGlobal('fetch', fetcher)
    expect(await flushReviews()).toBe(0)
    await expect(undoReview(queued.review)).rejects.toThrow('Bewertung bleibt gespeichert')
    expect(await pendingReviewCount()).toBe(0)
    await queueReview(2, 4)
    memory.set('pending-v1', [{ ...queued.review, upload_started: true, undo_requested: true },
      ...(memory.get('pending-v1') as unknown[])])
    fetcher.mockResolvedValueOnce(rejected).mockResolvedValueOnce({ ok: true })
    await expect(flushReviews()).rejects.toThrow('Bewertung bleibt gespeichert')
    expect(await pendingReviewCount()).toBe(1)
    expect(await flushReviews()).toBe(0)
    expect(JSON.parse(fetcher.mock.calls.at(-1)![1].body).card_id).toBe(2)
  })

  it('keeps unavailable responses with a foreign UUID or missing code pending', async () => {
    const { queueReview, undoReview, flushReviews, pendingReviewCount } = await import('./studyQueue')
    const { markHostReachable, markHostVerified } = await import('./hostAvailability')
    const { setRuntimeVerified } = await import('./lib/runtimeAccess')
    markHostReachable(true); markHostVerified(1); setRuntimeVerified(true)
    const queued = await queueReview(1, 3)
    memory.set('pending-v1', [{ ...queued.review, upload_started: true }])
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: false, status: 409,
      json: async () => ({ code: 'UNDO_UNAVAILABLE', detail: 'UNDO_UNAVAILABLE:foreign-uuid: Unknown outcome' }) })
      .mockResolvedValueOnce({ ok: false, status: 409,
        json: async () => ({ detail: `UNDO_UNAVAILABLE:${queued.review.review_id}: Missing typed proof` }) })
    vi.stubGlobal('fetch', fetcher)
    await expect(undoReview(queued.review)).rejects.toThrow('foreign-uuid')
    expect(await pendingReviewCount()).toBe(1)
    await expect(flushReviews()).rejects.toThrow('Missing typed proof')
    expect(await pendingReviewCount()).toBe(1)
  })

  it('persists undo of an already-acknowledged answer through failure, reload and replay', async () => {
    const first = await import('./studyQueue')
    const availability = await import('./hostAvailability')
    const runtime = await import('./lib/runtimeAccess')
    availability.markHostReachable(true); availability.markHostVerified(1); runtime.setRuntimeVerified(true)
    const queued = await first.queueReview(1, 3)
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ detail: 'Synthetic lost undo acknowledgement' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ review_id: queued.review.review_id, card: null }) })
    vi.stubGlobal('fetch', fetcher)
    expect(await first.flushReviews()).toBe(0)
    await expect(first.undoReview(queued.review)).rejects.toThrow('Synthetic lost undo acknowledgement')
    expect(await first.pendingReviewCount()).toBe(1)
    expect(memory.get('pending-v1')).toEqual([{ ...queued.review, upload_started: true, undo_requested: true }])
    vi.resetModules()
    const resumed = await import('./studyQueue')
    const freshAvailability = await import('./hostAvailability')
    const freshRuntime = await import('./lib/runtimeAccess')
    freshAvailability.markHostReachable(true); freshAvailability.markHostVerified(1); freshRuntime.setRuntimeVerified(true)
    expect(await resumed.flushReviews()).toBe(0)
    expect(fetcher.mock.calls.map(call => call[0])).toEqual([
      '/api/anki/study/reviews', '/api/anki/study/reviews/undo', '/api/anki/study/reviews/undo',
    ])
  })

})
