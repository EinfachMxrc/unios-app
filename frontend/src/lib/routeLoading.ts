// SPDX-License-Identifier: AGPL-3.0-or-later

import { lazy, type ComponentType } from 'react'
import { matchPath } from 'react-router-dom'

const routes = new Map<string, () => Promise<unknown>>()

/** One promise for intent preloads and React; a failed speculative load can retry. */
export function lazyRoute<T extends ComponentType>(pattern: string, loader: () => Promise<{ default: T }>) {
  let pending: ReturnType<typeof loader> | undefined
  const load = () =>
    (pending ??= loader().catch((error) => {
      pending = undefined
      throw error
    }))
  routes.set(pattern, load)
  return lazy(load)
}

export function preloadRoute(pathname: string): Promise<unknown> | undefined {
  for (const [pattern, load] of routes) {
    if (matchPath({ path: pattern, end: true }, pathname)) return load()
  }
}
