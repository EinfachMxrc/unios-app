// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { normalizeCalendarPreferences, useCalendarPreferences } from './calendarPreferences'

const key = 'unios-calendar-preferences-v1'
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); localStorage.clear()
  window.dispatchEvent(new StorageEvent('storage', { key: null }))
})

it('defaults to a teaching week and rejects malformed stored preferences', () => {
  for (const value of [null, 7, 'week', [], { view: 'unknown', hourPx: '64' }])
    expect(normalizeCalendarPreferences(value)).toEqual({ view: 'workweek', hourPx: 64, fit: true })
  expect(normalizeCalendarPreferences({ view: 'week', hourPx: Infinity })).toEqual({ view: 'week', hourPx: 64, fit: true })
  expect(normalizeCalendarPreferences({ view: 'day', hourPx: 1 })).toEqual({ view: 'day', hourPx: 40, fit: false })
  expect(normalizeCalendarPreferences({ view: 'list', hourPx: 200 })).toEqual({ view: 'list', hourPx: 112, fit: false })
  expect(normalizeCalendarPreferences({ hourPx: 80, fit: true }).fit).toBe(true)
})

it('persists only UI fields and keeps view and zoom consistent across components and remounts', () => {
  const panel = renderHook(() => useCalendarPreferences())
  const grid = renderHook(() => useCalendarPreferences())
  act(() => { panel.result.current.setView('week'); grid.result.current.setHourPx(80) })
  expect(panel.result.current.view).toBe('week')
  expect(panel.result.current.hourPx).toBe(80)
  expect(grid.result.current.view).toBe('week')
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ view: 'week', hourPx: 80, fit: false })
  act(() => panel.result.current.setFit(true))
  expect(grid.result.current.fit).toBe(true)
  expect(grid.result.current.hourPx).toBe(80)
  panel.unmount()
  expect(renderHook(() => useCalendarPreferences()).result.current.view).toBe('week')
})

it('reads changes from another window and resets safely after storage is cleared', () => {
  const view = renderHook(() => useCalendarPreferences())
  act(() => {
    localStorage.setItem(key, JSON.stringify({ view: 'day', hourPx: 96 }))
    window.dispatchEvent(new StorageEvent('storage', { key }))
  })
  expect(view.result.current.view).toBe('day')
  expect(view.result.current.hourPx).toBe(96)
  act(() => { localStorage.clear(); window.dispatchEvent(new StorageEvent('storage', { key: null })) })
  expect(view.result.current.view).toBe('workweek')
})

it('continues within the current window when the browser refuses persistent storage', () => {
  const view = renderHook(() => useCalendarPreferences())
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError') })
  act(() => view.result.current.setView('list'))
  expect(view.result.current.view).toBe('list')
})
