// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clearWorkspace, rememberWorkspace } from '@/lib/workspaceState'
import { WorkspaceNavigation } from './WorkspaceNavigation'

let scrollTop = 0
const scroll = vi.fn()
function View({
  marker = true,
  readerPosition = false,
  readerPending = false,
}: {
  marker?: boolean
  readerPosition?: boolean
  readerPending?: boolean
}) {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <main data-workspace-key={location.key}>
      <h1>Source work</h1>
      {readerPosition && location.search.includes('mode=source') && (
        <section
          className="material-reader"
          data-reader-position-ready={readerPending ? undefined : true}
          data-workspace-pending={readerPending ? true : undefined}
        />
      )}
      <button
        onClick={() =>
          navigate(`${location.pathname}?mode=source&version=17&page=80`, {
            replace: true,
            state: marker ? { readerPageSync: true } : undefined,
          })
        }
      >
        Page report
      </button>
      <button
        onClick={() =>
          navigate('/learning/focus/block/3?mode=practice&version=17&page=80', {
            replace: true,
            state: { readerPageSync: true },
          })
        }
      >
        Change mode
      </button>
      <button
        onClick={() =>
          navigate('/learning/focus/block/3?mode=source&version=18&page=80', {
            replace: true,
            state: { readerPageSync: true },
          })
        }
      >
        Change source
      </button>
      <button
        onClick={() =>
          navigate('/learning/focus/block/3?mode=notes&version=17&note=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa&page=80', {
            replace: true,
            state: { readerPageSync: true },
          })
        }
      >
        Change note
      </button>
      <button
        onClick={() =>
          navigate('/notes?id=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa&page=80', {
            replace: true,
            state: { readerPageSync: true },
          })
        }
      >
        Other route
      </button>
      <button
        onClick={() =>
          navigate(`${location.pathname}${location.search}&note=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`, {
            replace: true,
            state: { readerNoteSync: true },
          })
        }
      >
        Saved note report
      </button>
      <button onClick={() => navigate(`${location.pathname}?kind=new`, { state: { activityFilterSync: true } })}>
        Filter events
      </button>
      <span>{location.search}</span>
    </main>
  )
}
function open(marker = true, kind = 'block', readerPosition = false) {
  render(
    <MemoryRouter initialEntries={[`/learning/focus/${kind}/3?mode=source&version=17&page=12`]}>
      <WorkspaceNavigation />
      <View marker={marker} readerPosition={readerPosition} />
    </MemoryRouter>,
  )
}
beforeEach(() => {
  clearWorkspace()
  sessionStorage.clear()
  scrollTop = 0
  scroll.mockClear()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id))
  vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollTop)
  vi.spyOn(window, 'scrollTo').mockImplementation((options?: ScrollToOptions | number) => {
    scroll(options)
    scrollTop = typeof options === 'object' ? (options.top ?? 0) : 0
  })
})
afterEach(() => {
  cleanup()
  clearWorkspace()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('preserves scroll and the active control when changing an activity filter', async () => {
  render(
    <MemoryRouter initialEntries={['/activity']}>
      <WorkspaceNavigation />
      <View />
    </MemoryRouter>,
  )
  await waitFor(() => expect(scroll).toHaveBeenCalled())
  const control = screen.getByRole('button', { name: 'Filter events' })
  control.focus()
  scrollTop = 500
  scroll.mockClear()
  fireEvent.click(control)
  await screen.findByText('?kind=new')
  await new Promise((resolve) => window.setTimeout(resolve, 20))
  expect(scroll).not.toHaveBeenCalled()
  expect(scrollTop).toBe(500)
  expect(document.activeElement).toBe(control)
})

it.each(['block', 'cycle', 'course'])(
  'keeps the window position and reader control in a passive %s page replacement',
  async (kind) => {
    open(true, kind)
    await waitFor(() => expect(scroll).toHaveBeenCalled())
    const control = screen.getByRole('button', { name: 'Page report' })
    control.focus()
    scrollTop = 12_000
    scroll.mockClear()
    fireEvent.click(control)
    await screen.findByText('?mode=source&version=17&page=80')
    await new Promise((resolve) => window.setTimeout(resolve, 20))
    expect(scrollTop).toBe(12_000)
    expect(scroll).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(control)
  },
)

it.each(['Change mode', 'Change source', 'Change note', 'Other route'])(
  'still restores scroll and heading focus for %s despite a reader marker',
  async (action) => {
    open()
    await waitFor(() => expect(scroll).toHaveBeenCalled())
    scrollTop = 12_000
    scroll.mockClear()
    fireEvent.click(screen.getByRole('button', { name: action }))
    await waitFor(() => expect(scroll).toHaveBeenCalled())
    expect(scrollTop).toBe(0)
    expect(document.activeElement).toBe(screen.getByRole('heading'))
  },
)

it('retains normal navigation behavior when a page change has no passive reader marker', async () => {
  open(false)
  await waitFor(() => expect(scroll).toHaveBeenCalled())
  scrollTop = 12_000
  scroll.mockClear()
  fireEvent.click(screen.getByRole('button', { name: 'Page report' }))
  await waitFor(() => expect(scroll).toHaveBeenCalled())
  expect(scrollTop).toBe(0)
})

it('keeps the reader focus when first-save ACK adds its existing note handle', async () => {
  open(true, 'course')
  await waitFor(() => expect(scroll).toHaveBeenCalled())
  const control = screen.getByRole('button', { name: 'Saved note report' })
  control.focus()
  scrollTop = 12_000
  scroll.mockClear()
  fireEvent.click(control)
  await screen.findByText('?mode=source&version=17&page=12&note=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  await new Promise((resolve) => window.setTimeout(resolve, 20))
  expect(scroll).not.toHaveBeenCalled()
  expect(document.activeElement).toBe(control)
})

it('lets the ready source own its initial page but resets a following ordinary mode', async () => {
  scrollTop = 12_000
  open(true, 'course', true)
  await new Promise((resolve) => window.setTimeout(resolve, 20))
  expect(scroll).not.toHaveBeenCalled()
  expect(scrollTop).toBe(12_000)
  fireEvent.click(screen.getByRole('button', { name: 'Change mode' }))
  await waitFor(() => expect(scroll).toHaveBeenCalled())
  expect(scrollTop).toBe(0)
})

it.each([
  { width: 1440, expected: 5000, restores: false },
  { width: 390, expected: 12000, restores: true },
  { width: undefined, expected: 12000, restores: true },
])('restores PDF pixels only for a compatible saved width ($width)', async ({ width, expected, restores }) => {
  vi.stubGlobal('innerWidth', 390)
  vi.stubGlobal('innerHeight', 1000)
  vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(25000)
  rememberWorkspace('history:/learning/focus/course/3?mode=source&version=17&page=12:default', {
    x: 0,
    y: 12000,
    focus: -1,
    width,
  })
  scrollTop = 5000
  open(true, 'course', true)
  await new Promise((resolve) => window.setTimeout(resolve, 30))
  expect(scrollTop).toBe(expected)
  expect(scroll.mock.calls.length > 0).toBe(restores)
})

it('waits beyond five seconds for an initial mobile dialog before restoring exact PDF history', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 16),
  )
  vi.stubGlobal('innerWidth', 390)
  vi.stubGlobal('innerHeight', 1000)
  vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(25000)
  rememberWorkspace('history:/learning/focus/course/3?mode=source&version=17&page=12:default', {
    x: 0,
    y: 12345,
    focus: -1,
    width: 390,
  })
  const dialog = document.createElement('div')
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  document.body.append(dialog)
  try {
    render(
      <MemoryRouter initialEntries={['/learning/focus/course/3?mode=source&version=17&page=12']}>
        <WorkspaceNavigation />
        <View readerPosition readerPending />
      </MemoryRouter>,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000)
    })
    expect(scroll).not.toHaveBeenCalled()
    dialog.remove()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16)
    })
    expect(scroll).not.toHaveBeenCalled()
    const reader = document.querySelector('.material-reader')!
    reader.removeAttribute('data-workspace-pending')
    reader.setAttribute('data-reader-position-ready', 'true')
    scrollTop = 5000
    await act(async () => {
      await vi.advanceTimersByTimeAsync(32)
    })
    expect(scrollTop).toBe(12345)
  } finally {
    dialog.remove()
  }
})
