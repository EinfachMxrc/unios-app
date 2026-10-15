// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { READER_COMMIT_EXPIRY_MS, READER_ZOOM_SETTLE_MS, useReaderGestures } from './useReaderGestures'

let nextFrame = 0
let frames: Map<number, FrameRequestCallback>

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  frames = new Map()
  nextFrame = 0
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback)
    return nextFrame
  }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => frames.delete(id)))
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined)
  vi.spyOn(performance, 'now').mockReturnValue(1000)
  vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(3000)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function clampWidth(width: number) {
  return Math.min(1600, Math.max(180, width))
}

function flushFrame() {
  act(() => {
    const queued = [...frames.values()]
    frames.clear()
    queued.forEach(callback => callback(0))
  })
}

function settle() {
  act(() => { vi.advanceTimersByTime(READER_ZOOM_SETTLE_MS) })
}

function setup(enabled = true) {
  const viewport = document.createElement('div')
  const surface = document.createElement('div')
  surface.dataset.readerZoomSurface = ''
  const page = document.createElement('div')
  page.dataset.readerPage = '3'
  surface.append(page)
  viewport.append(surface)
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 80, top: -400, width: 760, height: 3000, bottom: 2600, right: 840, x: 80, y: -400, toJSON: () => ({}) })
  document.body.append(viewport)
  Object.defineProperty(viewport, 'scrollWidth', { value: 1200, configurable: true })
  Object.defineProperty(viewport, 'clientWidth', { value: 600, configurable: true })
  vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({ left: 80, top: 0, width: 600, height: 800, bottom: 800, right: 680, x: 80, y: 0, toJSON: () => ({}) })
  vi.spyOn(page, 'getBoundingClientRect').mockReturnValue({ left: 80, top: -400, width: 760, height: 1140, bottom: 740, right: 840, x: 80, y: -400, toJSON: () => ({}) })
  const onWidthChange = vi.fn()
  const onPageSwipe = vi.fn()
  const viewportRef = { current: viewport }
  const hook = renderHook(({ pageWidth, active, onSwipe }) => useReaderGestures({
    viewportRef, pageWidth, onWidthChange, onPageSwipe: onSwipe, enabled: active,
  }), { initialProps: { pageWidth: 760, active: enabled, onSwipe: onPageSwipe } })
  return { viewport, surface, page, onWidthChange, onPageSwipe, ...hook }
}

function wheel(target: HTMLElement, init: WheelEventInit = {}) {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: 400, clientY: 200, ...init })
  act(() => { target.dispatchEvent(event) })
  return event
}

function gesture(target: HTMLElement, type: string, scale?: number) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, { scale, clientX: 400, clientY: 200 })
  act(() => { target.dispatchEvent(event) })
  return event
}

