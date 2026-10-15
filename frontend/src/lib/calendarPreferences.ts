// SPDX-License-Identifier: AGPL-3.0-or-later
import { useSyncExternalStore } from 'react'
import type { CalendarView } from './calendarLayout'

const KEY = 'unios-calendar-preferences-v1'
type CalendarPreferences = { view: CalendarView; hourPx: number; fit: boolean }
const defaults: CalendarPreferences = { view: 'workweek', hourPx: 64, fit: true }
const listeners = new Set<() => void>()

export function validCalendarView(value: unknown): value is CalendarView {
  return value === 'day' || value === 'workweek' || value === 'week' || value === 'list'
}

export function normalizeCalendarPreferences(value: unknown): CalendarPreferences {
  if (!value || typeof value !== 'object') return defaults
  const saved = value as Partial<CalendarPreferences>
  const hourPx =
    typeof saved.hourPx === 'number' && Number.isFinite(saved.hourPx)
      ? Math.max(40, Math.min(112, saved.hourPx))
      : defaults.hourPx
  return {
    view: validCalendarView(saved.view) ? saved.view : defaults.view,
    hourPx,
    // Preserve an explicitly enlarged/reduced scale from older versions.
    fit: typeof saved.fit === 'boolean' ? saved.fit : hourPx === defaults.hourPx,
  }
}

function read(): CalendarPreferences {
  try {
    return normalizeCalendarPreferences(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
  } catch {
    return defaults
  }
}

let current = read()
function publish(value: CalendarPreferences) {
  current = value
  listeners.forEach((listener) => listener())
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

if (typeof window !== 'undefined')
  window.addEventListener('storage', (event) => {
    if (event.key === KEY || event.key === null) publish(read())
  })

/** Only display settings are stored, never appointments, links or account data. */
function update(change: Partial<CalendarPreferences>) {
  const next = normalizeCalendarPreferences({ ...current, ...change })
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* The current window remains usable when storage is denied. */
  }
  publish(next)
}
const setView = (view: CalendarView) => update({ view })
const setHourPx = (hourPx: number) => update({ hourPx, fit: false })
const setFit = (fit: boolean) => update({ fit })
export function useCalendarPreferences() {
  const value = useSyncExternalStore(
    subscribe,
    () => current,
    () => defaults,
  )
  return { ...value, setView, setHourPx, setFit }
}
