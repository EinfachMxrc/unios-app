// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import {
  accumulateReaderPan,
  advanceReaderPageSwipe,
  captureReaderZoomAnchor,
  clampReaderWidth,
  initialReaderSwipeState,
  normalizeReaderWheel,
  readerWidthForWheel,
  restoreReaderZoomAnchor,
  type ReaderPoint,
  type ReaderPanPosition,
  type ReaderZoomAnchor,
} from './readerGestures'

/** Ctrl-wheel pinches have no end event; commit the layout once the burst is quiet. */
export const READER_ZOOM_SETTLE_MS = 160
/** A committed width that never renders (caller clamped or ignored it) must not lock zoom. */
export const READER_COMMIT_EXPIRY_MS = 250

type ReaderGestureOptions = {
  viewportRef: RefObject<HTMLDivElement | null>
  pageWidth: number
  onWidthChange: (width: number) => void
  onPageSwipe: (direction: -1 | 1) => void
  enabled: boolean
}
type PageAnchor = { element: HTMLElement; point: ReaderZoomAnchor }
type PendingZoom = { width: number; anchor: PageAnchor | null }
type SafariGestureEvent = Event & { scale?: number; clientX?: number; clientY?: number }
/** One live pinch: the surface is scaled on the compositor until it is committed. */
type LiveZoom = { baseWidth: number; width: number; point: ReaderPoint; surface: HTMLElement }

function pageAnchorAt(viewport: HTMLElement, point: ReaderPoint): PageAnchor | null {
  const hit = document.elementFromPoint?.(point.x, point.y)?.closest<HTMLElement>('[data-reader-page]')
  if (hit && viewport.contains(hit)) {
    const anchor = captureReaderZoomAnchor(hit.getBoundingClientRect(), point)
    if (anchor) return { element: hit, point: anchor }
  }
  let closest: HTMLElement | null = null
  let distance = Infinity
  for (const element of viewport.querySelectorAll<HTMLElement>('[data-reader-page]')) {
    const rect = element.getBoundingClientRect()
    const gap = Math.max(rect.top - point.y, point.y - rect.bottom, 0)
    if (gap < distance && rect.width > 0 && rect.height > 0) {
      closest = element
      distance = gap
      if (gap === 0) break
    }
  }
  if (!closest) return null
  const anchor = captureReaderZoomAnchor(closest.getBoundingClientRect(), point)
  return anchor ? { element: closest, point: anchor } : null
}

function gesturePoint(event: SafariGestureEvent, viewport: HTMLElement): ReaderPoint {
  if (typeof event.clientX === 'number' && typeof event.clientY === 'number') {
    return { x: event.clientX, y: event.clientY }
  }
  const rect = viewport.getBoundingClientRect()
  return {
    x: rect.left + rect.width / 2,
    y: (Math.max(0, rect.top) + Math.min(window.innerHeight, rect.bottom)) / 2,
  }
}

function zoomSurface(viewport: HTMLElement) {
  return viewport.querySelector<HTMLElement>('[data-reader-zoom-surface]') ?? viewport
}

function clearPreview(surface: HTMLElement) {
  surface.style.removeProperty('transform')
  surface.style.removeProperty('transform-origin')
  surface.style.removeProperty('will-change')
}

/**
 * PDF-only gestures. The document remains vertically scrolled by the window.
 *
 * A pinch previews with a single `scale()` matrix on the page surface, so no
 * React render, layout, or session write happens per frame. The real page
 * width changes once per gesture; the transform is removed and the anchor
 * restored in the same layout pass, before the browser paints.
 */
