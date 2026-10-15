// SPDX-License-Identifier: AGPL-3.0-or-later

import type { TruthTable } from './truthTable'
import { assignmentTermLatex, logicVariableLatex } from './logicNotation'

export function truthBoardRows(table: TruthTable) {
  const variables = table.columns.slice(0, table.variableCount)
  return table.rows.map((row) => ({
    inputs: row.slice(0, table.variableCount),
    term: assignmentTermLatex(variables, row),
    output: row.at(-1)!,
  }))
}

/** Keep small formulas separate so even 64 minterms remain renderable in notes. */
export function truthBoardMarkdown(table: TruthTable, results: boolean, labels: { term: string; sum: string }): string {
  const variables = table.columns.slice(0, table.variableCount)
  const rows = truthBoardRows(table)
  const line = (cells: (string | number)[]) => `| ${cells.join(' | ')} |`
  const header = [...variables.map((name) => `$${logicVariableLatex(name)}$`), labels.term, '$Y$']
  const markdown = [
    line(header),
    line(header.map(() => '---')),
    ...rows.map((row) => line([...row.inputs, `$${row.term}$`, results ? (row.output === 1 ? '**1**' : 0) : ''])),
  ].join('\n')
  const ones = rows.filter((row) => row.output === 1)
  const sum = results
    ? `\n\n**${labels.sum}**\n\n$Y =$ ${ones.length ? ones.map((row) => `$${row.term}$`).join(' + ') : '$0$'}`
    : ''
  return `\n\n${markdown}${sum}\n\n`
}
