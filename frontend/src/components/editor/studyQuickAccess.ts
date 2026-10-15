// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from 'react'
import { mathTemplates, type MathTemplate } from './mathTemplates'
import { studyToolKeys } from './studyCommands'
import type { StudyTool } from './StudyHelperDialog'

export const STUDY_QUICK_ACCESS_KEY = 'unios-study-quick-access-v1'
const changedEvent = 'unios-study-quick-access-changed'
const RECENT_LIMIT = 6
type Category = 'templates' | 'tools'
type Shelf = { favorites: string[]; recent: string[] }
export type StudyQuickAccess = { templates: Shelf; tools: Shelf }
const empty = (): StudyQuickAccess => ({ templates: { favorites: [], recent: [] }, tools: { favorites: [], recent: [] } })
const allowed = (category: Category, id: string) => category === 'templates'
  ? Object.hasOwn(mathTemplates, id) : studyToolKeys.includes(id as StudyTool)

/** This preference stores public helper IDs only, never formulas or note text. */
export function readStudyQuickAccess(): StudyQuickAccess {
  try {
    const source: unknown = JSON.parse(localStorage.getItem(STUDY_QUICK_ACCESS_KEY) ?? 'null')
    if (!source || typeof source !== 'object') return empty()
    const result = empty()
    for (const category of ['templates', 'tools'] as const) {
      const shelf = (source as Record<string, unknown>)[category]
      if (!shelf || typeof shelf !== 'object') continue
      for (const key of ['favorites', 'recent'] as const) {
        const value = (shelf as Record<string, unknown>)[key]
        if (Array.isArray(value)) result[category][key] = [...new Set(value.filter((id): id is string =>
          typeof id === 'string' && allowed(category, id)))].slice(0, key === 'recent' ? RECENT_LIMIT : 40)
      }
    }
    return result
  } catch { return empty() }
}

export function updateStudyQuickAccess(current: StudyQuickAccess, category: Category, id: string, action: 'favorite' | 'use'): StudyQuickAccess {
  if (!allowed(category, id)) return current
  const shelf = current[category]
  return { ...current, [category]: action === 'favorite'
    ? { ...shelf, favorites: shelf.favorites.includes(id) ? shelf.favorites.filter(value => value !== id) : [...shelf.favorites, id] }
    : { ...shelf, recent: [id, ...shelf.recent.filter(value => value !== id)].slice(0, RECENT_LIMIT) } }
}

export function useStudyQuickAccess() {
  const [preferences, setPreferences] = useState(readStudyQuickAccess)
  const [sessionOnly, setSessionOnly] = useState(false)
  useEffect(() => {
    const sync = (event: Event) => {
      if (!(event instanceof StorageEvent) || event.key === STUDY_QUICK_ACCESS_KEY || event.key === null) setPreferences(readStudyQuickAccess())
    }
    window.addEventListener('storage', sync)
    window.addEventListener(changedEvent, sync)
    return () => { window.removeEventListener('storage', sync); window.removeEventListener(changedEvent, sync) }
  }, [])
  function update(category: Category, id: string, action: 'favorite' | 'use') {
    // Re-read before merging so two simultaneously open dialogs keep each other's choices.
    const next = updateStudyQuickAccess(sessionOnly ? preferences : readStudyQuickAccess(), category, id, action)
    setPreferences(next)
    try {
      localStorage.setItem(STUDY_QUICK_ACCESS_KEY, JSON.stringify(next))
      setSessionOnly(false)
      window.dispatchEvent(new Event(changedEvent))
    } catch { setSessionOnly(true) }
  }
  return { preferences, sessionOnly,
    toggleTemplate: (id: MathTemplate) => update('templates', id, 'favorite'),
    useTemplate: (id: MathTemplate) => update('templates', id, 'use'),
    toggleTool: (id: StudyTool) => update('tools', id, 'favorite'),
    useTool: (id: StudyTool) => update('tools', id, 'use') }
}

const searchAliases: Partial<Record<MathTemplate, string>> = {
  fraction: 'bruch fraction divide teilen', root: 'wurzel sqrt square root', power: 'potenz hoch exponent power',
  index: 'index tief subscript', sum: 'summe summation sigma', integral: 'integral integrieren integralrechnung',
  matrix: 'matrix matrizen', limit: 'grenzwert lim limit', derivative: 'ableitung differential derivative',
  partial: 'partielle ableitung partial', cases: 'fälle faelle cases', steps: 'schritte umformen gleichung aligned steps',
  system: 'gleichungssystem system equations', vector: 'vektor vector', binomial: 'binomialkoeffizient n über k choose binomial',
  product: 'produkt product', absolute: 'betrag absolute', norm: 'norm länge laenge length',
  complex: 'komplex imaginary', set: 'menge set', forall: 'für alle fuer alle forall', exists: 'existiert exists',
  element: 'element in', arrow: 'pfeil implikation arrow implies', naturals: 'natürliche natuerliche zahlen natural',
  integers: 'ganze zahlen integers', rationals: 'rationale zahlen rationals', reals: 'reelle zahlen reals',
  complexes: 'komplexe zahlen complexes', subset: 'teilmenge subset', intersection: 'schnittmenge intersection',
  union: 'vereinigung union', infinity: 'unendlich infinity', probability: 'wahrscheinlichkeit probability conditional',
  expectation: 'erwartungswert expectation', modulo: 'modulo rest remainder', congruence: 'kongruenz congruence',
}
export function normalizeStudySearch(value: string) {
  return value.toLocaleLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/ß/g, 'ss').trim().replace(/^\//, '')
}
export function matchesMathTemplate(template: MathTemplate, label: string, query: string) {
  const words = normalizeStudySearch(query).split(/\s+/).filter(Boolean)
  const text = normalizeStudySearch(`${template} ${label} ${searchAliases[template] ?? ''}`)
  return words.every(word => text.includes(word))
}
