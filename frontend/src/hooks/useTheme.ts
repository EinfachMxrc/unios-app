// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useSyncExternalStore } from 'react'
import { readMigratedStorage } from '@/lib/uiStorage'
export type Theme = 'system' | 'light' | 'dark'
const key = 'unios-theme'
const read = (): Theme => {
  const value = readMigratedStorage(key, 'marc-theme')
  return value === 'dark' || value === 'light' ? value : 'system'
}
let current = read()
const listeners = new Set<() => void>()
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function setTheme(theme: Theme) {
  localStorage.setItem(key, theme)
  current = theme
  listeners.forEach((listener) => listener())
}
window.addEventListener('storage', (event) => {
  if (event.key === key || event.key === null) {
    current = read()
    listeners.forEach((listener) => listener())
  }
})
export function useTheme(applyToDocument = false) {
  const theme = useSyncExternalStore(
    subscribe,
    () => current,
    () => 'system' as Theme,
  )
  useEffect(() => {
    if (!applyToDocument) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () =>
      document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && media.matches))
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme, applyToDocument])
  return theme
}
