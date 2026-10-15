// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clearWorkspace, rememberWorkspace } from '@/lib/workspaceState'
import { queryClient } from '@/offlineCache'
import { request } from '@/api'
import type { PracticeItem } from '@/types'
import { PracticePanel } from './PracticePanel'

const mocks = vi.hoisted(() => ({ api: vi.fn() }))
vi.mock('@/api', () => ({ useApi: mocks.api, request: vi.fn(), localDate: (value: string) => value }))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))
vi.mock('@/hooks/host', () => ({ useWritableHost: () => true }))
vi.mock('@/components/LinkedItems', () => ({ LinkedItems: () => null }))
const exercise: PracticeItem = {
  id: 31,
  exercise_id: null,
  course_id: 9,
  course_name: 'Synthetic Analysis',
  resource_id: 7,
  resource_name: 'Synthetic.pdf',
  question: 'Own synthetic question',
  topic: 'Synthetic limits',
  difficulty: 'easy',
  sample_solution: 'Own sample answer',
  solution_steps: 'Own explanation',
  source_page: 80,
  choices: null,
  correct_choice: null,
  attempt_count: 0,
  last_correct: null,
}
function tree(courseId = 9, workspaceKey = 'block:3') {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PracticePanel courseId={courseId} workspaceKey={workspaceKey} />
      </MemoryRouter>
    </QueryClientProvider>
  )
}
function open(courseId = 9, workspaceKey = 'block:3') {
  return render(tree(courseId, workspaceKey))
}
function deferred() {
  let resolve!: (value: unknown) => void
  const promise = new Promise<unknown>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}
function unloadWarns() {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}
beforeEach(() => {
  clearWorkspace()
  sessionStorage.clear()
  queryClient.clear()
  vi.clearAllMocks()
  vi.mocked(request).mockReset()
  mocks.api.mockImplementation((path: string) => ({
    data: path.includes('/history') ? [] : [{ ...exercise, course_id: Number(/course_id=(\d+)/.exec(path)?.[1] ?? 9) }],
    loading: false,
    error: null,
    reload: () => undefined,
  }))
})

it('keeps another exercise from replacing the current answer while its result is being saved through remount', async () => {
  mocks.api.mockImplementation((path: string) => ({
    data: path.includes('/history') ? [] : [exercise, { ...exercise, id: 32, question: 'Second own question' }],
    loading: false,
    error: null,
    reload: () => undefined,
  }))
  const pending = deferred()
  vi.mocked(request).mockReturnValue(pending.promise)
  const view = open()
  fireEvent.click(screen.getAllByRole('button', { name: 'practiceStart' })[0])
  fireEvent.change(screen.getByRole('textbox', { name: 'practiceAnswerLabel' }), {
    target: { value: 'Answer whose ACK is still pending' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'practiceShowSolution' }))
  fireEvent.click(screen.getByRole('button', { name: 'practiceCorrectSave' }))
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
  const sent = JSON.parse(vi.mocked(request).mock.calls[0][1]?.body as string)
  expect(sent.answer).toBe('Answer whose ACK is still pending')
  expect(vi.mocked(request).mock.calls[0][0]).toBe('/api/learning/practice/31/attempt')
  view.unmount()
  open()
  const next = screen.getByRole('button', { name: 'practiceStart' }) as HTMLButtonElement
  expect(next.disabled).toBe(true)
  fireEvent.click(next)
  expect((screen.getByRole('textbox', { name: 'practiceAnswerLabel' }) as HTMLTextAreaElement).value).toBe(
    'Answer whose ACK is still pending',
  )
  expect((screen.getByRole('button', { name: 'practiceCorrectSave' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'practiceCorrectSave' }))
  expect(request).toHaveBeenCalledTimes(1)
  await act(async () => {
    pending.resolve({})
    await pending.promise
  })
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'practiceAnswerLabel' })).toBeNull())
})
afterEach(() => {
  cleanup()
  clearWorkspace()
})

