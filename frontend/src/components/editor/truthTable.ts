// SPDX-License-Identifier: AGPL-3.0-or-later

import { logicVariableLatex } from './logicNotation'

type Operator = 'and' | 'or' | 'xor' | 'nand' | 'nor' | 'xnor' | 'implies' | 'iff'
type Expression =
  | { kind: 'variable'; name: string }
  | { kind: 'constant'; value: boolean }
  | { kind: 'not'; child: Expression }
  | { kind: 'binary'; op: Operator; left: Expression; right: Expression }
type Token = { kind: 'variable' | 'constant' | Operator | 'not' | '(' | ')'; text: string }
export type TruthTableErrorCode = 'empty' | 'syntax' | 'tooLong' | 'tooManyVariables'
export class TruthTableError extends Error {
  readonly code: TruthTableErrorCode
  constructor(code: TruthTableErrorCode) {
    super(code)
    this.code = code
  }
}
export const MAX_LOGIC_LENGTH = 256
export const MAX_LOGIC_VARIABLES = 6
const aliases: Record<string, Token['kind']> = {
  '!': 'not',
  '~': 'not',
  '¬': 'not',
  not: 'not',
  '&': 'and',
  '&&': 'and',
  '∧': 'and',
  '*': 'and',
  '·': 'and',
  '⋅': 'and',
  and: 'and',
  nand: 'nand',
  '|': 'or',
  '||': 'or',
  '∨': 'or',
  '+': 'or',
  or: 'or',
  nor: 'nor',
  '^': 'xor',
  '⊕': 'xor',
  xor: 'xor',
  xnor: 'xnor',
  '->': 'implies',
  '=>': 'implies',
  '→': 'implies',
  '⇒': 'implies',
  '=': 'iff',
  '<->': 'iff',
  '<=>': 'iff',
  '↔': 'iff',
  '⇔': 'iff',
  '(': '(',
  ')': ')',
  '0': 'constant',
  '1': 'constant',
  true: 'constant',
  false: 'constant',
}
const symbols: Record<Operator, string> = {
  and: '∧',
  or: '∨',
  xor: '⊕',
  nand: 'NAND',
  nor: 'NOR',
  xnor: 'XNOR',
  implies: '→',
  iff: '↔',
}

function tokensFor(source: string): Token[] {
  if (!source.trim()) throw new TruthTableError('empty')
  if (source.length > MAX_LOGIC_LENGTH) throw new TruthTableError('tooLong')
  const tokens: Token[] = []
  const pattern = /\s*(<->|<=>|->|=>|&&|\|\||[!~¬&∧*·⋅|∨+^⊕→⇒↔⇔=()]|[A-Za-z][A-Za-z0-9_]*|[01])/y
  let offset = 0
  while (offset < source.trimEnd().length) {
    pattern.lastIndex = offset
    const match = pattern.exec(source)
    if (!match) throw new TruthTableError('syntax')
    offset = pattern.lastIndex
    const text = match[1]
    const name = text.toLowerCase()
    tokens.push({ kind: Object.hasOwn(aliases, name) ? aliases[name] : 'variable', text })
  }
  return tokens
}

function parse(source: string): { root: Expression; variables: string[] } {
  const tokens = tokensFor(source)
  let at = 0
  const variables: string[] = []
  function unary(): Expression {
    const token = tokens[at++]
    if (!token) throw new TruthTableError('syntax')
    if (token.kind === 'not') return { kind: 'not', child: unary() }
    if (token.kind === '(') {
      const node = binary(0)
      if (tokens[at++]?.kind !== ')') throw new TruthTableError('syntax')
      return node
    }
    if (token.kind === 'constant') return { kind: 'constant', value: /^(1|true)$/i.test(token.text) }
    if (token.kind !== 'variable') throw new TruthTableError('syntax')
    if (!variables.includes(token.text)) variables.push(token.text)
    if (variables.length > MAX_LOGIC_VARIABLES) throw new TruthTableError('tooManyVariables')
    return { kind: 'variable', name: token.text }
  }
  const levels: Operator[][] = [['iff'], ['implies'], ['or', 'nor'], ['xor', 'xnor'], ['and', 'nand']]
  function binary(level: number): Expression {
    if (level === levels.length) return unary()
    let left = binary(level + 1)
    while (levels[level].includes(tokens[at]?.kind as Operator)) {
      const op = tokens[at++].kind as Operator
      // Implication associates to the right: A → B → C means A → (B → C).
      const right = binary(op === 'implies' ? level : level + 1)
      left = { kind: 'binary', op, left, right }
    }
    return left
  }
  const root = binary(0)
  if (at !== tokens.length) throw new TruthTableError('syntax')
  return { root, variables }
}

function evaluate(node: Expression, values: Record<string, boolean>): boolean {
  if (node.kind === 'variable') return values[node.name]
  if (node.kind === 'constant') return node.value
  if (node.kind === 'not') return !evaluate(node.child, values)
  const a = evaluate(node.left, values),
    b = evaluate(node.right, values)
  switch (node.op) {
    case 'and':
      return a && b
    case 'or':
      return a || b
    case 'xor':
      return a !== b
    case 'nand':
      return !(a && b)
    case 'nor':
      return !(a || b)
    case 'xnor':
    case 'iff':
      return a === b
    case 'implies':
      return !a || b
  }
}

