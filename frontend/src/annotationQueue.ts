// SPDX-License-Identifier: AGPL-3.0-or-later

import { createStore, del, get, keys, set } from 'idb-keyval'
import i18n from '@/i18n'
import { isHostOnline, markHostReachable } from '@/hostAvailability'
import { queryClient } from '@/offlineCache'
import { noteStaleHost, verifiedMutationGeneration } from '@/api'

export type PendingAnnotation = {
  id: string
  versionId: number
  kind: 'highlight' | 'question'
  quote: string
  page: number
  rects: number[][]
  comment: string
  createdAt: string
}

const storage = typeof indexedDB === 'undefined' ? null : createStore('marc-uni-os-annotation-outbox', 'annotations')
const listeners = new Set<() => void>()
let inFlight: Promise<void> | null = null

function notify() {
  listeners.forEach((listener) => listener())
}

export function subscribeAnnotations(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export async function pendingAnnotations(): Promise<PendingAnnotation[]> {
  if (!storage) return []
  const ids = await keys(storage)
  const entries = await Promise.all(ids.map((id) => get<PendingAnnotation>(id, storage)))
  return entries
    .filter((entry): entry is PendingAnnotation => Boolean(entry))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export async function queueAnnotation(entry: PendingAnnotation): Promise<void> {
  if (!storage) throw new Error(i18n.t('common:offlineStorageUnavailableInBrowser'))
  await set(entry.id, entry, storage)
  notify()
  if (isHostOnline()) void flushAnnotations()
}

async function doFlush(): Promise<void> {
  const entries = await pendingAnnotations()
  if (!entries.length || !navigator.onLine) return
  let generation: number
  try {
    generation = await verifiedMutationGeneration()
  } catch {
    return
  }
  try {
    markHostReachable(true)
    for (const entry of entries) {
      const response = await fetch(`/api/material/${entry.versionId}/annotations`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-UniOS-Lease-Generation': String(generation) },
        body: JSON.stringify({
          id: entry.id,
          kind: entry.kind,
          quote: entry.quote,
          page: entry.page,
          rects: entry.rects,
          comment: entry.comment,
        }),
      })
      if (!response.ok) {
        await noteStaleHost(response)
        return
      }
      await del(entry.id, storage!)
      notify()
      await queryClient.invalidateQueries({ queryKey: ['api', `/api/material/${entry.versionId}`] })
    }
  } catch {
    markHostReachable(false)
  }
}

export function flushAnnotations(): Promise<void> {
  if (inFlight) return inFlight
  inFlight = doFlush().finally(() => {
    inFlight = null
  })
  return inFlight
}
