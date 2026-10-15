// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import { renderFormula } from './math'

describe('bounded local formula rendering', () => {
  it('renders fractions, aligned equations, sets and matrices with accessible MathML', () => {
    for (const latex of ['\\frac{x^2+1}{2}', '\\forall x\\in\\R', '\\sum_{i=1}^{n}i',
      '\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}', '\\begin{aligned}x&=1\\\\y&=2\\end{aligned}']) {
      const html = renderFormula(latex, true)
      expect(html).toContain('<math')
      expect(html).toContain('katex')
    }
  })
  it('preserves invalid source and rejects oversized or recursively expanding expressions', () => {
    expect(renderFormula('\\frac{', false)).toBeNull()
    expect(renderFormula('x'.repeat(4001), false)).toBeNull()
    expect(renderFormula('\\def\\x{\\x}\\x', false)).toBeNull()
  })
  it('disables remote images, executable links and formula-to-formula macro mutation', () => {
    const html = renderFormula('\\href{javascript:alert(1)}{x}', false) ?? ''
    expect(html).not.toContain('href=')
    expect(renderFormula('\\includegraphics{https://example.invalid/x}', false) ?? '').not.toContain('<img')
    expect(renderFormula('\\gdef\\injected{42}1', false)).not.toBeNull()
    expect(renderFormula('\\injected', false)).toBeNull()
  })
})