export function useReaderGestures({
  viewportRef,
  pageWidth,
  onWidthChange,
  onPageSwipe,
  enabled,
}: ReaderGestureOptions) {
  const callbacks = useRef({ onWidthChange, onPageSwipe })
  const committedWidth = useRef(pageWidth)
  const live = useRef<LiveZoom | null>(null)
  const frame = useRef<number | null>(null)
  const settleTimer = useRef<number | null>(null)
  const anchorToRestore = useRef<PendingZoom | null>(null)
  const previewSurface = useRef<HTMLElement | null>(null)
  const commitExpiry = useRef<number | null>(null)

  useLayoutEffect(() => {
    callbacks.current = { onWidthChange, onPageSwipe }
  }, [onWidthChange, onPageSwipe])

  useLayoutEffect(() => {
    committedWidth.current = pageWidth
    const zoom = anchorToRestore.current
    const surface = previewSurface.current
    if (!zoom) return
    anchorToRestore.current = null
    previewSurface.current = null
    if (commitExpiry.current !== null) window.clearTimeout(commitExpiry.current)
    commitExpiry.current = null
    // The new layout is committed: drop the preview matrix before measuring.
    if (surface) clearPreview(surface)
    const viewport = viewportRef.current
    if (!enabled || !viewport || !zoom.anchor || Math.abs(zoom.width - pageWidth) > 0.01) return
    if (!viewport.contains(zoom.anchor.element)) return
    const position = restoreReaderZoomAnchor(zoom.anchor.point, zoom.anchor.element.getBoundingClientRect(), {
      left: viewport.scrollLeft,
      top: window.scrollY,
      maxLeft: Math.max(0, viewport.scrollWidth - viewport.clientWidth),
    })
    viewport.scrollLeft = position.left
    window.scrollTo({ left: window.scrollX, top: position.top, behavior: 'instant' })
  }, [pageWidth, enabled, viewportRef])

  useEffect(() => {
    const currentViewport = viewportRef.current
    if (!currentViewport || !enabled) return
    const viewport = currentViewport
    let swipe = initialReaderSwipeState()
    let safariActive = false
    let safariPoint: ReaderPoint | null = null
    let safariEndedAt = -Infinity
    let panPosition: ReaderPanPosition | null = null
    const computedLineHeight = Number.parseFloat(window.getComputedStyle(viewport).lineHeight)
    const lineHeight = Number.isFinite(computedLineHeight) ? computedLineHeight : 16

    function cancelSettle() {
      if (settleTimer.current === null) return
      window.clearTimeout(settleTimer.current)
      settleTimer.current = null
    }

    function cancelFrame() {
      if (frame.current === null) return
      cancelAnimationFrame(frame.current)
      frame.current = null
    }

    function paintPreview() {
      const zoom = live.current
      if (!zoom) return
      zoom.surface.style.transform = `scale(${zoom.width / zoom.baseWidth})`
    }

    /** A committed width is waiting for React: the surface still shows the old matrix. */
    function commitPending() {
      return anchorToRestore.current !== null
    }

    function startZoom(point: ReaderPoint) {
      if (live.current) return live.current
      const surface = zoomSurface(viewport)
      // Measured untransformed, once: the origin stays put for the whole pinch.
      const rect = surface.getBoundingClientRect()
      surface.style.transformOrigin = `${point.x - rect.left}px ${point.y - rect.top}px`
      surface.style.willChange = 'transform'
      live.current = { baseWidth: committedWidth.current, width: committedWidth.current, point, surface }
      return live.current
    }

    function previewZoom(nextWidth: number, point: ReaderPoint) {
      // Until the previous layout lands (one React render), the origin cannot be measured.
      if (!live.current && commitPending()) return
      const zoom = startZoom(point)
      const next = clampReaderWidth(nextWidth)
      if (next === zoom.width) return
      zoom.width = next
      if (frame.current !== null) return
      frame.current = requestAnimationFrame(() => {
        frame.current = null
        paintPreview()
      })
    }

    function commitZoom() {
      cancelSettle()
      cancelFrame()
      const zoom = live.current
      live.current = null
      if (!zoom) return
      const appliedWidth = Math.round(zoom.width)
      if (appliedWidth === Math.round(zoom.baseWidth)) {
        clearPreview(zoom.surface)
        return
      }
      // Paint the exact final matrix, then measure what the user sees under the cursor.
      zoom.surface.style.transform = `scale(${appliedWidth / zoom.baseWidth})`
      anchorToRestore.current = { anchor: pageAnchorAt(viewport, zoom.point), width: appliedWidth }
      previewSurface.current = zoom.surface
      commitExpiry.current = window.setTimeout(() => {
        commitExpiry.current = null
        if (anchorToRestore.current?.width !== appliedWidth) return
        anchorToRestore.current = null
        if (previewSurface.current) clearPreview(previewSurface.current)
        previewSurface.current = null
      }, READER_COMMIT_EXPIRY_MS)
      callbacks.current.onWidthChange(appliedWidth)
    }

    function scheduleSettle() {
      cancelSettle()
      settleTimer.current = window.setTimeout(() => {
        settleTimer.current = null
        commitZoom()
      }, READER_ZOOM_SETTLE_MS)
    }

    function onWheel(event: WheelEvent) {
      if (event.defaultPrevented || !event.cancelable) return
      // Access deltaMode before delta values, since browsers may normalize lazily.
      const delta = normalizeReaderWheel({ deltaMode: event.deltaMode, deltaX: event.deltaX, deltaY: event.deltaY }, window.innerHeight, lineHeight)
      if (event.ctrlKey) {
        // Without preventDefault the whole webview would zoom instead of the PDF.
        event.preventDefault()
        panPosition = null
        if (safariActive || performance.now() - safariEndedAt < 100) return
        const point = { x: event.clientX, y: event.clientY }
        previewZoom(readerWidthForWheel(live.current?.width ?? committedWidth.current, delta.y), point)
        if (live.current) scheduleSettle()
        return
      }
      if (live.current) commitZoom()
      if (event.altKey && Math.abs(delta.x) > Math.abs(delta.y)) {
        event.preventDefault()
        const next = advanceReaderPageSwipe(swipe, delta, performance.now())
        swipe = next.state
        if (next.direction !== null) callbacks.current.onPageSwipe(next.direction)
        return
      }
      if (delta.x === 0 || viewport.scrollWidth <= viewport.clientWidth) return
      // Apply both axes once: canceling the horizontal default cancels vertical scrolling too.
      // Trackpad inertia already arrives as wheel deltas; extra smoothing would add latency.
      event.preventDefault()
      const position = accumulateReaderPan(panPosition, {
        left: viewport.scrollLeft,
        top: window.scrollY,
        maxLeft: viewport.scrollWidth - viewport.clientWidth,
        maxTop: Math.max(0, (document.scrollingElement ?? document.documentElement).scrollHeight - window.innerHeight),
      }, delta)
      viewport.scrollLeft = position.left
      if (delta.y) window.scrollBy({ left: 0, top: position.top - window.scrollY, behavior: 'instant' })
      panPosition = { requested: { x: position.left, y: position.top }, observed: { x: viewport.scrollLeft, y: window.scrollY } }
    }

    function onGestureStart(event: SafariGestureEvent) {
      if (event.defaultPrevented || !event.cancelable) return
      event.preventDefault()
      panPosition = null
      if (live.current) commitZoom()
      safariActive = true
      safariPoint = gesturePoint(event, viewport)
      if (!commitPending()) startZoom(safariPoint)
    }

    function onGestureChange(event: SafariGestureEvent) {
      if (!safariActive || !event.cancelable) return
      event.preventDefault()
      if (typeof event.scale !== 'number' || !Number.isFinite(event.scale) || event.scale <= 0) return
      // Safari's scale is relative to gesturestart; a late start uses the committed width as base.
      previewZoom((live.current?.baseWidth ?? committedWidth.current) * event.scale, live.current?.point ?? safariPoint!)
    }

    function onGestureEnd(event: SafariGestureEvent) {
      if (!safariActive) return
      event.preventDefault()
      safariActive = false
      safariPoint = null
      safariEndedAt = performance.now()
      commitZoom()
    }

    viewport.addEventListener('wheel', onWheel, { passive: false })
    viewport.addEventListener('gesturestart', onGestureStart, { passive: false })
    viewport.addEventListener('gesturechange', onGestureChange, { passive: false })
    viewport.addEventListener('gestureend', onGestureEnd, { passive: false })
    return () => {
      viewport.removeEventListener('wheel', onWheel)
      viewport.removeEventListener('gesturestart', onGestureStart)
      viewport.removeEventListener('gesturechange', onGestureChange)
      viewport.removeEventListener('gestureend', onGestureEnd)
      cancelFrame()
      cancelSettle()
      if (commitExpiry.current !== null) window.clearTimeout(commitExpiry.current)
      commitExpiry.current = null
      if (live.current) clearPreview(live.current.surface)
      if (previewSurface.current) clearPreview(previewSurface.current)
      live.current = null
      previewSurface.current = null
      anchorToRestore.current = null
    }
  }, [enabled, viewportRef])
}
