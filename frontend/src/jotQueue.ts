// SPDX-License-Identifier: AGPL-3.0-or-later

import { randomId } from '@/lib/uuid'

import { createStore, del, get, keys, set } from 'idb-keyval'
import i18n from '@/i18n'
import { isHostOnline, markHostReachable } from '@/hostAvailability'
import { queryClient } from '@/offlineCache'
import type { Jot } from '@/types'
import { noteStaleHost, verifiedMutationGeneration } from '@/api'

export type PendingJot = Pick<Jot, 'id' | 'kind' | 'body' | 'created_at' | 'course_id' | 'note_id'>

const storage = typeof indexedDB === 'undefined' ? null : createStore('marc-uni-os-private', 'jot-outbox')
const listeners = new Set<() => void>()
let inFlight: Promise<void> | null = null

function notify() {
  for (const listener of listeners) listener()
}

export function subscribeJots(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export async function pendingJots(): Promise<PendingJot[]> {
  if (!storage) return []
  const ids = await keys(storage)
  const values = await Promise.all(ids.map((id) => get<PendingJot>(id, storage)))
  return values
    .filter((value): value is PendingJot => Boolean(value))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export async function queueJot(kind: Jot['kind'], body: string): Promise<PendingJot> {
  if (!storage) throw new Error(i18n.t('common:offlineStorageUnavailableInBrowser'))
  const text = body.trim()
  if (!text || text.length > 10_000) throw new Error(i18n.t('common:textLengthValidation'))
  const jot: PendingJot = {
    id: randomId(),
    kind,
    body: text,
    created_at: new Date().toISOString(),
    course_id: null,
    note_id: null,
  }
  await set(jot.id, jot, storage)
  notify()
  if (isHostOnline()) void flushJots()
  return jot
}

async function doFlush(): Promise<void> {
  const items = await pendingJots()
  if (!items.length || !navigator.onLine) return
  let generation: number
  try {
    generation = await verifiedMutationGeneration()
  } catch {
    return
  }
  try {
    markHostReachable(true)
    await queryClient.invalidateQueries({ queryKey: ['api', '/api/host'] })
    for (const jot of items) {
      const response = await fetch('/api/jots', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-UniOS-Lease-Generation': String(generation) },
        body: JSON.stringify(jot),
      })
      if (!response.ok) {
        await noteStaleHost(response)
        break // Entries sent before this one are gone from the outbox: still refresh the list below.
      }
      await del(jot.id, storage!)
      notify()
    }
    await queryClient.invalidateQueries({ queryKey: ['api', '/api/jots'] })
  } catch {
    markHostReachable(false)
  }
}

export function flushJots(): Promise<void> {
  if (inFlight) return inFlight
  inFlight = doFlush().finally(() => {
    inFlight = null
  })
  return inFlight
}
