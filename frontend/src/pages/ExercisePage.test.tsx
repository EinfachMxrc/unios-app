// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { request } from '@/api'
import { clearWorkspace, rememberWorkspace, workspaceValue } from '@/lib/workspaceState'
import { queryClient } from '@/offlineCache'
import { ExercisePage } from './ExercisePage'

const mocks = vi.hoisted(() => ({ api: vi.fn() }))
vi.mock('@/api', () => ({ useApi: mocks.api, request: vi.fn() }))
vi.mock('@/hooks/host', () => ({ useWritableHost: () => true }))
vi.mock('@/hooks/useAnchorScroll', () => ({ useAnchorScroll: () => undefined }))
vi.mock('@/components/Shell', () => ({
  Shell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}))
vi.mock('@/i18n/useT', () => {
  const t = (key: string) => key
  return { useT: () => ({ t }) }
})

const exercise = {
  question: 'Synthetic question 1',
  topic: 'Synthetic loops',
  difficulty: 'easy' as const,
  sample_solution: 'Own synthetic explanation',
  solution_steps: 'Own synthetic steps',
  source_page: 1,
  choices: null,
  correct_choice: null,
}
const item = {
  id: 1,
  resource_id: 4,
  resource_name: 'Synthetic.pdf',
  course_id: 2,
  course_name: 'Synthetic course',
  status: 'proposed' as const,
  exercise,
}
let items: Array<typeof item> = []
let apiError: string | null = null

