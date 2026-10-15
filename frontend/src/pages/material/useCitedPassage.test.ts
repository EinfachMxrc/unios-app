// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect, it } from 'vitest'
import { readCitation } from './useCitedPassage'

it('reads the exact spot first, then a clip, then a quote to look for', () => {
  expect(readCitation('?page=3&mark=0.1,0.4,0.6,0.42&quote=x')).toEqual({
    page: 3,
    rects: [[0.1, 0.4, 0.6, 0.42]],
    quote: null,
  })
  expect(readCitation('?page=2&clip=0.1,0.2,0.3,0.4')).toEqual({
    page: 2,
    rects: [[0.1, 0.2, 0.4, 0.6000000000000001]],
    quote: null,
  })
  expect(readCitation('?page=5&quote=will%20be%20%20assigned')).toEqual({
    page: 5,
    rects: null,
    quote: 'will be assigned',
  })
})

it('is nothing for a plain page link or a broken one', () => {
  expect(readCitation('?page=5')).toBeNull()
  expect(readCitation('?mark=0.1,0.4,0.6,0.42')).toBeNull()
  expect(readCitation('?page=0&quote=x')).toBeNull()
  expect(readCitation('?page=2&mark=nonsense')).toBeNull()
})
