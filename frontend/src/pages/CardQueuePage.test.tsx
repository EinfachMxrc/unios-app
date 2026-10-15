// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { components } from '@/generated/api'
import type { ManualCardResponse, ManualCardSource } from '@/manualCardTypes'
import { CardQueuePage } from './CardQueuePage'

const mocks = vi.hoisted(() => ({
  items: undefined as unknown[] | undefined,
  detail: undefined as ManualCardResponse | undefined,
  queueError: null as string | null,
  detailError: null as string | null,
  useApi: vi.fn(),
  request: vi.fn(),
  invalidate: vi.fn(),
  writable: vi.fn(),
}))
vi.mock('@/api', () => ({ request: mocks.request, useApi: mocks.useApi }))
vi.mock('@/offlineCache', () => ({ queryClient: { invalidateQueries: mocks.invalidate } }))
vi.mock('@/hooks/host', () => ({ useWritableHost: mocks.writable }))
vi.mock('@/components/Shell', () => ({
  Shell: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))

const item: components['schemas']['QueueItem'] = {
  id: 8,
  resource_id: 1,
  resource_name: 'Synthetic.pdf',
  course_id: 2,
  course_name: 'Synthetic Course',
  status: 'approved',
  origin: 'manual',
  deck_name: 'Uni::Synthetic Course',
  guid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  card: {
    card_type: 'basic',
    front: 'Own question',
    back: 'Own answer',
    course: 'synthetic',
    topic: 'Topic',
    confidence: null,
  },
  source: {
    resource_id: 1,
    resource_name: 'Synthetic.pdf',
    course_id: 2,
    course_name: 'Synthetic Course',
    version_id: 17,
    version: 1,
    sha256: 'synthetic-hash',
    page: 12,
    quote: 'Original quote',
    annotation_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    annotation_revision: 3,
    url: '/material/18?page=17',
  },
}
const result: ManualCardResponse = {
  queue_id: 8,
  status: 'approved',
  card: item.card,
  source: item.source as ManualCardSource,
  deck_name: item.deck_name!,
  note_id: null,
  transfer_error: 'Synthetic engine unavailable',
}
function tree(manualOnly = false, route = '/anki') {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <MemoryRouter initialEntries={[route]}>
        <CardQueuePage manualOnly={manualOnly} />
      </MemoryRouter>
    </QueryClientProvider>
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.items = [item]
  mocks.writable.mockReturnValue(true)
  mocks.detail = undefined
  mocks.queueError = null
  mocks.detailError = null
  mocks.useApi.mockImplementation((path: string, options?: { enabled?: boolean }) => ({
    data:
      options?.enabled === false
        ? undefined
        : path.startsWith('/api/anki/queue')
          ? mocks.items
          : path.startsWith('/api/anki/manual-cards/')
            ? mocks.detail
            : { pending: 0 },
    error: path.startsWith('/api/anki/queue') ? mocks.queueError : mocks.detailError,
    loading: false,
    reload: () => undefined,
  }))
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  mocks.invalidate.mockResolvedValue(undefined)
  mocks.request.mockResolvedValue(result)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('renders own pending cards without invented confidence and retries only the selected queue item', async () => {
  render(tree())
  expect(screen.getByText(/manual.originManual/)).toBeTruthy()
  expect(screen.queryByText(/manual.confidence/)).toBeNull()
  expect(screen.getByRole('link', { name: 'manual.openSource' }).getAttribute('href')).toBe('/material/17?page=12')
  expect(screen.getByText('manual.queuePending')).toBeTruthy()
  expect(screen.getByText('Own question').closest('dd')).toBeTruthy()
  expect(screen.queryByRole('textbox', { name: 'frontLabel' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'manual.retryTransfer' }))
  await screen.findByText('Synthetic engine unavailable')
  expect(mocks.request).toHaveBeenCalledExactlyOnceWith('/api/anki/manual-cards/8/transfer', { method: 'POST' })
  expect(screen.getByText('manual.queuePending')).toBeTruthy()
  expect(mocks.invalidate).toHaveBeenCalled()
})

it('respects a later server transfer acknowledgement and keeps retry disabled on a read-only host', async () => {
  mocks.writable.mockReturnValue(false)
  const view = render(tree())
  expect((screen.getByRole('button', { name: 'manual.retryTransfer' }) as HTMLButtonElement).disabled).toBe(true)
  mocks.items = [{ ...item, status: 'pushed' }]
  view.rerender(tree())
  expect(screen.queryByRole('button', { name: 'manual.retryTransfer' })).toBeNull()
  expect(screen.getByText(/statusPushed/)).toBeTruthy()
  expect(mocks.request).not.toHaveBeenCalled()
})

it('offers own cards without reading or rendering optional AI import and outbox surfaces', () => {
  mocks.items = [item, { ...item, id: 9, origin: 'ai', card: { ...item.card, front: 'AI question' } }]
  render(tree(true, '/study/cards'))
  expect(screen.getByRole('heading', { name: 'manual.queueTitle' })).toBeTruthy()
  expect(screen.getByText('Own question').closest('dd')).toBeTruthy()
  expect(screen.getByText('Own answer').closest('dd')).toBeTruthy()
  expect(screen.getByText('Topic').closest('dd')).toBeTruthy()
  expect(screen.queryByText('AI question')).toBeNull()
  expect(screen.queryByText('importPanelTitle')).toBeNull()
  expect(screen.queryByText('savedAnswersPanelTitle')).toBeNull()
  expect(screen.queryByRole('textbox')).toBeNull()
  const enabledReads = mocks.useApi.mock.calls.filter(([, options]) => options?.enabled !== false).map(([path]) => path)
  expect(enabledReads).toEqual(['/api/anki/queue?origin=manual'])
})

it('loads and focuses an older exact saved card beyond the newest queue window', () => {
  mocks.items = Array.from({ length: 200 }, (_, index) => ({
    ...item,
    id: index + 9,
    card: { ...item.card, front: `Newer own question ${index}` },
  }))
  mocks.detail = result
  render(tree(true, '/study/cards#card-8'))
  const target = document.getElementById('card-8')!
  expect(within(target).getByText('Own question')).toBeTruthy()
  expect(within(target).getByRole('link', { name: 'manual.openSource' }).getAttribute('href')).toBe(
    '/material/17?page=12',
  )
  expect(target).toBe(document.activeElement)
  expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'center' })
  expect(mocks.useApi).toHaveBeenCalledWith('/api/anki/manual-cards/8', { enabled: true })
})

