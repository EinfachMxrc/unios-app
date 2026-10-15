// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import { deResources, namespaces } from './resources'
import { baseKey, flattenResource, isTranslationInsensitive } from './translationHeuristics'

/**
 * German resources are bundled eagerly (see `./resources.ts`); English ones
 * are normally code-split and loaded on demand through
 * `i18next-resources-to-backend`. For this test we need every English
 * namespace module up front to compare it against its German counterpart, so
 * we eagerly glob-import them instead of relying on the runtime's lazy
 * `import()` — this never runs in the shipped app, only in the test process.
 *
 * The same missing/extra/untranslated logic used here (via
 * `./translationHeuristics.ts`) also backs `npm run i18n:check`, which runs
 * the equivalent comparison for every OTHER discovered language against
 * German (and, for a non-English language, against English as well — see
 * `./checkTranslations.ts`). This test stays specific to German ⇄ English
 * because those two are the only languages guaranteed to exist and to be
 * exercised by the rest of the test suite (Playwright's language switch
 * spec, `i18n.test.ts`'s pluralization tests, …).
 */
const englishModules = import.meta.glob('./locales/en/*.ts', { eager: true }) as Record<
  string,
  { default: Record<string, unknown> }
>

function englishResourceFor(namespace: string): Record<string, unknown> {
  const path = `./locales/en/${namespace}.ts`
  const module = englishModules[path]
  if (!module) throw new Error(`No English resource file found for namespace "${namespace}" (expected ${path})`)
  return module.default
}

describe('i18n key parity between German and English resources', () => {
  for (const namespace of namespaces) {
    describe(`namespace "${namespace}"`, () => {
      const de = flattenResource(deResources[namespace])
      const en = flattenResource(englishResourceFor(namespace))
      const deKeys = Object.keys(de)
      const enKeys = Object.keys(en)
      const deBaseKeys = new Set(deKeys.map(baseKey))
      const enBaseKeys = new Set(enKeys.map(baseKey))

      it('has every German key present in the English resource (plural-suffix aware)', () => {
        const missing = deKeys.filter((key) => !(key in en) && !enBaseKeys.has(baseKey(key)))
        expect(missing, `English "${namespace}" is missing keys: ${missing.join(', ')}`).toEqual([])
      })

      it('has every English key present in the German resource (plural-suffix aware)', () => {
        const extra = enKeys.filter((key) => !(key in de) && !deBaseKeys.has(baseKey(key)))
        expect(extra, `English "${namespace}" has keys not present in German: ${extra.join(', ')}`).toEqual([])
      })

      it('does not leave any English value identical to the German copy-paste source', () => {
        const suspects = deKeys.filter((key) => {
          if (!(key in en)) return false
          const deValue = de[key]
          const enValue = en[key]
          if (deValue !== enValue) return false
          return !isTranslationInsensitive(deValue)
        })
        expect(
          suspects,
          `English "${namespace}" has untranslated (copy-pasted) values for: ${suspects.join(', ')}`,
        ).toEqual([])
      })
    })
  }
})
