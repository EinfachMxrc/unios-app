// SPDX-License-Identifier: AGPL-3.0-or-later

export const MIN_READER_WIDTH = 180
export const MAX_READER_WIDTH = 1600

export type ReaderPoint = { x: number; y: number }
export type ReaderRect = { left: number; top: number; width: number; height: number }
export type ReaderZoomAnchor = ReaderPoint & { fractionX: number; fractionY: number }

/** Wheel units vary between trackpads, mice, and browser accessibility settings. */
export function normalizeReaderWheel(
  event: { deltaX: number; deltaY: number; deltaMode: number },
  pageHeight: number,
  lineHeight = 16,
) {
  const unit = event.deltaMode === 1 ? lineHeight : event.deltaMode === 2 ? pageHeight : 1
  const multiplier = Number.isFinite(unit) && unit > 0 ? unit : 1
  return {
    x: Number.isFinite(event.deltaX) ? event.deltaX * multiplier : 0,
    y: Number.isFinite(event.deltaY) ? event.deltaY * multiplier : 0,
  }
}

export function clampReaderWidth(width: number) {
  if (Number.isNaN(width)) return MIN_READER_WIDTH
  return Math.min(MAX_READER_WIDTH, Math.max(MIN_READER_WIDTH, width))
}

export function readerWidthForWheel(width: number, deltaY: number) {
  if (!Number.isFinite(deltaY)) return clampReaderWidth(width)
  // Bound single-event jumps while retaining small fractional trackpad deltas.
  return clampReaderWidth(width * Math.exp(Math.max(-1, Math.min(1, -deltaY * 0.004))))
}

export function captureReaderZoomAnchor(rect: ReaderRect, point: ReaderPoint): ReaderZoomAnchor | null {
  if (
    rect.width <= 0 ||
    rect.height <= 0 ||
    ![rect.left, rect.top, rect.width, rect.height, point.x, point.y].every(Number.isFinite)
  )
    return null
  return {
    ...point,
    // Gutter coordinates are intentional: zoom must not pull the nearest page edge to the cursor.
    fractionX: (point.x - rect.left) / rect.width,
    fractionY: (point.y - rect.top) / rect.height,
  }
}

/** Account for resized preceding pages, centered pages, and current browser scroll anchoring. */
export function restoreReaderZoomAnchor(
  anchor: ReaderZoomAnchor,
  rect: ReaderRect,
  scroll: { left: number; top: number; maxLeft: number },
) {
  return {
    left: Math.max(0, Math.min(scroll.maxLeft, scroll.left + rect.left + anchor.fractionX * rect.width - anchor.x)),
    top: Math.max(0, scroll.top + rect.top + anchor.fractionY * rect.height - anchor.y),
  }
}

export type ReaderPanPosition = { requested: ReaderPoint; observed: ReaderPoint }

/** Preserve fractions dropped by scroll offsets; external scrolling and boundaries take precedence. */
export function accumulateReaderPan(
  previous: ReaderPanPosition | null,
  current: { left: number; top: number; maxLeft: number; maxTop: number },
  delta: ReaderPoint,
) {
  const left = previous?.observed.x === current.left ? previous.requested.x : current.left
  const top = previous?.observed.y === current.top ? previous.requested.y : current.top
  return {
    left: Math.max(0, Math.min(current.maxLeft, left + delta.x)),
    top: Math.max(0, Math.min(current.maxTop, top + delta.y)),
  }
}

export type ReaderSwipeState = {
  distance: number
  lastEventAt: number
  lastSwipeAt: number
  triggered: boolean
}

export function initialReaderSwipeState(): ReaderSwipeState {
  return { distance: 0, lastEventAt: -Infinity, lastSwipeAt: -Infinity, triggered: false }
}

/** A wheel burst includes its inertia; a sustained burst can turn only one page. */
export function advanceReaderPageSwipe(state: ReaderSwipeState, delta: ReaderPoint, now: number) {
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y) || Math.abs(delta.x) <= Math.abs(delta.y)) {
    return { state, direction: null }
  }
  const newBurst = now - state.lastEventAt > 220
  const next = {
    distance: (newBurst ? 0 : state.distance) + delta.x,
    lastEventAt: now,
    lastSwipeAt: state.lastSwipeAt,
    triggered: newBurst ? now - state.lastSwipeAt < 650 : state.triggered,
  }
  let direction: -1 | 1 | null = null
  if (!next.triggered && Math.abs(next.distance) >= 72) {
    direction = next.distance > 0 ? 1 : -1
    next.triggered = true
    next.lastSwipeAt = now
  }
  return { state: next, direction }
}

/** The page width a zoom level of 100 % refers to. */
export const READER_BASE_WIDTH = 760

/** The zoom level a page width shows as, in whole percent. */
export function readerPercentForWidth(width: number) {
  return Math.round((width / READER_BASE_WIDTH) * 100)
}

/** A typed zoom level ("150", "150 %") as a page width within the reader limits, or null when it is not a positive number. */
export function readerWidthForPercent(typed: string): number | null {
  const percent = Number(typed.replace('%', '').trim())
  if (!typed.trim() || !Number.isFinite(percent) || percent <= 0) return null
  return clampReaderWidth(Math.round((READER_BASE_WIDTH * percent) / 100))
}

/** Preview-style zoom steps: proportional, so small and large pages feel the same. */
export const READER_ZOOM_STEP = 1.15

export function readerWidthForStep(width: number, direction: -1 | 1) {
  return clampReaderWidth(Math.round(direction > 0 ? width * READER_ZOOM_STEP : width / READER_ZOOM_STEP))
}

export type ReaderZoomCommand = { kind: 'step'; direction: -1 | 1 } | { kind: 'fit' }

/** Cmd/Ctrl +, -, 0 inside the reader zoom the PDF instead of the whole webview. */
export function readerZoomCommand(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>,
): ReaderZoomCommand | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null
  if (event.key === '+' || event.key === '=') return { kind: 'step', direction: 1 }
  if (event.key === '-' || event.key === '_') return { kind: 'step', direction: -1 }
  if (event.key === '0') return { kind: 'fit' }
  return null
}

/** Cmd/Ctrl+Shift+B toggles the note beside the PDF. */
export function isReaderSplitToggle(
  event: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>,
) {
  return (
    (event.ctrlKey || event.metaKey) &&
    event.shiftKey &&
    !event.altKey &&
    (event.code === 'KeyB' || event.key.toLowerCase() === 'b')
  )
}
