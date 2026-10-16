// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { request } from '@/api'
import { clearWorkspace, rememberWorkspace, workspaceValue } from '@/lib/workspaceState'
import { pendingPageParentKey } from '@/lib/notePages'
import { NoteSubpages } from './NotePageStructure'

const mocks = vi.hoisted(() => ({ writable: true }))
vi.mock('@/api', () => ({
  request: vi.fn(),
  useApi: () => ({ data: [], error: null, loading: false, reload: vi.fn() }),
}))
vi.mock('@/hooks/host', () => ({ useWritableHost: () => mocks.writable }))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))
const child = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const parent = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const replacement = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
beforeEach(() => {
  clearWorkspace()
  sessionStorage.clear()
  mocks.writable = true
  vi.mocked(request).mockReset()
})
afterEach(() => {
  cleanup()
  clearWorkspace()
  vi.restoreAllMocks()
})
function open() {
  return render(
    <StrictMode>
      <MemoryRouter>
        <NoteSubpages id={child} courseId={1} />
      </MemoryRouter>
    </StrictMode>,
  )
}

it('links an acknowledged child once under StrictMode and keeps a replacement workspace safe from a late ACK', async () => {
  let finish!: () => void
  vi.mocked(request).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = () => resolve({})
      }),
  )
  rememberWorkspace(pendingPageParentKey(child), parent)
  const view = open()
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
  const signal = vi.mocked(request).mock.calls[0][1]?.signal
  act(clearWorkspace)
  view.unmount()
  rememberWorkspace(pendingPageParentKey(child), replacement)
  await act(async () => finish())
  expect(signal?.aborted).toBe(true)
  expect(workspaceValue(pendingPageParentKey(child), '')).toBe(replacement)
})

it('keeps a pending page relationship visible without writing on a read-only host', async () => {
  mocks.writable = false
  rememberWorkspace(pendingPageParentKey(child), parent)
  open()
  expect(screen.getByText('pages.parentPending')).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'pages.createChild' })).toBeNull()
  await act(async () => new Promise((resolve) => window.setTimeout(resolve, 10)))
  expect(request).not.toHaveBeenCalled()
})
