// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { AssessmentCode, AssessmentInline, AssessmentQuestion } from './AssessmentQuestionContent'

afterEach(cleanup)

it('keeps explicit solution code literal even if it contains Markdown fences', () => {
  const source = '# literal\n```\n## not a heading\n$$x^2$$\n```'
  const { container } = render(<AssessmentCode text={source} language="python" />)
  expect(container.querySelector('pre > code')?.textContent).toBe(source)
  expect(container.querySelector('.katex')).toBeNull()
  expect(screen.queryByRole('heading')).toBeNull()
})

it('separates paragraph text for copying and displays double-dollar formulas inside prose', () => {
  const { container } = render(
    <AssessmentQuestion text={'First paragraph.\n\nSecond paragraph.\n\nSolve $$x^2=4$$ and explain.'} />,
  )
  expect(container.textContent).toContain('First paragraph.\nSecond paragraph.')
  expect(container.querySelector('.katex-display')).not.toBeNull()
  expect(container.querySelector('annotation')?.textContent).toBe('x^2=4')
  expect(container.textContent).toContain(' and explain.')
})

it('renders instructions as semantic headings and lists while retaining ordered start values', () => {
  render(
    <AssessmentQuestion
      text={[
        '## Synthetic transfer question',
        '',
        'Read **every** condition before answering.',
        '',
        '3. Explain `a > 0`.',
        '4. Compare both results.',
        '',
        '- Give one example.',
        '- Explain the exception.',
      ].join('\n')}
    />,
  )

  expect(screen.getByRole('heading', { name: 'Synthetic transfer question' })).toBeTruthy()
  const lists = screen.getAllByRole('list')
  expect(lists).toHaveLength(2)
  const ordered = lists.find((list) => list.tagName === 'OL')
  expect(ordered?.getAttribute('start')).toBe('3')
  expect(screen.getAllByRole('listitem')).toHaveLength(4)
  expect(screen.getByText('every').tagName).toBe('STRONG')
  expect(screen.getByText('a > 0').tagName).toBe('CODE')
})

it('renders all truth-table cells semantically with inline math and no lost rows', () => {
  const { container } = render(
    <AssessmentQuestion
      text={String.raw`| A | B | $A \land B$ |
| --- | --- | --- |
| 0 | 0 | **0** |
| 0 | 1 | 0 |
| 1 | 0 | 0 |
| 1 | 1 | \(1\) |`}
    />,
  )

  const table = screen.getByRole('table')
  expect(within(table).getAllByRole('columnheader')).toHaveLength(3)
  expect(within(table).getAllByRole('row')).toHaveLength(5)
  expect(within(table).getAllByRole('cell')).toHaveLength(12)
  expect(within(table).getAllByRole('row')[4].textContent).toContain('1')
  expect([...container.querySelectorAll('annotation')].map((node) => node.textContent)).toEqual([
    String.raw`A \land B`,
    '1',
  ])
  expect(table.closest('[tabindex="0"]')).toBeTruthy()
})

it('supports standard inline LaTeX alongside code and bold without eating neighbouring text', () => {
  const { container } = render(
    <AssessmentInline
      text={String.raw`Compare \(\frac{1}{2}\) with $x^2$, then inspect ` + '`return x;` and **explain**.'}
    />,
  )

  expect([...container.querySelectorAll('annotation')].map((node) => node.textContent)).toEqual([
    String.raw`\frac{1}{2}`,
    'x^2',
  ])
  expect(screen.getByText('return x;').tagName).toBe('CODE')
  expect(screen.getByText('explain').tagName).toBe('STRONG')
  expect(container.textContent).toContain('Compare ')
  expect(container.textContent).toContain(', then inspect ')
  expect(container.textContent).toContain(' and ')
  expect(container.textContent).toContain('.')
})

it('renders multiline dollars, bracket delimiters and same-line display formulas', () => {
  const { container } = render(
    <AssessmentQuestion
      text={String.raw`First formula:

$$
\sum_{i=1}^{3} i
$$

\[
\begin{pmatrix}1 & 0 \\ 0 & 1\end{pmatrix}
\]

$$x^2 + y^2 = z^2$$

Explain the result.`}
    />,
  )

  expect(container.querySelectorAll('.katex-display')).toHaveLength(3)
  expect([...container.querySelectorAll('annotation')].map((node) => node.textContent)).toEqual([
    String.raw`\sum_{i=1}^{3} i`,
    String.raw`\begin{pmatrix}1 & 0 \\ 0 & 1\end{pmatrix}`,
    'x^2 + y^2 = z^2',
  ])
  expect(screen.getByText('First formula:')).toBeTruthy()
  expect(screen.getByText('Explain the result.')).toBeTruthy()
})

