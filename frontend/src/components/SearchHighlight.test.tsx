// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { SearchHighlight, stripSnippetMarks } from './SearchHighlight'

afterEach(cleanup)

function marks(text: string, query: string) {
  const { container } = render(<SearchHighlight text={text} query={query} />)
  return { container, marked: Array.from(container.querySelectorAll('mark')).map((node) => node.textContent) }
}

it('removes the index brackets so they never show', () => {
  expect(stripSnippetMarks('Ein 【Treffer】 im Text')).toBe('Ein Treffer im Text')
})

it('highlights every term case-insensitively and keeps the surrounding text', () => {
  const { container, marked } = marks('Rekursion und Induktion, rekursiv gedacht', 'rekursion INDUKTION')
  expect(marked).toEqual(['Rekursion', 'Induktion'])
  expect(container.textContent).toBe('Rekursion und Induktion, rekursiv gedacht')
})

it('renders the text unchanged for an empty query, one-letter terms or field filters', () => {
  for (const query of ['', '   ', 'a', 'kurs:12']) {
    const { container, marked } = marks('Ein a im Text', query)
    expect(marked).toEqual([])
    expect(container.textContent).toBe('Ein a im Text')
    cleanup()
  }
})

it('treats regular-expression characters as plain text and never as HTML', () => {
  const { container, marked } = marks('Formel (a+b)* und <b>fett</b>', '(a+b)* <b>')
  expect(marked).toEqual(['(a+b)*', '<b>'])
  expect(container.querySelector('b')).toBeNull()
})
