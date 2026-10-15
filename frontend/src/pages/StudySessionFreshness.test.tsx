// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { QueryClientProvider, QueryObserver } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { request } from '@/api'
import { markHostReachable } from '@/hostAvailability'
import { clearWorkspace } from '@/lib/workspaceState'
import { queryClient } from '@/offlineCache'
import { studyDuePath, type StudyDueResponse } from '@/studyTypes'
import { syntheticStudyCard, syntheticStudyDue } from '@/studyTestFixtures'
import { StudySessionPage } from './StudySessionPage'

const mocks = vi.hoisted(() => ({ flush: vi.fn(), pending: vi.fn(), pendingIds: vi.fn() }))
vi.mock('@/studyQueue', () => ({ flushReviews: mocks.flush, pendingReviewCount: mocks.pending,
  StudyUndoUnavailableError: class extends Error {},
  pendingReviewCardIds: mocks.pendingIds, queueReview: vi.fn(), undoReview: vi.fn(),
  validPendingReview: (value: unknown) => value === null || typeof value === 'object' }))
vi.mock('@/lib/runtimeAccess', () => ({ useRuntimeVerified: () => true, runtimeWritesAllowed: () => true }))
vi.mock('@/i18n/useT', () => {
  const t = (key: string) => key
  return { useT: () => ({ t }) }
})

const subscriptions: (() => void)[] = []
const deck = 'Uni::Synthetic'
const duePath = studyDuePath(deck)
const statusPath = '/api/anki/study/status'
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' },
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(accept => { resolve = accept })
  return { promise, resolve }
}

function open() {
  return render(<QueryClientProvider client={queryClient}>
    <MemoryRouter initialEntries={[`/study/session/${encodeURIComponent(deck)}`]}>
      <Link to={`/study/session/${encodeURIComponent(deck)}`}>Switch A</Link>
      <Link to={`/study/session/${encodeURIComponent('Uni::Other')}`}>Switch B</Link>
      <Routes><Route path="/study/session/:deck" element={<StudySessionPage />} /></Routes>
    </MemoryRouter>
  </QueryClientProvider>)
}

beforeEach(() => {
  clearWorkspace(); queryClient.clear(); vi.clearAllMocks()
  markHostReachable(true)
  mocks.flush.mockResolvedValue(0); mocks.pending.mockResolvedValue(0); mocks.pendingIds.mockResolvedValue([])
})
afterEach(() => {
  cleanup(); subscriptions.splice(0).forEach(unsubscribe => unsubscribe())
  queryClient.clear(); clearWorkspace(); vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('discards an uncached GET read before replay ACK instead of freezing its reviewed card', async () => {
  const oldResponse = deferred<Response>()
  const replay = deferred<number>()
  const old = syntheticStudyDue(deck, [syntheticStudyCard(1, deck)])
  const fresh = syntheticStudyDue(deck, [syntheticStudyCard(2, deck)])
  let dueRequests = 0
  vi.stubGlobal('fetch', vi.fn((path: string) => {
    if (path === statusPath) return Promise.resolve(json({ mode: 'integrated' }))
    if (path !== duePath) throw new Error('Unexpected synthetic request')
    dueRequests += 1
    return dueRequests === 1 ? oldResponse.promise : Promise.resolve(json(fresh))
  }))
  mocks.flush.mockReturnValue(replay.promise)
  // Use the real QueryObserver and its pending query with no cached data. Its
  // pre-ACK request deliberately ignores cancellation to simulate a late result.
  const observer = new QueryObserver<StudyDueResponse>(queryClient, {
    queryKey: ['api', duePath], queryFn: ({ signal }) => request(duePath, { signal }), retry: false,
  })
  subscriptions.push(observer.subscribe(() => undefined))
  expect(dueRequests).toBe(1)
  expect(queryClient.getQueryData(['api', duePath])).toBeUndefined()
  open()
  await waitFor(() => expect(mocks.flush).toHaveBeenCalled())
  expect(screen.queryByRole('button', { name: /showAnswer/ })).toBeNull()
  await act(async () => { replay.resolve(0); await replay.promise })
  // The old server snapshot was already read before ACK, but arrives afterwards.
  await act(async () => { oldResponse.resolve(json(old)); await oldResponse.promise })
  await screen.findByText('Question 2')
  expect(screen.queryByText('Question 1')).toBeNull()
  expect(dueRequests).toBeGreaterThanOrEqual(2)
  expect(queryClient.getQueryData<StudyDueResponse>(['api', duePath])?.cards[0].id).toBe(2)
})

it('retries a failed uncached status read before attempting session initialization', async () => {
  let statusRequests = 0
  vi.stubGlobal('fetch', vi.fn((path: string) => {
    if (path === statusPath) {
      statusRequests += 1
      return Promise.resolve(statusRequests === 1 ? json({ detail: 'Synthetic status unavailable' }, 503)
        : json({ mode: 'integrated' }))
    }
    if (path === duePath) return Promise.resolve(json(syntheticStudyDue(deck, [syntheticStudyCard(2, deck)])))
    throw new Error('Unexpected synthetic request')
  }))
  open()
  await screen.findByText('Synthetic status unavailable')
  expect(screen.queryByRole('button', { name: /showAnswer/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'retry' }))
  await screen.findByText('Question 2')
  expect(statusRequests).toBe(2)
  expect(screen.queryByText('Synthetic status unavailable')).toBeNull()
})

it('keeps obsolete deck initializers from cancelling the current request after a shared replay finishes', async () => {
  const replay = deferred<number>()
  const otherPath = studyDuePath('Uni::Other')
  let firstDeckRequests = 0
  vi.stubGlobal('fetch', vi.fn((path: string) => {
    if (path === statusPath) return Promise.resolve(json({ mode: 'integrated' }))
    if (path === otherPath) return Promise.resolve(json(syntheticStudyDue('Uni::Other', [syntheticStudyCard(2, 'Uni::Other')])))
    if (path !== duePath) throw new Error('Unexpected synthetic request')
    firstDeckRequests += 1
    return Promise.resolve(json(syntheticStudyDue(deck, [syntheticStudyCard(firstDeckRequests === 1 ? 1 : 3, deck)])))
  }))
  mocks.flush.mockReturnValue(replay.promise)
  const cancellations = vi.spyOn(queryClient, 'cancelQueries')
  open()
  await waitFor(() => expect(mocks.flush).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole('link', { name: 'Switch B' }))
  await waitFor(() => expect(mocks.flush).toHaveBeenCalledTimes(2))
  fireEvent.click(screen.getByRole('link', { name: 'Switch A' }))
  await waitFor(() => expect(mocks.flush).toHaveBeenCalledTimes(3))
  await act(async () => { replay.resolve(0); await replay.promise })
  await screen.findByText('Question 3')
  expect(screen.queryByText('Question 1')).toBeNull()
  expect(screen.queryByText('Question 2')).toBeNull()
  expect(cancellations.mock.calls).toEqual([[{ queryKey: ['api', duePath], exact: true }]])
})
