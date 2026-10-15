// SPDX-License-Identifier: AGPL-3.0-or-later

import { baseKey, flattenResource, isTranslationInsensitive, PLURAL_SUFFIX } from './translationHeuristics.ts'
import { providedPluralCategories, requiredPluralCategories, sameInterpolationVars } from './pluralAndInterpolation.ts'

/**
 * The pure comparison logic behind `npm run i18n:check` (CLI wrapper:
 * `frontend/scripts/i18n-check.mjs`). Kept dependency-free (no `fs`, no
 * `import.meta.glob`) so it is unit-testable with plain fabricated resource
 * objects and importable both by Vitest and directly by plain Node.
 *
 * Severity rules (see `docs/TRANSLATING.md`):
 * - **extra key**, **interpolation mismatch** → always an error.
 * - **missing key** → a warning, EXCEPT for English, which must stay
 *   complete (`isStrict: true`), where it is an error.
 * - **untranslated value** (identical to its source copy) → always a
 *   warning.
 * - **missing plural form** (required by the locale's own grammar, once it
 *   has started pluralizing a key at all) → always a warning.
 *
 * The two imports below use explicit `.ts` extensions (allowed by this
 * project's `allowImportingTsExtensions` tsconfig option) rather than the
 * usual extensionless style: `frontend/scripts/i18n-check.mjs` imports this
 * file directly with plain Node (`--experimental-strip-types`), whose native
 * ESM resolver — unlike Vite's — requires an explicit extension.
 */

export interface NamespaceCheckIssue {
  namespace: string
  key: string
  message: string
}

export interface NamespaceCheckReport {
  errors: NamespaceCheckIssue[]
  warnings: NamespaceCheckIssue[]
}

export interface CheckNamespaceParams {
  /** Namespace name, only used to label issues (e.g. "common"). */
  namespace: string
  /** The locale being checked, e.g. "fr". Never "de" — German is the source and is never checked against itself. */
  locale: string
  /** BCP-47 tag used for `Intl.PluralRules` (the locale's `meta.intlLocale ?? code`). */
  intlLocale: string
  /** German's resource object for this namespace — the authoritative key set. */
  german: Record<string, unknown>
  /**
   * The resource "untranslated" values are compared against: German when
   * checking English itself, English for every other locale (contributors
   * scaffold new locales by copying English — see `i18n:new`).
   */
  untranslatedBaseline: Record<string, unknown>
  /** The locale's own resource object for this namespace. */
  target: Record<string, unknown>
  /** True only for English: missing keys are errors instead of warnings. */
  isStrict: boolean
}

export function checkNamespace(params: CheckNamespaceParams): NamespaceCheckReport {
  const { namespace, locale, intlLocale, german, untranslatedBaseline, target, isStrict } = params
  const errors: NamespaceCheckIssue[] = []
  const warnings: NamespaceCheckIssue[] = []

  const de = flattenResource(german)
  const baseline = flattenResource(untranslatedBaseline)
  const tgt = flattenResource(target)
  const deKeys = Object.keys(de)
  const tgtKeys = Object.keys(tgt)
  const deBaseKeys = new Set(deKeys.map(baseKey))
  const tgtBaseKeys = new Set(tgtKeys.map(baseKey))

  const missing = deKeys.filter((key) => !(key in tgt) && !tgtBaseKeys.has(baseKey(key)))
  for (const key of missing) {
    const issue: NamespaceCheckIssue = { namespace, key, message: `"${locale}" is missing key "${key}" (present in German)` }
    ;(isStrict ? errors : warnings).push(issue)
  }

  const extra = tgtKeys.filter((key) => !(key in de) && !deBaseKeys.has(baseKey(key)))
  for (const key of extra) {
    errors.push({ namespace, key, message: `"${locale}" has key "${key}" that does not exist in German` })
  }

  for (const key of deKeys) {
    if (!(key in tgt) || !(key in baseline)) continue
    if (baseline[key] === tgt[key] && !isTranslationInsensitive(tgt[key])) {
      warnings.push({ namespace, key, message: `"${locale}"'s "${key}" is identical to its source copy (possibly untranslated)` })
    }
  }

  for (const key of deKeys) {
    if (!(key in tgt)) continue
    if (!sameInterpolationVars(de[key], tgt[key])) {
      errors.push({
        namespace,
        key,
        message: `"${locale}"'s "${key}" interpolation variables don't match German ("${de[key]}" vs "${tgt[key]}")`,
      })
    }
  }

  const pluralBaseKeys = new Set(
    [...deKeys, ...Object.keys(baseline)].filter((key) => PLURAL_SUFFIX.test(key)).map(baseKey),
  )
  for (const base of pluralBaseKeys) {
    const provided = providedPluralCategories(tgtKeys, base)
    if (provided.length === 0) continue // locale intentionally not pluralizing this key — valid, see translationHeuristics.ts
    const required = requiredPluralCategories(intlLocale)
    const missingCategories = required.filter((category) => !provided.includes(category))
    if (missingCategories.length) {
      warnings.push({
        namespace,
        key: base,
        message: `"${locale}" is missing plural form(s) [${missingCategories.join(', ')}] for "${base}" (required by ${intlLocale} grammar)`,
      })
    }
  }

  return { errors, warnings }
}

export function mergeReports(reports: NamespaceCheckReport[]): NamespaceCheckReport {
  return {
    errors: reports.flatMap((report) => report.errors),
    warnings: reports.flatMap((report) => report.warnings),
  }
}

/** Whether English (or the locale being scaffolded from) drives the "untranslated" baseline. */
export function untranslatedBaselineLocale(locale: string): 'de' | 'en' {
  return locale === 'en' ? 'de' : 'en'
}
