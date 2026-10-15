// SPDX-License-Identifier: AGPL-3.0-or-later
import { createContext, useSyncExternalStore } from 'react'

/** Mode already resolved by the startup gate; null supports isolated consumers. */
export const RuntimeModeContext = createContext<'normal' | 'client' | 'demo' | null>(null)

const listeners = new Set<() => void>()
let verified = false
export function runtimeWritesAllowed() {
  return verified
}
export function setRuntimeVerified(value: boolean) {
  if (value === verified) return
  verified = value
  for (const listener of listeners) listener()
}
export function useRuntimeVerified() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    runtimeWritesAllowed,
    () => false,
  )
}