describe('PDF gesture listeners', () => {
  it('leaves outside gestures, pure vertical momentum, and disabled readers untouched', () => {
    const { viewport, onWidthChange, rerender, onPageSwipe } = setup()
    expect(wheel(document.body, { ctrlKey: true, deltaY: -10 }).defaultPrevented).toBe(false)
    expect(gesture(document.body, 'gesturestart').defaultPrevented).toBe(false)
    expect(wheel(viewport, { deltaY: 80 }).defaultPrevented).toBe(false)
    expect(window.scrollBy).not.toHaveBeenCalled()
    rerender({ pageWidth: 760, active: false, onSwipe: onPageSwipe })
    expect(wheel(viewport, { ctrlKey: true, deltaY: -10 }).defaultPrevented).toBe(false)
    flushFrame()
    expect(onWidthChange).not.toHaveBeenCalled()
  })

  it('previews a pinch on the compositor and commits one layout with the cursor anchor', () => {
    const { viewport, surface, page, onWidthChange, onPageSwipe, rerender } = setup()
    expect(wheel(viewport, { ctrlKey: true, deltaY: -5 }).defaultPrevented).toBe(true)
    wheel(viewport, { ctrlKey: true, deltaY: -5 })
    expect(frames.size).toBe(1)
    expect(surface.style.transformOrigin).toBe('320px 600px')
    flushFrame()
    // The preview is one matrix; neither React nor layout hears about it yet.
    expect(Number(/scale\(([\d.]+)\)/.exec(surface.style.transform)?.[1])).toBeCloseTo(clampWidth(760 * Math.exp(0.04)) / 760, 10)
    expect(surface.style.willChange).toBe('transform')
    expect(onWidthChange).not.toHaveBeenCalled()
    expect(page.getBoundingClientRect).not.toHaveBeenCalled()
    settle()
    expect(onWidthChange).toHaveBeenCalledOnce()
    const nextWidth = onWidthChange.mock.calls[0][0] as number
    expect(nextWidth).toBe(Math.round(760 * Math.exp(0.04)))
    const nextHeight = nextWidth * 1.5
    vi.mocked(page.getBoundingClientRect).mockReturnValue({ left: 80, top: -338, width: nextWidth, height: nextHeight, bottom: -338 + nextHeight, right: 80 + nextWidth, x: 80, y: -338, toJSON: () => ({}) })
    rerender({ pageWidth: nextWidth, active: true, onSwipe: onPageSwipe })
    expect(surface.style.transform).toBe('')
    expect(surface.style.willChange).toBe('')
    expect(viewport.scrollLeft).toBeCloseTo(80 + 320 / 760 * nextWidth - 400)
    expect(window.scrollTo).toHaveBeenCalledWith({ left: window.scrollX, top: window.scrollY - 338 + 600 / 1140 * nextHeight - 200, behavior: 'instant' })
  })

  it('keeps a continued pinch growing from the uncommitted width', () => {
    const { viewport, onWidthChange } = setup()
    wheel(viewport, { ctrlKey: true, deltaY: -50 })
    act(() => { vi.advanceTimersByTime(READER_ZOOM_SETTLE_MS - 10) })
    wheel(viewport, { ctrlKey: true, deltaY: -50 })
    act(() => { vi.advanceTimersByTime(READER_ZOOM_SETTLE_MS - 10) })
    expect(onWidthChange).not.toHaveBeenCalled()
    settle()
    expect(onWidthChange).toHaveBeenCalledExactlyOnceWith(Math.round(760 * Math.exp(0.4)))
  })

  it('drops the preview without a layout change when the pinch returns to its start', () => {
    const { viewport, surface, onWidthChange } = setup()
    wheel(viewport, { ctrlKey: true, deltaY: -20 })
    wheel(viewport, { ctrlKey: true, deltaY: 20 })
    flushFrame()
    settle()
    expect(onWidthChange).not.toHaveBeenCalled()
    expect(surface.style.transform).toBe('')
  })

  it('starts no new preview while the previous width is still waiting for React', () => {
    const { viewport, surface, onWidthChange, onPageSwipe, rerender } = setup()
    wheel(viewport, { ctrlKey: true, deltaY: -50 })
    settle()
    expect(onWidthChange).toHaveBeenCalledOnce()
    const committedMatrix = surface.style.transform
    // A wheel event in the gap between commit and render must not re-measure a transformed surface.
    expect(wheel(viewport, { ctrlKey: true, deltaY: -50 }).defaultPrevented).toBe(true)
    flushFrame()
    settle()
    expect(surface.style.transform).toBe(committedMatrix)
    expect(onWidthChange).toHaveBeenCalledOnce()
    rerender({ pageWidth: onWidthChange.mock.calls[0][0] as number, active: true, onSwipe: onPageSwipe })
    expect(surface.style.transform).toBe('')
    wheel(viewport, { ctrlKey: true, deltaY: -50 })
    settle()
    expect(onWidthChange).toHaveBeenCalledTimes(2)
  })

  it('releases an unrendered commit so zoom never stays locked', () => {
    const { viewport, surface, onWidthChange } = setup()
    wheel(viewport, { ctrlKey: true, deltaY: -50 })
    settle()
    expect(onWidthChange).toHaveBeenCalledOnce()
    // The caller ignored the width: after the expiry the preview is gone and pinching works again.
    act(() => { vi.advanceTimersByTime(READER_COMMIT_EXPIRY_MS) })
    expect(surface.style.transform).toBe('')
    wheel(viewport, { ctrlKey: true, deltaY: -50 })
    settle()
    expect(onWidthChange).toHaveBeenCalledTimes(2)
  })

  it('accumulates tiny pinch deltas across frames instead of discarding them', () => {
    const { viewport, onWidthChange } = setup()
    for (let i = 0; i < 40; i++) {
      wheel(viewport, { ctrlKey: true, deltaY: -0.05 })
      flushFrame()
    }
    settle()
    expect(onWidthChange).toHaveBeenCalledOnce()
    expect(onWidthChange.mock.lastCall?.[0]).toBeGreaterThan(760)
  })

  it('leaves split-view resize and toolbar width changes to their caller', () => {
    const { viewport, rerender, onPageSwipe } = setup()
    viewport.scrollLeft = 40
    rerender({ pageWidth: 820, active: true, onSwipe: onPageSwipe })
    expect(viewport.scrollLeft).toBe(40)
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  it('pans an overflowing PDF diagonally and forwards vertical movement once', () => {
    const { viewport } = setup()
    viewport.scrollLeft = 50
    expect(wheel(viewport, { deltaX: 40, deltaY: 25 }).defaultPrevented).toBe(true)
    expect(viewport.scrollLeft).toBe(90)
    expect(window.scrollBy).toHaveBeenCalledExactlyOnceWith({ left: 0, top: 25, behavior: 'instant' })
    Object.defineProperty(viewport, 'scrollWidth', { value: 600 })
    expect(wheel(viewport, { deltaX: 40 }).defaultPrevented).toBe(false)
  })

  it('accumulates horizontal subpixels when the browser rounds scrollLeft', () => {
    const { viewport } = setup()
    let observed = 0
    Object.defineProperty(viewport, 'scrollLeft', { configurable: true, get: () => observed, set: (value: number) => { observed = Math.round(value) } })
    for (let i = 0; i < 5; i++) wheel(viewport, { deltaX: 0.3 })
    expect(viewport.scrollLeft).toBe(2)
    // A scrollbar or other caller owns the new position immediately.
    viewport.scrollLeft = 30
    wheel(viewport, { deltaX: 1 })
    expect(viewport.scrollLeft).toBe(31)
  })

  it('turns one page per Alt swipe burst and reads current callbacks', () => {
    const { viewport, onPageSwipe, rerender } = setup()
    const nextSwipe = vi.fn()
    rerender({ pageWidth: 760, active: true, onSwipe: nextSwipe })
    wheel(viewport, { altKey: true, deltaX: 35 })
    wheel(viewport, { altKey: true, deltaX: 45 })
    wheel(viewport, { altKey: true, deltaX: 100 })
    expect(nextSwipe).toHaveBeenCalledExactlyOnceWith(1)
    expect(onPageSwipe).not.toHaveBeenCalled()
    expect(viewport.scrollLeft).toBe(0)
  })

  it('uses Safari scale relative to gesturestart and avoids duplicate Ctrl-wheel zoom', () => {
    const { viewport, onWidthChange } = setup()
    expect(gesture(viewport, 'gesturestart').defaultPrevented).toBe(true)
    gesture(viewport, 'gesturechange', 1.2)
    wheel(viewport, { ctrlKey: true, deltaY: -80 })
    gesture(viewport, 'gesturechange', 1.4)
    flushFrame()
    expect(onWidthChange).not.toHaveBeenCalled()
    expect(gesture(viewport, 'gestureend').defaultPrevented).toBe(true)
    expect(onWidthChange).toHaveBeenCalledExactlyOnceWith(1064)
    wheel(viewport, { ctrlKey: true, deltaY: -80 })
    flushFrame()
    settle()
    expect(onWidthChange).toHaveBeenCalledOnce()
  })

  it('bounds Safari zoom and ignores invalid scale', () => {
    const { viewport, onWidthChange, onPageSwipe, rerender } = setup()
    gesture(viewport, 'gesturestart')
    gesture(viewport, 'gesturechange', NaN)
    gesture(viewport, 'gestureend')
    expect(onWidthChange).not.toHaveBeenCalled()
    gesture(viewport, 'gesturestart')
    gesture(viewport, 'gesturechange', 100)
    gesture(viewport, 'gestureend')
    expect(onWidthChange).toHaveBeenLastCalledWith(1600)
    rerender({ pageWidth: 1600, active: true, onSwipe: onPageSwipe })
    gesture(viewport, 'gesturestart')
    gesture(viewport, 'gesturechange', 0.001)
    gesture(viewport, 'gestureend')
    expect(onWidthChange).toHaveBeenLastCalledWith(180)
  })

  it('removes scoped listeners and cancels queued work on unmount', () => {
    const { viewport, surface, unmount, onWidthChange } = setup()
    wheel(viewport, { ctrlKey: true, deltaY: -10 })
    flushFrame()
    wheel(viewport, { ctrlKey: true, deltaY: -10 })
    expect(frames.size).toBe(1)
    unmount()
    expect(frames.size).toBe(0)
    expect(surface.style.transform).toBe('')
    expect(wheel(viewport, { ctrlKey: true, deltaY: -10 }).defaultPrevented).toBe(false)
    flushFrame()
    settle()
    expect(onWidthChange).not.toHaveBeenCalled()
  })
})
