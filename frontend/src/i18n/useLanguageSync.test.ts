// SPDX-License-Identifier: AGPL-3.0-or-later

// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { applyDocumentLocale } from './useLanguageSync'
import type { LocaleMeta } from './localeMeta'

describe('applyDocumentLocale', () => {
  it('sets <html lang> and <html dir> from an LTR locale', () => {
    const meta: LocaleMeta = { code: 'en', nativeName: 'English', englishName: 'English', dir: 'ltr' }
    applyDocumentLocale(meta)
    expect(document.documentElement.lang).toBe('en')
    expect(document.documentElement.dir).toBe('ltr')
  })

  it('sets <html dir="rtl"> for a right-to-left locale — neither shipped language (German, English) exercises this, so it is tested directly against a fabricated LocaleMeta', () => {
    const meta: LocaleMeta = { code: 'zz', nativeName: 'Testish', englishName: 'Test language', dir: 'rtl' }
    applyDocumentLocale(meta)
    expect(document.documentElement.lang).toBe('zz')
    expect(document.documentElement.dir).toBe('rtl')
  })
})
