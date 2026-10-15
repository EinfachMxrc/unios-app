// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import { blockMathSource, inlineMathInput, inlineMathSource } from './mathSyntax'

describe('complete and literal math syntax', () => {
  it.each(['$x^2$', '\\(x^2\\)', '\\( \\frac{x+1}{2} \\)'])('preserves original inline LaTeX in %s', source => {
    expect(inlineMathSource(source)?.raw).toBe(source)
    expect(inlineMathSource(source)?.latex).toBe(source.startsWith('$') ? source.slice(1, -1) : source.slice(2, -2))
  })
  it.each(['$$x^2$$', '$$\nx^2\n$$', '\\[x^2\\]', '\\[\nx^2\n\\]', '  $$\nx^2\n  $$'])('preserves original block LaTeX in %s', source => {
    expect(blockMathSource(source)).toEqual({ raw: source, latex: 'x^2' })
  })
  it.each(['Text $$x$$', '$$x$$ Text', '$$\nkein Ende', '\\[x\\] Text', '\\[\nkein Ende', '$$$$', '\\[\\]'])('keeps unfinished or non-isolated blocks literal: %s', source => {
    expect(blockMathSource(source)).toBeNull()
  })
  it.each(['$5 und $10', '$ 1 $', '$x', '\\$x\\$', '\\(x', '$$x^2$$', 'Kosten: $5 und $'])('does not convert literal input %s', source => {
    expect(inlineMathInput(source)).toBeNull()
  })
  it('converts only the closing formula and retains surrounding text positions', () => {
    expect(inlineMathInput('Sei \\(x+1\\)')).toEqual({ index: 4, text: '\\(x+1\\)', data: { latex: 'x+1' } })
    expect(inlineMathInput('Sei $x$')).toEqual({ index: 4, text: '$x$', data: { latex: 'x' } })
    expect(inlineMathInput('Sei \\\\(x+1\\)')).toBeNull()
  })
  it('visits malformed large imports without recursive regular-expression backtracking', () => {
    expect(inlineMathSource(`$${'\\'.repeat(100_000)}x`)).toBeNull()
    expect(blockMathSource('$$'.repeat(50_000))?.latex.length).toBe(99_996)
    expect(blockMathSource(`$$\n${'x\n'.repeat(50_000)}`)).toBeNull()
  })
})
