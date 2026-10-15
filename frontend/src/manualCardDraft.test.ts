// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import type { ManualCardContext, ManualCardInput, ManualCardResponse } from './manualCardTypes'
import type { DraftEnvelope } from './manualDraftTypes'
const mocks = vi.hoisted(() => ({
  disk: new Map<string, unknown>(),
  get: vi.fn(),
  update: vi.fn(),
  request: vi.fn(),
  invalidate: vi.fn(),
}))
vi.mock('idb-keyval', () => ({ createStore: () => 'manual-store', get: mocks.get, update: mocks.update }))
vi.mock('@/api', () => ({ request: mocks.request }))
vi.mock('@/offlineCache', () => ({ queryClient: { invalidateQueries: mocks.invalidate } }))
const context: ManualCardContext = {
  resource_id: 1,
  resource_name: 'Synthetic.pdf',
  course_id: 2,
  course_name: 'Synthetic Course',
  version_id: 17,
  version: 1,
  page: 12,
  quote: 'Original quote',
  annotation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  annotation_revision: 3,
  comment: 'Own question',
  url: '/material/17?page=12',
}
const response: ManualCardResponse = {
  queue_id: 8,
  status: 'approved',
  card: {
    card_type: 'basic',
    front: 'Own question',
    back: 'Original quote',
    course: 'synthetic',
    topic: 'Synthetic',
    confidence: null,
  },
  source: { ...context, sha256: 'synthetic-hash' },
  deck_name: 'Uni::Synthetic Course',
  note_id: null,
  transfer_error: 'Synthetic engine unavailable',
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (cause: unknown) => void
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept
    reject = decline
  })
  return { promise, resolve, reject }
}
async function module() {
  return import('./manualCardDraft')
}
function envelope() {
  return [...mocks.disk.values()].find((value) => (value as DraftEnvelope)?.head) as DraftEnvelope
}
const transactions = new Map<string, Promise<void>>()
async function atomic(key: string, reducer: (previous: unknown) => unknown) {
  const operation = (transactions.get(key) ?? Promise.resolve())
    .catch(() => {})
    .then(() => {
      const next = reducer(structuredClone(mocks.disk.get(key)))
      mocks.disk.set(key, structuredClone(next))
    })
  transactions.set(key, operation)
  await operation
}
beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  mocks.disk.clear()
  transactions.clear()
  vi.clearAllMocks()
  vi.stubGlobal('indexedDB', {})
  vi.stubGlobal('BroadcastChannel', undefined)
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: vi.fn(async (_name, options, callback) => {
        const work = typeof options === 'function' ? options : callback
        return work()
      }),
    },
  })
  mocks.get.mockImplementation(async (key: string) => structuredClone(mocks.disk.get(key)))
  mocks.update.mockImplementation(atomic)
  mocks.request.mockResolvedValue(response)
  mocks.invalidate.mockResolvedValue(undefined)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
