// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import {
  buildFallbackLngMap,
  buildLocaleRegistry,
  DEFAULT_LOCALE,
  fallbackChain,
  getLocaleMetaOrDefault,
  intlLocaleFor,
  isKnownLocale,
  isValidBcp47,
  listLocales,
  resolveLocale,
  validateLocaleMeta,
} from './localeMetaShape'
import type { LocaleMeta } from './localeMetaShape'

function fixtureModules(entries: Record<string, LocaleMeta | Record<string, unknown>>) {
  return Object.fromEntries(
    Object.entries(entries).map(([code, meta]) => [`./locales/${code}/locale.json`, { default: meta }]),
  )
}

const de: LocaleMeta = { code: 'de', nativeName: 'Deutsch', englishName: 'German', dir: 'ltr' }
const en: LocaleMeta = { code: 'en', nativeName: 'English', englishName: 'English', dir: 'ltr', intlLocale: 'en-GB' }
const ar: LocaleMeta = { code: 'ar', nativeName: 'العربية', englishName: 'Arabic', dir: 'rtl' }
const fr: LocaleMeta = { code: 'fr', nativeName: 'Français', englishName: 'French', dir: 'ltr' }

describe('validateLocaleMeta', () => {
  it('accepts a well-formed meta object', () => {
    expect(validateLocaleMeta('de', de)).toEqual(de)
  })

  it('rejects a code that does not match the folder name', () => {
    expect(() => validateLocaleMeta('de', { ...de, code: 'en' })).toThrow(/code/i)
  })

  it('rejects a missing nativeName', () => {
    expect(() => validateLocaleMeta('de', { ...de, nativeName: '' })).toThrow(/nativeName/)
  })

  it('rejects a missing englishName', () => {
    expect(() => validateLocaleMeta('de', { ...de, englishName: undefined })).toThrow(/englishName/)
  })

  it('rejects an invalid dir', () => {
    expect(() => validateLocaleMeta('de', { ...de, dir: 'sideways' })).toThrow(/dir/)
  })

  it('rejects a folder name that is not a valid BCP-47 tag', () => {
    expect(() => validateLocaleMeta('D€', { ...de, code: 'D€' })).toThrow(/BCP-47/)
  })

  it('rejects a non-object default export', () => {
    expect(() => validateLocaleMeta('de', 'nope')).toThrow(/object/)
  })

  it('keeps an explicit intlLocale, and omits the field when absent', () => {
    expect(validateLocaleMeta('en', en).intlLocale).toBe('en-GB')
    expect(validateLocaleMeta('de', de).intlLocale).toBeUndefined()
  })
})

describe('isValidBcp47', () => {
  it.each(['de', 'en', 'en-GB', 'zh-Hans-CN', 'ar'])('accepts "%s"', (tag) => {
    expect(isValidBcp47(tag)).toBe(true)
  })

  it.each(['', 'D€', 'toolong-subtag-thats-way-too-long', '1de'])('rejects "%s"', (tag) => {
    expect(isValidBcp47(tag)).toBe(false)
  })
})

describe('buildLocaleRegistry', () => {
  it('discovers every locale folder with a locale.json', () => {
    const registry = buildLocaleRegistry(fixtureModules({ de, en, ar }))
    expect(registry.codes.sort()).toEqual(['ar', 'de', 'en'])
    expect(registry.byCode.ar).toEqual(ar)
  })

  it('throws when German is missing (it is the required base language)', () => {
    expect(() => buildLocaleRegistry(fixtureModules({ en }))).toThrow(/de/)
  })

  it('throws when an individual locale.json is malformed', () => {
    expect(() => buildLocaleRegistry(fixtureModules({ de, en: { ...en, dir: 'up' } }))).toThrow(/dir/)
  })
})

describe('isKnownLocale / resolveLocale', () => {
  const registry = buildLocaleRegistry(fixtureModules({ de, en }))

  it('recognizes a discovered code', () => {
    expect(isKnownLocale(registry, 'en')).toBe(true)
  })

  it('rejects an unknown or non-string code', () => {
    expect(isKnownLocale(registry, 'fr')).toBe(false)
    expect(isKnownLocale(registry, 42)).toBe(false)
    expect(isKnownLocale(registry, undefined)).toBe(false)
  })

  it('resolves an unknown/removed stored preference to German rather than crashing', () => {
    expect(resolveLocale(registry, 'fr')).toBe(DEFAULT_LOCALE)
    expect(resolveLocale(registry, null)).toBe(DEFAULT_LOCALE)
    expect(resolveLocale(registry, 'en')).toBe('en')
  })
})

describe('getLocaleMetaOrDefault', () => {
  const registry = buildLocaleRegistry(fixtureModules({ de, en }))

  it('returns the requested locale when known', () => {
    expect(getLocaleMetaOrDefault(registry, 'en')).toEqual(en)
  })

  it('falls back to German for an unknown code', () => {
    expect(getLocaleMetaOrDefault(registry, 'fr')).toEqual(de)
  })
})

describe('listLocales', () => {
  it('pins German and English first, then sorts the rest by native name', () => {
    // The collator is instantiated with a fixed 'en' locale (see
    // localeMetaShape.ts) for a deterministic, always-available ordering
    // rather than one that changes with the active UI language; this does
    // not always match "true" alphabetical order in the target script (e.g.
    // Arabic script sorts after Latin script here) — a known, documented
    // limitation (see docs/TRANSLATING.md) rather than a bug.
    const registry = buildLocaleRegistry(fixtureModules({ fr, de, ar, en }))
    expect(listLocales(registry).map((locale) => locale.code)).toEqual(['de', 'en', 'fr', 'ar'])
  })

  it('omits a pinned language from the list when it has not been discovered', () => {
    const registry = buildLocaleRegistry(fixtureModules({ de, ar }))
    expect(listLocales(registry).map((locale) => locale.code)).toEqual(['de', 'ar'])
  })
})

describe('fallbackChain', () => {
  it('gives German no further fallback (it is the base language)', () => {
    expect(fallbackChain('de')).toEqual([])
  })

  it('falls back English to German', () => {
    expect(fallbackChain('en')).toEqual(['de'])
  })

  it('falls back any other language through English, then German', () => {
    expect(fallbackChain('fr')).toEqual(['en', 'de'])
    expect(fallbackChain('ar')).toEqual(['en', 'de'])
  })
})

describe('buildFallbackLngMap', () => {
  it('builds an i18next fallbackLng map for every discovered locale, plus a default', () => {
    const registry = buildLocaleRegistry(fixtureModules({ de, en, fr }))
    expect(buildFallbackLngMap(registry)).toEqual({
      default: ['de'],
      de: [],
      en: ['de'],
      fr: ['en', 'de'],
    })
  })
})

describe('intlLocaleFor', () => {
  it('uses the explicit intlLocale override when set', () => {
    expect(intlLocaleFor(en)).toBe('en-GB')
  })

  it('defaults to the locale code when no override is set', () => {
    expect(intlLocaleFor(de)).toBe('de')
    expect(intlLocaleFor(ar)).toBe('ar')
  })
})
