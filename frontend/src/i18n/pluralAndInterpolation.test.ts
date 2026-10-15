// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import {
  interpolationVars,
  providedPluralCategories,
  requiredPluralCategories,
  sameInterpolationVars,
} from './pluralAndInterpolation'

describe('requiredPluralCategories', () => {
  it('returns two categories for German and English', () => {
    expect(requiredPluralCategories('de')).toEqual(['one', 'other'])
    expect(requiredPluralCategories('en-GB')).toEqual(['one', 'other'])
  })

  it('returns the richer category set a language with more plural forms needs (Polish)', () => {
    const categories = requiredPluralCategories('pl')
    expect(categories).toContain('one')
    expect(categories).toContain('few')
    expect(categories).toContain('many')
    expect(categories).toContain('other')
  })

  it('returns a single category for a language without grammatical plural (Japanese)', () => {
    expect(requiredPluralCategories('ja')).toEqual(['other'])
  })
})

describe('providedPluralCategories', () => {
  it('finds every suffix a resource provides for a base key', () => {
    const keys = ['reviewCards_one', 'reviewCards_other', 'unrelatedKey']
    expect(providedPluralCategories(keys, 'reviewCards').sort()).toEqual(['one', 'other'])
  })

  it('returns an empty list when the resource never pluralizes that key', () => {
    expect(providedPluralCategories(['count', 'unrelated_other'], 'count')).toEqual([])
  })
})

describe('interpolationVars', () => {
  it('extracts every {{variable}} placeholder', () => {
    expect(interpolationVars('Hallo {{name}}, du hast {{count}} Karten')).toEqual(new Set(['name', 'count']))
  })

  it('returns an empty set for a value without placeholders', () => {
    expect(interpolationVars('Kein Platzhalter hier')).toEqual(new Set())
  })
})

describe('sameInterpolationVars', () => {
  it('is true when both values use the same variable set, regardless of surrounding text', () => {
    expect(sameInterpolationVars('Hello {{name}}', 'Hallo {{name}}')).toBe(true)
  })

  it('is false when a variable is missing from one side', () => {
    expect(sameInterpolationVars('Hello {{name}}', 'Hallo')).toBe(false)
  })

  it('is false when a variable is only present on one side', () => {
    expect(sameInterpolationVars('{{a}} and {{b}}', '{{a}} only')).toBe(false)
  })

  it('is true for two values with no placeholders at all', () => {
    expect(sameInterpolationVars('Close', 'Schließen')).toBe(true)
  })
})
