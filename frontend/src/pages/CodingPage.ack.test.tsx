// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clearWorkspace } from '@/lib/workspaceState'
import { CodingPage } from './CodingPage'
import type { Task } from './codingTypes'

const mocks = vi.hoisted(() => ({ request: vi.fn(), api: vi.fn(), reload: vi.fn() }))
vi.mock('@/api', () => ({ request: mocks.request, useApi: mocks.api }))
vi.mock('@/hooks/host', () => ({ useWritableHost: () => true }))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))
vi.mock('@/components/Shell', () => ({ Shell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/components/LearningTabs', () => ({ LearningTabs: () => null }))
vi.mock('@/components/coding/CodeEditor', () => ({
  CodeEditor: ({
    value,
    label,
    onChange,
    onRun,
  }: {
    value: string
    label: string
    onChange: (value: string) => void
    onRun: () => void
  }) => (
    <>
      <textarea aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />
      <button onClick={onRun}>shortcutRun</button>
    </>
  ),
}))

const task: Task = {
  id: 71,
  course_id: 3,
  title: 'Synthetic task',
  template: 'reverse',
  language: 'python',
  topic_id: null,
  difficulty: 'easy',
  learning_goal: 'Synthetic goal',
  story: '',
  contract: 'Synthetic contract',
  rubric: [],
  status: 'active',
  draft_revision: 0,
  highest_hint: 0,
  created_at: '2026-10-09T12:00:00Z',
  files: { 'Solution.py': 'INITIAL' },
  starter_files: { 'Solution.py': 'INITIAL' },
  public_tests: [],
  attempts: [],
  reviews: [],
}
const key = `unios:coding-draft:v1:${task.id}:${task.created_at}`
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: Error) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
function openTask() {
  return render(
    <MemoryRouter initialEntries={['/coding?task=71']}>
      <CodingPage />
    </MemoryRouter>,
  )
}
async function editor() {
  return screen.findByRole('textbox', { name: 'editorLabel' })
}
function recovery() {
  return JSON.parse(localStorage.getItem(key) ?? 'null')
}
function posted(index: number) {
  return JSON.parse(mocks.request.mock.calls[index][1].body)
}

beforeEach(() => {
  clearWorkspace()
  localStorage.clear()
  vi.clearAllMocks()
  mocks.api.mockImplementation((path: string) => ({
    data:
      path === '/api/learning/coding/tasks/71' ? task : path === '/api/learning/coding/runner' ? { ready: true } : null,
    error: null,
    loading: false,
    reload: mocks.reload,
  }))
})
afterEach(() => {
  cleanup()
  clearWorkspace()
  vi.restoreAllMocks()
})

it('reads code in the task story and reveals a highlighted solution only after the explicit request', async () => {
  const story = 'Trace the code.\n\n```python\nvalues = [1, 2, 3]\n```'
  mocks.api.mockImplementation((path: string) => ({
    data:
      path === '/api/learning/coding/tasks/71'
        ? { ...task, story }
        : path === '/api/learning/coding/runner'
          ? { ready: true }
          : null,
    error: null,
    loading: false,
    reload: mocks.reload,
  }))
  mocks.request.mockResolvedValue({ level: 4, text: 'return values[::-1]', solution: true })
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  const view = openTask()
  await waitFor(() =>
    expect(view.container.querySelector('.coding-brief .assessment-code-block code')?.textContent).toContain(
      'values = [1, 2, 3]',
    ),
  )
  expect(view.container.textContent).not.toContain('return values[::-1]')
  fireEvent.click(screen.getByRole('button', { name: 'showSolution' }))
  expect(confirm).toHaveBeenCalledWith('solutionConfirm')
  await waitFor(() =>
    expect(view.container.querySelector('.coding-hint .assessment-code-block code')?.textContent).toBe(
      'return values[::-1]',
    ),
  )
  expect(posted(0)).toEqual({ level: 4, reveal_solution: true })
})

it('keeps a newer edit and its recovery, rebases it to the confirmed revision and saves it after remount', async () => {
  const first = deferred<{ revision: number }>()
  mocks.request.mockReturnValueOnce(first.promise)
  const view = openTask()
  fireEvent.change(await editor(), { target: { value: 'STAND_A' } })
  fireEvent.click(screen.getByRole('button', { name: 'save' }))
  expect(posted(0)).toEqual({ expected_revision: 0, files: { 'Solution.py': 'STAND_A' } })
  fireEvent.change(await editor(), { target: { value: 'STAND_B' } })
  await act(async () => {
    first.resolve({ revision: 1 })
    await first.promise
  })
  expect(((await editor()) as HTMLTextAreaElement).value).toBe('STAND_B')
  expect(screen.getByText('draftLocal')).toBeTruthy()
  expect(recovery()).toEqual({ revision: 1, files: { 'Solution.py': 'STAND_B' } })
  view.unmount()
  openTask()
  expect(((await editor()) as HTMLTextAreaElement).value).toBe('STAND_B')
  const second = deferred<{ revision: number }>()
  mocks.request.mockReturnValueOnce(second.promise)
  fireEvent.click(screen.getByRole('button', { name: 'save' }))
  expect(posted(1)).toEqual({ expected_revision: 1, files: { 'Solution.py': 'STAND_B' } })
  await act(async () => {
    second.resolve({ revision: 2 })
    await second.promise
  })
  expect(recovery()).toBeNull()
  expect(screen.getByText('draftSaved')).toBeTruthy()
})

it('runs the exact started snapshot while edits during both save and run ACKs remain local', async () => {
  const saved = deferred<{ revision: number }>()
  const run = deferred<{ job_id: string }>()
  mocks.request.mockReturnValueOnce(saved.promise).mockReturnValueOnce(run.promise)
  openTask()
  fireEvent.change(await editor(), { target: { value: 'RUN_A' } })
  fireEvent.click(screen.getByRole('button', { name: 'run' }))
  fireEvent.change(await editor(), { target: { value: 'EDIT_B' } })
  await act(async () => {
    saved.resolve({ revision: 1 })
    await saved.promise
  })
  await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2))
  expect(posted(1)).toEqual({ files: { 'Solution.py': 'RUN_A' }, confirmed: true })
  fireEvent.change(await editor(), { target: { value: 'EDIT_C' } })
  await act(async () => {
    run.resolve({ job_id: 'synthetic-job' })
    await run.promise
  })
  expect(((await editor()) as HTMLTextAreaElement).value).toBe('EDIT_C')
  expect(recovery()).toEqual({ revision: 1, files: { 'Solution.py': 'EDIT_C' } })
  expect(screen.getByText('draftLocal')).toBeTruthy()
  expect(screen.getByText('runUsesEarlierDraft')).toBeTruthy()
})

