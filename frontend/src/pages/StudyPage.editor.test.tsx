// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clearWorkspace } from '@/lib/workspaceState'
import { syntheticStudyCard } from '@/studyTestFixtures'
import { StudyPage } from './StudyPage'

const mocks = vi.hoisted(() => ({ api: vi.fn(), request: vi.fn(), reload: vi.fn(), invalidate: vi.fn(),
  invalidateBrowsers: vi.fn(), writable: vi.fn() }))
vi.mock('@/api', () => ({ useApi: mocks.api, request: mocks.request, localDate: (value: string) => value }))
vi.mock('@/components/Shell', () => ({ Shell: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock('@/components/LearningTabs', () => ({ LearningTabs: () => null }))
vi.mock('@/hooks/host', () => ({ useWritableHost: mocks.writable }))
vi.mock('@/hostAvailability', () => ({ useHostOnline: () => true }))
vi.mock('@/lib/runtimeAccess', () => ({ useRuntimeVerified: () => false }))
vi.mock('@/studyQueue', () => ({ flushReviews: vi.fn(), pendingReviewCount: async () => 0 }))
vi.mock('@/studyQueries', () => ({ invalidateStudyReads: mocks.invalidate }))
vi.mock('@/offlineCache', () => ({ queryClient: { invalidateQueries: mocks.invalidateBrowsers } }))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))

function deferred() {
  let resolve!: (value?: unknown) => void
  let reject!: (reason: Error) => void
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

function openFirstEditor() {
  render(<MemoryRouter><StudyPage /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'openCardBrowser' }))
  fireEvent.click(screen.getAllByRole('button', { name: 'editCard' })[0])
}

beforeEach(() => {
  clearWorkspace(); vi.clearAllMocks()
  mocks.writable.mockReturnValue(true)
  mocks.invalidate.mockResolvedValue(undefined)
  mocks.invalidateBrowsers.mockResolvedValue(undefined)
  mocks.api.mockImplementation((path: string) => ({
    data: path.endsWith('/status') ? { mode: 'integrated', cards: 2, notes: 2, reviews: 0, due: 2 }
      : path.endsWith('/cards') ? { cards: [syntheticStudyCard(1), syntheticStudyCard(2)] }
      : path.endsWith('/stats') ? { retention: null, daily_reviews: [], decks: [] } : undefined,
    loading: false, error: null, reload: mocks.reload, updatedAt: 0,
  }))
})
afterEach(() => { cleanup(); clearWorkspace() })

it('keeps newer front and back drafts after saving A, then saves B explicitly', async () => {
  const first = deferred()
  mocks.request.mockReturnValueOnce(first.promise).mockResolvedValueOnce(undefined)
  openFirstEditor()
  fireEvent.change(screen.getByRole('textbox', { name: 'frontLabel' }), { target: { value: 'Front A' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'backLabel' }), { target: { value: 'Back A' } })
  fireEvent.click(screen.getByRole('button', { name: 'saveCard' }))
  expect(mocks.request).toHaveBeenCalledExactlyOnceWith('/api/anki/study/cards/1', {
    method: 'PUT', body: JSON.stringify({ front: 'Front A', back: 'Back A' }),
  })
  fireEvent.change(screen.getByRole('textbox', { name: 'frontLabel' }), { target: { value: 'Front B' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'backLabel' }), { target: { value: 'Back B' } })
  await act(async () => { first.resolve(); await first.promise })
  expect((screen.getByRole('textbox', { name: 'frontLabel' }) as HTMLTextAreaElement).value).toBe('Front B')
  expect((screen.getByRole('textbox', { name: 'backLabel' }) as HTMLTextAreaElement).value).toBe('Back B')
  expect((screen.getByRole('button', { name: 'saveCard' }) as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'saveCard' }))
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'frontLabel' })).toBeNull())
  expect(mocks.request).toHaveBeenLastCalledWith('/api/anki/study/cards/1', {
    method: 'PUT', body: JSON.stringify({ front: 'Front B', back: 'Back B' }),
  })
  expect(mocks.invalidateBrowsers).toHaveBeenCalledTimes(2)
  expect(mocks.invalidate).toHaveBeenCalledTimes(2)
})