it('keeps an exact saved card accessible when the list fails and never presents failure as an empty queue', () => {
  mocks.items = undefined
  mocks.queueError = 'Synthetic list unavailable'
  mocks.detail = result
  render(tree(true, '/study/cards#card-8'))
  expect(screen.getByText('Synthetic list unavailable')).toBeTruthy()
  expect(screen.getByText('Own question')).toBeTruthy()
  expect(screen.queryByText('manual.emptyTitle')).toBeNull()
})

it('reports an unavailable direct card without claiming the requested queue is empty', () => {
  mocks.items = []
  mocks.detailError = 'Synthetic card unavailable'
  render(tree(true, '/study/cards#card-8'))
  expect(screen.getByText('Synthetic card unavailable')).toBeTruthy()
  expect(screen.queryByText('manual.emptyTitle')).toBeNull()
})

it('preserves editable AI proposals and the existing import route', async () => {
  mocks.items = [{ ...item, origin: 'ai', status: 'proposed', source: null }]
  render(tree())
  expect(screen.getByText('importPanelTitle')).toBeTruthy()
  const question = screen.getByRole('textbox', { name: 'frontLabel' })
  expect((question as HTMLTextAreaElement).disabled).toBe(false)
  fireEvent.change(question, { target: { value: 'Reviewed AI question' } })
  fireEvent.click(screen.getByRole('button', { name: 'approveButton' }))
  await waitFor(() =>
    expect(mocks.request).toHaveBeenCalledWith('/api/anki/queue/8', {
      method: 'PUT',
      body: JSON.stringify({ status: 'approved', front: 'Reviewed AI question', back: 'Own answer', topic: 'Topic' }),
    }),
  )
})
