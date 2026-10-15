// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { encodeMark, findPassage, pageRects, parseMark } from './passageLink'

describe('mark links', () => {
  it('round-trips a passage with four decimals', () => {
    const mark = encodeMark([[0.123456, 0.2, 0.5, 0.22], [0.1, 0.23, 0.4, 0.25]])
    expect(mark).toBe('0.1235,0.2,0.5,0.22;0.1,0.23,0.4,0.25')
    expect(parseMark(mark)).toEqual([[0.1235, 0.2, 0.5, 0.22], [0.1, 0.23, 0.4, 0.25]])
  })
  it('refuses anything that is not a passage on the page', () => {
    for (const value of [null, '', 'a,b,c,d', '0.1,0.2,0.3', '0.5,0.2,0.4,0.3', '0,0,2,1', '0.1,0.1,0.2,0.2;'])
      expect(parseMark(value)).toBeNull()
    expect(encodeMark([[0.5, 0.5, 0.4, 0.6]])).toBeNull()
  })
})

it('turns client rectangles into page fractions and drops slivers', () => {
  const page = new DOMRect(100, 200, 400, 800)
  expect(pageRects([new DOMRect(200, 400, 100, 20), new DOMRect(0, 0, 0.5, 20)], page)).toEqual([[0.25, 0.25, 0.5, 0.275]])
})

describe('findPassage', () => {
  function layer(...lines: string[]) {
    const root = document.createElement('div')
    for (const line of lines) {
      const span = document.createElement('span')
      span.textContent = line
      root.append(span)
    }
    return root
  }
  it('finds a quote across line breaks, ignoring spacing and case', () => {
    const root = layer('Students who register late ', 'will be assigned', 'to a group. Then more.')
    expect(findPassage(root, 'Will be assigned to a group.')?.toString()).toBe('will be assignedto a group.')
  })
  it('falls back to the start of the quote when the end differs', () => {
    const root = layer('The scheduling algorithm assigns every stu-', 'dent a slot.')
    const range = findPassage(root, 'The scheduling algorithm assigns every student a slot fairly.')
    expect(range?.toString().startsWith('The scheduling algorithm')).toBe(true)
  })
  it('gives up when the quote is not on the page', () => {
    expect(findPassage(layer('Something else entirely.'), 'will be assigned to a group.')).toBeNull()
  })
})
