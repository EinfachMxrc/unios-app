// SPDX-License-Identifier: AGPL-3.0-or-later

import { MAX_FORMULA_LENGTH } from './math'

const operators: Record<string, string> = {
  '<->': '\\leftrightarrow',
  '<=>': '\\Leftrightarrow',
  '->': '\\to',
  '=>': '\\Rightarrow',
  '↔': '\\leftrightarrow',
  '⇔': '\\Leftrightarrow',
  '→': '\\to',
  '⇒': '\\Rightarrow',
  '!': '\\lnot',
  '~': '\\lnot',
  '¬': '\\lnot',
  '*': '\\land',
  '&': '\\land',
  '&&': '\\land',
  '∧': '\\land',
  '·': '\\land',
  '⋅': '\\land',
  '+': '\\lor',
  '|': '\\lor',
  '||': '\\lor',
  '∨': '\\lor',
  '^': '\\oplus',
  '⊕': '\\oplus',
}

// Presentation only: retain each side of an equation exactly as written.
// ASCII shortcuts are opt-in, so arithmetic plus and factorial stay unchanged.
export function logicFormula(source: string): string | null {
  if (!source.trim() || source.length > MAX_FORMULA_LENGTH) return null
  const pattern = /\s+|<->|<=>|->|=>|&&|\|\||[A-Za-z][A-Za-z0-9_]*|[01]|[!~¬*&∧·⋅+|∨^⊕↔⇔→⇒=(),]/y
  const parts: string[] = []
  let offset = 0
  while (offset < source.length) {
    pattern.lastIndex = offset
    const token = pattern.exec(source)?.[0]
    if (!token) return null
    offset = pattern.lastIndex
    if (/^\s+$/.test(token)) continue
    parts.push(operators[token] ?? (token.length > 1 ? `\\mathrm{${token.replaceAll('_', '\\_')}}` : token))
  }
  const latex = parts.join(' ')
  return latex.length <= MAX_FORMULA_LENGTH ? latex : null
}
