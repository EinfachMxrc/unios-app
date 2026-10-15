// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clearWorkspace, rememberWorkspace } from '@/lib/workspaceState'
import { syntheticStudyCard } from '@/studyTestFixtures'
import type { StudyCard } from '@/studyTypes'
import { StudyPage } from './StudyPage'

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  cards: [] as StudyCard[],
  searchBeyondWindow: false,
  browserMode: 'success' as 'success' | 'loading' | 'error',
  request: vi.fn(),
}))
vi.mock('@/api', () => ({ useApi: mocks.api, request: mocks.request, localDate: (value: string) => value }))
vi.mock('@/components/Shell', () => ({ Shell: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock('@/components/LearningTabs', () => ({ LearningTabs: () => null }))
vi.mock('@/hooks/host', () => ({ useWritableHost: () => true }))
vi.mock('@/hostAvailability', () => ({ useHostOnline: () => true }))
vi.mock('@/lib/runtimeAccess', () => ({ useRuntimeVerified: () => false }))
vi.mock('@/studyQueue', () => ({ flushReviews: vi.fn(), pendingReviewCount: async () => 0 }))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))

function LocationProbe() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <>
      <output data-testid="location">
        {location.pathname}
        {location.search}
      </output>
      <button onClick={() => navigate(-1)}>Back in test history</button>
    </>
  )
}
function tree(entries = ['/study?view=browse']) {
  return (
    <MemoryRouter initialEntries={entries}>
      <StudyPage />
      <LocationProbe />
    </MemoryRouter>
  )
}
const locationParams = () => new URL(screen.getByTestId('location').textContent!, 'http://localhost').searchParams
const enabledCardReads = () =>
  mocks.api.mock.calls
    .filter(([path, options]) => path.startsWith('/api/anki/study/cards') && options?.enabled)
    .map(([path]) => path as string)

beforeEach(() => {
  clearWorkspace()
  vi.clearAllMocks()
  mocks.cards = [syntheticStudyCard(1)]
  mocks.searchBeyondWindow = false
  mocks.browserMode = 'success'
  mocks.api.mockImplementation((path: string) => {
    const isBrowser = path.startsWith('/api/anki/study/cards')
    const query = new URL(path, 'http://localhost').searchParams.get('q')
    return {
      data: path.endsWith('/status')
        ? { mode: 'integrated', cards: 209, notes: 209, reviews: 0, due: 209 }
        : path.endsWith('/stats')
          ? {
              retention: null,
              daily_reviews: [],
              decks: [
                {
                  name: 'Uni::Synthetic',
                  deck_id: 42,
                  cards: 209,
                  scope_cards: 209,
                  counts: { new: 209, learning: 0, review: 0 },
                },
              ],
            }
          : isBrowser && mocks.browserMode === 'success'
            ? {
                cards:
                  mocks.searchBeyondWindow && query === 'BeyondWindow201' ? [syntheticStudyCard(201)] : mocks.cards,
              }
            : null,
      loading: isBrowser && mocks.browserMode === 'loading',
      error: isBrowser && mocks.browserMode === 'error' ? 'Synthetic invalid search' : null,
      reload: () => undefined,
      updatedAt: 0,
    }
  })
})
afterEach(() => {
  cleanup()
  clearWorkspace()
})

it('restores a linked library search and escapes a literal deck while keeping OR inside its scope', () => {
  const deck = 'Uni::Synthetic_* "Quoted" \\Tail'
  const query = 'needle or elsewhere'
  render(tree([`/study?deck=${encodeURIComponent(deck)}&q=${encodeURIComponent(query)}`]))
  expect((screen.getByRole('searchbox', { name: 'cardSearchLabel' }) as HTMLInputElement).value).toBe(query)
  expect((screen.getByRole('combobox', { name: 'cardDeckFilterLabel' }) as HTMLSelectElement).value).toBe(deck)
  const path = enabledCardReads().at(-1)!
  expect(new URL(path, 'http://localhost').searchParams.get('q')).toBe(
    'deck:"Uni::Synthetic\\_\\* \\"Quoted\\" \\\\Tail" (needle or elsewhere)',
  )
  expect(screen.getByRole('button', { name: 'closeCardBrowser' })).toBeTruthy()
})