it('preserves the old expected revision and all newer input after a rejected save', async () => {
  const saved = deferred<{ revision: number }>()
  mocks.request.mockReturnValueOnce(saved.promise)
  openTask()
  fireEvent.change(await editor(), { target: { value: 'A' } })
  fireEvent.click(screen.getByRole('button', { name: 'save' }))
  fireEvent.change(await editor(), { target: { value: 'B' } })
  await act(async () => {
    saved.reject(new Error('409 synthetic revision conflict'))
    await saved.promise.catch(() => undefined)
  })
  expect(((await editor()) as HTMLTextAreaElement).value).toBe('B')
  expect(recovery()).toEqual({ revision: 0, files: { 'Solution.py': 'B' } })
  expect(screen.getByRole('alert').textContent).toContain('409')
})

it('does not remove recovery written by a newly mounted editor when the old save finishes', async () => {
  const saved = deferred<{ revision: number }>()
  mocks.request.mockReturnValueOnce(saved.promise)
  const view = openTask()
  fireEvent.change(await editor(), { target: { value: 'A' } })
  fireEvent.click(screen.getByRole('button', { name: 'save' }))
  fireEvent.change(await editor(), { target: { value: 'OLD_EDITOR_B' } })
  view.unmount()
  openTask()
  fireEvent.change(await editor(), { target: { value: 'B_FROM_NEW_EDITOR' } })
  await act(async () => {
    saved.resolve({ revision: 1 })
    await saved.promise
  })
  expect(((await editor()) as HTMLTextAreaElement).value).toBe('B_FROM_NEW_EDITOR')
  expect(recovery().files).toEqual({ 'Solution.py': 'B_FROM_NEW_EDITOR' })
})

it('claims a test operation synchronously before a second keyboard invocation', async () => {
  const run = deferred<{ job_id: string }>()
  mocks.request.mockReturnValueOnce(run.promise)
  openTask()
  await editor()
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: 'shortcutRun' }))
    fireEvent.click(screen.getByRole('button', { name: 'shortcutRun' }))
  })
  expect(mocks.request).toHaveBeenCalledTimes(1)
  await act(async () => {
    run.resolve({ job_id: 'synthetic-job' })
    await run.promise
  })
})

it('does not claim that newer input is locally recovered when storage refuses it', async () => {
  const saved = deferred<{ revision: number }>()
  mocks.request.mockReturnValueOnce(saved.promise)
  openTask()
  fireEvent.change(await editor(), { target: { value: 'A' } })
  fireEvent.click(screen.getByRole('button', { name: 'save' }))
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Synthetic storage quota')
  })
  fireEvent.change(await editor(), { target: { value: 'B' } })
  await act(async () => {
    saved.resolve({ revision: 1 })
    await saved.promise
  })
  expect(((await editor()) as HTMLTextAreaElement).value).toBe('B')
  expect(screen.getByText('draftUnsaved')).toBeTruthy()
  expect(screen.queryByText('draftLocal')).toBeNull()
  expect(screen.getByRole('button', { name: 'save' }).hasAttribute('disabled')).toBe(false)
})
