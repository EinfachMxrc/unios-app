// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import { countMatches, extractPageText, nextSearchResult, pageBadges, searchPosition } from './pdfSearch'

describe('countMatches', () => {
  it('counts non-overlapping, case-insensitive occurrences', () => {
    expect(countMatches('Klausur Klausur klausur', 'Klausur')).toBe(3)
  })

  it('is aware of German case folding (ß)', () => {
    expect(countMatches('Straße straße', 'STRASSE'.toLocaleLowerCase('de-DE'))).toBe(0)
    expect(countMatches('Straße Straße', 'straße')).toBe(2)
  })

  it('returns 0 for an empty term', () => {
    expect(countMatches('irgendein Text', '')).toBe(0)
  })

  it('returns 0 when there is no match', () => {
    expect(countMatches('Vorlesung', 'Klausur')).toBe(0)
  })
})

describe('extractPageText', () => {
  it('joins text items and ignores marked-content items without a str field', () => {
    const items = [{ str: 'Hallo' }, { type: 'beginMarkedContent' }, { str: 'Welt' }]
    expect(extractPageText(items)).toBe('Hallo  Welt')
  })

  it('returns an empty string for an empty array', () => {
    expect(extractPageText([])).toBe('')
  })
})

describe('nextSearchResult', () => {
  const results = [{ page: 2, count: 1 }, { page: 5, count: 2 }, { page: 9, count: 1 }]

  it('returns undefined when there are no results', () => {
    expect(nextSearchResult([], 3, 1)).toBeUndefined()
  })

  it('finds the next result after the current page', () => {
    expect(nextSearchResult(results, 3, 1)).toEqual({ page: 5, count: 2 })
  })

  it('wraps around to the first result when past the last one', () => {
    expect(nextSearchResult(results, 9, 1)).toEqual({ page: 2, count: 1 })
  })

  it('finds the previous result before the current page', () => {
    expect(nextSearchResult(results, 6, -1)).toEqual({ page: 5, count: 2 })
  })

  it('wraps around to the last result when before the first one', () => {
    expect(nextSearchResult(results, 2, -1)).toEqual({ page: 9, count: 1 })
  })
})

describe('searchPosition', () => {
  const results = [{ page: 2, count: 1 }, { page: 5, count: 3 }, { page: 9, count: 2 }]
  it('names the hit page you are on and the hits on the whole document', () => {
    expect(searchPosition(results, 5)).toEqual({ index: 2, pages: 3, hits: 6 })
  })
  it('has no position between hit pages, so the counter shows only the totals', () => {
    expect(searchPosition(results, 6)).toEqual({ index: null, pages: 3, hits: 6 })
    expect(searchPosition([], 1)).toEqual({ index: null, pages: 0, hits: 0 })
  })
})

describe('pageBadges', () => {
  it('counts search hits and placed highlights per page, skipping unplaced ones', () => {
    const badges = pageBadges([{ page: 2, count: 3 }], [
      { anchor: { page: 2, status: 'matched' } }, { anchor: { page: 4, status: 'matched' } },
      { anchor: { page: 4, status: 'matched' } }, { anchor: { page: null, status: 'unmatched' } },
    ])
    expect(badges.get(2)).toEqual({ hits: 3, marks: 1 })
    expect(badges.get(4)).toEqual({ hits: 0, marks: 2 })
    expect(badges.size).toBe(2)
  })
})
