// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react'
import { clearRecentObjects } from '@/lib/recentObjects'

const KEY = 'unios-workspace-session-v1'
const MAX_ENTRIES = 160
const MAX_BYTES = 768 * 1024
type Entry = { value: unknown; persist: boolean }
const entries = new Map<string, Entry>()
const listeners = new Map<string, Set<() => void>>()
let loaded = false

function load() {
  if (loaded) return
  loaded = true
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw || new TextEncoder().encode(raw).byteLength > MAX_BYTES) return
    const values: unknown = JSON.parse(raw)
    if (!Array.isArray(values)) return
    for (const item of values.slice(-MAX_ENTRIES)) {
      if (Array.isArray(item) && item.length === 2 && typeof item[0] === 'string' && item[0].length <= 1200)
        entries.set(item[0], { value: item[1], persist: true })
    }
  } catch {
    /* Denied storage still allows navigation within this window. */
  }
}

function persist() {
  trimContext()
  try {
    const saved = [...entries].filter(([, entry]) => entry.persist).map(([key, entry]) => [key, entry.value])
    let raw = JSON.stringify(saved)
    while (new TextEncoder().encode(raw).byteLength > MAX_BYTES && saved.length) {
      saved.shift()
      raw = JSON.stringify(saved)
    }
    sessionStorage.setItem(KEY, raw)
  } catch {
    /* UI context is not a server save or a durable document draft. */
  }
}

/** Bounded navigation history must never evict an unsaved in-memory draft. */
function trimContext() {
  const context = [...entries].filter(([, entry]) => entry.persist)
  for (const [key] of context.slice(0, Math.max(0, context.length - MAX_ENTRIES))) entries.delete(key)
}

type Options<T> = { persist?: boolean; valid?: (value: unknown) => value is T }
export function workspaceValue<T>(key: string, fallback: T, options: Options<T> = {}): T {
  load()
  const entry = entries.get(key)
  const valid =
    entry &&
    !(options.persist === false && entry.persist) &&
    (options.valid
      ? options.valid(entry.value)
      : fallback === null
        ? entry.value === null
        : Array.isArray(fallback)
          ? Array.isArray(entry.value)
          : typeof entry.value === typeof fallback && (typeof fallback !== 'number' || Number.isFinite(entry.value)))
  if (entry && valid) {
    entries.delete(key)
    entries.set(key, entry)
    return entry.value as T
  }
  entries.set(key, { value: fallback, persist: options.persist !== false })
  trimContext()
  return fallback
}

export function rememberWorkspace<T>(key: string, value: T, persistent = true) {
  load()
  const wasPersistent = entries.get(key)?.persist
  entries.delete(key)
  entries.set(key, { value, persist: persistent })
  trimContext()
  if (persistent || wasPersistent) persist()
  listeners.get(key)?.forEach((listener) => listener())
}

export function clearWorkspace() {
  clearRecentObjects()
  entries.clear()
  loaded = true
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* No disk fallback. */
  }
  try {
    localStorage.removeItem('unios-last-study-v1')
    localStorage.removeItem('unios-course-study-v1')
    localStorage.removeItem('unios-activity-preferences-v1')
  } catch {
    /* A connection switch must clear the durable resource handle too. */
  }
  listeners.forEach((group) => group.forEach((listener) => listener()))
  // Pending document writes belong to the server/session that started them.
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('unios:workspace-cleared'))
}

/** Explicit UI fields only: no password, calendar link or automatic form capture. */
export function useWorkspaceState<T>(
  key: string,
  fallback: T,
  { persist: persistent = true, valid }: Options<T> = {},
): [T, Dispatch<SetStateAction<T>>] {
  const subscribe = useCallback(
    (listener: () => void) => {
      const group = listeners.get(key) ?? new Set<() => void>()
      group.add(listener)
      listeners.set(key, group)
      return () => {
        group.delete(listener)
        if (!group.size) listeners.delete(key)
      }
    },
    [key],
  )
  const value = useSyncExternalStore(
    subscribe,
    () => workspaceValue(key, fallback, { persist: persistent, valid }),
    () => fallback,
  )
  const update: Dispatch<SetStateAction<T>> = useCallback(
    (next) => {
      const previous = workspaceValue(key, fallback, { persist: persistent, valid })
      const result = typeof next === 'function' ? (next as (value: T) => T)(previous) : next
      if (!Object.is(previous, result)) rememberWorkspace(key, result, persistent)
    },
    [key, fallback, persistent, valid],
  )
  return [value, update]
}
