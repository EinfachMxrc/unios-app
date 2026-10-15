// SPDX-License-Identifier: AGPL-3.0-or-later

import { QueryClient } from '@tanstack/react-query'
import type { Persister, PersistedClient } from '@tanstack/react-query-persist-client'
import { createStore, del, get, set } from 'idb-keyval'

const CACHE_KEY = 'read-queries-v1'
const CACHE_AGE = 14 * 24 * 60 * 60 * 1000
// idb-keyval cannot add a second store to an existing version-1 database.
// Jots already use marc-uni-os-private/jot-outbox, so reads need their own DB.
const storage = typeof indexedDB === 'undefined' ? null : createStore('marc-uni-os-read-cache', 'queries')
let persistQueue: Promise<void> = Promise.resolve()

async function legacyReadCache(): Promise<PersistedClient | undefined> {
  if (typeof indexedDB === 'undefined') return undefined
  return new Promise((resolve) => {
    // Opening a missing legacy DB used to create an empty version-1 DB before
    // the jot queue could create its store. Upgrade existing query-only DBs too.
    const open = indexedDB.open('marc-uni-os-private', 2)
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains('jot-outbox')) open.result.createObjectStore('jot-outbox')
    }
    open.onerror = () => resolve(undefined)
    open.onsuccess = () => {
      const db = open.result
      if (!db.objectStoreNames.contains('queries')) {
        db.close()
        resolve(undefined)
        return
      }
      const result = db.transaction('queries', 'readonly').objectStore('queries').get(CACHE_KEY)
      result.onerror = () => {
        db.close()
        resolve(undefined)
      }
      result.onsuccess = () => {
        db.close()
        resolve(result.result as PersistedClient | undefined)
      }
    }
  })
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { gcTime: CACHE_AGE, retry: false, refetchOnWindowFocus: false },
  },
})

export const persister: Persister = {
  persistClient: async (client: PersistedClient) => {
    if (!storage) return
    // A failed offline refetch retains data but puts the query in an error state.
    // Persist the last good data without persisting error details from the host.
    const safeClient: PersistedClient = {
      ...client,
      clientState: {
        ...client.clientState,
        queries: client.clientState.queries.map((query) => ({
          ...query,
          state: {
            ...query.state,
            status: 'success',
            error: null,
            errorUpdatedAt: 0,
            errorUpdateCount: 0,
            fetchStatus: 'idle',
            fetchFailureCount: 0,
            fetchFailureReason: null,
          },
        })),
      },
    }
    // Query updates can trigger several asynchronous writes at once. Preserve
    // their order so an older snapshot cannot replace the newest one.
    persistQueue = persistQueue.catch(() => undefined).then(() => set(CACHE_KEY, safeClient, storage))
    await persistQueue
  },
  restoreClient: async () => {
    await persistQueue
    if (!storage) return undefined
    const current = await get<PersistedClient>(CACHE_KEY, storage)
    if (current) return current
    const legacy = await legacyReadCache()
    if (legacy) await set(CACHE_KEY, legacy, storage)
    return legacy
  },
  removeClient: async () => {
    // A completed identity reset must not race a still-pending old snapshot.
    await persistQueue.catch(() => undefined)
    if (storage) await del(CACHE_KEY, storage)
  },
}

export const persistOptions = {
  persister,
  maxAge: CACHE_AGE,
  buster: 'read-api-v1',
  dehydrateOptions: {
    // System diagnostics and future sensitive endpoints never enter IndexedDB.
    shouldDehydrateQuery: (query: { state: { data: unknown }; meta?: Record<string, unknown> }) =>
      query.state.data !== undefined && query.meta?.offlineCache === true,
  },
}

export function mayCache(path: string): boolean {
  if (path.startsWith('/api/mensa/')) return true
  if (/^\/api\/(?:notes\/link-targets|entities\/note)(?:\?|$)/.test(path)) return true
  const focus = /^\/api\/learning\/focus\/(?:block|cycle)\/([1-9]\d{0,15})$/.exec(path)
  if (focus) return Number.isSafeInteger(Number(focus[1]))
  return /^\/api\/(overview|courses(?:\/\d+(?:\/material)?)?|material\/\d+|learning\/questions|anki\/study\/(?:status|due|stats)|deadlines|activity|search|notes(?:\/[0-9a-f-]+)?|jots)(?:\?|$)/.test(
    path,
  )
}
