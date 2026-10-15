// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { focusApiPath, focusPath, focusQuery, readFocusRef } from './learningFocus'

describe('bounded learning context navigation', () => {
  it('carries one stable block or cycle reference through existing study routes', () => {
    expect(readFocusRef('?deck=Other&focus=block%3A123')).toEqual({ kind: 'block', id: 123 })
    expect(readFocusRef(new URLSearchParams('focus=cycle:7'))).toEqual({ kind: 'cycle', id: 7 })
    expect(focusQuery({ kind: 'block', id: 123 })).toBe('focus=block%3A123')
    expect(focusApiPath({ kind: 'cycle', id: 7 })).toBe('/api/learning/focus/cycle/7')
    expect(readFocusRef('focus=course:3')).toEqual({ kind: 'course', id: 3 })
    expect(focusPath({ kind: 'course', id: 3 }, { version: 4, page: 9 })).toBe(
      '/learning/focus/course/3?version=4&page=9',
    )
  })

  it.each([
    '',
    'focus=https://evil.invalid',
    'focus=block:0',
    'focus=block:-2',
    'focus=block:1.5',
    'focus=block:9007199254740992',
    'focus=block:001',
    'focus=topic:1',
    'focus=cycle:2&focus=block:1',
  ])('rejects ambiguous or unbounded input %s', (search) => expect(readFocusRef(search)).toBeNull())

  it('preserves exact source, note and page using only allowed local URL fields', () => {
    expect(
      focusPath(
        { kind: 'block', id: 123 },
        { mode: 'notes', version: 4, page: 80, note: '2b763934-341c-4a99-8f1f-1fb99e22dcbd' },
      ),
    ).toBe('/learning/focus/block/123?mode=notes&version=4&note=2b763934-341c-4a99-8f1f-1fb99e22dcbd&page=80')
    expect(focusPath({ kind: 'cycle', id: 8 }, { version: NaN, page: -1, note: '../../other' })).toBe(
      '/learning/focus/cycle/8',
    )
  })
})
