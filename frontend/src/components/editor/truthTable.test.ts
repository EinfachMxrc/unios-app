// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import { buildTruthTable, compareLogicEquation, TruthTableError, truthTableMarkdown } from './truthTable'

const output = (source: string) => buildTruthTable(source).rows.map((row) => row.at(-1))
describe('classroom truth tables', () => {
  it.each([
    ['A & B', [0, 0, 0, 1]],
    ['A | B', [0, 1, 1, 1]],
    ['A ^ B', [0, 1, 1, 0]],
    ['A NAND B', [1, 1, 1, 0]],
    ['A NOR B', [1, 0, 0, 0]],
    ['A XNOR B', [1, 0, 0, 1]],
    ['A -> B', [1, 1, 0, 1]],
    ['A <-> B', [1, 0, 0, 1]],
  ])('evaluates %s over all input combinations', (source, values) => expect(output(source)).toEqual(values))
  it('accepts both Boolean algebra and programming notation with the same precedence', () => {
    expect(buildTruthTable('A + B · !C')).toEqual(buildTruthTable('A || B && ¬C'))
    expect(buildTruthTable('A * B')).toEqual(buildTruthTable('A ∧ B'))
    expect(buildTruthTable('A ⋅ B')).toEqual(buildTruthTable('A AND B'))
  })
  it('preserves parentheses and right-associative implication', () => {
    expect(output('A -> B -> C')).toEqual(output('A -> (B -> C)'))
    expect(output('(A -> B) -> C')).not.toEqual(output('A -> B -> C'))
    expect(output('!(A | B)')).toEqual(output('!A & !B'))
  })
  it('shows deduplicated intermediate results and portable, optionally blank Markdown', () => {
    const table = buildTruthTable('(A & B) | !(A & B)', true)
    expect(table.columns).toEqual(['A', 'B', '(A ∧ B)', '¬(A ∧ B)', '((A ∧ B) ∨ ¬(A ∧ B))'])
    expect(table.rows.every((row) => row.at(-1) === 1)).toBe(true)
    expect(truthTableMarkdown(table)).toContain('| 0 | 0 | 0 | 1 | 1 |')
    expect(truthTableMarkdown(table, false)).toContain('| 0 | 0 |  |  |  |')
  })
  it('handles constants, repeated variables and property-like variable names safely', () => {
    expect(output('true & !false')).toEqual([1])
    expect(output('1 XOR 0')).toEqual([1])
    expect(buildTruthTable('A | A').rows).toEqual([
      [0, 0],
      [1, 1],
    ])
    expect(output('constructor & toString')).toEqual([0, 0, 0, 1])
  })
  it('bounds tables to 64 rows and rejects invalid or executable input without partial results', () => {
    expect(buildTruthTable('A|B|C|D|E|F').rows).toHaveLength(64)
    for (const [source, code] of [
      ['', 'empty'],
      ['A &', 'syntax'],
      ['(A | B', 'syntax'],
      ['A B', 'syntax'],
      ['A;alert(1)', 'syntax'],
      ['<script>', 'syntax'],
      ['A|B|C|D|E|F|G', 'tooManyVariables'],
      ['A'.repeat(257), 'tooLong'],
    ]) {
      try {
        buildTruthTable(source)
        throw new Error('expected rejection')
      } catch (error) {
        expect(error).toBeInstanceOf(TruthTableError)
        expect((error as TruthTableError).code).toBe(code)
      }
    }
  })
})

describe('logic equation equivalence', () => {
  it('distinguishes the requested false equation from the correct implication', () => {
    expect(compareLogicEquation('A -> B = !A*B')).toEqual({
      equivalent: false,
      combinations: 4,
      counterexample: { values: { A: 0, B: 0 }, left: 1, right: 0 },
    })
    expect(compareLogicEquation('A -> B = !A+B')).toEqual({ equivalent: true, combinations: 4, counterexample: null })
    expect(buildTruthTable('A -> B = !A+B').rows.every((row) => row.at(-1) === 1)).toBe(true)
  })
  it.each([
    '!(A*B) = !A+!B',
    'A*B = B*A',
    'A+(B*C) = (A+B)*(A+C)',
    'A => B = !A+B',
    'A <=> B = !(A ^ B)',
    'constructor = !!constructor',
    '1 = !0',
  ])('checks every assignment for %s', (source) => {
    expect(compareLogicEquation(source)?.equivalent).toBe(true)
  })
  it('aligns variables by name, including variables only present on one side', () => {
    expect(compareLogicEquation('A = B')?.equivalent).toBe(false)
    expect(compareLogicEquation('A = A+B')?.counterexample).toEqual({ values: { A: 0, B: 1 }, left: 0, right: 1 })
    expect(compareLogicEquation('0 = 1')).toEqual({
      equivalent: false,
      combinations: 1,
      counterexample: { values: {}, left: 0, right: 1 },
    })
  })
  it('ignores arrow equals signs and rejects incomplete or ambiguous equations', () => {
    expect(compareLogicEquation('A => B')).toBeNull()
    expect(compareLogicEquation('A <=> B')).toBeNull()
    for (const source of ['A =', '= B', 'A = B = C', 'A &= B', 'A=B+C+D+E+F+G', 'A'.repeat(257) + '=A']) {
      expect(() => compareLogicEquation(source)).toThrow(TruthTableError)
    }
  })
})
