// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RulesPage } from './RulesPage'

const mocks = vi.hoisted(() => ({ request: vi.fn() }))
const rule = { id: 1, revision: 1, name: 'Synthetic rule', trigger: 'new_material', action: 'pin',
  course_id: null, days: 1, max_percent: null, enabled: false }
vi.mock('@/api', () => ({ request: mocks.request, localDate: (value: string) => value,
  useApi: (path: string) => ({ data: path === '/api/rules' ? [rule] : path === '/api/rules/audit' ? [] : { courses: [] },
    loading: false, error: null, reload: vi.fn() }) }))
vi.mock('@/hooks/host', () => ({ useWritableHost: () => true }))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))
vi.mock('@/components/Shell', () => ({ Shell: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)
function open() { render(<MemoryRouter><RulesPage /></MemoryRouter>) }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }

it('requires saving a changed rule before executing its stored version', () => {
  open()
  expect((screen.getByRole('button', { name: 'runNowButton' }) as HTMLButtonElement).disabled).toBe(false)
  fireEvent.change(screen.getByRole('textbox', { name: 'nameLabel' }), { target: { value: 'Unsaved name' } })
  fireEvent.click(screen.getByRole('button', { name: 'runNowButton' }))
  expect(mocks.request).not.toHaveBeenCalled()
  expect(screen.getByText('saveBeforeRun')).toBeTruthy()
})

it('does not display a preview after its input changed while the reply was pending', async () => {
  const preview = deferred<unknown>(); mocks.request.mockReturnValue(preview.promise)
  open(); fireEvent.click(screen.getByRole('button', { name: 'dryRunButton' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'nameLabel' }), { target: { value: 'New draft' } })
  await act(async () => { preview.resolve({ total: 1, items: [{ object_id: '1', object_type: 'task', title: 'Old result', url: '/tasks' }], action_description: 'Synthetic' }); await preview.promise })
  expect(screen.queryByText('Old result')).toBeNull()
})

it('keeps newer input after a save ACK and requires another save before running', async () => {
  const save = deferred<unknown>(); mocks.request.mockReturnValue(save.promise)
  open(); const name = screen.getByRole('textbox', { name: 'nameLabel' })
  fireEvent.change(name, { target: { value: 'Snapshot A' } })
  fireEvent.click(screen.getByRole('button', { name: 'saveChangesButton' }))
  fireEvent.change(name, { target: { value: 'Draft B' } })
  await act(async () => { save.resolve({ ...rule, revision: 2, name: 'Snapshot A' }); await save.promise })
  expect((name as HTMLInputElement).value).toBe('Draft B')
  expect((screen.getByRole('button', { name: 'runNowButton' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.queryByText('ruleSavedMessage')).toBeNull()
})
