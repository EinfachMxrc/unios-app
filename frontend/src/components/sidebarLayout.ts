// SPDX-License-Identifier: AGPL-3.0-or-later

import { useSyncExternalStore } from 'react'
import type { Preferences } from '@/preferences'
export type SidebarGroup = 'workspace' | 'library'
export type SidebarLayout = {
  version: 1
  workspace: string[]
  library: string[]
  courseOrder: number[]
  hiddenCourses: number[]
  showCourses: boolean
  showRecent?: boolean
}
const key = 'unios-sidebar-layout-v1'
export function defaultSidebarLayout(preferences: Preferences): SidebarLayout {
  return {
    version: 1,
    workspace: ['today', 'courses', 'learning', 'notes', 'deadlines'],
    library: preferences.advanced ? ['search', 'voice', 'collections', 'rules', 'journal', 'jots'] : [],
    courseOrder: [],
    hiddenCourses: [],
    showCourses: true,
    showRecent: true,
  }
}
function read(): SidebarLayout | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (!value || value.version !== 1 || !Array.isArray(value.workspace) || !Array.isArray(value.library)) return null
    const seen = new Set<string>()
    const entries = (values: unknown[]): string[] =>
      values
        .filter((id): id is string => {
          if (typeof id !== 'string' || id.length > 80 || seen.has(id)) return false
          seen.add(id)
          return true
        })
        .slice(0, 100)
    const ids = (values: unknown): number[] =>
      Array.isArray(values)
        ? [...new Set(values.filter((id): id is number => Number.isSafeInteger(id) && id > 0))].slice(0, 500)
        : []
    return {
      version: 1,
      workspace: entries(value.workspace),
      library: entries(value.library),
      courseOrder: ids(value.courseOrder),
      hiddenCourses: ids(value.hiddenCourses),
      showCourses: value.showCourses !== false,
      showRecent: value.showRecent !== false,
    }
  } catch {
    return null
  }
}
let current = read()
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
function publish(value: SidebarLayout | null) {
  current = value
  listeners.forEach((listener) => listener())
}
if (typeof window !== 'undefined')
  window.addEventListener('storage', (event) => {
    if (event.key === key || event.key === null) publish(read())
  })
export function useSidebarLayout(preferences: Preferences) {
  const saved = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  )
  return saved ?? defaultSidebarLayout(preferences)
}
// Publish only after the durable write: a failed storage write must not claim success.
export function saveSidebarLayout(layout: SidebarLayout) {
  localStorage.setItem(key, JSON.stringify(layout))
  publish(layout)
}
export function resetSidebarLayout() {
  localStorage.removeItem(key)
  publish(null)
}
export function moveSidebarEntry(
  layout: SidebarLayout,
  id: string,
  target: SidebarGroup,
  before?: string,
): SidebarLayout {
  const next = {
    ...layout,
    workspace: layout.workspace.filter((entry) => entry !== id),
    library: layout.library.filter((entry) => entry !== id),
  }
  const position = before ? next[target].indexOf(before) : -1
  next[target].splice(position < 0 ? next[target].length : position, 0, id)
  return next
}
