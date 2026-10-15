// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import { buildTruthTable, logicExpressionLatex } from './truthTable'
import { logicVariableLatex } from './logicNotation'
import { truthBoardRows, truthBoardMarkdown } from './truthBoardModel'
import { renderFormula } from './math'
const expression = '!x1*!x2*!x3 + !x1*x2*!x3 + x1*!x2*!x3'
const labels = { term: 'UND-Term', sum: 'DNF' }

describe('blackboard truth-table notation', () => {
  it('preserves every assignment and highlights exactly the three board minterms', () => {
    const table = buildTruthTable(expression, true)
    const rows = truthBoardRows(table)
    expect(rows.map((row) => row.output)).toEqual([1, 0, 1, 0, 1, 0, 0, 0])
    expect(rows.filter((row) => row.output === 1).map((row) => row.inputs.join(''))).toEqual(['000', '010', '100'])
    expect(rows[0].term).toBe('\\overline{x_{1}}\\,\\overline{x_{2}}\\,\\overline{x_{3}}')
    expect(rows[2].term).toBe('\\overline{x_{1}}\\,x_{2}\\,\\overline{x_{3}}')
    for (const row of rows) expect(renderFormula(row.term, false)).toContain('<math')
    expect(buildTruthTable(expression).rows).toEqual(buildTruthTable('!(x1*x2)*!x3').rows)
  })
  it('retains a single entered minterm instead of changing it to the example', () => {
    expect(truthBoardRows(buildTruthTable('!x1*!x2*!x3')).map((row) => row.output)).toEqual([1, 0, 0, 0, 0, 0, 0, 0])
  })
  it('formats negation of complete groups and indexed or named variables safely', () => {
    expect(logicExpressionLatex('(A+B)*C')).toBe('\\left(A + B\\right) \\, C')
    expect(logicExpressionLatex('(A -> B) -> C')).toBe('\\left(A \\to B\\right) \\to C')
    expect(logicExpressionLatex('A NAND (B NAND C)')).toBe(
      'A \\operatorname{NAND} \\left(B \\operatorname{NAND} C\\right)',
    )
    expect(logicVariableLatex('x12')).toBe('x_{12}')
    expect(logicVariableLatex('Input_1')).toBe('\\mathrm{Input\\_1}')
    expect(logicExpressionLatex('!(A+B)')).toBe('\\overline{A + B}')
    for (const source of ['A NAND B', 'A NOR B', 'A XOR B', 'A XNOR B', 'A -> B', 'A <-> B', '!A', '0']) {
      expect(renderFormula(logicExpressionLatex(source), false)).toContain('<math')
    }
  })
  it('exports mathematical terms and the exact selected sum, but no answers when hidden', () => {
    const table = buildTruthTable(expression)
    const visible = truthBoardMarkdown(table, true, labels)
    expect(visible).toContain('| $x_{1}$ | $x_{2}$ | $x_{3}$ | UND-Term | $Y$ |')
    expect(visible.match(/\*\*1\*\*/g)).toHaveLength(3)
    expect(visible.split('**DNF**')[1].match(/\+ /g)).toHaveLength(2)
    const hidden = truthBoardMarkdown(table, false, labels)
    expect(hidden).not.toContain('**DNF**')
    expect(hidden).not.toContain('**1**')
    expect(
      hidden
        .split('\n')
        .filter((line) => /^\| [01] /.test(line))
        .every((line) => line.endsWith('|  |')),
    ).toBe(true)
  })
  it('handles constants and the maximum 64 assignments without losing rows', () => {
    expect(truthBoardMarkdown(buildTruthTable('0'), true, labels)).toContain('$Y =$ $0$')
    expect(truthBoardMarkdown(buildTruthTable('1'), true, labels)).toContain('$Y =$ $1$')
    expect(truthBoardRows(buildTruthTable('A+B+C+D+E+F'))).toHaveLength(64)
  })
})
