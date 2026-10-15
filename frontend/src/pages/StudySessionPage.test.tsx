// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { clearWorkspace } from '@/lib/workspaceState'
import { studyDuePath, type StudyDueResponse } from '@/studyTypes'
import { syntheticStudyCard, syntheticStudyDue } from '@/studyTestFixtures'
import { StudySessionPage } from './StudySessionPage'
import type { LearningFocusContext } from '@/lib/learningFocus'
import { HostContext } from '@/hooks/host'

const mocks = vi.hoisted(() => ({
  reads: new Map<string, { data: unknown; error: string | null; loading: boolean }>(),
  fresh: new Map<string, StudyDueResponse>(),
  useApi: vi.fn(), fetchQuery: vi.fn(), cancelQueries: vi.fn(), request: vi.fn(),
  online: vi.fn(), verified: vi.fn(), queue: vi.fn(), flush: vi.fn(), pending: vi.fn(), pendingIds: vi.fn(), undo: vi.fn(),
}))

vi.mock('@/api', () => ({ useApi: mocks.useApi, request: mocks.request, localDate: (value: string) => value }))
vi.mock('@/offlineCache', () => ({ queryClient: { fetchQuery: mocks.fetchQuery, cancelQueries: mocks.cancelQueries } }))
vi.mock('@/hostAvailability', () => ({ useHostOnline: mocks.online }))
vi.mock('@/lib/runtimeAccess', () => ({ useRuntimeVerified: mocks.verified }))
vi.mock('@/lib/motion', () => ({ waitForMotion: async () => undefined }))
vi.mock('@/studyQueue', () => ({ queueReview: mocks.queue, flushReviews: mocks.flush,
  StudyUndoUnavailableError: class extends Error {},
  pendingReviewCount: mocks.pending, pendingReviewCardIds: mocks.pendingIds, undoReview: mocks.undo,
  validPendingReview: (value: unknown) => value === null || typeof value === 'object' }))
vi.mock('@/i18n/useT', () => {
  const t = (key: string, options?: Record<string, unknown>) => options ? `${key}:${JSON.stringify(options)}` : key
  return { useT: () => ({ t }) }
})

function setDue(deck: string, due: StudyDueResponse) {
  const path = studyDuePath(deck)
  mocks.reads.set(path, { data: due, error: null, loading: false })
  mocks.fresh.set(path, due)
}

function tree(deck: string, search = '') {
  return <MemoryRouter initialEntries={[`/study/session/${encodeURIComponent(deck)}${search}`]}>
    <Link to={`/study/session/${encodeURIComponent('Uni::A')}`}>Switch A</Link>
    <Link to={`/study/session/${encodeURIComponent('Uni::B')}`}>Switch B</Link>
    <Routes><Route path="/study/session/:deck" element={<StudySessionPage />} /></Routes>
  </MemoryRouter>
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(accept => { resolve = accept })
  return { promise, resolve }
}

beforeEach(() => {
  clearWorkspace()
  vi.clearAllMocks()
  mocks.reads.clear(); mocks.fresh.clear()
  mocks.reads.set('/api/anki/study/status', { data: { mode: 'integrated' }, error: null, loading: false })
  mocks.useApi.mockImplementation((path: string) => ({ ...(mocks.reads.get(path) ?? { data: null, error: null, loading: true }),
    updatedAt: Date.parse('2026-10-07T12:00:00Z'), reload: () => undefined }))
  mocks.fetchQuery.mockImplementation(async ({ queryKey }: { queryKey: string[] }) => {
    const due = mocks.fresh.get(queryKey[1])
    if (!due) throw new Error('Synthetic missing scope')
    return due
  })
  mocks.cancelQueries.mockResolvedValue(undefined)
  mocks.online.mockReturnValue(true); mocks.verified.mockReturnValue(true)
  mocks.queue.mockResolvedValue({ pending: 1, estimate: new Date('2026-10-08T12:00:00Z') })
  mocks.flush.mockResolvedValue(0); mocks.pending.mockResolvedValue(0); mocks.pendingIds.mockResolvedValue([])
  mocks.undo.mockResolvedValue({ pending: 0, card: null })
})
afterEach(() => { cleanup(); clearWorkspace() })

