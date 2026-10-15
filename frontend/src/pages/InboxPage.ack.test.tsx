// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { InboxPage } from './InboxPage'

const mocks = vi.hoisted(() => ({ request: vi.fn(), reload: vi.fn() }))
vi.mock('@/api', () => ({ request: mocks.request, useApi: (path: string) => ({ data: path === '/api/intake' ? []
  : { courses: [{ id: 1, name: 'Synthetic A' }, { id: 2, name: 'Synthetic B' }] }, error: null, loading: false, reload: mocks.reload }) }))
vi.mock('@/hooks/host', () => ({ useWritableHost: () => true }))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))
vi.mock('@/components/Shell', () => ({ Shell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/components/LocalActions', () => ({ LocalActions: () => null }))
vi.mock('./inbox/IntakeRow', () => ({ IntakeRow: () => null }))

function deferred() { let resolve!: () => void; let reject!: (cause: Error) => void; const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail }); return { promise, resolve, reject } }
function openCapture() {
  render(<MemoryRouter initialEntries={['/inbox']}><InboxPage /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'addButton' }))
  fireEvent.change(screen.getByLabelText('titleLabel'), { target: { value: 'TITLE_A' } })
  fireEvent.change(screen.getByLabelText('bodyLabelText'), { target: { value: 'BODY_A' } })
}
beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanup())

it('acknowledges the posted snapshot without clearing a newer title, body, mode, URL or course', async () => {
  const saved = deferred(); mocks.request.mockReturnValueOnce(saved.promise); openCapture()
  fireEvent.click(screen.getByRole('button', { name: 'saveToInboxButton' }))
  expect(JSON.parse(mocks.request.mock.calls[0][1].body)).toEqual({ kind: 'text', title: 'TITLE_A', url: null, body: 'BODY_A', course_id: null })
  fireEvent.change(screen.getByLabelText('titleLabel'), { target: { value: 'TITLE_B' } })
  fireEvent.change(screen.getByLabelText('bodyLabelText'), { target: { value: 'BODY_B' } })
  fireEvent.change(screen.getByLabelText('courseLabel'), { target: { value: '2' } })
  fireEvent.click(screen.getByRole('button', { name: 'modeWebsite' }))
  fireEvent.change(screen.getByLabelText('urlLabel'), { target: { value: 'https://example.invalid/new' } })
  await act(async () => { saved.resolve(); await saved.promise })
  expect((screen.getByLabelText('titleLabel') as HTMLInputElement).value).toBe('TITLE_B')
  expect((screen.getByLabelText('bodyLabelWeb') as HTMLTextAreaElement).value).toBe('BODY_B')
  expect((screen.getByLabelText('urlLabel') as HTMLInputElement).value).toBe('https://example.invalid/new')
  expect((screen.getByLabelText('courseLabel') as HTMLSelectElement).value).toBe('2')
  expect(screen.getByText('savedEarlierDraftMessage')).toBeTruthy(); expect(mocks.reload).toHaveBeenCalledTimes(1)
})

it('clears only an unchanged successfully posted form and guards duplicate submit synchronously', async () => {
  const saved = deferred(); mocks.request.mockReturnValueOnce(saved.promise); openCapture()
  const form = screen.getByLabelText('bodyLabelText').closest('form')!
  act(() => { fireEvent.submit(form); fireEvent.submit(form) })
  expect(mocks.request).toHaveBeenCalledTimes(1)
  await act(async () => { saved.resolve(); await saved.promise })
  expect((screen.getByLabelText('bodyLabelText') as HTMLTextAreaElement).value).toBe('')
  expect((screen.getByLabelText('titleLabel') as HTMLInputElement).value).toBe('')
  expect(screen.getByText('savedToInboxMessage')).toBeTruthy()
})

it('leaves newer input intact after failure and allows another deliberate submit', async () => {
  const saved = deferred(); mocks.request.mockReturnValueOnce(saved.promise); openCapture()
  fireEvent.click(screen.getByRole('button', { name: 'saveToInboxButton' }))
  fireEvent.change(screen.getByLabelText('bodyLabelText'), { target: { value: 'BODY_B' } })
  await act(async () => { saved.reject(new Error('synthetic network failure')); await saved.promise.catch(() => undefined) })
  expect((screen.getByLabelText('bodyLabelText') as HTMLTextAreaElement).value).toBe('BODY_B')
  expect(screen.getByText('saveFailedMessage')).toBeTruthy()
  mocks.request.mockResolvedValueOnce(undefined)
  fireEvent.click(screen.getByRole('button', { name: 'saveToInboxButton' }))
  expect(JSON.parse(mocks.request.mock.calls[1][1].body).body).toBe('BODY_B')
  await act(async () => undefined)
})
