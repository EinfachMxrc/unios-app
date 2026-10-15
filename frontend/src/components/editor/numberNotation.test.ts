// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import { binaryColumnSource, numberMathSource, numberMathInput } from './numberNotation'
import { inlineMathStart, blockMathStart } from './mathSyntax'
import { renderFormula } from './math'

describe('plain number writing', () => {
  it('keeps numbers inside explicit block and escaped-dollar writing literal', () => {
    expect(numberMathInput(String.raw`\[x^2+`)).toBeNull()
    expect(numberMathInput(String.raw`\[x^2 + y^2 `)).toBeNull()
    expect(numberMathSource(String.raw`x^2\$`)).toBeNull()
    expect(numberMathInput(String.raw`\$x^2 `)).toBeNull()
  })
  it.each([
    ['2^5', '2^{5}'],
    ['2^15', '2^{15}'],
    ['n^-2', 'n^{-2}'],
    ['^5', '{}^{5}'],
    ['(-9)10', '\\left(-9\\right)_{10}'],
    ['(10111)2', '\\left(10111\\right)_{2}'],
    ['(2^5-1)10', '\\left(2^{5}-1\\right)_{10}'],
    ['(777)_8', '\\left(777\\right)_{8}'],
  ])('renders %s without requiring LaTeX', (source, latex) => {
    expect(numberMathSource(source)).toEqual({ raw: source, latex })
    expect(renderFormula(latex, false)).toContain('<math')
  })
  it('waits for a separator and preserves its position and all exponent/base digits', () => {
    expect(numberMathInput('Notiz 2^15 ')).toEqual({ index: 6, text: '2^15 ', data: { latex: '2^{15}', suffix: ' ' } })
    expect(numberMathInput('Notiz 2^15')).toBeNull()
    expect(numberMathInput('(9)10-')?.data).toEqual({ latex: '\\left(9\\right)_{10}', suffix: '-' })
    expect(numberMathInput('$2^5 + ')).toBeNull()
    expect(numberMathInput('\\(2^5 + ')).toBeNull()
  })
  it.each(['(Kapitel)10', '(9)100', '(9)12', '2^5^6', '2^', '(2^^5)10', '\\href{x}{y}', '2^' + '1'.repeat(500)])(
    'leaves unsupported input literal: %s',
    (source) => {
      expect(numberMathSource(source)).toBeNull()
    },
  )
  it('avoids words, paths and escaped writing', () => {
    expect(inlineMathStart('siehe file^5 und /file/2^5')).toBe(-1)
    expect(inlineMathStart('wörtlich \\(9)10')).toBe(9) // Existing explicit opener remains eligible.
    expect(numberMathInput('file^5 ')).toBeNull()
    expect(numberMathInput('2\\^5 ')).toBeNull()
  })
  it('recognizes explicit binary column lines, with original bits and no computed result', () => {
    const source = '(01110)2\n+(10111)2\n=(00101)2'
    const formula = binaryColumnSource(source)!
    expect(formula.raw).toBe(source)
    expect(formula.latex).toContain('\\hline \\left(00101\\right)_{2}')
    expect(renderFormula(formula.latex, true)).toContain('<mtable')
    expect(blockMathStart(source)).toBe(0)
    expect(binaryColumnSource('14\n+23\n=5')).toBeNull()
    expect(binaryColumnSource('(01110)2\n+(10111)2\n=(11111)2')?.latex).toContain('11111')
  })
})