it('undoes the final rated answer with Z even after the session is complete', async () => {
  const deck = 'Uni::A'
  const review = { card_id: 1, rating: 3, review_id: 'synthetic-ui-review', offline: true,
    reviewed_at: '2026-10-09T12:00:00Z', study_deck_id: 42 }
  mocks.queue.mockResolvedValue({ pending: 1, estimate: new Date(), review })
  setDue(deck, syntheticStudyDue(deck, [syntheticStudyCard(1, deck)]))
  render(tree(deck))
  await screen.findByText('Question 1')
  fireEvent.click(screen.getByRole('button', { name: /showAnswer/ }))
  fireEvent.keyDown(window, { key: '3' })
  await screen.findByRole('button', { name: 'undo' })
  await screen.findByText('sessionDoneTitle')
  fireEvent.keyDown(window, { key: 'z' })
  await screen.findByText('Answer 1')
  expect(mocks.undo).toHaveBeenCalledWith(review)
  expect(screen.queryByRole('button', { name: 'undo' })).toBeNull()
  expect(screen.getByRole('status').textContent).toBe('undone')
})

it('keeps a known standby session read-only for both clicks and rating shortcuts', async () => {
  setDue('Uni::A', syntheticStudyDue('Uni::A', [syntheticStudyCard(1, 'Uni::A')]))
  const host = { mode: 'standby', generation: 1 } as import('@/types').HostStatus
  render(<HostContext.Provider value={host}>{tree('Uni::A')}</HostContext.Provider>)
  await screen.findByText('Question 1')
  fireEvent.click(screen.getByRole('button', { name: /showAnswer/ }))
  const rate = screen.getByRole('button', { name: /ratingGood/ })
  expect(rate.hasAttribute('disabled')).toBe(true)
  fireEvent.click(rate)
  fireEvent.keyDown(window, { key: '3' })
  expect(mocks.queue).not.toHaveBeenCalled()
  expect(screen.getByText('standbySessionReadOnly')).toBeTruthy()
})

it('keeps the current queue and exact undo target when the host rejects undo', async () => {
  const deck = 'Uni::A'
  const review = { card_id: 1, rating: 3, review_id: 'synthetic-ui-conflict', offline: true,
    reviewed_at: '2026-10-09T12:00:00Z' }
  mocks.queue.mockResolvedValue({ pending: 1, estimate: new Date(), review })
  mocks.undo.mockRejectedValue(new Error('Synthetic newer review'))
  setDue(deck, syntheticStudyDue(deck, [syntheticStudyCard(1, deck), syntheticStudyCard(2, deck)]))
  render(tree(deck))
  await screen.findByText('Question 1')
  fireEvent.click(screen.getByRole('button', { name: /showAnswer/ }))
  fireEvent.keyDown(window, { key: '3' })
  await screen.findByText('Question 2')
  fireEvent.click(screen.getByRole('button', { name: 'undo' }))
  await screen.findByRole('alert')
  expect(screen.getByText('Question 2')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'undo' })).toBeTruthy()
  expect(screen.queryByText('Answer 1')).toBeNull()
})

it('does not undo while Z is typed into an editable field', async () => {
  const deck = 'Uni::A'
  const review = { card_id: 1, rating: 3, review_id: 'synthetic-ui-input', offline: true,
    reviewed_at: '2026-10-09T12:00:00Z' }
  mocks.queue.mockResolvedValue({ pending: 1, estimate: new Date(), review })
  setDue(deck, syntheticStudyDue(deck, [syntheticStudyCard(1, deck)]))
  const view = render(<><input aria-label="Synthetic typing" />{tree(deck)}</>)
  await screen.findByText('Question 1')
  fireEvent.click(screen.getByRole('button', { name: /showAnswer/ }))
  fireEvent.keyDown(window, { key: '3' })
  await screen.findByRole('button', { name: 'undo' })
  const input = view.getByRole('textbox', { name: 'Synthetic typing' })
  fireEvent.keyDown(input, { key: 'z' })
  expect(mocks.undo).not.toHaveBeenCalled()
})

function setFocus(deck: string) {
  const focus: LearningFocusContext = { kind: 'block', id: 12, label: 'Accepted block', status: 'accepted',
    course_id: 2, course_name: 'Course B', exam_id: 3, exam_title: 'Exam B', exam_at: null, exam_changed: null,
    topics: [{ id: 4, name: 'Topic B' }], missing_topic_ids: [], duration_minutes: 35,
    starts_at: '2026-10-07T12:00:00Z', ends_at: null,
    card_scope: { mode: 'integrated', decks: [{ deck_id: 42, name: deck }], scope: 'course_related_decks', uncertain: false } }
  mocks.reads.set('/api/learning/focus/block/12', { data: focus, error: null, loading: false })
  return focus
}

