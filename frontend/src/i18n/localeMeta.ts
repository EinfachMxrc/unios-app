// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  buildFallbackLngMap,
  buildLocaleRegistry,
  DEFAULT_LOCALE,
  getLocaleMetaOrDefault,
  intlLocaleFor,
  listLocales,
  resolveLocale,
} from './localeMetaShape'
import type { LocaleMeta, LocaleRegistry, TextDirection } from './localeMetaShape'

export { DEFAULT_LOCALE, intlLocaleFor }
export type { LocaleMeta, TextDirection }

/**
 * Discovers every supported UI language from `./locales/*\/locale.json`.
 * Adding a language is therefore "add a folder with a locale.json" —
 * nothing here, or anywhere else in the app, needs to be hand-edited with
 * the new language's code (see `docs/TRANSLATING.md`).
 *
 * `eager: true` bundles every `locale.json` synchronously: these files are
 * tiny (four string fields) and the switcher needs the full list
 * immediately, so there is no lazy-loading win to be had here — unlike the
 * namespace resources themselves (see `./index.ts`), which ARE code-split
 * per language. Metadata is plain JSON rather than `.ts` on purpose — see
 * `./localeMetaShape.ts`'s header comment for why.
 */
const metaModules = import.meta.glob('./locales/*/locale.json', { eager: true }) as Record<
  string,
  { default: unknown }
>

export const localeRegistry: LocaleRegistry = buildLocaleRegistry(metaModules)

export const localeCodes: string[] = localeRegistry.codes

/** Validates an untrusted/stored language code, falling back to German rather than crashing. */
export function resolveStoredLocale(code: unknown): string {
  return resolveLocale(localeRegistry, code)
}

export function getLocaleMeta(code: string): LocaleMeta {
  return getLocaleMetaOrDefault(localeRegistry, code)
}

/** All discovered locales, sorted for the language switcher (see `SettingsPage.tsx`). */
export function listSupportedLocales(): LocaleMeta[] {
  return listLocales(localeRegistry)
}

/** i18next's `fallbackLng` option, derived from the discovered locales. */
export const fallbackLngMap: Record<string, string[]> = buildFallbackLngMap(localeRegistry)
