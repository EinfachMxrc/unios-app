// SPDX-License-Identifier: AGPL-3.0-or-later

import katex from 'katex'
import 'katex/dist/katex.min.css'

export const MAX_FORMULA_LENGTH = 4000

// Bound imported formulas as well as input. A fresh macro map prevents one
// expression from changing how another note is displayed.
export function renderFormula(latex: string, displayMode: boolean): string | null {
  if (!latex.trim() || latex.length > MAX_FORMULA_LENGTH) return null
  try {
    return katex.renderToString(latex, {
      displayMode,
      output: 'htmlAndMathml',
      trust: false,
      throwOnError: true,
      strict: 'ignore',
      maxExpand: 200,
      maxSize: 20,
      macros: {
        '\\xor': '\\oplus',
        '\\N': '\\mathbb{N}',
        '\\Z': '\\mathbb{Z}',
        '\\Q': '\\mathbb{Q}',
        '\\R': '\\mathbb{R}',
        '\\C': '\\mathbb{C}',
        '\\differentialD': '\\mathrm{d}',
        '\\imaginaryI': '\\mathrm{i}',
        '\\imaginaryJ': '\\mathrm{j}',
        '\\exponentialE': '\\mathrm{e}',
      },
    })
  } catch {
    return null
  }
}