it('returns to the accepted workspace at the frozen source and preserves the revealed native queue through context refetch', async () => {
  const deck = 'Uni::B'
  const source = { resource_id: 1, resource_name: 'Synthetic.pdf', course_id: 2, course_name: 'Course B',
    version_id: 17, version: 1, page: 12, sha256: 'synthetic-hash', quote: 'Original quote',
    annotation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', annotation_revision: 3, url: '/material/18?page=17' }
  setDue(deck, syntheticStudyDue(deck, [{ ...syntheticStudyCard(1, deck), source }]))
  const focus = setFocus(deck)
  const view = render(tree(deck, '?focus=block%3A12'))
  await screen.findByText('Question 1')
  fireEvent.click(screen.getByRole('button', { name: /showAnswer/ }))
  expect(screen.getByRole('link', { name: /manual.openSource/ }).getAttribute('href'))
    .toBe('/learning/focus/block/12?mode=source&version=17&page=12')
  expect(screen.getByRole('link', { name: 'allDecksLink' }).getAttribute('href')).toBe('/study?focus=block%3A12')
  mocks.reads.set('/api/learning/focus/block/12', { data: { ...focus, exam_title: 'Renamed exam' }, error: null, loading: false })
  setDue(deck, syntheticStudyDue(deck, [syntheticStudyCard(99, deck)]))
  view.rerender(tree(deck, '?focus=block%3A12'))
  expect(screen.getByText('Answer 1')).toBeTruthy()
  expect(screen.queryByText('Question 99')).toBeNull()
})

it('rejects an unrelated deck before fetching or presenting its native cards', async () => {
  setFocus('Uni::B')
  setDue('Uni::A', syntheticStudyDue('Uni::A', [syntheticStudyCard(1, 'Uni::A')]))
  render(tree('Uni::A', '?focus=block%3A12'))
  await screen.findByText('focusScopeMismatch')
  expect(mocks.fetchQuery).not.toHaveBeenCalled()
  expect(screen.queryByText('Question 1')).toBeNull()
  expect(mocks.queue).not.toHaveBeenCalled()
})

it('opens the frozen manual source version/page while preserving the revealed session through refetch', async () => {
  const deck = 'Uni::A'
  const source = { resource_id: 1, resource_name: 'Synthetic.pdf', course_id: 2, course_name: 'Synthetic Course',
    version_id: 17, version: 1, page: 12, sha256: 'synthetic-hash', quote: 'Original quote',
    annotation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', annotation_revision: 3, url: '/material/18?page=17' }
  setDue(deck, syntheticStudyDue(deck, [{ ...syntheticStudyCard(1, deck), source }]))
  const view = render(tree(deck))
  await screen.findByText('Question 1')
  expect(screen.getByRole('link', { name: /manual.openSource/ }).getAttribute('href')).toBe('/material/17?page=12')
  fireEvent.click(screen.getByRole('button', { name: /showAnswer/ }))
  setDue(deck, syntheticStudyDue(deck, [syntheticStudyCard(99, deck)]))
  view.rerender(tree(deck))
  expect(screen.getByText('Answer 1')).toBeTruthy()
  expect(screen.getByRole('link', { name: /manual.openSource/ }).getAttribute('href')).toBe('/material/17?page=12')
  expect(screen.queryByText('Question 99')).toBeNull()
})

it('replaces the question with the complete native answer without duplicating FrontSide and keeps the source', async () => {
  const deck = 'Uni::A'
  const source = { resource_id: 1, resource_name: 'Synthetic.pdf', course_id: 2, course_name: 'Synthetic Course',
    version_id: 17, version: 1, page: 12, sha256: 'synthetic-hash', quote: 'Original quote',
    annotation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', annotation_revision: 3, url: '/material/18?page=17' }
  setDue(deck, syntheticStudyDue(deck, [{ ...syntheticStudyCard(1, deck), source,
    front_html: '<div>Own native question</div>',
    back_html: '<div>Own native question</div><hr id="answer"><p><strong>Own native answer</strong></p><p>Custom template detail</p>' }]))
  render(tree(deck))
  await screen.findByText('Own native question')
  expect(screen.queryByText('Own native answer')).toBeNull()
  expect(screen.getByRole('link', { name: /manual.openSource/ }).getAttribute('href')).toBe('/material/17?page=12')
  fireEvent.click(screen.getByRole('button', { name: /showAnswer/ }))
  expect(screen.getAllByText('Own native question')).toHaveLength(1)
  expect(document.querySelector('.study-session-answer strong')?.textContent).toBe('Own native answer')
  expect(document.querySelector('.study-session-answer hr')).toBeTruthy()
  expect(screen.getByText('Custom template detail')).toBeTruthy()
  expect(screen.getByRole('link', { name: /manual.openSource/ }).getAttribute('href')).toBe('/material/17?page=12')
})

it('loads the exact parent scope and rates its child card in the returned parent context', async () => {
  const deck = 'Uni::Parent & 子'
  setDue(deck, syntheticStudyDue(deck, [syntheticStudyCard(7, `${deck}::Child`)]))
  render(tree(deck))
  await screen.findByText('Question 7')
  expect(mocks.useApi).toHaveBeenCalledWith(studyDuePath(deck), { enabled: true })
  expect(mocks.fetchQuery).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['api', studyDuePath(deck)], staleTime: 0 }))
  fireEvent.click(screen.getByRole('button', { name: /showAnswer/ }))
  fireEvent.click(screen.getByRole('button', { name: /ratingGood/ }))
  await screen.findByRole('heading', { name: 'sessionDoneTitle' })
  expect(mocks.queue).toHaveBeenCalledWith(7, 3, expect.objectContaining({ state: 0, last_review: null }), 42)
})