it('asks the backend for the search instead of filtering only its first 200 cards', () => {
  mocks.cards = Array.from({ length: 200 }, (_, index) => syntheticStudyCard(index + 1))
  mocks.searchBeyondWindow = true
  render(tree())
  expect(screen.getByText('cardSearchLimitHint')).toBeTruthy()
  expect(screen.queryByText('Question 201')).toBeNull()
  const search = screen.getByRole('searchbox', { name: 'cardSearchLabel' })
  fireEvent.change(search, { target: { value: 'BeyondWindow201' } })
  expect(enabledCardReads().every((path) => !path.includes('?q='))).toBe(true)
  fireEvent.submit(search.closest('form')!)
  expect(enabledCardReads().at(-1)).toBe('/api/anki/study/cards?q=BeyondWindow201')
  expect(screen.getByText('Question 201')).toBeTruthy()
  expect(screen.queryByText('Question 1')).toBeNull()
  expect(locationParams().get('q')).toBe('BeyondWindow201')
  expect(locationParams().get('view')).toBe('browse')
})

it('commits the typed search with a deck selection and preserves unrelated URL context', () => {
  render(tree(['/study?view=browse&keep=synthetic']))
  fireEvent.change(screen.getByRole('searchbox', { name: 'cardSearchLabel' }), { target: { value: 'new query' } })
  fireEvent.change(screen.getByRole('combobox', { name: 'cardDeckFilterLabel' }), {
    target: { value: 'Uni::Synthetic' },
  })
  expect(locationParams().get('deck')).toBe('Uni::Synthetic')
  expect(locationParams().get('q')).toBe('new query')
  expect(locationParams().get('keep')).toBe('synthetic')
  expect(new URL(enabledCardReads().at(-1)!, 'http://localhost').searchParams.get('q')).toBe(
    'deck:"Uni::Synthetic" (new query)',
  )
  fireEvent.click(screen.getByRole('button', { name: 'cardSearchReset' }))
  expect(locationParams().has('q')).toBe(false)
  expect(locationParams().has('deck')).toBe(false)
  expect(locationParams().get('keep')).toBe('synthetic')
  expect((screen.getByRole('searchbox', { name: 'cardSearchLabel' }) as HTMLInputElement).value).toBe('')
})

it('keeps library scope in history and lets an explicit learn view override a remembered browser', () => {
  rememberWorkspace('cards:tab', 'browse')
  render(tree(['/study?view=learn&q=retained', '/study?view=browse&q=current&deck=Uni%3A%3ASynthetic']))
  fireEvent.click(screen.getByRole('button', { name: 'Back in test history' }))
  expect(screen.queryByRole('searchbox')).toBeNull()
  expect(screen.getByRole('button', { name: 'openCardBrowser' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'openCardBrowser' }))
  expect(locationParams().get('view')).toBe('browse')
  expect((screen.getByRole('searchbox', { name: 'cardSearchLabel' }) as HTMLInputElement).value).toBe('retained')
})

it('restores input and deck values when navigating back between library searches', () => {
  render(tree(['/study?view=browse&q=first&deck=Uni%3A%3ASynthetic', '/study?view=browse&q=second']))
  fireEvent.click(screen.getByRole('button', { name: 'Back in test history' }))
  expect((screen.getByRole('searchbox', { name: 'cardSearchLabel' }) as HTMLInputElement).value).toBe('first')
  expect((screen.getByRole('combobox', { name: 'cardDeckFilterLabel' }) as HTMLSelectElement).value).toBe(
    'Uni::Synthetic',
  )
  expect(new URL(enabledCardReads().at(-1)!, 'http://localhost').searchParams.get('q')).toBe(
    'deck:"Uni::Synthetic" (first)',
  )
})

it.each(['loading', 'error'] as const)('does not present %s as an empty card collection', (mode) => {
  mocks.browserMode = mode
  render(tree())
  expect(screen.queryByText('noCardsTitle')).toBeNull()
  expect(screen.queryByText('cardSearchEmptyTitle')).toBeNull()
  if (mode === 'error') expect(screen.getByText('Synthetic invalid search')).toBeTruthy()
  else expect(screen.getByRole('status', { name: 'loading' })).toBeTruthy()
})

it('distinguishes an empty successful filtered result from an empty library', () => {
  mocks.cards = []
  render(tree(['/study?view=browse&q=missing']))
  expect(screen.getByText('cardSearchEmptyTitle')).toBeTruthy()
  expect(screen.getByText('cardSearchEmptyText')).toBeTruthy()
  expect(screen.queryByText('noCardsTitle')).toBeNull()
})

it('never enables the global card browser inside a course learning focus', () => {
  render(tree(['/study?focus=block%3A12&view=browse&q=global']))
  expect(screen.queryByRole('searchbox')).toBeNull()
  expect(enabledCardReads()).toEqual([])
})
