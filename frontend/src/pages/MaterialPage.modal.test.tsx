// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { clearWorkspace } from '@/lib/workspaceState'
import { settleManualWorkspaceReset } from '@/manualCardDraft'
import type { Material } from '@/types'
import { MaterialPage, MaterialReader } from './MaterialPage'

const mocks = vi.hoisted(() => ({ wide: true, useApi: vi.fn() }))
const originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks')
vi.mock('@/api', () => ({ useApi: mocks.useApi, request: vi.fn(), localDate: (value: string) => value }))
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => mocks.wide }))
vi.mock('@/hooks/host', () => ({ useWritableHost: () => true }))
vi.mock('@/hostAvailability', () => ({ useHostOnline: () => true, isHostOnline: () => true }))
vi.mock('@/hooks/useAnnotationOutbox', () => ({ useAnnotationOutbox: () => ({ pending: [] }) }))
vi.mock('@/hooks/useAnchorScroll', () => ({ useAnchorScroll: () => undefined }))
vi.mock('@/pages/material/useReaderGestures', () => ({ useReaderGestures: () => undefined }))
vi.mock('react-pdf', () => ({
  pdfjs: { GlobalWorkerOptions: {} },
  Document: ({ children }: { children: ReactNode }) => <>{children}</>,
  useDocumentContext: () => ({ pdf: null }),
}))
vi.mock('@/components/Shell', () => ({ Shell: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock('@/components/EntityProperties', () => ({ EntityProperties: () => null }))
vi.mock('@/components/FirstUseHint', () => ({ FirstUseHint: () => null }))
vi.mock('@/components/LinkedItems', () => ({ LinkedItems: () => null }))
vi.mock('@/components/EntityActions', () => ({ EntityActions: () => null }))
vi.mock('@/addons/AddonWidgetSlot', () => ({ AddonWidgetSlot: () => null }))
vi.mock('@/offlineCache', () => ({ queryClient: { invalidateQueries: vi.fn().mockResolvedValue(undefined) } }))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string) => key }) }))

const material: Material = {
  version_id: 17,
  version: 1,
  resource_id: 1,
  resource_name: 'Synthetic.pdf',
  course_id: 2,
  course_name: 'Synthetic Course',
  versions: [{ id: 17, version: 1 }],
  annotations: [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      resource_id: 1,
      source_version_id: 17,
      quote: 'Synthetic source quote',
      comment: 'Own question',
      revision: 1,
      kind: 'highlight',
      resolved: false,
      created_at: '2026-10-07T10:00:00Z',
      updated_at: '2026-10-07T10:00:00Z',
      anchor: { status: 'matched', page: 12, rects: [] },
    },
  ],
}
function tree() {
  return (
    <MemoryRouter initialEntries={['/material/17?page=12']}>
      <Routes>
        <Route path="/material/:id" element={<MaterialPage />} />
      </Routes>
    </MemoryRouter>
  )
}
beforeEach(async () => {
  // jsdom supplies neither IDB nor Web Locks. Model the supported LS capability
  // instead of accidentally invoking the deliberate unsafe-close guard.
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: async (_name: string, options: unknown, callback?: () => Promise<unknown>) =>
        typeof options === 'function' ? options() : callback!(),
    },
  })
  localStorage.clear()
  sessionStorage.clear()
  clearWorkspace()
  mocks.wide = true
  await settleManualWorkspaceReset()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  mocks.useApi.mockImplementation((path: string) => ({
    data: path === '/api/material/17' ? material : null,
    error: null,
    loading: false,
    updatedAt: 0,
    reload: () => undefined,
  }))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
})
afterEach(async () => {
  cleanup()
  clearWorkspace()
  await settleManualWorkspaceReset()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  if (originalLocks) Object.defineProperty(navigator, 'locks', originalLocks)
  else Reflect.deleteProperty(navigator, 'locks')
})

it('keeps the manual modal as the only accessible dialog during desktop/mobile resize and restores the source action focus', async () => {
  const view = render(tree())
  fireEvent.click(screen.getByRole('button', { name: 'annotationsButton' }))
  fireEvent.change(screen.getByLabelText('commentLabel'), { target: { value: 'Unsaved own annotation comment' } })
  fireEvent.click(screen.getByRole('button', { name: 'manual.createAction' }))
  await screen.findByRole('dialog', { name: 'manual.title' })
  await waitFor(() => expect((screen.getByLabelText('manual.front') as HTMLTextAreaElement).disabled).toBe(false))
  mocks.wide = false
  view.rerender(tree())
  await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(1))
  expect(screen.getByRole('dialog', { name: 'manual.title' })).toBeTruthy()
  expect(screen.getByRole('dialog', { name: 'manual.title' }).getAttribute('aria-modal')).toBe('true')
  expect(screen.queryByRole('dialog', { name: 'annotationsDialogTitle' })).toBeNull()
  fireEvent.click(screen.getAllByRole('button', { name: 'manual.close' })[0])
  await screen.findByRole('dialog', { name: 'annotationsDialogTitle' })
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'manual.createAction' })))
  expect((screen.getByLabelText('commentLabel') as HTMLTextAreaElement).value).toBe('Unsaved own annotation comment')
  expect(window.confirm).not.toHaveBeenCalled()
})

it('suspends an initially mobile reader modal through rotation and returns focus in the desktop workspace', async () => {
  mocks.wide = false
  const view = render(tree())
  fireEvent.click(screen.getByRole('button', { name: 'annotationsButton' }))
  await screen.findByRole('dialog', { name: 'annotationsDialogTitle' })
  fireEvent.click(screen.getByRole('button', { name: 'manual.createAction' }))
  await screen.findByRole('dialog', { name: 'manual.title' })
  await waitFor(() => expect((screen.getByLabelText('manual.front') as HTMLTextAreaElement).disabled).toBe(false))
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
  mocks.wide = true
  view.rerender(tree())
  await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(1))
  expect(screen.getByRole('dialog', { name: 'manual.title' })).toBeTruthy()
  fireEvent.click(screen.getAllByRole('button', { name: 'manual.close' })[0])
  await screen.findByRole('dialog', { name: 'annotationsDialogTitle' })
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'manual.createAction' })))
  expect(window.confirm).not.toHaveBeenCalled()
})

it('blocks a foreign-course source before rendering the embedded reader controls', () => {
  render(
    <MemoryRouter>
      <MaterialReader versionId={17} embedded expectedCourseId={99} />
    </MemoryRouter>,
  )
  expect(screen.getByText('focusForeignSource')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'annotationsButton' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'nextPageAria' })).toBeNull()
})