function Location() {
  const location = useLocation()
  return (
    <output data-testid="location">
      {location.pathname}
      {location.hash}
    </output>
  )
}
function tree(entry = '/exercises') {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <ExercisePage />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>
  )
}
function open(entry = '/exercises') {
  return render(tree(entry))
}
function deferred() {
  let resolve!: (value: typeof item) => void
  const promise = new Promise<typeof item>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

beforeEach(() => {
  clearWorkspace()
  sessionStorage.clear()
  queryClient.clear()
  vi.clearAllMocks()
  vi.mocked(request).mockReset()
  items = [item]
  apiError = null
  mocks.api.mockImplementation((path: string) => ({
    data: path.endsWith('/status') ? { pending: 0 } : items,
    loading: false,
    error: null,
    refreshError: apiError,
    reload: vi.fn(),
  }))
})
afterEach(() => {
  cleanup()
  clearWorkspace()
})

it('previews structured questions without replacing their raw editable or submitted source', async () => {
  const source = '**Trace the array.**\n\n```java\nint[] a = {1,4,7};\n```'
  items = [{ ...item, exercise: { ...exercise, question: source } }]
  vi.mocked(request).mockResolvedValue(items[0])
  const view = open()
  await waitFor(() =>
    expect(view.container.querySelector('.assessment-code-block code')?.textContent).toContain('int[] a'),
  )
  fireEvent.click(screen.getByRole('button', { name: 'openProposal' }))
  expect((screen.getByRole('textbox', { name: 'questionLabel' }) as HTMLTextAreaElement).value).toBe(source)
  expect(view.container.querySelector('.exercise-proposal-preview summary')?.textContent).toBe('previewTaskLabel')
  expect(view.container.querySelector('.exercise-proposal-preview .assessment-code-block code')?.textContent).toContain(
    'int[] a',
  )
  fireEvent.click(screen.getByRole('button', { name: 'saveChangesButton' }))
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
  expect(JSON.parse(vi.mocked(request).mock.calls[0][1]?.body as string).question).toBe(source)
})

it('renders 200 proposals as ten summaries and a single explicitly opened editor, retaining drafts through paging', () => {
  items = Array.from({ length: 200 }, (_, index) => ({
    ...item,
    id: index + 1,
    exercise: { ...exercise, question: `Synthetic question ${index + 1}` },
  }))
  open()
  expect(screen.getAllByRole('button', { name: 'openProposal' })).toHaveLength(10)
  expect(screen.queryByRole('textbox', { name: 'questionLabel' })).toBeNull()
  fireEvent.click(screen.getAllByRole('button', { name: 'openProposal' })[0])
  fireEvent.change(screen.getByRole('textbox', { name: 'questionLabel' }), {
    target: { value: 'Unfinished own explanation' },
  })
  fireEvent.click(screen.getAllByRole('button', { name: 'openProposal' })[0])
  expect(screen.getAllByRole('textbox', { name: 'questionLabel' })).toHaveLength(1)
  expect((screen.getByRole('textbox', { name: 'questionLabel' }) as HTMLTextAreaElement).value).toBe(
    'Synthetic question 2',
  )
  fireEvent.click(screen.getByRole('button', { name: 'nextPage' }))
  expect(screen.getAllByRole('button', { name: 'openProposal' })).toHaveLength(10)
  expect(screen.queryByRole('textbox', { name: 'questionLabel' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'previousPage' }))
  fireEvent.click(screen.getAllByRole('button', { name: 'openProposal' })[0])
  expect((screen.getByRole('textbox', { name: 'questionLabel' }) as HTMLTextAreaElement).value).toBe(
    'Unfinished own explanation',
  )
  expect(sessionStorage.getItem('unios-workspace-session-v1')).not.toContain('Unfinished own explanation')
})

it('releases a deep-linked target when searching rather than trapping the user on its page', () => {
  items = Array.from({ length: 200 }, (_, index) => ({
    ...item,
    id: index + 1,
    exercise: { ...exercise, question: `Synthetic question ${index + 1}` },
  }))
  open('/exercises#exercise-199')
  expect((screen.getByRole('textbox', { name: 'questionLabel' }) as HTMLTextAreaElement).value).toBe(
    'Synthetic question 199',
  )
  fireEvent.change(screen.getByRole('searchbox', { name: 'searchProposals' }), { target: { value: 'question 1' } })
  expect(screen.getByTestId('location').textContent).toBe('/exercises')
  expect(screen.queryByRole('textbox', { name: 'questionLabel' })).toBeNull()
  expect(screen.getByText('Synthetic question 1', { exact: true })).toBeTruthy()
})

it('retains dirty proposal text through cached errors and replaces only clean baselines on refetch', () => {
  const view = open()
  fireEvent.click(screen.getByRole('button', { name: 'openProposal' }))
  items = [{ ...item, exercise: { ...exercise, question: 'Refetched clean question' } }]
  view.rerender(tree())
  expect((screen.getByRole('textbox', { name: 'questionLabel' }) as HTMLTextAreaElement).value).toBe(
    'Refetched clean question',
  )
  fireEvent.change(screen.getByRole('textbox', { name: 'questionLabel' }), {
    target: { value: 'Own unfinished answer' },
  })
  items = [{ ...item, exercise: { ...exercise, question: 'Another server change' } }]
  apiError = 'Synthetic refetch failed'
  view.rerender(tree())
  expect(screen.getByText('Synthetic refetch failed')).toBeTruthy()
  expect((screen.getByRole('textbox', { name: 'questionLabel' }) as HTMLTextAreaElement).value).toBe(
    'Own unfinished answer',
  )
})

it('shares a pending proposal write across remount and permits only one PUT until acknowledgement', async () => {
  const pending = deferred()
  vi.mocked(request).mockReturnValue(pending.promise)
  const view = open()
  fireEvent.click(screen.getByRole('button', { name: 'openProposal' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'questionLabel' }), { target: { value: 'Sent explanation' } })
  fireEvent.click(screen.getByRole('button', { name: 'saveChangesButton' }))
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
  const sent = JSON.parse(vi.mocked(request).mock.calls[0][1]?.body as string)
  expect(sent).toMatchObject({ question: 'Sent explanation', status: 'proposed' })
  expect(vi.mocked(request).mock.calls[0][0]).toBe('/api/ai/exercises/1')
  view.unmount()
  open()
  fireEvent.click(screen.getByRole('button', { name: 'openProposal' }))
  expect((screen.getByRole('button', { name: 'saveChangesButton' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'saveChangesButton' }))
  expect(request).toHaveBeenCalledTimes(1)
  // The mutation ACK arrives before the invalidated list returns its new data.
  await act(async () => {
    pending.resolve({ ...item, exercise: { ...exercise, question: 'Sent explanation' } })
    await pending.promise
  })
  await waitFor(() =>
    expect((screen.getByRole('button', { name: 'saveChangesButton' }) as HTMLButtonElement).disabled).toBe(false),
  )
  expect((screen.getByRole('textbox', { name: 'questionLabel' }) as HTMLTextAreaElement).value).toBe('Sent explanation')
})

it('binds an old proposal acknowledgement to its snapshot and preserves newer shared text', async () => {
  const pending = deferred()
  vi.mocked(request).mockReturnValue(pending.promise)
  open()
  fireEvent.click(screen.getByRole('button', { name: 'openProposal' }))
  fireEvent.click(screen.getByRole('button', { name: 'saveChangesButton' }))
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
  const newer = { ...exercise, question: 'Newer shared text during the old request' }
  act(() => rememberWorkspace('exercise-proposal:1:draft', newer, false))
  await act(async () => {
    pending.resolve(item)
    await pending.promise
  })
  await waitFor(() =>
    expect((screen.getByRole('button', { name: 'saveChangesButton' }) as HTMLButtonElement).disabled).toBe(false),
  )
  expect((screen.getByRole('textbox', { name: 'questionLabel' }) as HTMLTextAreaElement).value).toBe(newer.question)
  expect(workspaceValue('exercise-proposal:1:baseline', exercise, { persist: false })).toEqual(exercise)
})

it('never lets an earlier proposal acknowledgement replace the different active editor', async () => {
  items = [item, { ...item, id: 2, exercise: { ...exercise, question: 'Second question' } }]
  const pending = deferred()
  vi.mocked(request).mockReturnValue(pending.promise)
  open()
  fireEvent.click(screen.getAllByRole('button', { name: 'openProposal' })[0])
  fireEvent.click(screen.getByRole('button', { name: 'saveChangesButton' }))
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole('button', { name: 'openProposal' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'questionLabel' }), {
    target: { value: 'Second unfinished explanation' },
  })
  await act(async () => {
    pending.resolve(item)
    await pending.promise
  })
  expect(screen.getAllByRole('textbox', { name: 'questionLabel' })).toHaveLength(1)
  expect((screen.getByRole('textbox', { name: 'questionLabel' }) as HTMLTextAreaElement).value).toBe(
    'Second unfinished explanation',
  )
})