it('preserves progress, revealed answer and frozen metadata through background refetch', async () => {
  const deck = 'Uni::A'
  setDue(deck, syntheticStudyDue(deck, [syntheticStudyCard(1, deck), { ...syntheticStudyCard(2, deck),
    back_html: '<div>Question 2</div><hr id="answer"><div>Answer 2</div>' }]))
  const view = render(tree(deck))
  await screen.findByText('Question 1')
  fireEvent.click(screen.getByRole('button', { name: /showAnswer/ }))
  fireEvent.click(screen.getByRole('button', { name: /ratingGood/ }))
  await screen.findByText('Question 2')
  fireEvent.click(screen.getByRole('button', { name: /showAnswer/ }))
  setDue(deck, syntheticStudyDue(deck, [syntheticStudyCard(99, deck)], {
    counts: { new: 99, learning: 1, review: 1 }, has_more: true, generated_at: '2026-10-08T12:00:00Z',
  }))
  view.rerender(tree(deck))
  expect(screen.queryByText('Question 99')).toBeNull()
  expect(screen.getByText('Question 2')).toBeTruthy()
  expect(screen.getByText('Answer 2')).toBeTruthy()
  expect(screen.getByText('sessionProgressText:{"completed":1,"total":2,"count":2}')).toBeTruthy()
  expect(screen.getByText('countsSummary:{"new":2,"learning":0,"review":0}')).toBeTruthy()
  expect(screen.getByText('sessionSnapshotText:{"date":"2026-10-07T12:00:00Z"}')).toBeTruthy()
})

it('keeps deck caches separate and resumes the frozen session after a deck switch', async () => {
  setDue('Uni::A', syntheticStudyDue('Uni::A', [syntheticStudyCard(1, 'Uni::A'), syntheticStudyCard(2, 'Uni::A')]))
  setDue('Uni::B', syntheticStudyDue('Uni::B', [syntheticStudyCard(10, 'Uni::B')]))
  render(tree('Uni::A'))
  await screen.findByText('Question 1')
  fireEvent.click(screen.getByRole('button', { name: /showAnswer/ }))
  fireEvent.click(screen.getByRole('button', { name: /ratingGood/ }))
  await screen.findByText('Question 2')
  fireEvent.click(screen.getByRole('link', { name: 'Switch B' }))
  await screen.findByText('Question 10')
  expect(screen.queryByText('Question 2')).toBeNull()
  fireEvent.click(screen.getByRole('link', { name: 'Switch A' }))
  await screen.findByText('Question 2')
  expect(screen.queryByText('Question 1')).toBeNull()
  expect(mocks.fetchQuery.mock.calls.map(call => call[0].queryKey[1])).toEqual([studyDuePath('Uni::A'), studyDuePath('Uni::B')])
})

