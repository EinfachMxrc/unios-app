// SPDX-License-Identifier: AGPL-3.0-or-later
import { useSyncExternalStore } from 'react'

const key = 'unios.materials.seen-through'
const changed = 'unios:materials-seen'
let memory = 0
function snapshot() {
  try {
    return Math.max(memory, Number(localStorage.getItem(key)) || 0)
  } catch {
    return memory
  }
}
function subscribe(callback: () => void) {
  window.addEventListener(changed, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(changed, callback)
    window.removeEventListener('storage', callback)
  }
}
export function markMaterialsSeen(ids: number[]) {
  memory = Math.max(snapshot(), ...ids)
  try {
    localStorage.setItem(key, String(memory))
  } catch {
    /* Keep the acknowledgement for this session. */
  }
  window.dispatchEvent(new Event(changed))
}
export function useSeenMaterials() {
  return useSyncExternalStore(subscribe, snapshot, () => 0)
}
