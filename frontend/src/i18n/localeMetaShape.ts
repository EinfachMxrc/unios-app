// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Pure, framework-free locale registry logic.
 *
 * This module intentionally has ZERO dependency on Vite (no
 * `import.meta.glob`) or on i18next, so it can be imported two different
 * ways from two different runtimes:
 *
 * 1. From `./localeMeta.ts`, which feeds it the result of a real
 *    `import.meta.glob('./locales/*\/locale.json')` call — that's how the
 *    shipped app discovers languages.
 * 2. Directly by plain Node (via `node --experimental-strip-types`, which
 *    erases the type-only syntax below at load time) from
 *    `frontend/scripts/i18n-check.mjs` and `frontend/scripts/i18n-new.mjs` —
 *    neither of those runs under Vite, so they cannot use `import.meta.glob`
 *    and instead discover locale folders with plain `fs` calls, then hand
 *    the parsed `locale.json` contents to `validateLocaleMeta` here.
 *
 * Locale metadata is plain JSON (not `.ts`) on purpose: `./index.ts`'s
 * `resourcesToBackend` factory does `import(`./locales/${language}/${namespace}.ts`)`
 * with two runtime-variable path segments, which forces Vite to treat every
 * file matching `./locales/*\/*.ts` as a potential lazy-load target — a
 * `locale.json` would therefore ship as a handful of dead, never-fetched chunks
 * (i18next never requests a "meta" namespace). A `.json` file doesn't match
 * that glob shape at all, so it stays out of the namespace-loading path
 * entirely.
 *
 * Keeping this logic here (instead of duplicating it between the app and
 * the contributor tooling) is what lets `i18n:check` enforce exactly the
 * same rules the running app relies on.
 */

export type TextDirection = 'ltr' | 'rtl'

export interface LocaleMeta {
  /** BCP-47 language tag, e.g. "de", "en", "ar". Must match the folder name. */
  code: string
  /** The language's own name for itself, e.g. "Deutsch", "العربية". */
  nativeName: string
  /** The language's English name, e.g. "German", "Arabic". Used in docs/tooling. */
  englishName: string
  dir: TextDirection
  /**
   * BCP-47 tag to use for `Intl.*` formatting (dates, numbers, currency).
   * Defaults to `code` when omitted — most languages format correctly from
   * the bare language tag. Set this only when the bare tag would pick an
   * unwanted regional convention (English defaults to en-US's month-first
   * dates; UniOS uses en-GB's day-first order instead, so `en/locale.json` sets
   * `intlLocale: 'en-GB'`).
   */
  intlLocale?: string
}

export interface LocaleRegistry {
  codes: string[]
  byCode: Record<string, LocaleMeta>
}

/** German is the source language: every namespace is guaranteed complete for it. */
export const DEFAULT_LOCALE = 'de'

/** Languages that always lead the switcher, in this order, ahead of the rest. */
export const PINNED_LOCALES = [DEFAULT_LOCALE, 'en']

const DIRECTIONS: TextDirection[] = ['ltr', 'rtl']

// BCP-47 primary-subtag + optional script/region/variant subtags, lowercase
// primary tag (folder names are lowercase throughout `src/i18n/locales/`).
const BCP47_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/

export function isValidBcp47(code: string): boolean {
  return BCP47_PATTERN.test(code)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Validates the shape of a locale's parsed `locale.json`. Throws a
 * descriptive error — surfaced at app startup (via `localeMeta.ts`) or by
 * `i18n:check` — rather than letting a malformed file silently produce a
 * broken switcher entry.
 */
export function validateLocaleMeta(folder: string, candidate: unknown): LocaleMeta {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error(`Locale "${folder}": locale.json must contain a JSON object`)
  }
  const meta = candidate as Partial<LocaleMeta>
  if (!isValidBcp47(folder)) {
    throw new Error(`Locale "${folder}": folder name is not a valid BCP-47 language tag`)
  }
  if (meta.code !== folder) {
    throw new Error(
      `Locale "${folder}": locale.json declares code "${String(meta.code)}", which must match the folder name`,
    )
  }
  if (!isNonEmptyString(meta.nativeName)) {
    throw new Error(`Locale "${folder}": locale.json is missing a non-empty "nativeName"`)
  }
  if (!isNonEmptyString(meta.englishName)) {
    throw new Error(`Locale "${folder}": locale.json is missing a non-empty "englishName"`)
  }
  if (!meta.dir || !DIRECTIONS.includes(meta.dir)) {
    throw new Error(
      `Locale "${folder}": locale.json has invalid "dir" (expected "ltr" or "rtl", got ${JSON.stringify(meta.dir)})`,
    )
  }
  if (meta.intlLocale !== undefined && !isNonEmptyString(meta.intlLocale)) {
    throw new Error(`Locale "${folder}": locale.json has an invalid "intlLocale"`)
  }
  return {
    code: meta.code,
    nativeName: meta.nativeName,
    englishName: meta.englishName,
    dir: meta.dir,
    ...(meta.intlLocale ? { intlLocale: meta.intlLocale } : {}),
  }
}

