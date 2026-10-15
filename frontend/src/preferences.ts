// SPDX-License-Identifier: AGPL-3.0-or-later

import { useSyncExternalStore } from 'react'
import { readMigratedStorage } from '@/lib/uiStorage'
import { DEFAULT_LOCALE, resolveStoredLocale } from './i18n/localeMeta'
export type ModuleKey =
  'courses' | 'deadlines' | 'notifications' | 'search' | 'ai' | 'projects' | 'grades' | 'mail' | 'addons'
/**
 * A UI language code, validated against the languages discovered under
 * `src/i18n/locales/*` (see `./i18n/localeMeta.ts`). Kept as a plain `string`
 * rather than a fixed union so that adding a language never requires
 * touching this file — `resolveStoredLocale` is what enforces validity, at
 * the point an untrusted value (localStorage) is read.
 */
export type Language = string
export type Preferences = {
  modules: Record<ModuleKey, boolean>
  density: 'comfortable' | 'compact'
  advanced: boolean
  language: Language
}
const key = 'unios-ui-preferences-v1'
const defaults: Preferences = {
  modules: {
    courses: true,
    deadlines: true,
    notifications: true,
    search: true,
    ai: false,
    projects: false,
    grades: false,
    mail: false,
    addons: true,
  },
  density: 'comfortable',
  advanced: false,
  language: DEFAULT_LOCALE,
}
function read(): Preferences {
  if (typeof window === 'undefined') return defaults
  try {
    const saved = JSON.parse(
      readMigratedStorage(key, 'marc-ui-preferences-v1') ?? 'null',
    ) as Partial<Preferences> | null
    if (!saved || typeof saved !== 'object') return defaults
    const modules = Object.fromEntries(
      (Object.keys(defaults.modules) as ModuleKey[]).map((name) => [
        name,
        typeof saved.modules?.[name] === 'boolean' ? saved.modules[name] : defaults.modules[name],
      ]),
    ) as Preferences['modules']
    return {
      modules,
      density: saved.density === 'compact' ? 'compact' : 'comfortable',
      advanced: typeof saved.advanced === 'boolean' ? saved.advanced : false,
      // An unknown or removed language code (e.g. a locale that was later
      // dropped) falls back to German rather than crashing the app.
      // Backward compatible with existing stored 'de'/'en' values.
      language: resolveStoredLocale(saved.language),
    }
  } catch {
    return defaults
  }
}
let current = read()
const listeners = new Set<() => void>()
function publish(next: Preferences) {
  current = next
  listeners.forEach((listener) => listener())
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === key) publish(read())
  })
}
export function usePreferences() {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => defaults,
  )
}
export function setModule(name: ModuleKey, enabled: boolean) {
  const next = { ...current, modules: { ...current.modules, [name]: enabled } }
  window.localStorage.setItem(key, JSON.stringify(next))
  publish(next)
}
export function setAdvanced(enabled: boolean) {
  const next = { ...current, advanced: enabled }
  window.localStorage.setItem(key, JSON.stringify(next))
  publish(next)
}
export function setLanguage(language: Language) {
  const next = { ...current, language: resolveStoredLocale(language) }
  window.localStorage.setItem(key, JSON.stringify(next))
  publish(next)
}
/**
 * Synchronous read of the stored language preference, for use outside React
 * (i18next bootstrap in `src/i18n/index.ts`, which must pick the initial
 * language before any component renders).
 */
export function getLanguage(): Language {
  return current.language
}
export function setDensity(density: Preferences['density']) {
  const next = { ...current, density }
  window.localStorage.setItem(key, JSON.stringify(next))
  publish(next)
}