function label(node: Expression): string {
  if (node.kind === 'variable') return node.name
  if (node.kind === 'constant') return node.value ? '1' : '0'
  if (node.kind === 'not') return `¬${label(node.child)}`
  return `(${label(node.left)} ${symbols[node.op]} ${label(node.right)})`
}

export type TruthTable = { columns: string[]; rows: number[][]; variableCount: number }
export function buildTruthTable(source: string, intermediate = false): TruthTable {
  const { root, variables } = parse(source)
  const expressions: Expression[] = []
  const seen = new Set<string>()
  function visit(node: Expression) {
    if (node.kind === 'binary') {
      visit(node.left)
      visit(node.right)
    }
    if (node.kind === 'not') visit(node.child)
    if ((node.kind === 'binary' || node.kind === 'not') && !seen.has(label(node))) {
      seen.add(label(node))
      expressions.push(node)
    }
  }
  if (intermediate) visit(root)
  if (!expressions.includes(root)) expressions.push(root)
  const rows = Array.from({ length: 2 ** variables.length }, (_, row) => {
    const values: Record<string, boolean> = Object.create(null)
    variables.forEach((name, index) => {
      values[name] = !!(row & (1 << (variables.length - index - 1)))
    })
    return [
      ...variables.map((name) => Number(values[name])),
      ...expressions.map((node) => Number(evaluate(node, values))),
    ]
  })
  return { columns: [...variables, ...expressions.map(label)], rows, variableCount: variables.length }
}

// Every label is produced by the parser, never from arbitrary user HTML.
export function truthTableMarkdown(table: TruthTable, results = true): string {
  const row = (cells: (string | number)[]) => `| ${cells.join(' | ')} |`
  return (
    '\n\n' +
    [
      row(table.columns),
      row(table.columns.map(() => '---')),
      ...table.rows.map((cells) =>
        row(cells.map((cell, index) => (results || index < table.variableCount ? cell : ''))),
      ),
    ].join('\n') +
    '\n\n'
  )
}

export type LogicComparison = {
  equivalent: boolean
  combinations: number
  counterexample: { values: Record<string, number>; left: number; right: number } | null
}

// A plain equals sign compares two complete expressions. Arrow aliases retain
// their meaning; '=' in '=>' or '<=>' does not start an equation.
export function compareLogicEquation(source: string): LogicComparison | null {
  const sides = source.split(/(?<![<>])=(?!>)/)
  if (sides.length === 1) return null
  if (source.length > MAX_LOGIC_LENGTH) throw new TruthTableError('tooLong')
  if (sides.length !== 2 || sides.some((side) => !side.trim())) throw new TruthTableError('syntax')
  const left = parse(sides[0]),
    right = parse(sides[1])
  const variables = [...new Set([...left.variables, ...right.variables])]
  if (variables.length > MAX_LOGIC_VARIABLES) throw new TruthTableError('tooManyVariables')
  const combinations = 2 ** variables.length
  let counterexample: LogicComparison['counterexample'] = null
  for (let row = 0; row < combinations; row++) {
    const values: Record<string, boolean> = Object.create(null)
    variables.forEach((name, index) => {
      values[name] = !!(row & (1 << (variables.length - index - 1)))
    })
    const a = Number(evaluate(left.root, values)),
      b = Number(evaluate(right.root, values))
    if (a !== b && !counterexample)
      counterexample = {
        values: Object.fromEntries(variables.map((name) => [name, Number(values[name])])),
        left: a,
        right: b,
      }
  }
  return { equivalent: counterexample === null, combinations, counterexample }
}

/** Blackboard notation for the already validated expression, never raw LaTeX. */
export function logicExpressionLatex(source: string): string {
  const operators: Record<Operator, string> = {
    and: '\\,',
    or: '+',
    xor: '\\oplus',
    nand: '\\operatorname{NAND}',
    nor: '\\operatorname{NOR}',
    xnor: '\\operatorname{XNOR}',
    implies: '\\to',
    iff: '\\leftrightarrow',
  }
  const precedence: Record<Operator, number> = { and: 4, nand: 4, xor: 3, xnor: 3, or: 2, nor: 2, implies: 1, iff: 0 }
  function display(node: Expression, parent?: Operator, right = false): string {
    if (node.kind === 'variable') return logicVariableLatex(node.name)
    if (node.kind === 'constant') return node.value ? '1' : '0'
    if (node.kind === 'not') return `\\overline{${display(node.child)}}`
    const value = `${display(node.left, node.op)} ${operators[node.op]} ${display(node.right, node.op, true)}`
    const associative = node.op === parent && ['and', 'or', 'xor', 'iff'].includes(node.op)
    const rightImplication = node.op === 'implies' && parent === 'implies' && right
    const grouped =
      parent !== undefined &&
      (precedence[node.op] < precedence[parent] ||
        (precedence[node.op] === precedence[parent] && !associative && !rightImplication))
    return grouped ? `\\left(${value}\\right)` : value
  }
  return display(parse(source).root)
}
