// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { components } from '@/generated/api'
import { CardQueuePage } from './CardQueuePage'

type QueueItem = components['schemas']['QueueItem']
const mocks = vi.hoisted(() => ({ items: [] as QueueItem[], useApi: vi.fn(), request: vi.fn(), invalidate: vi.fn() }))
vi.mock('@/api', () => ({ request: mocks.request, useApi: mocks.useApi }))
vi.mock('@/offlineCache', () => ({ queryClient: { invalidateQueries: mocks.invalidate } }))
vi.mock('@/hooks/host', () => ({ useWritableHost: () => true }))
vi.mock('@/components/Shell', () => ({ Shell: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))

const proposal = (id: number): QueueItem => ({
  id,
  resource_id: 1,
  resource_name: 'Synthetic.pdf',
  course_id: 2,
  course_name: 'Synthetic Course',
  status: 'proposed',
  origin: 'ai',
  guid: null,
  source: null,
  deck_name: null,
  card: {
    card_type: 'basic',
    front: `Question ${id}`,
    back: `Answer ${id}`,
    course: 'synthetic',
    topic: 'Topic',
    confidence: null,
  },
})

function deferred() {
  let resolve!: (value: unknown) => void
  let reject!: (reason: Error) => void
  const promise = new Promise((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
function tree() {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <MemoryRouter>
        <CardQueuePage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}
const bulk = () => screen.getByRole('button', { name: 'approveAllButton' }) as HTMLButtonElement

beforeEach(() => {
  vi.clearAllMocks()
  mocks.items = [proposal(1), proposal(2)]
  mocks.useApi.mockImplementation((path: string) => ({
    data: path.startsWith('/api/anki/queue') ? mocks.items : { pending: 0 },
    loading: false,
    error: null,
    reload: () => undefined,
  }))
  mocks.invalidate.mockResolvedValue(undefined)
})
afterEach(cleanup)

it.each(['frontLabel', 'backLabel', 'topicLabel'])(
  'blocks bulk approval for an unsaved %s change and releases on reverting it',
  (field) => {
    render(tree())
    const input = screen.getAllByRole('textbox', { name: field })[0] as HTMLInputElement
    const original = input.value
    fireEvent.change(input, { target: { value: 'Visible unsaved correction' } })
    expect(bulk().disabled).toBe(true)
    expect(bulk().getAttribute('aria-describedby')).toBe('card-queue-bulk-hint')
    expect(screen.getByRole('status').textContent).toBe('bulkReviewBlocked')
    fireEvent.click(bulk())
    expect(mocks.request).not.toHaveBeenCalled()
    expect(input.value).toBe('Visible unsaved correction')
    fireEvent.change(input, { target: { value: original } })
    expect(bulk().disabled).toBe(false)
    expect(screen.queryByText('bulkReviewBlocked')).toBeNull()
  },
)

it('waits for individual save ACK, approves the reviewed payload, and keeps rows read-only during bulk approval', async () => {
  const saved = deferred()
  const approved = deferred()
  mocks.request.mockReturnValueOnce(saved.promise).mockReturnValueOnce(approved.promise)
  render(tree())
  fireEvent.change(screen.getAllByRole('textbox', { name: 'frontLabel' })[0], {
    target: { value: 'Reviewed question' },
  })
  fireEvent.click(screen.getAllByRole('button', { name: 'saveChangesButton' })[0])
  await waitFor(() =>
    expect(mocks.request).toHaveBeenCalledExactlyOnceWith('/api/anki/queue/1', {
      method: 'PUT',
      body: JSON.stringify({ status: 'proposed', front: 'Reviewed question', back: 'Answer 1', topic: 'Topic' }),
    }),
  )
  expect(bulk().disabled).toBe(true)
  await act(async () => {
    saved.resolve({ ...proposal(1), card: { ...proposal(1).card, front: 'Reviewed question' } })
    await saved.promise
  })
  await waitFor(() => expect(bulk().disabled).toBe(false))
  fireEvent.click(bulk())
  await waitFor(() =>
    expect(mocks.request).toHaveBeenLastCalledWith('/api/anki/queue/approve', {
      method: 'POST',
      body: JSON.stringify({ ids: [1, 2] }),
    }),
  )
  screen
    .getAllByRole('textbox', { name: 'frontLabel' })
    .forEach((input) => expect((input as HTMLTextAreaElement).disabled).toBe(true))
  screen
    .getAllByRole('button', { name: 'approveButton' })
    .forEach((button) => expect((button as HTMLButtonElement).disabled).toBe(true))
  await act(async () => {
    approved.resolve([1, 2])
    await approved.promise
  })
  await waitFor(() => expect(bulk().disabled).toBe(false))
})

it('does not release bulk approval after one row save while another row remains dirty', async () => {
  mocks.request.mockResolvedValue({ ...proposal(1), card: { ...proposal(1).card, back: 'Reviewed answer' } })
  render(tree())
  fireEvent.change(screen.getAllByRole('textbox', { name: 'backLabel' })[0], { target: { value: 'Reviewed answer' } })
  fireEvent.change(screen.getAllByRole('textbox', { name: 'topicLabel' })[1], { target: { value: 'Unsaved topic' } })
  fireEvent.click(screen.getAllByRole('button', { name: 'saveChangesButton' })[0])
  await waitFor(() =>
    expect((screen.getAllByRole('button', { name: 'saveChangesButton' })[0] as HTMLButtonElement).disabled).toBe(false),
  )
  expect(bulk().disabled).toBe(true)
  expect((screen.getAllByRole('textbox', { name: 'topicLabel' })[1] as HTMLInputElement).value).toBe('Unsaved topic')
  expect(mocks.request).toHaveBeenCalledTimes(1)
})

it('retains the dirty draft and bulk guard after a failed individual save', async () => {
  mocks.request.mockRejectedValue(new Error('Synthetic save failure'))
  render(tree())
  fireEvent.change(screen.getAllByRole('textbox', { name: 'frontLabel' })[0], {
    target: { value: 'Retained correction' },
  })
  fireEvent.click(screen.getAllByRole('button', { name: 'saveChangesButton' })[0])
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Synthetic save failure')
  expect(bulk().disabled).toBe(true)
  expect((screen.getAllByRole('textbox', { name: 'frontLabel' })[0] as HTMLTextAreaElement).value).toBe(
    'Retained correction',
  )
})

it('rechecks synchronous draft state if an edit is batched after the bulk click but before its request starts', async () => {
  render(tree())
  act(() => {
    fireEvent.click(bulk())
    fireEvent.change(screen.getAllByRole('textbox', { name: 'frontLabel' })[0], {
      target: { value: 'Batched newer correction' },
    })
  })
  await screen.findByRole('alert')
  expect(mocks.request).not.toHaveBeenCalled()
  expect((screen.getAllByRole('textbox', { name: 'frontLabel' })[0] as HTMLTextAreaElement).value).toBe(
    'Batched newer correction',
  )
  expect(bulk().disabled).toBe(true)
})

it('blocks a pristine row while its individual decision is pending and cleans registry entries when a row leaves the list', async () => {
  const saved = deferred()
  mocks.request.mockReturnValue(saved.promise)
  const view = render(tree())
  fireEvent.click(screen.getAllByRole('button', { name: 'saveChangesButton' })[0])
  expect(bulk().disabled).toBe(true)
  await act(async () => {
    saved.resolve(proposal(1))
    await saved.promise
  })
  await waitFor(() => expect(bulk().disabled).toBe(false))
  fireEvent.change(screen.getAllByRole('textbox', { name: 'frontLabel' })[0], {
    target: { value: 'Removed row draft' },
  })
  expect(bulk().disabled).toBe(true)
  mocks.items = [proposal(2)]
  view.rerender(tree())
  expect(bulk().disabled).toBe(false)
  mocks.items = [proposal(1), proposal(2)]
  view.rerender(tree())
  expect(bulk().disabled).toBe(false)
})
