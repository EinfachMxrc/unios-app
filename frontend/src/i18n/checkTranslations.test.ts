// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import { checkNamespace, mergeReports, untranslatedBaselineLocale } from './checkTranslations'

describe('untranslatedBaselineLocale', () => {
  it('uses German as the baseline when checking English itself', () => {
    expect(untranslatedBaselineLocale('en')).toBe('de')
  })

  it('uses English as the baseline for any other language (the i18n:new scaffold source)', () => {
    expect(untranslatedBaselineLocale('fr')).toBe('en')
    expect(untranslatedBaselineLocale('ar')).toBe('en')
  })
})

describe('checkNamespace: missing keys', () => {
  const german = { close: 'Schließen', title: 'Titel' }

  it('warns about a missing key for a non-strict (non-English) locale', () => {
    const report = checkNamespace({
      namespace: 'common',
      locale: 'fr',
      intlLocale: 'fr',
      german,
      untranslatedBaseline: { close: 'Close', title: 'Title' },
      target: { close: 'Fermer' },
      isStrict: false,
    })
    expect(report.errors).toEqual([])
    expect(report.warnings).toEqual([{ namespace: 'common', key: 'title', message: expect.stringContaining('missing key "title"') }])
  })

  it('errors about a missing key when the locale is strict (English)', () => {
    const report = checkNamespace({
      namespace: 'common',
      locale: 'en',
      intlLocale: 'en-GB',
      german,
      untranslatedBaseline: german,
      target: { close: 'Close' },
      isStrict: true,
    })
    expect(report.warnings).toEqual([])
    expect(report.errors).toEqual([{ namespace: 'common', key: 'title', message: expect.stringContaining('missing key "title"') }])
  })

  it('does not flag a key covered by a plural-suffix base match', () => {
    // Dutch ("nl") needs exactly one/other, like German/English, so this
    // also implicitly confirms the plural-forms check has nothing to add
    // here — see the dedicated "missing plural forms" tests below for a
    // language whose grammar needs more categories than were provided.
    const report = checkNamespace({
      namespace: 'today',
      locale: 'nl',
      intlLocale: 'nl',
      german: { reviewCards: 'Wiederholen' },
      untranslatedBaseline: { reviewCards_one: 'Review', reviewCards_other: 'Review all' },
      target: { reviewCards_one: 'Herhaal', reviewCards_other: 'Herhaal alles' },
      isStrict: false,
    })
    expect(report.warnings).toEqual([])
    expect(report.errors).toEqual([])
  })
})

describe('checkNamespace: extra keys', () => {
  it('always errors on a key that does not exist in German, regardless of strictness', () => {
    const report = checkNamespace({
      namespace: 'common',
      locale: 'fr',
      intlLocale: 'fr',
      german: { close: 'Schließen' },
      untranslatedBaseline: { close: 'Close' },
      target: { close: 'Fermer', ghost: 'Fantôme' },
      isStrict: false,
    })
    expect(report.errors).toEqual([{ namespace: 'common', key: 'ghost', message: expect.stringContaining('does not exist in German') }])
  })
})

describe('checkNamespace: untranslated values', () => {
  it('warns when a value is identical to its baseline copy', () => {
    const report = checkNamespace({
      namespace: 'common',
      locale: 'fr',
      intlLocale: 'fr',
      german: { close: 'Schließen' },
      untranslatedBaseline: { close: 'Close' },
      target: { close: 'Close' },
      isStrict: false,
    })
    expect(report.warnings).toEqual([{ namespace: 'common', key: 'close', message: expect.stringContaining('identical to its source copy') }])
  })

  it('does not flag a value made only of cognates/short words', () => {
    const report = checkNamespace({
      namespace: 'common',
      locale: 'fr',
      intlLocale: 'fr',
      german: { pdf: 'PDF', vegan: 'Vegan', app: 'UniOS Desktop' },
      untranslatedBaseline: { pdf: 'PDF', vegan: 'Vegan', app: 'UniOS Desktop' },
      target: { pdf: 'PDF', vegan: 'Vegan', app: 'UniOS Desktop' },
      isStrict: false,
    })
    expect(report.warnings).toEqual([])
  })
})

describe('checkNamespace: interpolation mismatches', () => {
  it('errors when a target value drops a German interpolation variable', () => {
    const report = checkNamespace({
      namespace: 'common',
      locale: 'fr',
      intlLocale: 'fr',
      german: { greeting: 'Hallo {{name}}' },
      untranslatedBaseline: { greeting: 'Hello {{name}}' },
      target: { greeting: 'Bonjour' },
      isStrict: false,
    })
    expect(report.errors).toEqual([{ namespace: 'common', key: 'greeting', message: expect.stringContaining('interpolation variables') }])
  })

  it('does not flag matching interpolation variables', () => {
    const report = checkNamespace({
      namespace: 'common',
      locale: 'fr',
      intlLocale: 'fr',
      german: { greeting: 'Hallo {{name}}' },
      untranslatedBaseline: { greeting: 'Hello {{name}}' },
      target: { greeting: 'Bonjour {{name}}' },
      isStrict: false,
    })
    expect(report.errors).toEqual([])
  })
})

describe('checkNamespace: missing plural forms', () => {
  it('warns when a locale pluralizes a key but is missing a category its own grammar requires', () => {
    const report = checkNamespace({
      namespace: 'today',
      locale: 'pl',
      intlLocale: 'pl',
      german: { reviewCards: 'Wiederholen' },
      untranslatedBaseline: { reviewCards_one: 'Review', reviewCards_other: 'Review all' },
      // Polish needs one/few/many/other; this only provides one/other.
      target: { reviewCards_one: 'Powtórz', reviewCards_other: 'Powtórz wszystko' },
      isStrict: false,
    })
    expect(report.warnings).toEqual([
      { namespace: 'today', key: 'reviewCards', message: expect.stringContaining('[few, many]') },
    ])
  })

  it('does not warn when the locale opts out of pluralizing that key entirely', () => {
    const report = checkNamespace({
      namespace: 'today',
      locale: 'fr',
      intlLocale: 'fr',
      german: { reviewCards: 'Wiederholen' },
      untranslatedBaseline: { reviewCards_one: 'Review', reviewCards_other: 'Review all' },
      target: { reviewCards: 'Réviser' },
      isStrict: false,
    })
    expect(report.warnings).toEqual([])
  })

  it('does not warn when the locale already covers every required category', () => {
    const report = checkNamespace({
      namespace: 'today',
      locale: 'nl',
      intlLocale: 'nl',
      german: { reviewCards: 'Wiederholen' },
      untranslatedBaseline: { reviewCards_one: 'Review', reviewCards_other: 'Review all' },
      target: { reviewCards_one: 'Herhaal', reviewCards_other: 'Herhaal alles' },
      isStrict: false,
    })
    expect(report.warnings).toEqual([])
  })
})

describe('mergeReports', () => {
  it('flattens errors and warnings from multiple namespace reports', () => {
    const a = { errors: [{ namespace: 'a', key: 'x', message: 'e1' }], warnings: [] }
    const b = { errors: [], warnings: [{ namespace: 'b', key: 'y', message: 'w1' }] }
    expect(mergeReports([a, b])).toEqual({
      errors: [{ namespace: 'a', key: 'x', message: 'e1' }],
      warnings: [{ namespace: 'b', key: 'y', message: 'w1' }],
    })
  })
})