/** The BCP-47 tag to feed `Intl.*` constructors for this locale. */
export function intlLocaleFor(meta: LocaleMeta): string {
  return meta.intlLocale ?? meta.code
}

/**
 * Builds a locale registry from a map of `{ "./locales/<code>/locale.json": { default } }`
 * — the shape both `import.meta.glob(..., { eager: true })` and a hand-built
 * fixture object produce. Pure and side-effect-free, so it's the same
 * function exercised by unit tests, by the shipped app, and by the
 * contributor check script.
 */
export function buildLocaleRegistry(rawModules: Record<string, { default: unknown }>): LocaleRegistry {
  const byCode: Record<string, LocaleMeta> = {}
  for (const [path, module] of Object.entries(rawModules)) {
    // Accepts any "<...>/<folder>/locale.json" path — production code globs
    // "./locales/*/locale.json", tests glob a throwaway fixture directory (see
    // localeMeta.test.ts), and both shapes should resolve the same way.
    const match = /\/([^/]+)\/locale\.json$/.exec(path)
    if (!match) throw new Error(`Unexpected locale meta path: "${path}"`)
    const folder = match[1]
    byCode[folder] = validateLocaleMeta(folder, module.default)
  }
  if (!byCode[DEFAULT_LOCALE]) {
    throw new Error(`Missing required "${DEFAULT_LOCALE}" locale (locales/${DEFAULT_LOCALE}/locale.json)`)
  }
  return { codes: Object.keys(byCode), byCode }
}

export function isKnownLocale(registry: LocaleRegistry, code: unknown): code is string {
  return typeof code === 'string' && code in registry.byCode
}

/** Validates an untrusted/stored language code, falling back to German rather than crashing. */
export function resolveLocale(registry: LocaleRegistry, code: unknown): string {
  return isKnownLocale(registry, code) ? code : DEFAULT_LOCALE
}

export function getLocaleMetaOrDefault(registry: LocaleRegistry, code: string): LocaleMeta {
  return registry.byCode[code] ?? registry.byCode[DEFAULT_LOCALE]
}

/**
 * All discovered locales, sorted for the language switcher: German and
 * English always lead (in that order, when present), the rest follow
 * alphabetically by native name using a locale-aware collator.
 */
export function listLocales(registry: LocaleRegistry): LocaleMeta[] {
  const collator = new Intl.Collator('en', { sensitivity: 'base' })
  const pinned = PINNED_LOCALES.filter((code) => code in registry.byCode)
  const rest = registry.codes
    .filter((code) => !pinned.includes(code))
    .sort((a, b) => collator.compare(registry.byCode[a].nativeName, registry.byCode[b].nativeName))
  return [...pinned, ...rest].map((code) => registry.byCode[code])
}

/**
 * i18next fallback chain for a language: `<lang> → en → de`, collapsing to
 * `en → de` for English itself, and to nothing further for German (the base
 * language, which has no fallback — it IS the fallback).
 */
export function fallbackChain(code: string): string[] {
  if (code === DEFAULT_LOCALE) return []
  if (code === 'en') return [DEFAULT_LOCALE]
  return ['en', DEFAULT_LOCALE]
}

/** i18next's `fallbackLng` option, built from every discovered locale's fallback chain. */
export function buildFallbackLngMap(registry: LocaleRegistry): Record<string, string[]> {
  const map: Record<string, string[]> = { default: [DEFAULT_LOCALE] }
  for (const code of registry.codes) map[code] = fallbackChain(code)
  return map
}
