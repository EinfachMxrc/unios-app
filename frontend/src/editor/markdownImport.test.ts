// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import { docText, parseBody } from './doc'
import { markdownToBlocks, markdownToBody } from './markdownImport'

describe('markdown snippets', () => {
  it('reads formulas and tables as their own parts', () => {
    const blocks = markdownToBlocks('Aus $x^2$ folgt\n\n$$\\frac{a}{b}$$\n\n| A | B |\n| --- | --- |\n| 1 | 2 |')
    expect(blocks.map((block) => block.type)).toEqual(['paragraph', 'equation', 'table'])
    expect(blocks[0].content.some((node) => node.type === 'math' && node.latex === 'x^2')).toBe(true)
    expect(blocks[1].props.latex).toBe('\\frac{a}{b}')
    expect((blocks[2].props.rows as unknown[][]).length).toBe(2)
    expect(markdownToBlocks('Preis 5 $ und 6 $ gesamt')[0].content).toHaveLength(1)
  })

  it('turns a page template into headings, to-dos and paragraphs', () => {
    const blocks = markdownToBlocks(
      '## Was ich können muss\n\n- [ ] \n\n## Nächster Schritt\n\nText mit **fett** und [[Notiz]].',
    )
    expect(blocks.map((block) => block.type)).toEqual(['heading', 'todo', 'heading', 'paragraph'])
    expect(blocks[0].props.level).toBe(2)
    expect(blocks[3].content.map((node) => node.type)).toEqual(['text', 'text', 'text', 'wikilink', 'text'])
  })

  it('keeps links, escapes and code literally', () => {
    const body = markdownToBody('Siehe [Seite 3](/material/2?page=3) und \\*kein Stern\\* mit `x*y`.')
    expect(parseBody(body).blocks[0].content[0]).toMatchObject({ text: 'Siehe ' })
    expect(body).toContain('"href":"/material/2?page=3"')
    const text = docText(parseBody(body))
    expect(text).toBe('Siehe Seite 3 und *kein Stern* mit x*y.')
  })

  it('reads fenced code and quotes', () => {
    const blocks = markdownToBlocks('> Zitat\n\n```python\nprint(1)\n```')
    expect(blocks.map((block) => block.type)).toEqual(['quote', 'code'])
    expect(blocks[1].props.language).toBe('python')
  })
})
