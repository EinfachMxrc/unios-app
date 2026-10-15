// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, it } from 'vitest'
import { highlightSegments } from './paletteHighlight'

it('marks every occurrence of each typed word, ignoring case', () => {
  expect(highlightSegments('04_Schleifen.pdf – schleifen', 'Schl')).toEqual([
    { text: '04_', match: false },
    { text: 'Schl', match: true },
    { text: 'eifen.pdf – ', match: false },
    { text: 'schl', match: true },
    { text: 'eifen', match: false },
  ])
})

it('treats each word of the query separately and merges touching matches', () => {
  expect(highlightSegments('Programmieren 1', 'prog ammieren')).toEqual([
    { text: 'Prog', match: true },
    { text: 'r', match: false },
    { text: 'ammieren', match: true },
    { text: ' 1', match: false },
  ])
})

it('returns the plain text when nothing is typed or nothing matches', () => {
  expect(highlightSegments('Termine', '  ')).toEqual([{ text: 'Termine', match: false }])
  expect(highlightSegments('Termine', 'xyz')).toEqual([{ text: 'Termine', match: false }])
})
