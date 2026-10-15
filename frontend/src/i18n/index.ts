// SPDX-License-Identifier: AGPL-3.0-or-later

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import resourcesToBackend from 'i18next-resources-to-backend'
import { getLanguage } from '@/preferences'
import { defaultNS, deResources, namespaces } from './resources'
import { fallbackLngMap, localeCodes } from './localeMeta'

/**
 * i18next + react-i18next setup.
 *
 * - German (`de`) is the default and fallback language. Its resources are
 *   bundled synchronously (see `./resources.ts`) so the app renders correct
 *   text immediately, without waiting on any async load — this keeps every
 *   existing Playwright spec (which asserts German text) passing unchanged.
 * - Every UI language is discovered from `./locales/*\/locale.json` (see
 *   `./localeMeta.ts`) rather than hand-listed here — `supportedLngs` and
 *   `fallbackLng` are both derived from that discovery, so adding a language
 *   never touches this file.
 * - English (`en`) is loaded on demand through `i18next-resources-to-backend`,
 *   which resolves to a plain dynamic `import()` of the matching TS module.
 *   Vite code-splits that into its own chunk, so English text never inflates
 *   the default bundle; the chunk is a same-origin build asset (not a
 *   third-party network fetch) and is precached by the PWA service worker
 *   like any other JS asset, so switching languages keeps working offline
 *   once the app has been opened once.
 * - `i18n.init()` populates the resource store synchronously from the
 *   `resources` option for whichever language already has bundled/cached
 *   resources, so `t()` works right after import without an `await` (see
 *   `src/App.test.tsx`, which renders without awaiting i18n readiness).
 *
 * Deliberately not using i18next's own `CustomTypeOptions`/`TFunction<Ns>`
 * generics for compile-time key safety — see `./useT.ts` for why (a real bug
 * in that machinery for the plain `t('key')` call shape) and use `useT` from
 * that module in components instead of `useTranslation` directly.
 */
void i18n
  .use(resourcesToBackend((language: string, namespace: string) => import(`./locales/${language}/${namespace}.ts`)))
  .use(initReactI18next)

export const i18nReady = i18n.init({
  lng: getLanguage(),
  fallbackLng: fallbackLngMap,
  supportedLngs: localeCodes,
  ns: namespaces,
  defaultNS,
  resources: { de: deResources },
  partialBundledLanguages: true,
  interpolation: { escapeValue: false },
  returnNull: false,
  react: { useSuspense: false },
})

export default i18n
