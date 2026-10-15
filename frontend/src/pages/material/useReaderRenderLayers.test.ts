// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { READER_RENDER_IDLE_MS, useReaderRenderLayers } from './useReaderRenderLayers'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
const advance = (milliseconds: number) =>
  act(() => {
    vi.advanceTimersByTime(milliseconds)
  })

describe('deferred PDF rendering', () => {
  it('keeps a finished raster through a burst and requests only the final idle width', () => {
    const { result, rerender } = renderHook(({ width }) => useReaderRenderLayers(width), {
      initialProps: { width: 760 },
    })
    expect(vi.getTimerCount()).toBe(0)
    rerender({ width: 900 })
    advance(READER_RENDER_IDLE_MS - 1)
    expect(result.current.currentWidth).toBe(760)
    expect(result.current.pendingWidth).toBeNull()
    rerender({ width: 1000 })
    advance(READER_RENDER_IDLE_MS - 1)
    expect(result.current.pendingWidth).toBeNull()
    advance(1)
    expect(result.current.currentWidth).toBe(760)
    expect(result.current.pendingWidth).toBe(1000)
    act(() => result.current.rendered(1000))
    expect(result.current.currentWidth).toBe(1000)
    expect(result.current.pendingWidth).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects an obsolete render completion when another gesture has superseded it', () => {
    const { result, rerender } = renderHook(({ width }) => useReaderRenderLayers(width), {
      initialProps: { width: 760 },
    })
    rerender({ width: 900 })
    advance(READER_RENDER_IDLE_MS)
    rerender({ width: 1100 })
    act(() => result.current.rendered(900))
    expect(result.current.currentWidth).toBe(760)
    expect(result.current.pendingWidth).toBeNull()
    advance(READER_RENDER_IDLE_MS)
    expect(result.current.pendingWidth).toBe(1100)
  })

  it('retains the last good page on rendering failure and permits a later zoom attempt', () => {
    const { result, rerender } = renderHook(({ width }) => useReaderRenderLayers(width), {
      initialProps: { width: 760 },
    })
    rerender({ width: 900 })
    advance(READER_RENDER_IDLE_MS)
    act(() => result.current.failed(900))
    expect(result.current.currentWidth).toBe(760)
    expect(result.current.pendingWidth).toBeNull()
    expect(result.current.hasError).toBe(true)
    rerender({ width: 1000 })
    expect(result.current.hasError).toBe(false)
    advance(READER_RENDER_IDLE_MS)
    act(() => result.current.rendered(1000))
    expect(result.current.currentWidth).toBe(1000)
  })

  it('keeps an initial layer failure visible after a zoom burst returns to its width', () => {
    const { result, rerender } = renderHook(({ width }) => useReaderRenderLayers(width), {
      initialProps: { width: 760 },
    })
    act(() => result.current.failed(760))
    expect(result.current.hasError).toBe(true)
    rerender({ width: 900 })
    expect(result.current.hasError).toBe(true)
    rerender({ width: 760 })
    advance(READER_RENDER_IDLE_MS)
    expect(result.current.currentWidth).toBe(760)
    expect(result.current.pendingWidth).toBeNull()
    expect(result.current.hasError).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('retains a late initial failure during another desired width until its replacement finishes', () => {
    const { result, rerender } = renderHook(({ width }) => useReaderRenderLayers(width), {
      initialProps: { width: 760 },
    })
    rerender({ width: 900 })
    advance(READER_RENDER_IDLE_MS)
    act(() => result.current.failed(760))
    expect(result.current.currentWidth).toBe(760)
    expect(result.current.pendingWidth).toBe(900)
    expect(result.current.hasError).toBe(true)
    // A later zoom still must not conceal the damaged active page during idle.
    rerender({ width: 1000 })
    expect(result.current.hasError).toBe(true)
    advance(READER_RENDER_IDLE_MS)
    expect(result.current.pendingWidth).toBe(1000)
    expect(result.current.hasError).toBe(true)
    act(() => result.current.rendered(1000))
    expect(result.current.currentWidth).toBe(1000)
    expect(result.current.pendingWidth).toBeNull()
    expect(result.current.hasError).toBe(false)
  })

  it('ignores obsolete pending failures while a different replacement is rendering', () => {
    const { result, rerender } = renderHook(({ width }) => useReaderRenderLayers(width), {
      initialProps: { width: 760 },
    })
    rerender({ width: 900 })
    advance(READER_RENDER_IDLE_MS)
    rerender({ width: 1100 })
    advance(READER_RENDER_IDLE_MS)
    act(() => result.current.failed(900))
    expect(result.current.currentWidth).toBe(760)
    expect(result.current.pendingWidth).toBe(1100)
    expect(result.current.hasError).toBe(false)
  })

  it('cancels idle work when a lazy page leaves the rendered region', () => {
    const { rerender, unmount } = renderHook(({ width }) => useReaderRenderLayers(width), {
      initialProps: { width: 760 },
    })
    rerender({ width: 900 })
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