it('asks for course-filtered proposals and history, including an exercise before its first attempt', () => {
  open()
  expect(mocks.api.mock.calls.map((call) => call[0])).toContain('/api/learning/practice?course_id=9')
  expect(mocks.api.mock.calls.map((call) => call[0])).toContain('/api/learning/practice/history?course_id=9')
  expect(screen.getByText(exercise.question)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'practiceStart' }))
  expect(screen.getByRole('textbox', { name: 'practiceAnswerLabel' })).toBeTruthy()
})

it('bounds a semester with 200 exercises and keeps a started answer visible while searching', () => {
  mocks.api.mockImplementation((path: string) => ({
    data: path.includes('/history')
      ? []
      : Array.from({ length: 200 }, (_, index) => ({
          ...exercise,
          id: index + 1,
          question: `Synthetic question ${index + 1}`,
        })),
    loading: false,
    error: null,
    reload: vi.fn(),
  }))
  open()
  expect(screen.getAllByRole('button', { name: 'practiceStart' })).toHaveLength(10)
  fireEvent.click(screen.getAllByRole('button', { name: 'practiceStart' })[0])
  fireEvent.change(screen.getByRole('textbox', { name: 'practiceAnswerLabel' }), {
    target: { value: 'My unfinished answer' },
  })
  fireEvent.change(screen.getByRole('searchbox', { name: 'practiceSearch' }), { target: { value: 'question 199' } })
  expect(screen.getByText('Synthetic question 199')).toBeTruthy()
  expect((screen.getByRole('textbox', { name: 'practiceAnswerLabel' }) as HTMLTextAreaElement).value).toBe(
    'My unfinished answer',
  )
})

it('restores an unfinished answer and reveal through remount but never into another course', () => {
  const view = open()
  fireEvent.click(screen.getByRole('button', { name: 'practiceStart' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'practiceAnswerLabel' }), {
    target: { value: 'Own explanation before saving' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'practiceShowSolution' }))
  view.unmount()
  const restored = open()
  expect((screen.getByRole('textbox', { name: 'practiceAnswerLabel' }) as HTMLTextAreaElement).value).toBe(
    'Own explanation before saving',
  )
  expect(screen.getByText(exercise.sample_solution)).toBeTruthy()
  restored.unmount()
  open(10)
  fireEvent.click(screen.getByRole('button', { name: 'practiceStart' }))
  expect((screen.getByRole('textbox', { name: 'practiceAnswerLabel' }) as HTMLTextAreaElement).value).toBe('')
  expect(screen.queryByText(exercise.sample_solution)).toBeNull()
})

it('retains a newer shared answer when the earlier attempt acknowledgement arrives', async () => {
  const pending = deferred()
  vi.mocked(request).mockReturnValue(pending.promise)
  open()
  fireEvent.click(screen.getByRole('button', { name: 'practiceStart' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'practiceAnswerLabel' }), {
    target: { value: 'Old sent answer' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'practiceShowSolution' }))
  fireEvent.click(screen.getByRole('button', { name: 'practiceCorrectSave' }))
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
  act(() => rememberWorkspace('practice:9:block:3:answer', 'New answer from the current workspace', false))
  await act(async () => {
    pending.resolve({})
    await pending.promise
  })
  await waitFor(() =>
    expect((screen.getByRole('button', { name: 'practiceCorrectSave' }) as HTMLButtonElement).disabled).toBe(false),
  )
  expect((screen.getByRole('textbox', { name: 'practiceAnswerLabel' }) as HTMLTextAreaElement).value).toBe(
    'New answer from the current workspace',
  )
  expect(unloadWarns()).toBe(true)
})

