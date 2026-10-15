// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AddonPage } from './AddonPage'

const mocks = vi.hoisted(() => ({ request: vi.fn(), fingerprint: 'revision-A' }))
vi.mock('@/api', () => ({ request: mocks.request, localDate: (value: string) => value,
  useApi: (path: string) => ({ data: { title: path.endsWith('/second') ? 'Second addon' : 'First addon',
    runtime: 'wasm', fingerprint: mocks.fingerprint }, error: null, loading: false }) }))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))
vi.mock('@/components/Shell', () => ({ Shell: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
function Navigation() { const navigate = useNavigate(); return <button onClick={() => navigate('/addons/second')}>Next addon</button> }
function open() { return render(<MemoryRouter initialEntries={['/addons/first']}><Navigation /><Routes>
  <Route path="/addons/:id" element={<AddonPage />} /></Routes></MemoryRouter>) }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
beforeEach(() => { vi.clearAllMocks(); mocks.fingerprint = 'revision-A' })
afterEach(cleanup)

it('does not show an old execution result under the next addon', async () => {
  const result = deferred<unknown>(); mocks.request.mockReturnValue(result.promise)
  open(); fireEvent.click(screen.getByRole('button', { name: 'execute' }))
  fireEvent.click(screen.getByRole('button', { name: 'Next addon' }))
  await act(async () => { result.resolve({ title: 'Old result', body: 'First addon output' }); await result.promise })
  expect(screen.getByRole('heading', { name: 'Second addon' })).toBeTruthy()
  expect(screen.queryByText('First addon output')).toBeNull()
})

it('hides a completed output when the same addon fingerprint changes', async () => {
  mocks.request.mockResolvedValue({ title: 'Old result', body: 'Old revision output' })
  const view = open(); fireEvent.click(screen.getByRole('button', { name: 'execute' }))
  await screen.findByText('Old revision output')
  mocks.fingerprint = 'revision-B'
  view.rerender(<MemoryRouter initialEntries={['/addons/first']}><Navigation /><Routes>
    <Route path="/addons/:id" element={<AddonPage />} /></Routes></MemoryRouter>)
  expect(screen.queryByText('Old revision output')).toBeNull()
})