it('uses a fresh online snapshot instead of freezing cards already acknowledged in the old cache', async () => {
  const deck = 'Uni::A'
  setDue(deck, syntheticStudyDue(deck, [syntheticStudyCard(1, deck)]))
  mocks.fresh.set(studyDuePath(deck), syntheticStudyDue(deck, [syntheticStudyCard(2, deck)]))
  render(tree(deck))
  await screen.findByText('Question 2')
  expect(screen.queryByText('Question 1')).toBeNull()
})

it('waits for durable offline outbox hydration and skips already rated cards on reload', async () => {
  const deck = 'Uni::A'
  setDue(deck, syntheticStudyDue(deck, [syntheticStudyCard(1, deck), syntheticStudyCard(2, deck)]))
  mocks.online.mockReturnValue(false)
  mocks.pending.mockResolvedValue(1)
  const hydration = deferred<number[]>()
  mocks.pendingIds.mockReturnValue(hydration.promise)
  render(tree(deck))
  expect(screen.queryByText('Question 1')).toBeNull()
  expect(screen.queryByRole('button', { name: /showAnswer|ratingGood/ })).toBeNull()
  fireEvent.keyDown(window, { key: '3' })
  expect(mocks.queue).not.toHaveBeenCalled()
  await act(async () => { hydration.resolve([1]); await hydration.promise })
  await screen.findByText('Question 2')
  expect(screen.queryByText('Question 1')).toBeNull()
  expect(screen.getByText('sessionProgressText:{"completed":1,"total":2,"count":2}')).toBeTruthy()
  expect(mocks.fetchQuery).not.toHaveBeenCalled()
})

it('explains an uncached offline deck without substituting the global daily window', () => {
  mocks.online.mockReturnValue(false)
  mocks.reads.set('/api/anki/study/due', { data: syntheticStudyDue('', [syntheticStudyCard(1, 'Uni::A')], { scope: null }),
    error: null, loading: false })
  render(tree('Uni::B'))
  expect(screen.getByRole('heading', { name: 'offlineDeckMissingTitle' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'openConnection' }).getAttribute('href')).toBe('/system')
  expect(screen.queryByText('noCardsDueText')).toBeNull()
  expect(screen.queryByText('Question 1')).toBeNull()
})

it('describes an empty queue with planned learning steps as unavailable instead of an empty deck', async () => {
  setDue('Uni::A', syntheticStudyDue('Uni::A', [], { counts: { new: 0, learning: 4, review: 0 } }))
  render(tree('Uni::A'))
  await screen.findByRole('heading', { name: 'noCardsAvailableText' })
  expect(screen.getByText('learningCardsWaitingText')).toBeTruthy()
  expect(screen.queryByText('deckNothingDueTitle')).toBeNull()
})

it('explicitly starts a new bounded session without reusing the completed cached window', async () => {
  const deck = 'Uni::A'
  setDue(deck, syntheticStudyDue(deck, [syntheticStudyCard(1, deck)], { has_more: true }))
  render(tree(deck))
  await screen.findByText('Question 1')
  fireEvent.click(screen.getByRole('button', { name: /showAnswer/ }))
  fireEvent.click(screen.getByRole('button', { name: /ratingGood/ }))
  await screen.findByRole('heading', { name: 'sessionDoneTitle' })
  expect(screen.getByText('moreCardsAvailableText')).toBeTruthy()
  mocks.fresh.set(studyDuePath(deck), syntheticStudyDue(deck, [syntheticStudyCard(2, deck)]))
  fireEvent.click(screen.getByRole('button', { name: 'startAnotherSession' }))
  await screen.findByText('Question 2')
  expect(screen.queryByText('Question 1')).toBeNull()
  expect(mocks.fetchQuery).toHaveBeenCalledTimes(2)
})

it.each([{ key: 'Enter', code: 'Enter' }, { key: ' ', code: 'Space' }])(
  'preserves native snapshot-summary keyboard activation for $code', async event => {
    setDue('Uni::A', syntheticStudyDue('Uni::A'))
    render(tree('Uni::A'))
    await screen.findByText('Question 1')
    const summary = screen.getByText(/sessionSnapshotText/)
    expect(summary.tagName).toBe('SUMMARY')
    summary.focus()
    // jsdom has no native details activation; allow the browser default instead of intercepting it.
    expect(fireEvent.keyDown(summary, event)).toBe(true)
    expect(screen.queryByText('Answer 1')).toBeNull()
    expect(mocks.queue).not.toHaveBeenCalled()
  },
)