it('warns before losing a private RAM answer, including pending save, and clears only after matching success', async () => {
  const pending = deferred()
  vi.mocked(request).mockReturnValue(pending.promise)
  open()
  expect(unloadWarns()).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'practiceStart' }))
  expect(unloadWarns()).toBe(false)
  const privateAnswer = 'Private answer kept only in the current window'
  fireEvent.change(screen.getByRole('textbox', { name: 'practiceAnswerLabel' }), { target: { value: privateAnswer } })
  expect(unloadWarns()).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'practiceShowSolution' }))
  expect(unloadWarns()).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'practiceCorrectSave' }))
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
  expect(unloadWarns()).toBe(true)
  expect(sessionStorage.getItem('unios-workspace-session-v1') ?? '').not.toContain(privateAnswer)
  await act(async () => {
    pending.resolve({})
    await pending.promise
  })
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'practiceAnswerLabel' })).toBeNull())
  expect(unloadWarns()).toBe(false)
})

it('keeps the unload warning after a failed save and removes it after explicit cancellation or workspace clear', async () => {
  vi.mocked(request).mockRejectedValue(new Error('Synthetic save failure'))
  open()
  fireEvent.click(screen.getByRole('button', { name: 'practiceStart' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'practiceAnswerLabel' }), {
    target: { value: 'Not acknowledged' },
  })
  expect(unloadWarns()).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'practiceCancel' }))
  expect(unloadWarns()).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'practiceStart' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'practiceAnswerLabel' }), {
    target: { value: 'Another private answer' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'practiceShowSolution' }))
  fireEvent.click(screen.getByRole('button', { name: 'practiceCorrectSave' }))
  await screen.findByRole('alert')
  expect(unloadWarns()).toBe(true)
  act(() => clearWorkspace())
  expect(unloadWarns()).toBe(false)
})

it('keeps an active answer editable when a cached practice refetch fails', () => {
  const view = open()
  fireEvent.click(screen.getByRole('button', { name: 'practiceStart' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'practiceAnswerLabel' }), {
    target: { value: 'Still working offline' },
  })
  mocks.api.mockImplementation((path: string) => ({
    data: path.includes('/history') ? [] : [exercise],
    loading: false,
    error: 'Synthetic unavailable',
    reload: vi.fn(),
  }))
  view.rerender(tree())
  expect(screen.getByText('Synthetic unavailable')).toBeTruthy()
  expect((screen.getByRole('textbox', { name: 'practiceAnswerLabel' }) as HTMLTextAreaElement).value).toBe(
    'Still working offline',
  )
  expect((screen.getByRole('textbox', { name: 'practiceAnswerLabel' }) as HTMLTextAreaElement).disabled).toBe(false)
})

it('formats a question and choices while keeping the solution hidden and the submitted choice unchanged', async () => {
  const formatted = {
    ...exercise,
    question: 'Trace the stack.\n\n```java\nint[] items = {1,2};\n```',
    choices: ['`LIFO`', '`FIFO`'],
    correct_choice: 0,
    sample_solution: '```python\nreturn values[::-1]\n```',
  }
  mocks.api.mockImplementation((path: string) => ({
    data: path.includes('/history') ? [] : [formatted],
    loading: false,
    error: null,
    reload: vi.fn(),
  }))
  vi.mocked(request).mockResolvedValue({})
  const view = open()
  expect(view.container.querySelector('.assessment-code-block code')?.textContent).toContain('items')
  expect(view.container.textContent).not.toContain('return values[::-1]')
  fireEvent.click(screen.getByRole('button', { name: 'practiceStart' }))
  const radios = screen.getAllByRole('radio') as HTMLInputElement[]
  expect(radios[0].value).toBe('`LIFO`')
  expect(radios[0].closest('label')?.querySelector('code')?.textContent).toBe('LIFO')
  fireEvent.click(radios[0])
  expect(view.container.textContent).not.toContain('return values[::-1]')
  fireEvent.click(screen.getByRole('button', { name: 'practiceShowSolution' }))
  expect(
    Array.from(view.container.querySelectorAll('.assessment-code-block code')).some((code) =>
      code.textContent?.includes('return values[::-1]'),
    ),
  ).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'practiceSaveResultButton' }))
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
  expect(JSON.parse(vi.mocked(request).mock.calls[0][1]?.body as string)).toMatchObject({
    answer: '`LIFO`',
    correct: true,
  })
})
