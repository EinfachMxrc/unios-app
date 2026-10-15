// SPDX-License-Identifier: AGPL-3.0-or-later

import { useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()
let reachable = true
let verifiedGeneration: number | null = null
let verifiedAt = 0

function notify() {
  for (const listener of listeners) listener()
}

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => {
    markHostUnverified()
    notify()
  })
  window.addEventListener('online', () => {
    reachable = true
    markHostUnverified()
    notify()
  })
}

export function markHostUnverified() {
  verifiedGeneration = null
  verifiedAt = 0
  notify()
}

export function markHostVerified(generation: number | null) {
  verifiedGeneration = generation
  verifiedAt = Date.now()
  notify()
}

export function currentVerifiedGeneration() {
  return Date.now() - verifiedAt <= 30_000 ? verifiedGeneration : null
}

export function markHostReachable(value: boolean) {
  if (reachable === value) return
  reachable = value
  notify()
}

export function isHostOnline() {
  return (typeof navigator === 'undefined' || navigator.onLine) && reachable
}

export function useHostOnline() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    isHostOnline,
    () => true,
  )
}

export function useHostVerified() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => verifiedGeneration !== null,
    () => false,
  )
}
