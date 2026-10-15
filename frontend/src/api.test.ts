// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { ApiError, dateFromApi, localDate, request, useApi, notifyConnectionsChanged } from './api'
import { queryClient } from './offlineCache'
import i18n from './i18n'

describe('navigation query reuse', () => {
  afterEach(() => {
    queryClient.clear()
    vi.unstubAllGlobals()
  })
  it('invalidates connection status and inactive overview warnings after sign-in', () => {
    const paths = [
      '/api/overview',
      '/api/system',
      '/api/capabilities',
      '/api/setup/status',
      '/api/mycampus/import/status',
    ]
    for (const path of [...paths, '/api/notes']) queryClient.setQueryData(['api', path], { marker: 'invented cache' })
    notifyConnectionsChanged()
    for (const path of paths) expect(queryClient.getQueryState(['api', path])?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(['api', '/api/notes'])?.isInvalidated).toBe(false)
  })
  it('reuses a fresh response on remount and still honors explicit refresh', async () => {
    queryClient.clear()
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ items: ['fake-course'] }), { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children)
    const first = renderHook(() => useApi<{ items: string[] }>('/api/courses'), { wrapper })
    await waitFor(() => expect(first.result.current.data?.items).toEqual(['fake-course']))
    first.unmount()
    const second = renderHook(() => useApi<{ items: string[] }>('/api/courses'), { wrapper })
    expect(second.result.current.data?.items).toEqual(['fake-course'])
    expect(fetcher).toHaveBeenCalledTimes(1)
    act(() => second.result.current.reload())
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    act(() => window.dispatchEvent(new Event('unios:sync-completed')))
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3))
    second.unmount()
  })
  it('retains cached data while exposing a failed refresh separately', async () => {
    queryClient.clear()
    queryClient.setQueryDefaults(['api', '/api/synthetic-refresh'], { retry: false })
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: ['cached'] }), { status: 200 }))
      .mockResolvedValue(new Response(JSON.stringify({ detail: 'Synthetic refresh failed' }), { status: 503 }))
    vi.stubGlobal('fetch', fetcher)
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children)
    const view = renderHook(() => useApi<{ items: string[] }>('/api/synthetic-refresh'), { wrapper })
    await waitFor(() => expect(view.result.current.data?.items).toEqual(['cached']))
    act(() => view.result.current.reload())
    await waitFor(() => expect(view.result.current.refreshError).toBe('Synthetic refresh failed'))
    expect(view.result.current.data?.items).toEqual(['cached'])
    expect(view.result.current.error).toBeNull()
    expect(view.result.current.loading).toBe(false)
    view.unmount()
  })
})

describe('domain error contract', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('preserves a server no-write conflict code separately from its readable detail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              detail: 'Markierung wurde inzwischen geändert',
              code: 'MANUAL_SOURCE_CHANGED',
            }),
            { status: 409 },
          ),
      ),
    )
    const error = await request('/api/synthetic-contract').catch((cause) => cause)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 409,
      code: 'MANUAL_SOURCE_CHANGED',
      message: 'Markierung wurde inzwischen geändert',
    })
  })

  it('does not treat malformed error metadata as a safe recovery code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              detail: [{ loc: ['synthetic'], msg: 'Invalid' }],
              code: { unsafe: true },
            }),
            { status: 422 },
          ),
      ),
    )
    await expect(request('/api/synthetic-contract')).rejects.toMatchObject({
      status: 422,
      code: undefined,
      message: 'HTTP 422',
    })
  })
})

describe('localDate', () => {
  it('returns a placeholder for a missing value', () => {
    expect(localDate(null)).toBe('Noch keine Daten')
    expect(localDate(undefined)).toBe('Noch keine Daten')
    expect(localDate('')).toBe('Noch keine Daten')
  })

  it('returns a placeholder for an invalid timestamp', () => {
    expect(localDate('not-a-date')).toBe('Ungültiges Datum')
  })

  it('treats a timestamp without a timezone suffix as UTC', () => {
    // Without the appended "Z" this string would be parsed as local time by
    // `new Date()`. localDate must normalize it to UTC before formatting so
    // it renders the same regardless of the host's local timezone.
    const withZ = localDate('2026-01-15T10:30:00Z')
    const withoutZ = localDate('2026-01-15T10:30:00')
    expect(withoutZ).toBe(withZ)
  })

  it('does not double-append a timezone for an already-qualified timestamp', () => {
    expect(localDate('2026-01-15T10:30:00+02:00')).toBe(localDate('2026-01-15T08:30:00Z'))
  })

  it('formats using the requested options', () => {
    expect(localDate('2026-06-01T00:00:00Z', { day: '2-digit', month: '2-digit', year: 'numeric' })).toBe('01.06.2026')
  })
})

describe('localDate locale awareness', () => {
  afterEach(async () => {
    await i18n.changeLanguage('de')
  })

  it('formats with en-GB and English placeholders once the UI language is English', async () => {
    await i18n.changeLanguage('en')
    expect(localDate(null)).toBe('No data yet')
    expect(localDate('not-a-date')).toBe('Invalid date')
    // en-GB keeps day-before-month ordering (like the German output) instead
    // of switching to the month-first en-US convention.
    expect(localDate('2026-06-01T00:00:00Z', { day: '2-digit', month: '2-digit', year: 'numeric' })).toBe('01/06/2026')
  })

  it('goes back to German formatting after switching back', async () => {
    await i18n.changeLanguage('en')
    await i18n.changeLanguage('de')
    expect(localDate(null)).toBe('Noch keine Daten')
    expect(localDate('2026-06-01T00:00:00Z', { day: '2-digit', month: '2-digit', year: 'numeric' })).toBe('01.06.2026')
  })
})

it('parses naive UTC and explicit offsets as the same instant across a local midnight', () => {
  const expected = Date.parse('2026-10-04T22:30:00Z')
  for (const value of ['2026-10-04T22:30:00', '2026-10-04T22:30:00Z', '2026-10-05T00:30:00+02:00'])
    expect(dateFromApi(value).getTime()).toBe(expected)
})
