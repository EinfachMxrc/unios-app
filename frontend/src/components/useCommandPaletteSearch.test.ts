// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchResponse } from '@/types'
import { paletteSearchFixture } from './commandPalette.testFixtures'
import { useCommandPaletteSearch } from './useCommandPaletteSearch'

const api = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('@/api', () => api)

function deferred() {
  let resolve!: (response: SearchResponse) => void
  let reject!: (cause: Error) => void
  const promise = new Promise<SearchResponse>((accept, fail) => { resolve = accept; reject = fail })
  return { promise, resolve, reject }
}

describe('command palette query ownership', () => {
  beforeEach(() => { vi.useFakeTimers(); api.request.mockReset() })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('waits exactly 250 ms and debounces rapid changes into one trimmed, encoded request', async () => {
    api.request.mockResolvedValue(paletteSearchFixture())
    const { result, rerender } = renderHook(({ query }) => useCommandPaletteSearch(query, true), { initialProps: { query: 'a' } })
    await act(async () => vi.advanceTimersByTime(500))
    expect(api.request).not.toHaveBeenCalled()
    rerender({ query: 'al' })
    await act(async () => vi.advanceTimersByTime(249))
    expect(api.request).not.toHaveBeenCalled()
    rerender({ query: '  alpha & beta  ' })
    await act(async () => vi.advanceTimersByTime(249))
    expect(api.request).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTime(1))
    expect(api.request).toHaveBeenCalledTimes(1)
    expect(api.request.mock.calls[0][0]).toBe('/api/search?q=alpha%20%26%20beta')
    expect(result.current?.results?.note_results[0].title).toBe('synthetic-note-0')
    expect(result.current?.searching).toBe(false)
  })

  it('hides loading and ignores an old response when input is shortened below two characters', async () => {
    const old = deferred()
    api.request.mockReturnValue(old.promise)
    const { result, rerender } = renderHook(({ query }) => useCommandPaletteSearch(query, true), { initialProps: { query: 'old' } })
    await act(async () => vi.advanceTimersByTime(250))
    expect(result.current?.searching).toBe(true)
    const signal = api.request.mock.calls[0][1].signal as AbortSignal
    rerender({ query: 'o' })
    expect(signal.aborted).toBe(true)
    expect(result.current).toBeNull()
    // This request deliberately ignores abort to exercise the success-path guard.
    await act(async () => old.resolve(paletteSearchFixture(1, 'old')))
    expect(result.current).toBeNull()
  })

  it('keeps a newer result when the older request resolves after it', async () => {
    const old = deferred()
    const latest = deferred()
    api.request.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise)
    const { result, rerender } = renderHook(({ query }) => useCommandPaletteSearch(query, true), { initialProps: { query: 'old' } })
    await act(async () => vi.advanceTimersByTime(250))
    rerender({ query: 'latest' })
    expect(result.current).toBeNull()
    await act(async () => vi.advanceTimersByTime(250))
    await act(async () => latest.resolve(paletteSearchFixture(1, 'latest')))
    await act(async () => old.resolve(paletteSearchFixture(1, 'old')))
    expect(result.current?.query).toBe('latest')
    expect(result.current?.results?.note_results[0].title).toBe('latest-note-0')
  })

  it('ignores a cancelled response even when the user returns to the same query', async () => {
    const first = deferred()
    const current = deferred()
    api.request.mockReturnValueOnce(first.promise).mockReturnValueOnce(current.promise)
    const { result, rerender } = renderHook(({ query }) => useCommandPaletteSearch(query, true), { initialProps: { query: 'alpha' } })
    await act(async () => vi.advanceTimersByTime(250))
    rerender({ query: 'beta' })
    rerender({ query: 'alpha' })
    await act(async () => vi.advanceTimersByTime(250))
    await act(async () => first.resolve(paletteSearchFixture(1, 'first')))
    expect(result.current?.searching).toBe(true)
    expect(result.current?.results).toBeNull()
    await act(async () => current.resolve(paletteSearchFixture(1, 'current')))
    expect(result.current?.results?.note_results[0].title).toBe('current-note-0')
  })

  it('hides old errors immediately and prevents cancelled errors from replacing the current query', async () => {
    const latest = deferred()
    const old = deferred()
    api.request.mockRejectedValueOnce(new Error('first failed')).mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise)
    const { result, rerender } = renderHook(({ query }) => useCommandPaletteSearch(query, true), { initialProps: { query: 'first' } })
    await act(async () => vi.advanceTimersByTime(250))
    expect(result.current?.error).toContain('first failed')
    rerender({ query: 'old' })
    expect(result.current).toBeNull()
    await act(async () => vi.advanceTimersByTime(250))
    rerender({ query: 'latest' })
    await act(async () => vi.advanceTimersByTime(250))
    await act(async () => old.reject(new Error('cancelled failure')))
    expect(result.current?.query).toBe('latest')
    expect(result.current?.error).toBe('')
    await act(async () => latest.resolve(paletteSearchFixture()))
    expect(result.current?.error).toBe('')
  })

  it('cancels both timers and requests when disabled or unmounted', async () => {
    const old = deferred()
    api.request.mockReturnValue(old.promise)
    const { result, rerender, unmount } = renderHook(({ enabled }) => useCommandPaletteSearch('synthetic', enabled), { initialProps: { enabled: true } })
    rerender({ enabled: false })
    await act(async () => vi.advanceTimersByTime(250))
    expect(api.request).not.toHaveBeenCalled()
    rerender({ enabled: true })
    await act(async () => vi.advanceTimersByTime(250))
    const signal = api.request.mock.calls[0][1].signal as AbortSignal
    rerender({ enabled: false })
    expect(result.current).toBeNull()
    expect(signal.aborted).toBe(true)
    rerender({ enabled: true })
    await act(async () => vi.advanceTimersByTime(250))
    const finalSignal = api.request.mock.calls[1][1].signal as AbortSignal
    unmount()
    expect(finalSignal.aborted).toBe(true)
    await act(async () => old.resolve(paletteSearchFixture()))
  })
})
