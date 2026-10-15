// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { useEffect, useRef, type ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clearWorkspace } from '@/lib/workspaceState'
import { MaterialReader } from './MaterialPage'

let scrollTop = 0
const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')
const pdf = vi.hoisted(() => ({ numPages: 120, getPage: async () => ({ getViewport: () => ({ width: 100, height: 140 }) }) }))
vi.mock('react-pdf', () => ({ pdfjs: { GlobalWorkerOptions: {} }, Document: function MockDocument({ children, onLoadSuccess }: {
  children: ReactNode; onLoadSuccess: (document: typeof pdf) => void
}) { const load = useRef(onLoadSuccess); useEffect(() => { load.current(pdf) }, []); return <>{children}</> } }))
vi.mock('./material/ReaderParts', () => ({ ReaderPage: ({ number, width, ratio }: { number: number; width: number; ratio: number }) =>
  <div id={`reader-page-${number}`} data-reader-page={number} style={{ width, height: width * ratio }} /> }))
vi.mock('@/api', () => ({ useApi: (path: string) => ({ data: path === '/api/material/17' ? {
  version_id: 17, version: 1, resource_id: 1, resource_name: 'Synthetic.pdf', course_id: 9,
  course_name: 'Synthetic Analysis', versions: [{ id: 17, version: 1 }], annotations: [],
} : null, loading: false, error: null, updatedAt: 0, reload: () => undefined }), request: vi.fn() }))
vi.mock('@/i18n/useT', () => ({ useT: () => ({ t: (key: string, options?: { page?: number; total?: number }) =>
  key === 'pageOfTotal' ? `${key}:${options?.page}/${options?.total}` : key }) }))
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => true }))
vi.mock('@/hooks/host', () => ({ useWritableHost: () => false }))
vi.mock('@/hostAvailability', () => ({ useHostOnline: () => true, isHostOnline: () => true }))
vi.mock('@/hooks/useAnnotationOutbox', () => ({ useAnnotationOutbox: () => ({ pending: [] }) }))
vi.mock('@/hooks/useAnchorScroll', () => ({ useAnchorScroll: () => undefined }))
vi.mock('./material/useReaderGestures', () => ({ useReaderGestures: () => undefined }))
vi.mock('./material/ReaderStudyTools', () => ({ ReaderStudyTools: () => null }))
vi.mock('./material/ReaderAnnotations', () => ({ ReaderAnnotations: () => null }))
vi.mock('@/components/FirstUseHint', () => ({ FirstUseHint: () => null }))
vi.mock('@/addons/AddonWidgetSlot', () => ({ AddonWidgetSlot: () => null }))
vi.mock('@/components/ManualCardDialog', () => ({ ManualCardDialog: () => null }))

beforeEach(() => {
  clearWorkspace(); sessionStorage.clear(); scrollTop = 0
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0))
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id))
  vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollTop)
  vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(134_000)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const number = Number(this.dataset.readerPage)
    const top = number ? 800 + (number - 1) * 1100 - scrollTop : 0
    return { top, bottom: top + (number ? 1064 : 50), height: number ? 1064 : 50, width: 760, left: 0, right: 760, x: 0, y: top, toJSON: () => ({}) }
  })
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: function (this: HTMLElement) {
    scrollTop = 800 + (Number(this.dataset.readerPage) - 1) * 1100
  } })
})
afterEach(() => {
  cleanup(); clearWorkspace(); vi.restoreAllMocks(); vi.unstubAllGlobals()
  if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})

it('keeps page 12 while scrolling to the workspace header and updates only when a source reaches the reading line', async () => {
  const pageChanged = vi.fn()
  render(<MemoryRouter initialEntries={['/learning/focus/block/3?mode=source&version=17&page=12']}>
    <MaterialReader versionId={17} embedded expectedCourseId={9} onPageChange={pageChanged} />
  </MemoryRouter>)
  await screen.findByText('pageOfTotal:12/120')
  await waitFor(() => expect(scrollTop).toBe(12_900))
  scrollTop = 0; fireEvent.scroll(window)
  expect(screen.getByText('pageOfTotal:12/120')).toBeTruthy()
  expect(pageChanged.mock.calls.flat()).not.toContain(1)
  scrollTop = 700; fireEvent.scroll(window)
  await screen.findByText('pageOfTotal:1/120')
})

it('tracks the requested source below a taller embedded toolbar instead of the preceding page', async () => {
  render(<MemoryRouter initialEntries={['/learning/focus/block/3?mode=source&version=17&page=12']}>
    <MaterialReader versionId={17} embedded expectedCourseId={9} />
  </MemoryRouter>)
  await waitFor(() => expect(scrollTop).toBe(12_900))
  const controls = document.querySelector<HTMLElement>('.material-controls')!
  controls.style.top = '165px'
  scrollTop = 12_900 - 220; fireEvent.scroll(window)
  expect(screen.getByText('pageOfTotal:12/120')).toBeTruthy()
  expect(screen.queryByText('pageOfTotal:11/120')).toBeNull()
})
