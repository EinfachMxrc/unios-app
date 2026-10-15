// SPDX-License-Identifier: AGPL-3.0-or-later

export const mathTemplates = {
  fraction: '\\frac{#@}{#?}', root: '\\sqrt{#@}', power: '{#@}^{#?}', index: '{#@}_{#?}',
  sum: '\\sum_{#?}^{#?}#@', integral: '\\int_{#?}^{#?}#@\\,\\mathrm{d}x',
  matrix: '\\begin{pmatrix}#? & #? \\\\ #? & #?\\end{pmatrix}',
  limit: '\\lim_{x\\to #?}#@', derivative: '\\frac{\\mathrm{d}}{\\mathrm{d}x}#@',
  partial: '\\frac{\\partial #@}{\\partial #?}',
  cases: '\\begin{cases}#? & #? \\\\ #? & #?\\end{cases}',
  steps: '\\begin{aligned}#? &= #? \\\\ &= #?\\end{aligned}',
  system: '\\begin{cases}#? = #? \\\\ #? = #?\\end{cases}',
  vector: '\\begin{pmatrix}#? \\\\ #? \\\\ #?\\end{pmatrix}',
  binomial: '\\binom{#@}{#?}', product: '\\prod_{#?}^{#?}#@',
  absolute: '\\left|#@\\right|', norm: '\\left\\|#@\\right\\|',
  log: '\\log#@', complex: '#? + #?\\mathrm{i}',
  set: '\\{#@\\}', forall: '\\forall', exists: '\\exists', element: '\\in',
  pi: '\\pi', alpha: '\\alpha', arrow: '\\Rightarrow',
  naturals: '\\mathbb{N}', integers: '\\mathbb{Z}', rationals: '\\mathbb{Q}',
  reals: '\\mathbb{R}', complexes: '\\mathbb{C}', subset: '\\subseteq',
  intersection: '\\cap', union: '\\cup', infinity: '\\infty',
  probability: 'P\\left(#@\\mid #?\\right)', expectation: '\\mathbb{E}\\left[#@\\right]',
  modulo: '#@\\bmod #?', congruence: '#?\\equiv #?\\pmod{#?}',
} as const
export type MathTemplate = keyof typeof mathTemplates

export function matrixTemplate(rows: number, columns: number, square = false): string {
  if (![rows, columns].every(n => Number.isInteger(n) && n >= 1 && n <= 8)) throw new Error('dimensions')
  const environment = square ? 'bmatrix' : 'pmatrix'
  return `\\begin{${environment}}${Array.from({ length: rows }, () => Array(columns).fill('#?').join(' & ')).join(' \\\\ ')}\\end{${environment}}`
}