it('keeps invalid LaTeX readable rather than dropping the exercise text', () => {
  const expression = String.raw`\notARealMathCommand{synthetic}`
  const { container } = render(<AssessmentQuestion text={`Before.\n\n$$\n${expression}\n$$\n\nAfter.`} />)

  expect(container.querySelector('.katex')).toBeNull()
  expect(screen.getByText(expression).tagName).toBe('CODE')
  expect(screen.getByText('Before.')).toBeTruthy()
  expect(screen.getByText('After.')).toBeTruthy()
})

it('preserves source indentation, string literals and mathematical delimiters inside code', () => {
  const source = [
    'function describe(value) {',
    '    const label = "<img src=x> $x^2$ **raw**";',
    '    if (value) {',
    '        return `example: ${label}`;',
    '    }',
    '    return "no result";',
    '}',
  ].join('\n')
  const { container } = render(
    <AssessmentQuestion text={`Read the code.\n\n\`\`\`javascript\n${source}\n\`\`\`\n\nExplain the output.`} />,
  )

  const code = container.querySelector('pre > code')
  expect(code?.textContent).toBe(source)
  expect(code?.closest('pre')?.tabIndex).toBe(0)
  expect(container.querySelector('.katex')).toBeNull()
  expect(container.querySelector('img')).toBeNull()
  expect(screen.getByText('Read the code.')).toBeTruthy()
  expect(screen.getByText('Explain the output.')).toBeTruthy()
})

it('displays an unknown study-widget fence as literal code without activating controls', () => {
  const source = ['question: Synthetic question', 'answer: Synthetic answer', 'reveal: automatic'].join('\n')
  const { container } = render(<AssessmentQuestion text={`\`\`\`unios-recall\n${source}\n\`\`\``} />)

  expect(container.querySelector('pre > code')?.textContent).toBe(source)
  expect(screen.queryByRole('button')).toBeNull()
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(container.querySelector('.recall-card')).toBeNull()
})

it('keeps imported HTML, image syntax and URLs passive text', () => {
  const source = [
    '<script>window.syntheticTaskExecuted = true</script>',
    '<img src="https://example.invalid/image.png" onerror="window.syntheticTaskExecuted = true">',
    '<iframe src="https://example.invalid/frame"></iframe>',
    '[Open](https://example.invalid/task)',
    '![Example](https://example.invalid/image.png)',
  ].join('\n\n')
  const { container } = render(<AssessmentQuestion text={source} />)

  expect(container.querySelector('script, img, iframe, a')).toBeNull()
  expect(screen.queryByRole('link')).toBeNull()
  expect(screen.queryByRole('img')).toBeNull()
  for (const line of source.split('\n\n')) expect(container.textContent).toContain(line)
})

it('does not grant trusted LaTeX commands permission to insert links or remote images', () => {
  const { container } = render(
    <AssessmentInline
      text={String.raw`\(\href{https://example.invalid}{answer}\) and \(\includegraphics{https://example.invalid/picture.png}\)`}
    />,
  )

  expect(container.querySelector('a, img, iframe')).toBeNull()
  expect(screen.queryByRole('link')).toBeNull()
  expect(screen.queryByRole('img')).toBeNull()
  expect(container.textContent?.length).toBeGreaterThan(0)
})

it('retains complete long prose and replaces old task content on rerender', () => {
  const source = 'Synthetic condition '.repeat(500) + 'FINAL CONDITION MUST REMAIN VISIBLE.'
  const view = render(<AssessmentQuestion text={source} />)

  expect(view.container.querySelector('.assessment-question-text')?.textContent).toBe(source)
  view.rerender(<AssessmentQuestion text={'## Next synthetic question\n\nA fresh instruction.'} />)
  expect(screen.getByRole('heading', { name: 'Next synthetic question' })).toBeTruthy()
  expect(screen.getByText('A fresh instruction.')).toBeTruthy()
  expect(view.container.textContent).not.toContain('FINAL CONDITION MUST REMAIN VISIBLE.')
})