it('restores an own durable draft and frozen source after reload', async () => {
  const first = await module()
  await first.openManualDraft(context)
  await first.updateManualDraft(context, {
    front: 'Own edited question',
    back: 'Own answer <T> &\nsecond line',
    topic: 'Topic',
  })
  const draft = first.manualDraftState(context).draft
  vi.resetModules()
  const next = await module()
  await next.openManualDraft({ ...context, page: 17, annotation_revision: 4, quote: 'Moved quote' })
  expect(next.manualDraftState(context).draft).toEqual(draft)
  expect(next.manualDraftState(context).localSaved).toBe(true)
  expect(mocks.request).not.toHaveBeenCalled()
})
it('preserves both stale-window texts durably instead of overwriting the shared head', async () => {
  const a = await module()
  await a.openManualDraft(context)
  vi.resetModules()
  const b = await module()
  await b.openManualDraft(context)
  await a.updateManualDraft(context, { front: 'Window A question' })
  await b.updateManualDraft(context, { front: 'Window B question' })
  expect(b.manualDraftState(context)).toMatchObject({
    phase: 'conflict',
    draft: { front: 'Window B question' },
    localSaved: true,
  })
  expect(envelope().head.draft.front).toBe('Window A question')
  expect(Object.values(envelope().branches).map((copy) => copy.draft.front)).toContain('Window B question')
  vi.resetModules()
  const restored = await module()
  await restored.openManualDraft(context)
  expect(restored.manualDraftState(context).draft.front).toBe('Window A question')
  const copy = restored
    .manualDraftState(context)
    .recoveryCopies.find((copy) => copy.draft.front === 'Window B question')!
  await restored.adoptManualDraftCopy(context, copy.id)
  expect(restored.manualDraftState(context).draft.front).toBe('Window B question')
  expect(
    restored.manualDraftState(context).recoveryCopies.some((copy) => copy.draft.front === 'Window A question'),
  ).toBe(true)
})
it('atomically reserves one initial POST when two isolated windows save the same draft concurrently', async () => {
  const a = await module()
  await a.openManualDraft(context)
  vi.resetModules()
  const b = await module()
  await b.openManualDraft(context)
  const held = deferred<ManualCardResponse>()
  mocks.request.mockReturnValueOnce(held.promise)
  const first = a.saveManualDraft(context),
    second = b.saveManualDraft(context)
  await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1))
  await second
  expect(b.manualDraftState(context).phase).toBe('unconfirmed')
  held.resolve(response)
  await first
  expect(mocks.request).toHaveBeenCalledTimes(1)
})
it('persists the exact payload before POST and lets another window retry the lost ACK with the same UUID', async () => {
  const a = await module()
  await a.openManualDraft(context)
  mocks.request.mockImplementationOnce(async (_path, options) => {
    const payload = JSON.parse(options.body) as ManualCardInput
    expect(envelope().intents[payload.mutation_id].payload).toEqual(payload)
    throw new Error('Synthetic lost response')
  })
  await a.saveManualDraft(context)
  const sent = JSON.parse(mocks.request.mock.calls[0][1].body)
  vi.resetModules()
  const b = await module()
  await b.openManualDraft(context)
  await b.updateManualDraft(context, { front: 'Must remain frozen' })
  await b.saveManualDraft(context)
  expect(JSON.parse(mocks.request.mock.calls[1][1].body)).toEqual(sent)
  expect(b.manualDraftState(context).phase).toBe('saved')
})
it('retains a divergent recovery copy but freezes its adoption while another UUID is unconfirmed', async () => {
  const a = await module()
  await a.openManualDraft(context)
  vi.resetModules()
  const b = await module()
  await b.openManualDraft(context)
  await a.updateManualDraft(context, { front: 'A question' })
  await b.updateManualDraft(context, { front: 'B question' })
  mocks.request.mockRejectedValueOnce(new Error('Lost ACK'))
  await a.saveManualDraft(context)
  await b.openCurrentManualDraft(context)
  const uuid = b.manualDraftState(context).draft.mutationId
  const copy = b.manualDraftState(context).recoveryCopies.find((copy) => copy.draft.front === 'B question')!
  await b.adoptManualDraftCopy(context, copy.id)
  expect(b.manualDraftState(context).draft.mutationId).toBe(uuid)
  expect(b.manualDraftState(context).phase).toBe('unconfirmed')
})
it('does not let a delayed ACK from window A replace the explicitly started second card in B', async () => {
  const a = await module()
  await a.openManualDraft(context)
  const held = deferred<ManualCardResponse>()
  mocks.request.mockReturnValueOnce(held.promise)
  const saving = a.saveManualDraft(context)
  await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1))
  vi.resetModules()
  const b = await module()
  await b.openManualDraft(context)
  await b.saveManualDraft(context)
  await b.startAnotherManualDraft(context)
  await b.updateManualDraft(context, { front: 'Second own question' })
  const uuid = b.manualDraftState(context).draft.mutationId
  held.resolve({ ...response, status: 'pushed', note_id: 99 })
  await saving
  expect(envelope().head.draft).toMatchObject({
    mutationId: uuid,
    front: 'Second own question',
    sent: null,
    result: null,
  })
  vi.resetModules()
  const reloaded = await module()
  await reloaded.openManualDraft(context)
  expect(reloaded.manualDraftState(context).draft.front).toBe('Second own question')
})
it('shares an in-flight promise within a window while another source is independent', async () => {
  const api = await module()
  await api.openManualDraft(context)
  const held = deferred<ManualCardResponse>()
  mocks.request.mockReturnValueOnce(held.promise)
  const saving = api.saveManualDraft(context)
  expect(api.saveManualDraft(context)).toBe(saving)
  await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1))
  const other = { ...context, annotation_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }
  await api.openManualDraft(other)
  await api.saveManualDraft(other)
  expect(mocks.request).toHaveBeenCalledTimes(2)
  held.resolve(response)
  await saving
})
it('keeps RAM text and sends nothing when the declared authority refuses persistence', async () => {
  const api = await module()
  await api.openManualDraft(context)
  mocks.update.mockRejectedValue(new Error('Synthetic IDB quota'))
  await api.updateManualDraft(context, { front: 'Unsaved own question' })
  await api.saveManualDraft(context)
  expect(api.manualDraftState(context)).toMatchObject({
    draft: { front: 'Unsaved own question' },
    phase: 'editing',
    storageError: true,
    localSaved: false,
  })
  expect(mocks.request).not.toHaveBeenCalled()
})
it('never selects a stale local editing copy when declared IDB is unreadable', async () => {
  const api = await module()
  await api.openManualDraft(context)
  await api.updateManualDraft(context, { front: 'Old editing text' })
  const marker = JSON.parse(localStorage.getItem('unios:manual-card-workspace:v2')!)
  localStorage.setItem(
    `unios:manual-card-draft:v2:${marker.id}:17:${context.annotation_id}`,
    JSON.stringify(envelope()),
  )
  mocks.request.mockRejectedValueOnce(new Error('Lost ACK'))
  await api.saveManualDraft(context)
  const payload = JSON.parse(mocks.request.mock.calls[0][1].body)
  vi.resetModules()
  mocks.get.mockRejectedValue(new Error('Synthetic IDB read failure'))
  const reloaded = await module()
  await reloaded.openManualDraft(context)
  expect(reloaded.manualDraftState(context)).toMatchObject({
    phase: 'unavailable',
    storageError: true,
    localSaved: false,
  })
  await reloaded.updateManualDraft(context, { front: 'Forbidden changed payload' })
  await reloaded.saveManualDraft(context)
  expect(mocks.request).toHaveBeenCalledTimes(1)
  mocks.get.mockImplementation(async (key) => structuredClone(mocks.disk.get(key)))
  reloaded.retryManualDraftRecovery(context)
  await vi.waitFor(() => expect(reloaded.manualDraftState(context).phase).toBe('unconfirmed'))
  await reloaded.saveManualDraft(context)
  expect(JSON.parse(mocks.request.mock.calls[1][1].body)).toEqual(payload)
})
it('uses the declared local authority only with Web Locks and never fabricates an unsafe CAS', async () => {
  vi.stubGlobal('indexedDB', undefined)
  const api = await module()
  await api.openManualDraft(context)
  await api.updateManualDraft(context, { front: 'Local fallback question' })
  expect(api.manualDraftState(context).localSaved).toBe(true)
  expect(JSON.parse(localStorage.getItem('unios:manual-card-workspace:v2')!).backend).toBe('local')
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
  await api.updateManualDraft(context, { front: 'Uncommitted question' })
  await api.saveManualDraft(context)
  expect(api.manualDraftState(context).storageError).toBe(true)
  expect(mocks.request).not.toHaveBeenCalled()
})
it('retains a known server ACK in RAM if receipt persistence fails, without another POST', async () => {
  const api = await module()
  await api.openManualDraft(context)
  mocks.request.mockImplementationOnce(async () => {
    mocks.update.mockRejectedValue(new Error('Synthetic ACK write failure'))
    return response
  })
  await api.saveManualDraft(context)
  expect(api.manualDraftState(context)).toMatchObject({
    phase: 'saved',
    draft: { result: { queue_id: 8 } },
    storageError: true,
    localSaved: false,
  })
  await api.saveManualDraft(context)
  expect(mocks.request).toHaveBeenCalledTimes(1)
})
it('partitions recovery copies and fences late responses after a durable workspace rotation', async () => {
  const api = await module()
  await api.openManualDraft(context)
  const held = deferred<ManualCardResponse>()
  mocks.request.mockReturnValueOnce(held.promise)
  const saving = api.saveManualDraft(context)
  await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1))
  const uuid = api.manualDraftState(context).draft.mutationId
  api.resetManualDraftWorkspace()
  await api.settleManualWorkspaceReset()
  expect(mocks.request.mock.calls[0][1].signal.aborted).toBe(true)
  await api.openManualDraft(context)
  await api.updateManualDraft(context, { front: 'New server question' })
  held.resolve(response)
  await saving
  expect(api.manualDraftState(context).draft).toMatchObject({ front: 'New server question', sent: null, result: null })
  expect(api.manualDraftState(context).draft.mutationId).not.toBe(uuid)
})
it('bounds a hanging POST and keeps its durable exact intent after cancellation', async () => {
  const api = await module()
  await api.openManualDraft(context)
  vi.useFakeTimers()
  mocks.request.mockReturnValueOnce(new Promise(() => {}))
  const saving = api.saveManualDraft(context)
  await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1))
  const payload = JSON.parse(mocks.request.mock.calls[0][1].body)
  await vi.advanceTimersByTimeAsync(30_001)
  await saving
  expect(mocks.request.mock.calls[0][1].signal.aborted).toBe(true)
  expect(api.manualDraftState(context).phase).toBe('unconfirmed')
  expect(envelope().intents[payload.mutation_id].payload).toEqual(payload)
  mocks.request.mockResolvedValueOnce(response)
  await api.saveManualDraft(context)
  expect(JSON.parse(mocks.request.mock.calls[1][1].body)).toEqual(payload)
})
it('keeps pushed receipts monotone across independent late status reads', async () => {
  const api = await module()
  await api.openManualDraft(context)
  await api.saveManualDraft(context)
  const old = deferred<ManualCardResponse>(),
    fresh = deferred<ManualCardResponse>()
  mocks.request.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise)
  const oldRead = api.refreshManualDraftResult(context),
    freshRead = api.refreshManualDraftResult(context)
  fresh.resolve({ ...response, status: 'pushed', note_id: 99 })
  await freshRead
  old.resolve(response)
  await oldRead
  expect(envelope().head.draft.result).toMatchObject({ status: 'pushed', note_id: 99 })
})
it('requires explicit source verification before a new mutation after guaranteed no-write rejection', async () => {
  const api = await module()
  await api.openManualDraft(context)
  await api.updateManualDraft(context, { front: 'Keep own question', back: 'Keep own answer', topic: 'Keep topic' })
  mocks.request.mockRejectedValueOnce(
    Object.assign(new Error('Synthetic source changed'), { status: 409, code: 'MANUAL_SOURCE_CHANGED' }),
  )
  await api.saveManualDraft(context)
  const uuid = api.manualDraftState(context).draft.mutationId
  await api.acceptManualDraftSource(context)
  expect(api.manualDraftState(context).draft.mutationId).toBe(uuid)
  mocks.request.mockResolvedValueOnce({
    version_id: 17,
    version: 1,
    resource_id: 1,
    resource_name: 'Synthetic.pdf',
    course_id: 2,
    course_name: 'Synthetic Course',
    versions: [],
    annotations: [
      {
        id: context.annotation_id,
        resource_id: 1,
        source_version_id: 18,
        revision: 4,
        quote: 'Fresh source quote',
        comment: 'Different comment',
        anchor: { status: 'matched', page: 13, rects: [] },
      },
    ],
  })
  await api.checkManualDraftSource(context)
  await api.acceptManualDraftSource(context)
  expect(api.manualDraftState(context).draft).toMatchObject({
    front: 'Keep own question',
    back: 'Keep own answer',
    topic: 'Keep topic',
    sent: null,
    context: { version_id: 17, annotation_revision: 4, page: 13, quote: 'Fresh source quote' },
  })
  expect(api.manualDraftState(context).draft.mutationId).not.toBe(uuid)
})
it('keeps generic UUID conflicts frozen and refuses unmatched source recovery', async () => {
  const api = await module()
  await api.openManualDraft(context)
  mocks.request.mockRejectedValueOnce(
    Object.assign(new Error('Synthetic UUID conflict'), { status: 409, code: 'MANUAL_MUTATION_CONFLICT' }),
  )
  await api.saveManualDraft(context)
  const draft = api.manualDraftState(context).draft
  await api.checkManualDraftSource(context)
  await api.acceptManualDraftSource(context)
  expect(api.manualDraftState(context).phase).toBe('unconfirmed')
  expect(api.manualDraftState(context).draft).toEqual(draft)
})

