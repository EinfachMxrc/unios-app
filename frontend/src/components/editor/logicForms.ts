// SPDX-License-Identifier: AGPL-3.0-or-later

import type { TruthTable } from './truthTable'
export function normalForms(table: TruthTable): { dnf: string; cnf: string } {
  const variables = table.columns.slice(0, table.variableCount)
  const terms = (result: number, conjunction: boolean) => table.rows.filter(row => row.at(-1) === result).map(row =>
    '(' + variables.map((name, i) => `${row[i] === (conjunction ? 1 : 0) ? '' : '¬'}${name}`)
      .join(conjunction ? ' ∧ ' : ' ∨ ') + ')')
  const ones = terms(1, true), zeros = terms(0, false)
  return { dnf: !ones.length ? '0' : ones.length === table.rows.length ? '1' : ones.join(' ∨ '),
    cnf: !zeros.length ? '1' : zeros.length === table.rows.length ? '0' : zeros.join(' ∧ ') }
}
export function karnaugh(table: TruthTable) {
  if (table.variableCount < 2 || table.variableCount > 4) return null
  const rowBits = Math.floor(table.variableCount / 2), columnBits = table.variableCount - rowBits
  const gray = (bits: number) => Array.from({ length: 1 << bits }, (_, i) => (i ^ (i >> 1)).toString(2).padStart(bits, '0'))
  const rowLabels = gray(rowBits), columnLabels = gray(columnBits)
  return { rowVariables: table.columns.slice(0, rowBits).join(''), columnVariables: table.columns.slice(rowBits, table.variableCount).join(''),
    rowLabels, columnLabels, cells: rowLabels.map(a => columnLabels.map(b => ({ index: parseInt(a + b, 2), value: table.rows[parseInt(a + b, 2)].at(-1)! }))) }
}
export function validKarnaughGroup(table: TruthTable, indices: number[]): boolean {
  const n = table.variableCount, unique = [...new Set(indices)]
  if (n < 2 || n > 4 || !unique.length || unique.length !== indices.length || (unique.length & (unique.length - 1))) return false
  if (unique.some(i => !Number.isInteger(i) || i < 0 || i >= table.rows.length || table.rows[i].at(-1) !== 1)) return false
  // A valid group is exactly a Boolean subcube; this includes wraparound groups.
  const varying = Array.from({ length: n }, (_, bit) => new Set(unique.map(i => (i >> bit) & 1)).size === 2)
  return 2 ** varying.filter(Boolean).length === unique.length
}
export function groupTerm(table: TruthTable, indices: number[]): string | null {
  if (!validKarnaughGroup(table, indices)) return null
  return table.columns.slice(0, table.variableCount).flatMap((name, i) => {
    const values = new Set(indices.map(index => table.rows[index][i]))
    return values.size === 1 ? [values.has(1) ? name : `¬${name}`] : []
  }).join(' ∧ ') || '1'
}
