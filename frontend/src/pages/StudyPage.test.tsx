// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import type { ReactNode } from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clearWorkspace } from '@/lib/workspaceState'
import type { StudyStats } from '@/studyTypes'
import { StudyPage } from './StudyPage'
import type { LearningFocusContext } from '@/lib/learningFocus'

const mocks = vi.hoisted(() => ({ api: vi.fn(), online: vi.fn(), writable: vi.fn(),
  mode: 'integrated' as 'integrated' | 'external', stats: null as StudyStats | null, statsLoading: false }))
vi.mock('@/api', () => ({ useApi: mocks.api, request: vi.fn(), localDate: (value: string) => value }))
vi.mock('@/components/Shell', () => ({ Shell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/components/LearningTabs', () => ({ LearningTabs: () => null }))
vi.mock('@/hooks/host', () => ({ useWritableHost: mocks.writable }))
vi.mock('@/hostAvailability', () => ({ useHostOnline: mocks.online }))
vi.mock('@/lib/runtimeAccess', () => ({ useRuntimeVerified: () => false }))
vi.mock('@/studyQueue', () => ({ flushReviews: vi.fn(), pendingReviewCount: async () => 0 }))
vi.mock('@/i18n/useT', () => {
  const t = (key: string, options?: Record<string, unknown>) => options ? `${key}:${JSON.stringify(options)}` : key
  return { useT: () => ({ t }) }
})

beforeEach(() => {
  clearWorkspace(); vi.clearAllMocks()
  mocks.mode = 'integrated'
  mocks.writable.mockReturnValue(false)
  mocks.statsLoading = false
  mocks.stats = {
    retention: null, daily_reviews: [],
    decks: [{ name: 'Uni::Synthetic', deck_id: 42, cards: 1, scope_cards: 209, counts: { new: 201, learning: 4, review: 4 } }],
  }
  mocks.online.mockReturnValue(true)
  mocks.api.mockImplementation((path: string) => ({
    data: path.endsWith('/status') ? { mode: mocks.mode, cards: 209, notes: 209, reviews: 0, due: 209 }
      : path.endsWith('/stats') ? mocks.stats : null,
    loading: path.endsWith('/stats') && mocks.statsLoading, error: null, reload: () => undefined,
    updatedAt: Date.parse('2026-10-07T12:00:00Z'),
  }))
})
afterEach(() => { cleanup(); clearWorkspace() })

it('shows native category counts beyond a 100-card window and the full parent scope inventory', () => {
  render(<MemoryRouter><StudyPage /></MemoryRouter>)
  expect(screen.getByText('deckDueSummary:{"due":209,"total":209,"count":209}')).toBeTruthy()
  expect(screen.getByText('countsSummary:{"new":201,"learning":4,"review":4}')).toBeTruthy()
  expect(mocks.api.mock.calls.some(call => call[0] === '/api/anki/study/due')).toBe(false)
  const link = screen.getByRole('link', { name: /Synthetic.*deckDueSummary/ })
  expect(link.getAttribute('href')).toBe('/study/session/Uni%3A%3ASynthetic')
})

it('shows only native decks projected for the accepted course and preserves its bounded return context', () => {
  const focus: LearningFocusContext = { kind: 'block', id: 12, label: 'Accepted block', status: 'accepted',
    course_id: 2, course_name: 'Course B', exam_id: 3, exam_title: 'Exam B', exam_at: null, exam_changed: null,
    topics: [{ id: 4, name: 'Topic B' }], missing_topic_ids: [], duration_minutes: 35,
    starts_at: '2026-10-07T12:00:00Z', ends_at: null,
    card_scope: { mode: 'integrated', decks: [{ deck_id: 42, name: 'Uni::Synthetic' }], scope: 'course_related_decks', uncertain: false } }
  mocks.stats!.decks.push({ deck_id: 43, name: 'Unrelated A', cards: 201, scope_cards: 201,
    counts: { new: 201, learning: 0, review: 0 } })
  const normalRead = mocks.api.getMockImplementation()!
  mocks.api.mockImplementation((path: string) => path === '/api/learning/focus/block/12'
    ? { data: focus, error: null, loading: false, reload: () => undefined } : normalRead(path))
  render(<MemoryRouter initialEntries={['/study?focus=block%3A12']}><StudyPage /></MemoryRouter>)
  expect(screen.queryByText('Unrelated A')).toBeNull()
  expect(screen.getByRole('link', { name: /Synthetic.*deckDueSummary/ }).getAttribute('href'))
    .toBe('/study/session/Uni%3A%3ASynthetic?focus=block%3A12')
  expect(screen.getByRole('link', { name: /focusBackToWork/ }).getAttribute('href')).toBe('/learning/focus/block/12')
  expect(screen.queryByRole('button', { name: 'openCardBrowser' })).toBeNull()
  expect(screen.queryByRole('heading', { name: 'statsTitle' })).toBeNull()
})

it('never falls back to global decks for an invalid focus reference', () => {
  render(<MemoryRouter initialEntries={['/study?focus=block:0']}><StudyPage /></MemoryRouter>)
  expect(screen.queryByRole('link', { name: /Synthetic.*deckDueSummary/ })).toBeNull()
  expect(screen.getAllByText('focusContextUnavailable').length).toBeGreaterThan(0)
})

it('shows the timestamp of cached deck metadata and identifies its offline limits', () => {
  mocks.online.mockReturnValue(false)
  render(<MemoryRouter><StudyPage /></MemoryRouter>)
  expect(screen.getByText('deckSnapshotText:{"date":"2026-10-07T12:00:00.000Z"}')).toBeTruthy()
  expect(screen.getByText('deckOverviewOfflineText')).toBeTruthy()
})

it('does not describe deck metadata still loading as an empty collection', () => {
  mocks.stats = null; mocks.statsLoading = true
  render(<MemoryRouter><StudyPage /></MemoryRouter>)
  expect(screen.getByRole('status', { name: 'loading' })).toBeTruthy()
  expect(screen.queryByText('noDecksTitle')).toBeNull()
})

it('keeps deck navigation before management in reading and native focus order while external setup stays first', () => {
  mocks.writable.mockReturnValue(true)
  const view = render(<MemoryRouter><StudyPage /></MemoryRouter>)
  const deck = screen.getByRole('link', { name: /Synthetic.*deckDueSummary/ })
  const transfer = screen.getByRole('button', { name: 'transferApproved' })
  const focusOrder = Array.from(view.container.querySelectorAll('a[href], button:not([disabled]), summary'))
  expect(focusOrder.indexOf(deck)).toBeLessThan(focusOrder.indexOf(transfer))
  expect(screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent))
    .toEqual(['deckListTitle', 'manageCardsTitle', 'statsTitle'])
  deck.focus()
  expect(document.activeElement).toBe(deck)

  mocks.mode = 'external'
  view.rerender(<MemoryRouter><StudyPage /></MemoryRouter>)
  expect(screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)).toEqual(['setupCardsTitle'])
  expect(screen.queryByRole('link', { name: /Synthetic.*deckDueSummary/ })).toBeNull()
  expect(screen.getByRole('button', { name: 'startWithoutExisting' }).hasAttribute('disabled')).toBe(false)
})

it('exposes daily review values inside a named statistics group', () => {
  mocks.stats!.daily_reviews = [{ day: '2026-10-07', count: 3 }, { day: '2026-10-08', count: 0 }]
  render(<MemoryRouter><StudyPage /></MemoryRouter>)
  const group = screen.getByRole('group', { name: 'dailyReviewsAria' })
  expect(within(group).getByText('10-07')).toBeTruthy()
  expect(within(group).getByText('3')).toBeTruthy()
  expect(within(group).getByText('10-08')).toBeTruthy()
  expect(within(group).getByText('0')).toBeTruthy()
})
