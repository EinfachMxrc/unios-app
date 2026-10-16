// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import { bodyFromApi, docText, normalizeBlock, parseBody, serializeDoc, type NoteBlock, type NoteDoc } from './doc'
import { docToPm, pmToDoc } from './pmConvert'

const block = (id: string, type: NoteBlock['type'], rest: Partial<NoteBlock> = {}): NoteBlock => ({
  id,
  type,
  props: {},
  content: [],
  children: [],
  ...rest,
})
const text = (value: string, extra: object = {}) => ({ type: 'text' as const, text: value, ...extra })

const rich: NoteDoc = {
  version: 1,
  blocks: [
    block('h1aaaaaa', 'heading', { props: { level: 2 }, content: [text('Titel')] }),
    block('p1aaaaaa', 'paragraph', {
      content: [
        text('Fett', { marks: ['bold'] }),
        text(' und '),
        text('markiert', { marks: ['highlight', 'italic'], color: 'green' }),
        { type: 'wikilink', title: 'Andere Notiz' },
        { type: 'math', latex: 'x^2' },
        text('Link', { href: 'https://example.org' }),
        text('Zeile\nzwei'),
      ],
    }),
    block('b1aaaaaa', 'bullet', {
      content: [text('eins')],
      children: [block('b2aaaaaa', 'bullet', { content: [text('innen')] })],
    }),
    block('b3aaaaaa', 'bullet', { content: [text('zwei')] }),
    block('t1aaaaaa', 'todo', { props: { checked: true }, content: [text('fertig')] }),
    block('n1aaaaaa', 'numbered', { content: [text('a')] }),
    block('q1aaaaaa', 'quote', {
      content: [text('Zitat')],
      children: [block('p2aaaaaa', 'paragraph', { content: [text('mehr')] })],
    }),
    block('c1aaaaaa', 'callout', {
      props: { kind: 'definition', label: 'Basis' },
      children: [block('p3aaaaaa', 'paragraph', { content: [text('Inhalt')] })],
    }),
    block('g1aaaaaa', 'toggle', {
      content: [text('Beweis')],
      children: [block('p4aaaaaa', 'paragraph', { content: [text('Schritt')] })],
    }),
    block('k1aaaaaa', 'code', { props: { language: 'python' }, content: [text('print(1)\n\nprint(2)')] }),
    block('d1aaaaaa', 'divider'),
    block('tb1aaaaa', 'table', {
      props: {
        header: true,
        rows: [
          [[text('A')], [text('B')]],
          [[text('1')], [text('2')]],
        ],
      },
    }),
    block('m1aaaaaa', 'media', { props: { alt: 'Bild', kind: 'image', src: '/api/note-assets/x.png' } }),
    block('e1aaaaaa', 'entity', { props: { id: 3, kind: 'course', label: 'Prog' } }),
    block('eq1aaaaa', 'equation', { props: { latex: 'a+b' } }),
    block('s1aaaaaa', 'study', { props: { kind: 'recall', source: '{}' } }),
  ],
}

describe('block document <-> editor document', () => {
  it('round-trips every block type with its ids', () => {
    const doc = { version: 1 as const, blocks: rich.blocks.map(normalizeBlock) }
    expect(pmToDoc(docToPm(doc))).toEqual(doc)
  })

  it('treats a lone empty paragraph as an empty note', () => {
    expect(pmToDoc(docToPm({ version: 1, blocks: [] })).blocks).toEqual([])
  })

  it('keeps ids unique when a split block repeats its parent id', () => {
    const pm = docToPm({ version: 1, blocks: [block('p1aaaaaa', 'paragraph', { content: [text('a')] })] })
    pm.content!.push({ ...pm.content![0] })
    const ids = pmToDoc(pm).blocks.map((item) => item.id)
    expect(new Set(ids).size).toBe(2)
  })

  it('serializes one block per line so line merges become block merges', () => {
    const body = serializeDoc(rich)
    expect(body.split('\n')).toHaveLength(rich.blocks.length)
    expect(serializeDoc(parseBody(body))).toBe(body)
  })

  it('wraps pre-block text as paragraphs instead of dropping it', () => {
    const doc = parseBody('# Alt\n\nText aus der Zeit vor Blöcken')
    expect(doc.blocks.map((item) => item.type)).toEqual(['paragraph', 'paragraph'])
    expect(docText(doc)).toContain('Text aus der Zeit vor Blöcken')
  })

  it('canonicalises host documents so an unchanged note never looks edited', () => {
    const fromHost = {
      version: 1,
      blocks: [
        {
          id: 'p1aaaaaa',
          type: 'paragraph',
          props: {},
          children: [],
          content: [{ type: 'text', text: 'x', marks: [] }],
        },
      ],
    }
    const local = pmToDoc(docToPm(parseBody(bodyFromApi(fromHost))))
    expect(serializeDoc(local)).toBe(bodyFromApi(fromHost))
  })
})
