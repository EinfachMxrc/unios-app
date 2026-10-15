// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import {
  accumulateReaderPan,
  advanceReaderPageSwipe,
  captureReaderZoomAnchor,
  clampReaderWidth,
  initialReaderSwipeState,
  normalizeReaderWheel,
  readerPercentForWidth,
  readerWidthForPercent,
  readerWidthForStep,
  readerWidthForWheel,
  readerZoomCommand,
  isReaderSplitToggle,
  restoreReaderZoomAnchor,
} from './readerGestures'

describe('reader wheel geometry', () => {
  it('normalizes pixels, lines and viewport pages without losing fractional deltas', () => {
    expect(normalizeReaderWheel({ deltaX: 0.25, deltaY: -1.5, deltaMode: 0 }, 800)).toEqual({ x: 0.25, y: -1.5 })
    expect(normalizeReaderWheel({ deltaX: 2, deltaY: -3, deltaMode: 1 }, 800, 20)).toEqual({ x: 40, y: -60 })
    expect(normalizeReaderWheel({ deltaX: -1, deltaY: 0.5, deltaMode: 2 }, 800)).toEqual({ x: -800, y: 400 })
    expect(normalizeReaderWheel({ deltaX: NaN, deltaY: Infinity, deltaMode: 0 }, 800)).toEqual({ x: 0, y: 0 })
  })

  it('bounds zoom while retaining tiny trackpad movements', () => {
    expect(readerWidthForWheel(760, -10)).toBeGreaterThan(760)
    expect(readerWidthForWheel(760, 10)).toBeLessThan(760)
    expect(readerWidthForWheel(760, -0.01)).toBeGreaterThan(760)
    expect(readerWidthForWheel(180, 10_000)).toBe(180)
    expect(readerWidthForWheel(1600, -10_000)).toBe(1600)
    expect(readerWidthForWheel(760, NaN)).toBe(760)
    expect(clampReaderWidth(NaN)).toBe(180)
  })

  it('keeps the same page fraction under the cursor when preceding pages grow', () => {
    const anchor = captureReaderZoomAnchor({ left: 80, top: -300, width: 800, height: 1200 }, { x: 400, y: 300 })!
    expect(anchor).toEqual({ x: 400, y: 300, fractionX: 0.4, fractionY: 0.5 })
    const scroll = restoreReaderZoomAnchor(
      anchor,
      { left: 80, top: 200, width: 1000, height: 1500 },
      { left: 50, top: 2000, maxLeft: 600 },
    )
    expect(scroll).toEqual({ left: 130, top: 2650 })
    expect(200 + anchor.fractionY * 1500 - (scroll.top - 2000)).toBe(300)
  })

  it('handles centered pages, gutters and scroll boundaries', () => {
    const anchor = captureReaderZoomAnchor({ left: 300, top: 100, width: 400, height: 600 }, { x: 200, y: 50 })!
    expect(anchor.fractionX).toBe(-0.25)
    expect(
      restoreReaderZoomAnchor(
        anchor,
        { left: 250, top: 100, width: 600, height: 900 },
        { left: 0, top: 0, maxLeft: 50 },
      ),
    ).toEqual({ left: 0, top: 0 })
    expect(
      restoreReaderZoomAnchor(
        { x: 0, y: 0, fractionX: 1, fractionY: 0 },
        { left: 0, top: 0, width: 800, height: 600 },
        { left: 0, top: 0, maxLeft: 250 },
      ).left,
    ).toBe(250)
    expect(captureReaderZoomAnchor({ left: 0, top: 0, width: 0, height: 600 }, { x: 10, y: 10 })).toBeNull()
    expect(captureReaderZoomAnchor({ left: 0, top: 0, width: 800, height: NaN }, { x: 10, y: 10 })).toBeNull()
  })

  it('retains pan fractions while external movement and scroll boundaries take precedence', () => {
    const previous = { requested: { x: 10.4, y: 100.4 }, observed: { x: 10, y: 100 } }
    expect(
      accumulateReaderPan(previous, { left: 10, top: 100, maxLeft: 500, maxTop: 2000 }, { x: 0.3, y: 0.3 }),
    ).toEqual({ left: 10.700000000000001, top: 100.7 })
    expect(accumulateReaderPan(previous, { left: 30, top: 300, maxLeft: 500, maxTop: 2000 }, { x: 1, y: 2 })).toEqual({
      left: 31,
      top: 302,
    })
    expect(accumulateReaderPan(null, { left: 500, top: 2000, maxLeft: 500, maxTop: 2000 }, { x: 50, y: 100 })).toEqual({
      left: 500,
      top: 2000,
    })
  })
})

