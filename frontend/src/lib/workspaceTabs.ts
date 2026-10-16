// SPDX-License-Identifier: AGPL-3.0-or-later
import { useSyncExternalStore } from 'react'
import { isAppScreen } from './inAppLinks'

export type WorkspaceTab = {
  id: string
  to: string
  title?: string
  locationKey?: string
  routeState?: unknown
}
type Tabs = { items: WorkspaceTab[]; active: string; closed: WorkspaceTab[] }
const KEY = 'unios-workspace-tabs-v1'
export const MAX_WORKSPACE_TABS = 24
const listeners = new Set<() => void>()
const empty = (): Tabs => ({ items: [], active: '', closed: [] })
let state = empty()
let loaded = false

export function tabTarget(value: string): string | null {
  if (!value.startsWith('/') || value.startsWith('//') || value.length > 5000) return null
  try {
    const url = new URL(value, 'https://unios.invalid')
    if (
      url.origin !== 'https://unios.invalid' ||
      !isAppScreen(url.pathname) ||
      ['/setup', '/welcome', '/import'].includes(url.pathname)
    )
      return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}

/** Persist only app handles, never searches, cited passages, titles or form data. */
export function persistedTabTarget(value: string): string | null {
  const safe = tabTarget(value)
  if (!safe) return null
  const url = new URL(safe, 'https://unios.invalid')
  const params = new URLSearchParams()
  for (const key of [
    'id',
    'page',
    'note',
    'course_id',
    'resource_id',
    'assignment_id',
    'parent_id',
    'revision',
    'task',
    'topic',
    'version',
  ]) {
    const value = url.searchParams.get(key)
    if (value && (/^[1-9]\d{0,15}$/.test(value) || /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value)))
      params.set(key, value)
  }
  for (const key of ['new', 'edit', 'workspace']) {
    if (url.searchParams.get(key) === '1') params.set(key, '1')
  }
  return `${url.pathname}${params.size ? `?${params}` : ''}`
}

