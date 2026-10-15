// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import { logicFormula } from './logicFormula'
import { renderFormula } from './math'

describe('explicit quick logic entry', () => {
  it('retains a user equation even when the claimed equivalence is false', () => {
    expect(logicFormula('A -> B = !A*B')).toBe('A \\to B = \\lnot A \\land B')
    expect(logicFormula('A -> B = !A+B')).toBe('A \\to B = \\lnot A \\lor B')
  })
  it('renders aliases, parentheses, constants and named variables without requiring LaTeX', () => {
    for (const source of [
      '!(A*B)+C',
      'A <-> B',
      'A <=> B',
      'A => B',
      'A && B || ~C',
      'A ∧ B ∨ ¬C',
      'A ^ B',
      'Eingang_1 -> 0',
      'A→B=¬A∨B',
    ]) {
      expect(renderFormula(logicFormula(source)!, false)).toContain('<math')
    }
    expect(logicFormula('Eingang_1')).toBe('\\mathrm{Eingang\\_1}')
  })
  it('rejects oversized input, unsupported characters and executable or raw LaTeX input', () => {
    for (const source of [
      '',
      '  ',
      'A'.repeat(4001),
      'A'.repeat(3995),
      '<img src=x>',
      '\\href{https://example.invalid}{A}',
      'A $ B',
      'A \\lor B',
      'A -> B;',
    ]) {
      expect(logicFormula(source)).toBeNull()
    }
  })
})
