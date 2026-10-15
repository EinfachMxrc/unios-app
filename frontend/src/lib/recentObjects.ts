// SPDX-License-Identifier: AGPL-3.0-or-later
import { useSyncExternalStore } from 'react'

export type RecentObject = { to: string; title: string }
const EMPTY: RecentObject[] = []
let objects: RecentObject[] = EMPTY
const listeners = new Set<() => void>()

/** Keep object handles in this window only; never record arbitrary queries or tokens. */
export function recentHandle(pathname: string, search: string): string | null {
  const params = new URLSearchParams(search)
  if (pathname === '/notes') {
    const id = params.get('id')
    return id && /^[a-zA-Z0-9-]{1,80}$/.test(id) ? `/notes?id=${encodeURIComponent(id)}` : null
  }
  if (/^\/material\/\d+$/.test(pathname)) {
    const page = params.get('page')
    return page && /^[1-9]\d{0,5}$/.test(page) ? `${pathname}?page=${page}` : pathname
  }
  return /^\/(courses|projects)\/\d+$/.test(pathname) ? pathname : null
}

export function rememberObject(to: string, title: string) {
  const url = new URL(to, 'https://unios.invalid')
  const safe = recentHandle(url.pathname, url.search)
  if (url.origin !== 'https://unios.invalid' || !safe || !title.trim()) return
  const item = { to: safe, title: title.trim().slice(0, 200) }
  // One entry per object; revisiting a PDF updates its exact page handle.
  const identity = (ref: string) => (ref.startsWith('/material/') ? ref.split('?')[0] : ref)
  if (objects[0]?.to === item.to && objects[0]?.title === item.title) return
  objects = [item, ...objects.filter((value) => identity(value.to) !== identity(item.to))].slice(0, 12)
  listeners.forEach((listener) => listener())
}

export function clearRecentObjects() {
  objects = EMPTY
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function useRecentObjects() {
  return useSyncExternalStore(
    subscribe,
    () => objects,
    () => EMPTY,
  )
}
