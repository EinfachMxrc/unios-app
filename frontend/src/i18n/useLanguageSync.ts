// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect } from 'react'
import { usePreferences } from '@/preferences'
import i18n from './index'
import { getLocaleMeta } from './localeMeta'
import type { LocaleMeta } from './localeMeta'

/**
 * Sets `<html lang>` and `<html dir>` from a locale's metadata. Extracted as
 * a pure function (rather than inlined in the effect below) so it can be
 * unit-tested directly against a fabricated `LocaleMeta` — including an RTL
 * one, which the two shipped languages (German, English) never exercise —
 * without needing a real registered locale. See `useLanguageSync.test.ts`.
 */
export function applyDocumentLocale(meta: LocaleMeta) {
  document.documentElement.lang = meta.code
  document.documentElement.dir = meta.dir
}

/**
 * Keeps i18next and `<html lang>`/`<html dir>` in sync with the stored
 * language preference. Mount once near the app root (see `App.tsx`).
 */
export function useLanguageSync() {
  const { language } = usePreferences()
  useEffect(() => {
    applyDocumentLocale(getLocaleMeta(language))
    if (i18n.language !== language) void i18n.changeLanguage(language)
  }, [language])
}