it('rejects adoption of a branch changed since its displayed preview, then exposes its fresh text', async () => {
  const a = await module()
  await a.openManualDraft(context)
  vi.resetModules()
  const b = await module()
  await b.openManualDraft(context)
  await a.updateManualDraft(context, { front: 'Head A' })
  await b.updateManualDraft(context, { front: 'Displayed B' })
  await a.openCurrentManualDraft(context)
  const displayed = a.manualDraftState(context).recoveryCopies.find((copy) => copy.draft.front === 'Displayed B')!
  const durable = structuredClone(envelope()),
    newer = crypto.randomUUID()
  durable.branches[displayed.id].draft = {
    ...durable.branches[displayed.id].draft,
    front: 'Newer preserved B',
    writeId: newer,
  }
  durable.revision += 1
  const key = [...mocks.disk.keys()].find((key) => key.startsWith('unios:manual-card-draft:v2:'))!
  mocks.disk.set(key, durable)
  await a.adoptManualDraftCopy(context, displayed.id)
  expect(a.manualDraftState(context).draft.front).toBe('Head A')
  expect(a.manualDraftState(context).recoveryCopies.find((copy) => copy.id === displayed.id)?.draft.front).toBe(
    'Newer preserved B',
  )
  await a.adoptManualDraftCopy(context, displayed.id)
  expect(a.manualDraftState(context).draft.front).toBe('Newer preserved B')
})
it('keeps all windows fenced if native pairing succeeded but durable namespace rotation failed', async () => {
  const a = await module()
  await a.openManualDraft(context)
  mocks.request.mockRejectedValueOnce(new Error('Old host lost ACK'))
  await a.saveManualDraft(context)
  const oldPayload = JSON.parse(mocks.request.mock.calls[0][1].body)
  vi.resetModules()
  const b = await module()
  await b.openManualDraft(context)
  const persistence = await import('./lib/manualDraftPersistence')
  await persistence.prepareManualBindingChange()
  // The real native endpoint has changed its binding. This cut rejects only the subsequent rotation.
  mocks.update.mockRejectedValueOnce(new Error('Synthetic rotation failure'))
  a.resetManualDraftWorkspace()
  await expect(a.settleManualWorkspaceReset()).rejects.toThrow('Synthetic rotation failure')
  await b.saveManualDraft(context)
  expect(mocks.request).toHaveBeenCalledTimes(1)
  expect(envelope().intents[oldPayload.mutation_id].payload).toEqual(oldPayload)
  expect(mocks.disk.get('workspace:v2')).toMatchObject({ binding: 'changing' })
})
it('releases a proven pre-write pairing rejection without changing the workspace or reserved UUID', async () => {
  const a = await module()
  await a.openManualDraft(context)
  mocks.request.mockRejectedValueOnce(new Error('Lost ACK'))
  await a.saveManualDraft(context)
  const oldPayload = JSON.parse(mocks.request.mock.calls[0][1].body)
  const persistence = await import('./lib/manualDraftPersistence'),
    before = await persistence.readManualWorkspace()
  const fence = await persistence.prepareManualBindingChange()
  await persistence.cancelRejectedManualBindingChange(fence)
  expect((await persistence.readManualWorkspace()).id).toBe(before.id)
  await vi.waitFor(() => expect(a.manualDraftState(context).phase).toBe('unconfirmed'))
  await a.saveManualDraft(context)
  expect(JSON.parse(mocks.request.mock.calls[1][1].body)).toEqual(oldPayload)
})
it('lets bounded cancellation unblock an exclusive pairing lock and preserves the old recovery namespace', async () => {
  const api = await module()
  await api.openManualDraft(context)
  let shared = 0,
    waiting: (() => void) | null = null
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: vi.fn(async (_name, options, callback) => {
        if (typeof options === 'function') return options()
        if (options.mode === 'shared') {
          shared += 1
          try {
            return await callback()
          } finally {
            shared -= 1
            waiting?.()
            waiting = null
          }
        }
        if (shared > 0)
          await new Promise<void>((resolve) => {
            waiting = resolve
          })
        return callback()
      }),
    },
  })
  vi.useFakeTimers()
  mocks.request.mockReturnValueOnce(new Promise(() => {}))
  const saving = api.saveManualDraft(context)
  await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1))
  const payload = JSON.parse(mocks.request.mock.calls[0][1].body),
    paired = vi.fn()
  const { withManualBindingChange } = await import('./lib/manualDraftCoordination')
  const { prepareManualBindingChange } = await import('./lib/manualDraftPersistence')
  const pairing = withManualBindingChange(async () => {
    await prepareManualBindingChange()
    paired()
    api.resetManualDraftWorkspace()
    await api.settleManualWorkspaceReset()
  })
  await Promise.resolve()
  expect(paired).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(30_001)
  await saving
  await pairing
  expect(paired).toHaveBeenCalledTimes(1)
  expect(envelope().intents[payload.mutation_id].payload).toEqual(payload)
  await api.openManualDraft(context)
  expect(api.manualDraftState(context).draft.mutationId).not.toBe(payload.mutation_id)
})
it('migrates divergent v1 copies without rewriting unresolved UUIDs and resolves each exact request explicitly', async () => {
  const oldWorkspace = crypto.randomUUID(),
    firstId = crypto.randomUUID(),
    secondId = crypto.randomUUID()
  const make = (id: string, front: string) => ({
    context,
    mutationId: id,
    writeId: crypto.randomUUID(),
    updatedAt: Date.now(),
    front,
    back: context.quote,
    topic: 'Synthetic',
    sent: {
      mutation_id: id,
      front,
      back: context.quote,
      topic: 'Synthetic',
      source: { version_id: 17, annotation_id: context.annotation_id, expected_revision: 3, page: 12 },
    },
    result: null,
  })
  const first = make(firstId, 'Legacy A'),
    second = make(secondId, 'Legacy B')
  localStorage.setItem('unios:manual-card-workspace:v1', oldWorkspace)
  const oldKey = `unios:manual-card-draft:v1:${oldWorkspace}:17:${context.annotation_id}`
  mocks.disk.set(oldKey, first)
  localStorage.setItem(oldKey, JSON.stringify(second))
  const api = await module()
  await api.openManualDraft(context)
  expect(api.manualDraftState(context).unresolvedCount).toBe(2)
  await api.saveManualDraft(context)
  expect(api.manualDraftState(context).unresolvedCount).toBe(1)
  const currentId = api.manualDraftState(context).draft.mutationId
  await api.startAnotherManualDraft(context)
  expect(api.manualDraftState(context).draft.mutationId).toBe(currentId)
  const remaining = api.manualDraftState(context).recoveryCopies.find((copy) => copy.draft.sent && !copy.draft.result)!
  await api.openManualSentCopy(context, remaining.id)
  await api.saveManualDraft(context)
  expect(mocks.request.mock.calls.map((call) => JSON.parse(call[1].body).mutation_id).sort()).toEqual(
    [firstId, secondId].sort(),
  )
  expect(api.manualDraftState(context).unresolvedCount).toBe(0)
  await api.startAnotherManualDraft(context)
  expect(api.manualDraftState(context).phase).toBe('editing')
})

