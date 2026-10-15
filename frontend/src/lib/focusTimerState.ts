// SPDX-License-Identifier: AGPL-3.0-or-later

import { useSyncExternalStore, type Dispatch, type SetStateAction } from 'react'
import type { FocusTimerState } from './focusTimer'

const KEY = 'unios.focusTimer.v1'
const listeners = new Set<() => void>()
let loaded = false
let timer: FocusTimerState | null = null

function validTimer(value: unknown): value is FocusTimerState {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<FocusTimerState>
  return (
    Number.isSafeInteger(item.blockId) &&
    item.blockId! > 0 &&
    typeof item.topic === 'string' &&
    typeof item.courseName === 'string' &&
    typeof item.durationSeconds === 'number' &&
    Number.isFinite(item.durationSeconds) &&
    item.durationSeconds >= 0 &&
    typeof item.startedAt === 'number' &&
    Number.isFinite(item.startedAt) &&
    (item.pausedAt === null || (typeof item.pausedAt === 'number' && Number.isFinite(item.pausedAt))) &&
    typeof item.accumulatedPauseMs === 'number' &&
    Number.isFinite(item.accumulatedPauseMs) &&
    item.accumulatedPauseMs >= 0
  )
}

function readStored(): FocusTimerState | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    const value: unknown = raw ? JSON.parse(raw) : null
    return validTimer(value) ? value : null
  } catch {
    return null
  }
}

function emit() {
  listeners.forEach((listener) => listener())
}

function snapshot() {
  if (!loaded) {
    loaded = true
    timer = readStored()
  }
  return timer
}

function update(next: SetStateAction<FocusTimerState | null>) {
  const previous = snapshot()
  timer = typeof next === 'function' ? next(previous) : next
  try {
    if (timer) window.localStorage.setItem(KEY, JSON.stringify(timer))
    else window.localStorage.removeItem(KEY)
  } catch {
    /* A running timer remains usable when local persistence is unavailable. */
  }
  emit()
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY && event.key !== null) return
    loaded = true
    timer = readStored()
    emit()
  })
  window.addEventListener('unios:workspace-cleared', () => update(null))
}

/** The overview and focus workspace share one timer, including concurrent mounted views. */
export function useFocusTimerState(): [FocusTimerState | null, Dispatch<SetStateAction<FocusTimerState | null>>] {
  const state = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    snapshot,
    () => null,
  )
  return [state, update]
}