describe('intentional page swipes', () => {
  it('uses a threshold and never turns more than one page during inertia', () => {
    let step = advanceReaderPageSwipe(initialReaderSwipeState(), { x: 30, y: 0 }, 0)
    expect(step.direction).toBeNull()
    step = advanceReaderPageSwipe(step.state, { x: 45, y: 5 }, 30)
    expect(step.direction).toBe(1)
    for (const now of [100, 200, 350, 500, 650, 800]) {
      step = advanceReaderPageSwipe(step.state, { x: 100, y: 0 }, now)
      expect(step.direction).toBeNull()
    }
    step = advanceReaderPageSwipe(step.state, { x: -80, y: 0 }, 1100)
    expect(step.direction).toBe(-1)
  })

  it('ignores dominant vertical scrolling and an immediate second burst', () => {
    const start = initialReaderSwipeState()
    expect(advanceReaderPageSwipe(start, { x: 100, y: 110 }, 0)).toEqual({ state: start, direction: null })
    const first = advanceReaderPageSwipe(start, { x: 80, y: 0 }, 10)
    expect(first.direction).toBe(1)
    const cooldown = advanceReaderPageSwipe(first.state, { x: 80, y: 0 }, 310)
    expect(cooldown.direction).toBeNull()
    expect(advanceReaderPageSwipe(cooldown.state, { x: 80, y: 0 }, 900).direction).toBe(1)
  })
})

describe('reader keyboard zoom', () => {
  it('maps Cmd/Ctrl plus, minus and zero to PDF zoom commands', () => {
    const base = { ctrlKey: false, metaKey: true, altKey: false }
    expect(readerZoomCommand({ ...base, key: '=' })).toEqual({ kind: 'step', direction: 1 })
    expect(readerZoomCommand({ ...base, key: '+' })).toEqual({ kind: 'step', direction: 1 })
    expect(readerZoomCommand({ ...base, key: '-' })).toEqual({ kind: 'step', direction: -1 })
    expect(readerZoomCommand({ ...base, metaKey: false, ctrlKey: true, key: '0' })).toEqual({ kind: 'fit' })
    expect(readerZoomCommand({ ...base, metaKey: false, key: '=' })).toBeNull()
    expect(readerZoomCommand({ ...base, altKey: true, key: '=' })).toBeNull()
    expect(readerZoomCommand({ ...base, key: 'k' })).toBeNull()
  })

  it('steps proportionally and stays within reader bounds', () => {
    expect(readerWidthForStep(760, 1)).toBe(874)
    expect(readerWidthForStep(874, -1)).toBe(760)
    expect(readerWidthForStep(1550, 1)).toBe(1600)
    expect(readerWidthForStep(190, -1)).toBe(180)
  })
})

describe('reader split toggle', () => {
  it('accepts Cmd/Ctrl+Shift+B on any keyboard layout and nothing else', () => {
    const base = { key: 'B', code: 'KeyB', ctrlKey: false, metaKey: true, shiftKey: true, altKey: false }
    expect(isReaderSplitToggle(base)).toBe(true)
    expect(isReaderSplitToggle({ ...base, metaKey: false, ctrlKey: true })).toBe(true)
    // Dvorak and similar layouts report the letter even when the physical key differs.
    expect(isReaderSplitToggle({ ...base, code: 'KeyX', key: 'b' })).toBe(true)
    expect(isReaderSplitToggle({ ...base, shiftKey: false })).toBe(false)
    expect(isReaderSplitToggle({ ...base, altKey: true })).toBe(false)
    expect(isReaderSplitToggle({ ...base, metaKey: false })).toBe(false)
  })
})

describe('typed zoom level', () => {
  it('turns a typed percentage into a page width and back', () => {
    expect(readerWidthForPercent('100')).toBe(760)
    expect(readerWidthForPercent(' 150 % ')).toBe(1140)
    expect(readerPercentForWidth(1140)).toBe(150)
  })
  it('keeps typed values inside the reader limits', () => {
    expect(readerWidthForPercent('5')).toBe(180)
    expect(readerWidthForPercent('900')).toBe(1600)
  })
  it('ignores input that is not a positive number, so the zoom stays as it was', () => {
    expect(readerWidthForPercent('')).toBeNull()
    expect(readerWidthForPercent('abc')).toBeNull()
    expect(readerWidthForPercent('0')).toBeNull()
  })
})
