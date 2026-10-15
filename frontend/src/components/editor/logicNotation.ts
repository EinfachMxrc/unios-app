// SPDX-License-Identifier: AGPL-3.0-or-later

/** Presentation only: x1 becomes x₁; the parser's variable identity is unchanged. */
export function logicVariableLatex(name: string): string {
  const indexed = /^([A-Za-z])([0-9]+)$/.exec(name)
  if (indexed) return `${indexed[1]}_{${indexed[2]}}`
  return name.length === 1 ? name : `\\mathrm{${name.replaceAll('_', '\\_')}}`
}

export function assignmentTermLatex(variables: string[], values: number[]): string {
  return (
    variables
      .map((name, i) => {
        const variable = logicVariableLatex(name)
        return values[i] === 0 ? `\\overline{${variable}}` : variable
      })
      .join('\\,') || '1'
  )
}
