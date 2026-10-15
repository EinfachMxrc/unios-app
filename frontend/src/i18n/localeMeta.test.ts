// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import i18nextFactory from 'i18next'
import { buildFallbackLngMap, buildLocaleRegistry, fallbackChain, listLocales } from './localeMetaShape'
import {
  fallbackLngMap,
  getLocaleMeta,
  listSupportedLocales,
  localeCodes,
  localeRegistry,
  resolveStoredLocale,
} from './localeMeta'

describe('production locale discovery (real import.meta.glob over src/i18n/locales)', () => {
  it('discovers exactly the shipped languages', () => {
    expect(localeCodes.sort()).toEqual(['de', 'en'])
  })

  it('exposes correct metadata for each shipped language', () => {
    expect(getLocaleMeta('de')).toMatchObject({ code: 'de', nativeName: 'Deutsch', dir: 'ltr' })
    expect(getLocaleMeta('en')).toMatchObject({ code: 'en', nativeName: 'English', dir: 'ltr', intlLocale: 'en-GB' })
  })

  it('lists German then English for the switcher', () => {
    expect(listSupportedLocales().map((locale) => locale.code)).toEqual(['de', 'en'])
  })

  it('validates a stored preference and falls back to German for an unknown one', () => {
    expect(resolveStoredLocale('fr')).toBe('de')
    expect(resolveStoredLocale('en')).toBe('en')
  })

  it('builds a fallbackLng map covering every discovered language', () => {
    expect(fallbackLngMap).toEqual({ default: ['de'], de: [], en: ['de'] })
  })
})

/**
 * These fixture files live under `./__fixtures__/discoveryLocales/`, NOT
 * under `./locales/`, specifically so this test can exercise the real Vite
 * `import.meta.glob` discovery mechanism against a throwaway third language
 * (including an RTL one) without shipping it in the actual app — see
 * `docs/TRANSLATING.md` and the fixture files' own comments.
 */
const fixtureMetaModules = import.meta.glob('./__fixtures__/discoveryLocales/*/locale.json', { eager: true }) as Record<
  string,
  { default: unknown }
>
const fixtureNamespaceModules = import.meta.glob('./__fixtures__/discoveryLocales/*/demo.ts', {
  eager: true,
}) as Record<string, { default: Record<string, string> }>

function fixtureNamespaceFor(code: string): Record<string, string> {
  const module = fixtureNamespaceModules[`./__fixtures__/discoveryLocales/${code}/demo.ts`]
  if (!module) throw new Error(`No fixture namespace for locale "${code}"`)
  return module.default
}

describe('locale discovery mechanism (glob-based, mirrors production wiring exactly)', () => {
  it('discovers every locale folder with a locale.json, including a third, RTL, test-only language', () => {
    const registry = buildLocaleRegistry(fixtureMetaModules)
    expect(registry.codes.sort()).toEqual(['de', 'en', 'zz'])
  })

  it('picks up the RTL direction declared by the test-only locale', () => {
    const registry = buildLocaleRegistry(fixtureMetaModules)
    expect(registry.byCode.zz).toMatchObject({ dir: 'rtl', nativeName: 'Testish' })
  })

  it('lists the fixture locale after German and English, sorted by native name', () => {
    const registry = buildLocaleRegistry(fixtureMetaModules)
    expect(listLocales(registry).map((locale) => locale.code)).toEqual(['de', 'en', 'zz'])
  })
})

describe('deep-partial fallback chain (integration, throwaway i18next instance)', () => {
  // A dedicated i18next instance (not the app's shared `./index.ts` one) so
  // this test can freely configure a third, incomplete, test-only language
  // without affecting — or being affected by — the real app bootstrap or any
  // other test in this file.
  async function buildDemoInstance(registry: ReturnType<typeof buildLocaleRegistry>) {
    const instance = i18nextFactory.createInstance()
    await instance.init({
      lng: 'zz',
      fallbackLng: buildFallbackLngMap(registry),
      supportedLngs: registry.codes,
      ns: ['demo'],
      defaultNS: 'demo',
      resources: {
        de: { demo: fixtureNamespaceFor('de') },
        en: { demo: fixtureNamespaceFor('en') },
        zz: { demo: fixtureNamespaceFor('zz') },
      },
      interpolation: { escapeValue: false },
      returnNull: false,
    })
    return instance
  }

  it("uses the test-only language's own translation when present", async () => {
    const registry = buildLocaleRegistry(fixtureMetaModules)
    const instance = await buildDemoInstance(registry)
    expect(instance.t('demo:greeting')).toBe('Zzzhello')
  })

  it('falls through to English (not straight to German) for a key the test-only language never translated', async () => {
    const registry = buildLocaleRegistry(fixtureMetaModules)
    const instance = await buildDemoInstance(registry)
    // The fixture's "zz" resource only has "greeting" (see demo.ts in that
    // fixture folder) — "farewell" must resolve through the fallback chain
    // `zz -> en -> de`, landing on English rather than skipping straight to
    // German or rendering an empty/placeholder string.
    expect(instance.t('demo:farewell')).toBe('Bye')
  })

  it('matches the documented fallback chain shape for a non-English language', () => {
    expect(fallbackChain('zz')).toEqual(['en', 'de'])
  })
})

describe('sanity: production registry object identity', () => {
  it('is the same object every import sees (computed once at module load)', () => {
    expect(localeRegistry.codes).toEqual(localeCodes)
  })
})