it('does not discard an unsaved second-card text when an old status response completes after a transient write failure', async () => {
  const api = await module()
  await api.openManualDraft(context)
  await api.saveManualDraft(context)
  const held = deferred<ManualCardResponse>()
  mocks.request.mockReturnValueOnce(held.promise)
  const reading = api.refreshManualDraftResult(context)
  await api.startAnotherManualDraft(context)
  mocks.update.mockRejectedValueOnce(new Error('Transient own-text write failure'))
  await api.updateManualDraft(context, { front: 'Own unsaved second question must survive' })
  held.resolve(response)
  await reading
  expect(api.manualDraftState(context).draft.front).toBe('Own unsaved second question must survive')
  expect(api.manualDraftState(context).localSaved).toBe(false)
  expect(api.manualDraftState(context).storageError).toBe(true)
  await api.saveManualDraft(context)
  expect(JSON.parse(mocks.request.mock.calls.at(-1)![1].body).front).toBe('Own unsaved second question must survive')
})
it('fences a POST still waiting for its binding lock after workspace rotation', async () => {
  const api = await module()
  await api.openManualDraft(context)
  const held = deferred<void>()
  let queued = false
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: async (_name: string, options: unknown, callback?: () => Promise<unknown>) => {
        if (typeof options === 'function') return options()
        queued = true
        await held.promise
        return callback!()
      },
    },
  })
  const saving = api.saveManualDraft(context)
  await vi.waitFor(() => expect(queued).toBe(true))
  api.resetManualDraftWorkspace()
  await api.settleManualWorkspaceReset()
  held.resolve()
  await saving
  expect(mocks.request).not.toHaveBeenCalled()
  await api.openManualDraft(context)
  expect(api.manualDraftState(context).phase).toBe('editing')
})
