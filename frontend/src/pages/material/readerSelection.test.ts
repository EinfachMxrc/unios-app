// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { afterEach, expect, it } from 'vitest'
import { readReaderSelection } from './readerSelection'

afterEach(() => document.body.replaceChildren())

function page(number: number, rect = { left: 100, top: 200, width: 400, height: 600 }) {
  const element = document.createElement('div')
  element.dataset.materialPage = String(number)
  element.getBoundingClientRect = () => ({
    ...rect,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  })
  const text = document.createTextNode('Die Rekursion endet im Basisfall.')
  const span = document.createElement('span')
  span.append(text)
  element.append(span)
  document.body.append(element)
  return text
}

function selection(
  text: string,
  anchor: Node | null,
  focus: Node | null,
  rects: Array<{ left: number; top: number; width: number; height: number }>,
) {
  return {
    toString: () => text,
    anchorNode: anchor,
    focusNode: focus,
    getRangeAt: () => ({
      getClientRects: () => rects.map((r) => ({ ...r, right: r.left + r.width, bottom: r.top + r.height })),
    }),
  } as unknown as globalThis.Selection
}

it('stores the quote with rects as fractions of its page', () => {
  const node = page(4)
  const result = readReaderSelection(
    selection('  Die   Rekursion ', node, node, [{ left: 140, top: 260, width: 200, height: 30 }]),
  )
  expect(result).toEqual({
    kind: 'selection',
    selection: { quote: 'Die Rekursion', page: 4, rects: [[0.1, 0.1, 0.6, 0.15]] },
  })
})

it('asks for a shorter passage or one page, but clears an empty selection quietly', () => {
  const first = page(1)
  const second = page(2)
  expect(readReaderSelection(selection('x', first, first, []))).toEqual({ kind: 'constraint' })
  expect(readReaderSelection(selection('x'.repeat(1001), first, first, []))).toEqual({ kind: 'constraint' })
  expect(readReaderSelection(selection('Rekursion', first, second, []))).toEqual({ kind: 'constraint' })
  expect(readReaderSelection(selection('', null, null, []))).toEqual({ kind: 'empty' })
  expect(readReaderSelection(null)).toEqual({ kind: 'empty' })
})

it('ignores hairline rects and treats a selection without visible boxes as empty', () => {
  const node = page(1)
  expect(
    readReaderSelection(selection('Rekursion', node, node, [{ left: 120, top: 220, width: 1, height: 20 }])),
  ).toEqual({ kind: 'empty' })
})
