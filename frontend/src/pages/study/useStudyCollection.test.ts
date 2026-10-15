// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useStudyCollection } from './useStudyCollection'

const api = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/api', () => api)
vi.mock('@/studyQueries', () => ({ invalidateStudyReads: vi.fn() }))
vi.mock('@/i18n/useT', () => ({
  useT: () => ({
    t: (key: string, values?: Record<string, unknown>) => (values ? `${key}:${JSON.stringify(values)}` : key),
  }),
}))

beforeEach(() => api.request.mockReset())
afterEach(cleanup)

function setup() {
  const onCardsChanged = vi.fn()
  return { onCardsChanged, ...renderHook(() => useStudyCollection({ onCardsChanged })) }
}

it('activates an Anki package only after its preview was shown', async () => {
  const { result } = setup()
  expect(await act(() => result.current.activate())).toBe(false)
  act(() => result.current.setFile(new File(['apkg'], 'deck.apkg')))
  api.request.mockResolvedValueOnce({ cards: 3, notes: 3, reviews: 0 })
  await act(() => result.current.previewFile())
  expect(result.current.preview).toEqual({ cards: 3, notes: 3, reviews: 0 })
  api.request.mockResolvedValueOnce({ after: { cards: 3, reviews: 0 } })
  await act(() => result.current.activate())
  expect(result.current.message).toBe('activateSuccess:{"cards":3,"reviews":0}')
  expect(result.current.file).toBeNull()
})

it('reports a failed action with its own message and clears it on the next try', async () => {
  const { result } = setup()
  api.request.mockRejectedValueOnce(new Error('HTTP 500'))
  await act(() => result.current.exportCards())
  expect(result.current.errorMessage).toBe('exportFailed')
  expect(result.current.busy).toBe(false)
  api.request.mockResolvedValueOnce({ package: 'cards.apkg' })
  await act(() => result.current.exportCards())
  expect(result.current.errorMessage).toBe('')
  expect(result.current.lastPackage).toBe('cards.apkg')
})

it('refreshes the card browser after approved cards were taken over', async () => {
  const { result, onCardsChanged } = setup()
  api.request.mockResolvedValueOnce({ imported: 4 })
  await act(() => result.current.transferApproved())
  expect(result.current.message).toBe('transferApprovedSuccess:{"count":4}')
  expect(onCardsChanged).toHaveBeenCalledOnce()
})