it('does not close or replace another card editor when the older request succeeds', async () => {
  const first = deferred(); mocks.request.mockReturnValue(first.promise)
  openFirstEditor()
  fireEvent.click(screen.getByRole('button', { name: 'saveCard' }))
  fireEvent.click(screen.getAllByRole('button', { name: 'editCard' })[1])
  fireEvent.change(screen.getByRole('textbox', { name: 'frontLabel' }), { target: { value: 'Card 2 draft' } })
  await act(async () => { first.resolve(); await first.promise })
  expect((screen.getByRole('textbox', { name: 'frontLabel' }) as HTMLTextAreaElement).value).toBe('Card 2 draft')
  expect((screen.getByRole('textbox', { name: 'backLabel' }) as HTMLTextAreaElement).value).toBe('Answer 2')
  expect(mocks.request).toHaveBeenCalledTimes(1)
})

it('treats reopening the same card as a different editor instance', async () => {
  const first = deferred(); mocks.request.mockReturnValue(first.promise)
  openFirstEditor()
  fireEvent.click(screen.getByRole('button', { name: 'saveCard' }))
  fireEvent.click(screen.getAllByRole('button', { name: 'editCard' })[0])
  await act(async () => { first.resolve(); await first.promise })
  expect((screen.getByRole('textbox', { name: 'frontLabel' }) as HTMLTextAreaElement).value).toBe('Question 1')
})

it('keeps a later edit generation even if the user returns to the submitted text, and invalidates all library queries', async () => {
  const first = deferred(); mocks.request.mockReturnValue(first.promise)
  openFirstEditor()
  fireEvent.click(screen.getByRole('button', { name: 'saveCard' }))
  const front = screen.getByRole('textbox', { name: 'frontLabel' })
  fireEvent.change(front, { target: { value: 'Intermediate draft' } })
  fireEvent.change(front, { target: { value: 'Question 1' } })
  await act(async () => { first.resolve(); await first.promise })
  expect((screen.getByRole('textbox', { name: 'frontLabel' }) as HTMLTextAreaElement).value).toBe('Question 1')
  const { predicate } = mocks.invalidateBrowsers.mock.calls[0][0]
  expect(predicate({ queryKey: ['api', '/api/anki/study/cards'] })).toBe(true)
  expect(predicate({ queryKey: ['api', '/api/anki/study/cards?q=older'] })).toBe(true)
  expect(predicate({ queryKey: ['api', '/api/anki/study/cards?q=newer'] })).toBe(true)
  expect(predicate({ queryKey: ['api', '/api/anki/study/cards/1'] })).toBe(false)
  expect(predicate({ queryKey: ['api', '/api/anki/study/due'] })).toBe(false)
})

it('keeps drafts and allows explicit retry after a failed save without duplicating a pending request', async () => {
  const first = deferred(); mocks.request.mockReturnValueOnce(first.promise).mockResolvedValueOnce(undefined)
  openFirstEditor()
  fireEvent.change(screen.getByRole('textbox', { name: 'frontLabel' }), { target: { value: 'Retained draft' } })
  const save = screen.getByRole('button', { name: 'saveCard' })
  fireEvent.click(save); fireEvent.click(save)
  expect(mocks.request).toHaveBeenCalledTimes(1)
  await act(async () => { first.reject(new Error('Synthetic failure')); await first.promise.catch(() => undefined) })
  expect((screen.getByRole('textbox', { name: 'frontLabel' }) as HTMLTextAreaElement).value).toBe('Retained draft')
  expect(screen.getByText('saveCardFailed')).toBeTruthy()
  expect(mocks.reload).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'saveCard' }))
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'frontLabel' })).toBeNull())
  expect(mocks.request).toHaveBeenCalledTimes(2)
})

it('does not write card edits on a read-only host', () => {
  mocks.writable.mockReturnValue(false)
  openFirstEditor()
  fireEvent.click(screen.getByRole('button', { name: 'saveCard' }))
  expect(mocks.request).not.toHaveBeenCalled()
})
