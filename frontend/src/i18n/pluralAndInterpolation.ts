// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Pure helpers for `npm run i18n:check` (see `./checkTranslations.ts`):
 * which CLDR plural categories a locale's grammar actually needs, and which
 * `{{variable}}` interpolation placeholders a translated string uses. Both
 * only depend on the standard `Intl` API and plain string matching, so — like
 * `./translationHeuristics.ts` — this file is importable both by Vitest and
 * directly by plain Node (`--experimental-strip-types`).
 */

/**
 * The CLDR plural categories a locale's own grammar distinguishes, e.g.
 * `['one', 'other']` for German/English, or `['one', 'few', 'many', 'other']`
 * for Polish. Uses `Intl.PluralRules` directly rather than sampling counts,
 * so it is exact rather than heuristic.
 */
export function requiredPluralCategories(intlLocale: string): string[] {
  return new Intl.PluralRules(intlLocale).resolvedOptions().pluralCategories
}

/**
 * Which plural-suffix categories (e.g. `_one`, `_other`) a resource actually
 * provides for a given base key.
 */
export function providedPluralCategories(resourceKeys: Iterable<string>, base: string): string[] {
  const prefix = `${base}_`
  const categories: string[] = []
  for (const key of resourceKeys) {
    if (key.startsWith(prefix)) categories.push(key.slice(prefix.length))
  }
  return categories
}

const INTERPOLATION_VAR = /\{\{\s*([\w.]+)\s*\}\}/g

/** The set of `{{variable}}` interpolation placeholder names used in a translated value. */
export function interpolationVars(value: string): Set<string> {
  const vars = new Set<string>()
  for (const match of value.matchAll(INTERPOLATION_VAR)) vars.add(match[1])
  return vars
}

/** True when two values use exactly the same set of interpolation variables. */
export function sameInterpolationVars(a: string, b: string): boolean {
  const varsA = interpolationVars(a)
  const varsB = interpolationVars(b)
  if (varsA.size !== varsB.size) return false
  for (const name of varsA) if (!varsB.has(name)) return false
  return true
}
