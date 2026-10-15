// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CourseMaterialPanel } from './CourseMaterialPanel'
import type { CourseMaterial } from '@/types'

const mocks = vi.hoisted(() => ({ data: null as CourseMaterial | null, request: vi.fn(), reload: vi.fn() }))
vi.mock('@/api', () => ({
  useApi: () => ({ data: mocks.data, loading: false, error: null, reload: mocks.reload }),
  request: mocks.request,
}))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))
vi.mock('@/hooks/host', () => ({ useWritableHost: () => true }))
vi.mock('@/hooks/useApiMutation', () => ({
  useApiMutation: (execute: () => Promise<CourseMaterial>, options: { onSuccess: (data: CourseMaterial) => void }) => ({
    mutate: async () => options.onSuccess(await execute()),
    pending: false,
    error: null,
    reset: vi.fn(),
  }),
}))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.data = {
    course_id: 2,
    scratchpad: 'Gespeicherter Stand',
    scratchpad_revision: 1,
    annotations: [],
    questions: [],
  }
})
afterEach(cleanup)
const tree = () => (
  <MemoryRouter>
    <CourseMaterialPanel courseId={2} />
  </MemoryRouter>
)

it('preserves a dirty draft and its CAS base when an annotation refetch returns a newer scratchpad', () => {
  const view = render(tree())
  fireEvent.change(screen.getByLabelText('scratchpadLabel'), { target: { value: 'Noch nicht gespeichert' } })
  mocks.data = { ...mocks.data!, scratchpad: 'Anderer Serverstand', scratchpad_revision: 2 }
  view.rerender(tree())
  expect((screen.getByLabelText('scratchpadLabel') as HTMLTextAreaElement).value).toBe('Noch nicht gespeichert')
  expect(screen.getByText('propertiesChanged')).toBeTruthy()
  expect((screen.getByRole('button', { name: 'saveScratchpadButton' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'discardDraftReload' }))
  expect((screen.getByLabelText('scratchpadLabel') as HTMLTextAreaElement).value).toBe('Anderer Serverstand')
})

it('accepts a clean refetch and saves against exactly that confirmed revision', async () => {
  const view = render(tree())
  mocks.data = { ...mocks.data!, scratchpad: 'Neu geladen', scratchpad_revision: 3 }
  view.rerender(tree())
  expect((screen.getByLabelText('scratchpadLabel') as HTMLTextAreaElement).value).toBe('Neu geladen')
  fireEvent.change(screen.getByLabelText('scratchpadLabel'), { target: { value: 'Eigene Ergänzung' } })
  mocks.request.mockResolvedValue({ ...mocks.data, scratchpad: 'Eigene Ergänzung', scratchpad_revision: 4 })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'saveScratchpadButton' }))
  })
  expect(JSON.parse(mocks.request.mock.calls[0][1].body)).toEqual({ expected_revision: 3, body: 'Eigene Ergänzung' })
  view.rerender(tree())
  expect((screen.getByLabelText('scratchpadLabel') as HTMLTextAreaElement).value).toBe('Eigene Ergänzung')
})
