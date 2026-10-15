// SPDX-License-Identifier: AGPL-3.0-or-later
import { useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { rememberWorkspace, workspaceValue } from '@/lib/workspaceState'
import { recentHandle, rememberObject } from '@/lib/recentObjects'

type View = { x: number; y: number; focus: number; width?: number }
const controls = 'a[href],button,input,select,textarea,[contenteditable="true"],[tabindex]:not(h1)'
const validView = (value: unknown): value is View => !!value && typeof value === 'object'
  && ['x', 'y', 'focus'].every(key => Number.isFinite((value as Record<string, unknown>)[key]))
  && ((value as View).width === undefined || Number.isFinite((value as View).width))

function passiveReaderPage(previous: ReturnType<typeof useLocation>, current: ReturnType<typeof useLocation>, action: string) {
  const field = current.state?.readerPageSync === true ? 'page' : current.state?.readerNoteSync === true ? 'note' : null
  if (action !== 'REPLACE' || !field || previous.pathname !== current.pathname
    || previous.hash !== current.hash || !/^\/learning\/focus\/(?:block|cycle|course)\/[1-9]\d{0,15}$/.test(current.pathname)
    || !Number.isSafeInteger(Number(current.pathname.split('/').at(-1)))) return false
  const before = new URLSearchParams(previous.search)
  const after = new URLSearchParams(current.search)
  const value = after.get(field)
  if (after.getAll(field).length !== 1 || !value || (field === 'page'
    ? !/^[1-9]\d{0,15}$/.test(value) || !Number.isSafeInteger(Number(value))
    : !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value))) return false
  before.delete(field); after.delete(field); before.sort(); after.sort()
  return before.toString() === after.toString()
}

/** Restore history after the new route and its data have arrived, without moving dialogs. */
export function WorkspaceNavigation() {
  const location = useLocation()
  const navigate = useNavigate()
  const action = useNavigationType()
  const previousLocation = useRef(location)
  useLayoutEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat
        || !['ArrowLeft', 'ArrowRight'].includes(event.key) || event.defaultPrevented) return
      if (event.target instanceof Element && event.target.closest(
        'input,textarea,select,[contenteditable],[role="textbox"],[role="dialog"]')) return
      event.preventDefault()
      navigate(event.key === 'ArrowLeft' ? -1 : 1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [navigate])
  useLayoutEffect(() => {
    const old = history.scrollRestoration
    history.scrollRestoration = 'manual'
    return () => { history.scrollRestoration = old }
  }, [])
  useLayoutEffect(() => {
    const previous = previousLocation.current
    const passiveFilter = action !== 'POP' && location.state?.activityFilterSync === true
      && previous.pathname === '/activity' && location.pathname === '/activity' && previous.hash === location.hash
    const passivePage = passiveFilter || passiveReaderPage(previous, location, action)
    previousLocation.current = location
    const key = `history:${location.pathname}${location.search}${location.hash}:${location.key}`
    const saved = workspaceValue<View | null>(key, null, { valid: (value): value is View | null => value === null || validView(value) })
    let focused = saved?.focus ?? -1
    let restoring = true
    let readerBlockedByModal = false
    let timer: number | undefined
    let frame = 0
    const capture = () => {
      if (!restoring) rememberWorkspace(key, { x: window.scrollX, y: window.scrollY, focus: focused, width: innerWidth })
    }
    const scroll = () => { window.clearTimeout(timer); timer = window.setTimeout(capture, 120) }
    const focus = (event: FocusEvent) => {
      const main = document.querySelector('main')
      if (main?.contains(event.target as Node)) {
        focused = [...main.querySelectorAll(controls)].indexOf(event.target as Element)
        capture()
      }
    }
    const started = performance.now()
    const restore = () => {
      const main = document.querySelector<HTMLElement>(`main[data-workspace-key="${CSS.escape(location.key)}"]`)
      // PDF pages reflow at a different viewport width. Its reader owns the
      // semantic page anchor; old desktop pixel offsets are invalid on mobile.
      const compatibleReaderWidth = !main?.querySelector('.material-reader')
        || saved?.width === undefined || saved.width === innerWidth
      const waiting = !main || main.querySelector('[data-slot="skeleton"], [data-workspace-pending="true"]')
        || (action === 'POP' && saved && compatibleReaderWidth && document.documentElement.scrollHeight - innerHeight < saved.y)
      const pendingReader = main?.querySelector('.material-reader[data-workspace-pending="true"]')
      if (pendingReader && document.querySelector('[role="dialog"][aria-modal="true"]')) readerBlockedByModal = true
      // Closing a modal precedes the reader's restoration frame. Once blocked,
      // wait through that intermediate frame until its page anchor is ready.
      if (waiting && (performance.now() - started < 5000 || (readerBlockedByModal && pendingReader))) {
        frame = requestAnimationFrame(restore); return
      }
      if (!main) { restoring = false; return }
      const ref = recentHandle(location.pathname, location.search)
      const title = main.querySelector('h1')?.textContent?.trim()
      if (!waiting && ref && title && !['/notes', '/material/'].some(path => location.pathname.startsWith(path))
        && !main.querySelector('[role="alert"]'))
        rememberObject(ref, title)
      // Reporting an already visible PDF page is metadata, not a route change.
      // Keep its window position and control focus; the reader owns this scroll.
      if (passivePage) {
        focused = [...main.querySelectorAll(controls)].indexOf(document.activeElement as Element)
        restoring = false; capture(); return
      }
      if (action === 'POP' && saved && compatibleReaderWidth) window.scrollTo({ left: saved.x, top: saved.y, behavior: 'instant' })
      // A ready reader has already positioned its requested source page. Only
      // an existing history view takes precedence over that initial position.
      else if (!location.hash && !main.querySelector('[data-reader-position-ready="true"]'))
        window.scrollTo({ left: 0, top: 0, behavior: 'instant' })
      const active = document.activeElement
      // Let a dialog or an editor's deliberate autofocus keep control.
      if ((action !== 'POP' || saved) && !active?.closest('[role="dialog"], [contenteditable="true"]')) {
        const target = action === 'POP' && saved && saved.focus >= 0
          ? main.querySelectorAll<HTMLElement>(controls)[saved.focus]
          : location.hash ? document.getElementById(location.hash.slice(1)) : main.querySelector<HTMLElement>('h1')
        if (target && main.contains(target)) { if (target.tagName === 'H1') target.tabIndex = -1; target.focus({ preventScroll: true }) }
      }
      restoring = false
    }
    frame = requestAnimationFrame(restore)
    window.addEventListener('scroll', scroll, { passive: true })
    document.addEventListener('focusin', focus)
    return () => {
      cancelAnimationFrame(frame); window.clearTimeout(timer); capture()
      window.removeEventListener('scroll', scroll); document.removeEventListener('focusin', focus)
    }
  }, [location, action])
  return null
}
