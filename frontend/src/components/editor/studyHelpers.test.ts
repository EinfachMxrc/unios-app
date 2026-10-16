// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { binaryWord, formatNumber, parseNumber, placeValues } from './numberSystems'
import { buildTruthTable } from './truthTable'
import { groupTerm, karnaugh, normalForms, validKarnaughGroup } from './logicForms'
import {
  binomialProbability,
  describeNumbers,
  diagramPositions,
  markdownTable,
  parseDiagram,
  readStudyFence,
  studyFence,
} from './studyModels'
import { mathTemplates, matrixTemplate } from './mathTemplates'
import { quickStudyCommand } from './studyCommands'
import { renderFormula } from './math'
import { editorExtensions } from '@/editor/extensions'
import { insertStudyMarkdown } from './studyInsert'
import { parseClip, validClip } from '@/pages/material/PdfClipTool'

const editors: Editor[] = []
afterEach(() => editors.splice(0).forEach((e) => e.destroy()))
function editor(body: string) {
  const e = new Editor({ extensions: editorExtensions(), content: body, contentType: 'markdown' })
  editors.push(e)
  return e
}
describe('exact number systems', () => {
  it('roundtrips wide integers in every supported base without floating point', () => {
    for (const n of [0n, 1n, -31n, 9007199254740993n, (1n << 127n) - 1n]) {
      for (const base of [2, 8, 10, 16, 36]) {
        const source = n.toString(base),
          value = parseNumber(source, base)
        expect(value).toEqual({ numerator: n, denominator: 1n })
        expect(formatNumber(value, base).text).toBe(source.toUpperCase())
      }
    }
  })
  it('handles fractional places, prefixes, decimal commas and truncation explicitly', () => {
    expect(formatNumber(parseNumber('10.101', 2), 10)).toEqual({ text: '2.625', exact: true })
    expect(formatNumber(parseNumber('0,1', 10), 2).exact).toBe(false)
    expect(formatNumber(parseNumber('0,1', 10), 2).text).toMatch(/…$/)
    expect(parseNumber('0xAB', 16).numerator).toBe(171n)
    expect(parseNumber('0BEEF', 16).numerator).toBe(48879n)
    expect(parseNumber('010', 10).numerator).toBe(10n)
    expect(placeValues('10.1', 2)).toEqual([
      { digit: '1', exponent: 1, value: '2' },
      { digit: '0', exponent: 0, value: '0' },
      { digit: '1', exponent: -1, value: '1/2' },
    ])
  })
  it('checks fixed-width signed and unsigned ranges instead of silently wrapping', () => {
    expect(binaryWord(parseNumber('-1', 10), 8)).toEqual({ bits: '11111111', unsigned: '255', signed: '-1' })
    expect(binaryWord(parseNumber('128', 10), 8).signed).toBe('-128')
    for (const n of ['256', '-129', '0.5']) expect(() => binaryWord(parseNumber(n, 10), 8)).toThrow()
    for (const s of ['', '12', '<script>', '1e3', '0xF']) expect(() => parseNumber(s, 2)).toThrow()
  })
})
describe('logic forms and Karnaugh geometry', () => {
  it('produces equivalent normal forms for every two-variable Boolean function', () => {
    for (let mask = 0; mask < 16; mask++) {
      const table = {
        columns: ['A', 'B', 'f'],
        variableCount: 2,
        rows: Array.from({ length: 4 }, (_, i) => [i >> 1, i & 1, (mask >> i) & 1]),
      }
      const forms = normalForms(table)
      for (const expression of [forms.dnf, forms.cnf]) {
        const actual = buildTruthTable(expression)
        // Constants omit variables but apply to every assignment.
        expect(
          actual.variableCount === 0 ? Array(4).fill(actual.rows[0].at(-1)) : actual.rows.map((r) => r.at(-1)),
        ).toEqual(table.rows.map((r) => r.at(-1)))
      }
    }
  })
  it('uses Gray order and validates wraparound subcubes, zero cells and incomplete groups', () => {
    const table = buildTruthTable('!A | !B | !C | !D'),
      map = karnaugh(table)!
    expect(map.rowLabels).toEqual(['00', '01', '11', '10'])
    expect(map.cells[2][2].index).toBe(15)
    expect(validKarnaughGroup(table, [0, 2, 8, 10])).toBe(true)
    expect(groupTerm(table, [0, 2, 8, 10])).toBe('¬B ∧ ¬D')
    for (const group of [[0, 1, 2], [0, 0], [0, 3], [15], [99]]) expect(validKarnaughGroup(table, group)).toBe(false)
    expect(karnaugh(buildTruthTable('A'))).toBeNull()
  })
})
describe('study models and portable notes', () => {
  it('restores typing after tables and widgets instead of inside their content', () => {
    for (const markdown of [markdownTable(['Base', 'Value'], [['2', '01011']]), studyFence('diagram', 'A -> B')]) {
      const e = editor('Vorher /bin')
      expect(insertStudyMarkdown(e, markdown, { from: 8, to: 12 })).toBe(true)
      expect(e.state.selection.$from.parent.type.name).toBe('paragraph')
      e.commands.insertContent('Weiter')
      expect(e.getMarkdown()).not.toContain('/bin')
      expect(e.getMarkdown()).toContain('Vorher')
      expect(e.state.doc.lastChild?.textContent).toBe('Weiter')
    }
  })
  it('preserves diagrams, recall and advanced math through repeated Markdown roundtrips', () => {
    const body =
      studyFence('diagram', 'Start -> Ende : fertig') +
      studyFence('recall', JSON.stringify({ question: 'Was ist $x^2$?', answer: '$2x$', hint: 'Ableiten' })) +
      '\n\n$$\n\\begin{aligned}a &= b \\\\ c &= d\\end{aligned}\n$$\n\n$$\n\\begin{cases}x & x>0 \\\\ 0 & x=0\\end{cases}\n$$'
    const first = editor(body)
    expect(first.getJSON().content?.filter((n) => n.type === 'studyBlock')).toHaveLength(2)
    expect(editor(first.getMarkdown()).getJSON()).toEqual(first.getJSON())
    expect(editor(editor(first.getMarkdown()).getMarkdown()).getJSON()).toEqual(first.getJSON())
  })
  it('bounds diagrams, handles cycles and rejects malformed widgets without eating their source', () => {
    const graph = parseDiagram('A -> B\nB -> A')
    expect(diagramPositions(graph)).toHaveLength(2)
    expect(readStudyFence('```unios-diagram\n{"source":"<script>"}\n```')).toBeNull()
    const bad = '```unios-recall\n{"source":"invalid"}\n```'
    expect(editor(bad).getMarkdown()).toContain('invalid')
    expect(() => parseDiagram('A -> B -> C')).toThrow()
    expect(() => parseDiagram(Array.from({ length: 21 }, (_, i) => `N${i}`).join('\n'))).toThrow()
    expect(markdownTable(['Name'], [['<script>|[x]']])).not.toContain('<script>')
  })
  it('computes descriptive statistics and binomial probabilities with clear boundary behavior', () => {
    const result = describeNumbers('1,5; 2.5\n3.5')
    expect(result.mean).toBeCloseTo(2.5)
    expect(result.median).toBe(2.5)
    expect(result.sample).toBeCloseTo(1)
    expect(describeNumbers('4').sample).toBeNull()
    expect(binomialProbability(3, 1, 0.5)).toBeCloseTo(0.375)
    expect(binomialProbability(0, 0, 0.5)).toBe(1)
    expect(binomialProbability(5, 5, 1)).toBe(1)
    expect(Array.from({ length: 101 }, (_, k) => binomialProbability(100, k, 0.3)).reduce((a, b) => a + b)).toBeCloseTo(
      1,
    )
    for (const text of ['', 'NaN', '1e999', '1,2,3', '<img>']) expect(() => describeNumbers(text)).toThrow()
    expect(() => binomialProbability(5, 6, 0.5)).toThrow()
  })
  it('renders MathLive keyboard aliases and advanced expressions while retaining security bounds', () => {
    for (const template of Object.values(mathTemplates))
      expect(renderFormula(template.replace(/#[@?]/g, '1'), true), template).not.toBeNull()
    for (const latex of [
      '\\int x\\differentialD x',
      '\\imaginaryI+\\imaginaryJ+\\exponentialE',
      '\\lim_{x\\to0}x',
      '\\frac{\\partial f}{\\partial x}',
      '\\begin{pmatrix}1&2&3\\\\4&5&6\\end{pmatrix}',
    ])
      expect(renderFormula(latex, true)).not.toBeNull()
    expect(matrixTemplate(3, 4).match(/#\?/g)).toHaveLength(12)
    expect(() => matrixTemplate(0, 10000)).toThrow()
    expect(renderFormula('\\placeholder{}', false)).toBeNull()
    expect(renderFormula('x'.repeat(4001), false)).toBeNull()
    expect(renderFormula('\\href{javascript:alert(1)}{x}', false)).not.toContain('href="javascript:')
  })
  it('opens exact keyboard aliases in the intended view', () => {
    expect(quickStudyCommand(' HEX ')).toEqual({ kind: 'tool', tool: 'number', base: 16 })
    expect(quickStudyCommand('kv')).toEqual({ kind: 'truth', view: 'kv' })
    expect(quickStudyCommand('partial')).toEqual({ kind: 'math', template: 'partial' })
    expect(quickStudyCommand('unknown')).toBeNull()
  })
  it('rejects invalid or off-page clip bounds and preserves normalized coordinates', () => {
    expect(parseClip('0.1,0.2,0.3,0.4')).toEqual({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 })
    for (const value of [null, '', '0,0,0,1', '.1,.2,.3,.4', '1,0,1,1', 'NaN,0,1,1', '0,0,1,1,1'])
      expect(parseClip(value)).toBeNull()
    expect(validClip({ x: 0, y: 0, width: 1, height: 1 })).toBe(true)
  })
})
