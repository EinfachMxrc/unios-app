// SPDX-License-Identifier: AGPL-3.0-or-later
import { newManualDraftId } from './manualDraftId'
const bindingLock = 'unios:manual-cards:binding:v2'
const channelName = 'unios:manual-cards:v2'
export const manualWriterInstanceId = newManualDraftId()
export const manualWorkspaceMarker = 'unios:manual-card-workspace:v2'
const listeners = new Set<() => void>()
const channel =
  typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(channelName) : null
function changed() {
  listeners.forEach((listener) => listener())
}
channel?.addEventListener('message', changed)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (
      event.key === null ||
      event.key === manualWorkspaceMarker ||
      event.key?.startsWith('unios:manual-card-draft:v2:')
    )
      changed()
  })
  window.addEventListener('focus', changed)
  window.addEventListener('pageshow', changed)
}
export function subscribeManualChanges(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function publishManualChange() {
  channel?.postMessage({ changed: true })
  changed()
}
export function manualWebLocksAvailable() {
  return typeof navigator !== 'undefined' && !!navigator.locks?.request
}
export function withManualStorageLock<T>(name: string, work: () => Promise<T>): Promise<T> {
  if (!manualWebLocksAvailable()) return Promise.reject(new Error('MANUAL_COORDINATION_UNAVAILABLE'))
  return navigator.locks.request(name, work)
}
/** The binding lock covers host verification + POST + ACK, never an open dialog. */
export function withManualBinding<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
  if (!manualWebLocksAvailable()) return Promise.reject(new Error('MANUAL_COORDINATION_UNAVAILABLE'))
  return navigator.locks.request(bindingLock, { mode: 'shared', signal }, async () => {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    return work()
  })
}
/** Without Web Locks this version sends no manual POST, so pairing may continue. */
export function withManualBindingChange<T>(work: () => Promise<T>) {
  return manualWebLocksAvailable() ? navigator.locks.request(bindingLock, { mode: 'exclusive' }, work) : work()
}
