// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { components } from '@/generated/api'
import messages from '@/i18n/locales/de/cardQueue'
import { CardQueuePage } from './CardQueuePage'

type QueueItem = components['schemas']['QueueItem']
const mocks = vi.hoisted(() => ({
  items: [] as QueueItem[],
  error: null as string | null,
  request: vi.fn(),
  api: vi.fn(),
  reload: vi.fn(),
}))
vi.mock('@/api', () => ({ request: mocks.request, useApi: mocks.api }))
vi.mock('@/offlineCache', () => ({ queryClient: { invalidateQueries: vi.fn().mockResolvedValue(undefined) } }))
vi.mock('@/hooks/host', () => ({ useWritableHost: () => true }))
vi.mock('@/components/Shell', () => ({ Shell: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock('@/i18n/useT', () => ({
  useT: () => ({
    t: (key: string, values: Record<string, unknown> = {}) =>
      (messages[key as keyof typeof messages] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
        String(values[name]),
      ),
  }),
}))

function proposal(id: number): QueueItem {
  return {
    id,
    resource_id: 1,
    resource_name: 'Synthetic source',
    course_id: 2,
    course_name: 'Synthetic course',
    status: 'proposed',
    origin: 'ai',
    guid: null,
    source: null,
    deck_name: null,
    card: {
      card_type: 'basic',
      front: `Question ${id}`,
      back: `Answer ${id}`,
      course: 'Synthetic',
      topic: 'Topic',
      confidence: null,
    },
  }
}
function tree(route = '/anki', manual = false) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <MemoryRouter initialEntries={[route]}>
        <CardQueuePage manualOnly={manual} />
      </MemoryRouter>
    </QueryClientProvider>
  )
}
function bulk(count = 20) {
  return screen.getByRole('button', { name: `Sichtbare ${count} Karten freigeben` }) as HTMLButtonElement
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.error = null
  mocks.api.mockImplementation((path: string, options?: { enabled?: boolean }) => ({
    data: options?.enabled === false ? undefined : path.startsWith('/api/anki/queue') ? mocks.items : { pending: 0 },
    error: path.startsWith('/api/anki/queue') ? mocks.error : null,
    loading: false,
    reload: mocks.reload,
  }))
  mocks.request.mockImplementation((path: string, options: { body: string }) => {
    if (path.endsWith('/approve')) {
      const { ids } = JSON.parse(options.body)
      if (ids.length > 100) return Promise.reject(new Error('422 oversized selection'))
      return Promise.resolve(ids)
    }
    return Promise.resolve(undefined)
  })
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it.each([101, 200])(
  'with %i proposals approves only the explicitly named 20 visible cards in one valid request',
  async (count) => {
    mocks.items = Array.from({ length: count }, (_, index) => proposal(index + 1))
    render(tree())
    expect(document.querySelectorAll('.card-queue-row')).toHaveLength(20)
    expect(screen.getByText('Question 1', { selector: 'textarea' })).toBeTruthy()
    expect(screen.queryByText('Question 21', { selector: 'textarea' })).toBeNull()
    expect(screen.getByText(/ausschließlich die 20 hier sichtbaren Karten/)).toBeTruthy()
    fireEvent.click(bulk())
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1))
    expect(mocks.request).toHaveBeenCalledWith('/api/anki/queue/approve', {
      method: 'POST',
      body: JSON.stringify({ ids: Array.from({ length: 20 }, (_, index) => index + 1) }),
    })
    await act(async () => undefined)
    expect(mocks.request).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
  },
)

it('names and approves the single remaining proposal on page six of 101 without an implicit follow-up batch', async () => {
  mocks.items = Array.from({ length: 101 }, (_, index) => proposal(index + 1))
  render(tree())
  for (let page = 0; page < 5; page++) fireEvent.click(screen.getByRole('button', { name: 'Weitere Karten' }))
  expect(document.querySelectorAll('.card-queue-row')).toHaveLength(1)
  expect(screen.getByText('Seite 6 von 6 · 1 von 101 Karten sichtbar')).toBeTruthy()
  fireEvent.click(bulk(1))
  await waitFor(() =>
    expect(mocks.request).toHaveBeenCalledWith('/api/anki/queue/approve', {
      method: 'POST',
      body: JSON.stringify({ ids: [101] }),
    }),
  )
  await act(async () => undefined)
  expect(mocks.request).toHaveBeenCalledTimes(1)
})

it('blocks pagination while dirty and pins the draft when a refetch moves its card outside the current page', () => {
  mocks.items = Array.from({ length: 101 }, (_, index) => proposal(index + 1))
  const view = render(tree())
  const input = screen.getAllByRole('textbox', { name: 'Vorderseite' })[0]
  fireEvent.change(input, { target: { value: 'Retained visible draft' } })
  expect((screen.getByRole('button', { name: 'Weitere Karten' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Weitere Karten' }))
  expect(document.getElementById('card-1')).toBeTruthy()
  mocks.items = [...mocks.items.slice(1), mocks.items[0]]
  mocks.error = 'Synthetic refetch failure'
  view.rerender(tree())
  expect(document.querySelectorAll('.card-queue-row')).toHaveLength(20)
  expect((document.getElementById('card-1')!.querySelector('textarea') as HTMLTextAreaElement).value).toBe(
    'Retained visible draft',
  )
  expect(screen.getByText('Synthetic refetch failure')).toBeTruthy()
  expect(bulk().disabled).toBe(true)
})

it('jumps to a listed manual source card on a later page while keeping the direct-fetch fallback contract', () => {
  mocks.items = Array.from(
    { length: 200 },
    (_, index) => ({ ...proposal(index + 1), origin: 'manual', status: 'pushed' }) as QueueItem,
  )
  render(tree('/study/cards#card-177', true))
  expect(document.querySelectorAll('.card-queue-row')).toHaveLength(20)
  expect(document.getElementById('card-177')).toBe(document.activeElement)
  expect(mocks.api).toHaveBeenCalledWith('/api/anki/manual-cards/177', { enabled: false })
})