/** One editor per document; PDF page/zoom and note revision are view state. */
export function tabIdentity(value: string): string {
  const url = new URL(value, 'https://unios.invalid')
  if (url.pathname === '/notes') {
    const note = url.searchParams.get('id')
    return note
      ? `/notes:${note}`
      : `/notes:${url.searchParams.has('new') ? 'new' : 'index'}:${url.searchParams.get('course_id') ?? 'all'}:${url.searchParams.get('resource_id') ?? 'none'}`
  }
  if (['/assessment', '/coding'].includes(url.pathname) && url.searchParams.has('task'))
    return `${url.pathname}:task:${url.searchParams.get('task')}`
  if (url.pathname === '/collections' && !url.searchParams.has('id'))
    return `/collections:new:${url.searchParams.get('course_id') ?? 'all'}`
  return `${url.pathname}${url.searchParams.has('id') ? `:${url.searchParams.get('id')}` : ''}`
}
function load() {
  if (loaded) return
  loaded = true
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw || raw.length > 48_000) return
    const saved = JSON.parse(raw) as { items?: unknown; active?: unknown }
    if (!Array.isArray(saved.items)) return
    const seen = new Set<string>()
    for (const row of saved.items.slice(0, MAX_WORKSPACE_TABS)) {
      if (!row || typeof row.id !== 'string' || !/^[\w-]{1,80}$/.test(row.id) || typeof row.to !== 'string') continue
      const to = persistedTabTarget(row.to)
      if (!to || seen.has(tabIdentity(to)) || state.items.some((item) => item.id === row.id)) continue
      seen.add(tabIdentity(to))
      state.items.push({ id: row.id, to })
    }
    state.active = state.items.find((item) => item.id === saved.active)?.id ?? state.items[0]?.id ?? ''
  } catch {
    /* Navigation remains available with denied or invalid session storage. */
  }
}
function publish(next: Tabs) {
  state = next
  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({
        active: state.active,
        items: state.items.map(({ id, to }) => ({ id, to: persistedTabTarget(to) })).filter((item) => item.to),
      }),
    )
  } catch {
    /* No document content or disk fallback. */
  }
  listeners.forEach((listener) => listener())
}
function id() {
  return crypto.randomUUID()
}
export function workspaceTabsSnapshot() {
  load()
  return state
}
export function observeWorkspaceTab(to: string, locationKey: string, routeState: unknown) {
  load()
  const target = tabTarget(to)
  if (!target) return
  const current = state.items.find((item) => item.id === state.active)
  const existing = state.items.find((item) => tabIdentity(item.to) === tabIdentity(target))
  const active = existing ?? current ?? { id: id(), to: target }
  if (active.to === target && active.locationKey === locationKey && state.active === active.id) return
  const updated = {
    ...active,
    to: target,
    locationKey,
    routeState,
    ...(tabIdentity(active.to) !== tabIdentity(target) ? { title: undefined } : {}),
  }
  let items = state.items.map((item) => (item.id === active.id ? updated : item))
  if (!items.some((item) => item.id === active.id)) items = [...items, updated]
  if (existing && current?.to === '/workspace/new' && current.id !== existing.id)
    items = items.filter((item) => item.id !== current.id)
  publish({ ...state, active: active.id, items })
}
export function openWorkspaceTab(to: string): WorkspaceTab | null {
  load()
  const target = tabTarget(to)
  if (!target) return null
  const existing = state.items.find((item) => tabIdentity(item.to) === tabIdentity(target))
  if (existing) {
    const destination =
      target === existing.to ? existing : { ...existing, to: target, locationKey: undefined, routeState: undefined }
    publish({
      ...state,
      items: state.items.map((item) => (item.id === existing.id ? destination : item)),
      active: existing.id,
    })
    return destination
  }
  if (state.items.length >= MAX_WORKSPACE_TABS) return null
  const item = { id: id(), to: target }
  publish({ ...state, items: [...state.items, item], active: item.id })
  return item
}
export function selectWorkspaceTab(identifier: string) {
  const item = workspaceTabsSnapshot().items.find((item) => item.id === identifier)
  if (item) publish({ ...state, active: item.id })
  return item
}
export function closeWorkspaceTab(identifier: string): WorkspaceTab | undefined {
  load()
  const closed = state.items.find((item) => item.id === identifier)
  if (!closed) return
  const index = state.items.indexOf(closed)
  let items = state.items.filter((item) => item.id !== identifier)
  if (!items.length) items = [{ id: id(), to: '/workspace/new' }]
  const active =
    identifier === state.active
      ? items[Math.min(index, items.length - 1)]
      : items.find((item) => item.id === state.active)!
  publish({ items, active: active.id, closed: [closed, ...state.closed].slice(0, 10) })
  return active
}
export function reopenWorkspaceTab() {
  load()
  const [item, ...closed] = state.closed
  if (!item || state.items.length >= MAX_WORKSPACE_TABS) return null
  const existing = state.items.find((tab) => tabIdentity(tab.to) === tabIdentity(item.to))
  const active = existing ?? item
  publish({ items: existing ? state.items : [...state.items, item], active: active.id, closed })
  return active
}
export function moveWorkspaceTab(identifier: string, destination: number) {
  load()
  const item = state.items.find((item) => item.id === identifier)
  if (!item) return
  const items = state.items.filter((item) => item.id !== identifier)
  items.splice(Math.max(0, Math.min(items.length, destination)), 0, item)
  publish({ ...state, items })
}
export function nameWorkspaceTab(title: string, to: string) {
  load()
  const item = state.items.find((item) => item.id === state.active)
  const name = title.trim().slice(0, 160)
  if (!item || item.to !== to || !name || item.title === name) return
  publish({ ...state, items: state.items.map((tab) => (tab.id === item.id ? { ...tab, title: name } : tab)) })
}
export function clearWorkspaceTabs() {
  state = empty()
  loaded = true
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* No fallback. */
  }
  listeners.forEach((listener) => listener())
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function useWorkspaceTabs() {
  return useSyncExternalStore(subscribe, workspaceTabsSnapshot, workspaceTabsSnapshot)
}
