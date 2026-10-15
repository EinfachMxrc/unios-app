// SPDX-License-Identifier: AGPL-3.0-or-later

import { useSyncExternalStore } from 'react'

type Accessibility = { scale: 100 | 112 | 125 | 150; contrast: boolean; reduceMotion: boolean }
const defaults: Accessibility = { scale: 100, contrast: false, reduceMotion: false }
const key = 'unios-accessibility-v1'
const listeners = new Set<() => void>()
function read(): Accessibility {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? '{}') as Partial<Accessibility>
    return {
      scale: [100, 112, 125, 150].includes(saved.scale ?? 0) ? saved.scale! : 100,
      contrast: saved.contrast === true,
      reduceMotion: saved.reduceMotion === true,
    }
  } catch {
    return defaults
  }
}
let current = read()
function apply() {
  document.documentElement.style.fontSize = `${current.scale}%`
  document.documentElement.dataset.highContrast = String(current.contrast)
  document.documentElement.dataset.reduceMotion = String(current.reduceMotion)
}
apply()
export function setAccessibility(next: Partial<Accessibility>) {
  current = { ...current, ...next }
  localStorage.setItem(key, JSON.stringify(current))
  apply()
  listeners.forEach((listener) => listener())
}
window.addEventListener('storage', (event) => {
  if (event.key === key) {
    current = read()
    apply()
    listeners.forEach((listener) => listener())
  }
})
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export function useAccessibility() {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => defaults,
  )
}
