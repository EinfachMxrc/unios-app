// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { docText, paragraph, parseBody, serializeDoc, linkInline } from '@/editor/doc'
import {
  recordLectureCoverage,
  parseLecturePages,
  lectureCoverage,
  lastRecordedLectureSourceVersion,
  lectureDraftPrompt,
  type LectureSource,
} from './lectureCoverage'

const source: LectureSource = {
  courseId: 1,
  resourceId: 5,
  versionId: 17,
  version: 2,
  resourceName: 'Synthetic.pdf',
  pageCount: 120,
}
/** A body that already holds personal text, in the stored block form. */
const withText = (...texts: string[]) => serializeDoc({ version: 1, blocks: texts.map((text) => paragraph(text)) })
/** Add a personal line inside the first recorded lecture block. */
function addPersonal(body: string, node: ReturnType<typeof paragraph>) {
  const doc = parseBody(body)
  doc.blocks.find((block) => block.type === 'callout')!.children.push(node)
  return serializeDoc(doc)
}
const callouts = (body: string, date: string) =>
  parseBody(body).blocks.filter((block) => block.type === 'callout' && block.props.label === `Vorlesung · ${date}`)

describe('portable lecture page context', () => {
  it('parses multiple ranges, removes duplicates and preserves noncontiguous pages', () => {
    expect(parseLecturePages('5-8, 7; 12–14, 18', 120)).toEqual([5, 6, 7, 8, 12, 13, 14, 18])
  })
  it.each(['', '0', '4-2', '-1', '121', '3,,5', '5-8oops', '1-201'])(
    'rejects invalid or excessive pages: %s',
    (input) => {
      expect(() => parseLecturePages(input, 120)).toThrow()
    },
  )
  it('records only context in an empty note with exact source-version links', () => {
    const result = recordLectureCoverage('', source, '2026-10-14', '5-7, 12')
    const text = JSON.stringify(parseBody(result.body))
    expect(docText(parseBody(result.body))).toContain('Vorlesung · 2026-10-14')
    expect(text).toContain('Synthetic.pdf · Version 2')
    for (const page of [5, 6, 7, 12]) expect(text).toContain(`/material/17?page=${page}`)
    expect(text).not.toContain('/material/17?page=8')
    expect(lectureCoverage(result.body, source, '2026-10-14')).toEqual({ date: '2026-10-14', pages: [5, 6, 7, 12] })
  })
  it('updates one day without removing personal text', () => {
    const original = addPersonal(
      recordLectureCoverage(withText('Meine eigene Erklärung.'), source, '2026-10-14', '5-7').body,
      paragraph('Mein Beispiel aus der Stunde.'),
    )
    const result = recordLectureCoverage(original, source, '2026-10-14', '5-9')
    expect(callouts(result.body, '2026-10-14')).toHaveLength(1)
    expect(docText(parseBody(result.body))).toContain('Meine eigene Erklärung.')
    expect(docText(parseBody(result.body))).toContain('Mein Beispiel aus der Stunde.')
    expect(lectureCoverage(result.body, source, '2026-10-14')?.pages).toEqual([5, 6, 7, 8, 9])
  })
  it('keeps older days and older PDF versions when adding a new lecture', () => {
    const old = recordLectureCoverage('', source, '2026-10-13', '1-3').body
    const result = recordLectureCoverage(old, { ...source, versionId: 18, version: 3 }, '2026-10-14', '5-7')
    const text = JSON.stringify(parseBody(result.body))
    expect(text).toContain('/material/17?page=2')
    expect(text).toContain('/material/18?page=6')
    expect(callouts(result.body, '2026-10-13')).toHaveLength(1)
  })
  it('does not treat personal same-source page references as covered lecture pages', () => {
    const personal = paragraph([linkInline('Seite 20', '/material/17?page=20')])
    const body = addPersonal(recordLectureCoverage('', source, '2026-10-14', '5-7').body, personal)
    expect(lectureCoverage(body, source, '2026-10-14')?.pages).toEqual([5, 6, 7])
    const result = recordLectureCoverage(body, source, '2026-10-14', '5-9')
    expect(JSON.stringify(parseBody(result.body))).toContain('/material/17?page=20')
    expect(lectureCoverage(result.body, source, '2026-10-14')?.pages).toEqual([5, 6, 7, 8, 9])
  })
  it('keeps another PDF lecture block intact when its personal text links to the newly selected source', () => {
    const other: LectureSource = { ...source, resourceId: 6, versionId: 18, resourceName: 'Comparison.pdf' }
    const personal = paragraph([linkInline('anderem Skript', '/material/18?page=20')])
    const original = addPersonal(recordLectureCoverage('', source, '2026-10-14', '5-7').body, personal)
    expect(lectureCoverage(original, other, '2026-10-14')).toBeNull()
    const result = recordLectureCoverage(original, other, '2026-10-14', '10-12')
    expect(result.body.startsWith(original)).toBe(true)
    expect(lectureCoverage(result.body, source, '2026-10-14')?.pages).toEqual([5, 6, 7])
    expect(lectureCoverage(result.body, other, '2026-10-14')?.pages).toEqual([10, 11, 12])
    const updated = recordLectureCoverage(result.body, other, '2026-10-14', '10-14')
    expect(updated.body.startsWith(original)).toBe(true)
    expect(JSON.stringify(parseBody(updated.body))).toContain('/material/18?page=20')
    expect(lectureCoverage(updated.body, other, '2026-10-14')?.pages).toEqual([10, 11, 12, 13, 14])
  })
  it('ignores source-like text inside a filename when identifying the lecture source', () => {
    const named = { ...source, resourceName: 'Synthetic ](/material/18) script.pdf' }
    const result = recordLectureCoverage('', named, '2026-10-14', '5-7')
    expect(lectureCoverage(result.body, named, '2026-10-14')?.pages).toEqual([5, 6, 7])
    const updated = recordLectureCoverage(result.body, named, '2026-10-14', '5-9')
    expect(callouts(updated.body, '2026-10-14')).toHaveLength(1)
  })
  it('selects only the last explicitly recorded lecture source despite appended personal references', () => {
    const first = recordLectureCoverage('', source, '2026-10-13', '5-7').body
    const second = recordLectureCoverage(first, { ...source, versionId: 18 }, '2026-10-14', '10-12').body
    const personal = parseBody(second)
    personal.blocks.push(paragraph([linkInline('Skriptseite', '/material/19?page=20')]))
    personal.blocks.push(
      paragraph([{ type: 'text', text: 'Quelle:', marks: ['bold'] }, linkInline('Eigene Quelle', '/material/20')]),
    )
    expect(lastRecordedLectureSourceVersion(serializeDoc(personal))).toBe(18)
    expect(lastRecordedLectureSourceVersion(serializeDoc({ version: 1, blocks: personal.blocks.slice(-2) }))).toBeNull()
    const unrelated = parseBody(second)
    unrelated.blocks.push({
      id: 'unrelated1',
      type: 'callout',
      props: { kind: 'note', label: 'Eigene Erklärung' },
      content: [],
      children: [
        paragraph([{ type: 'text', text: 'Quelle:', marks: ['bold'] }, linkInline('Vergleich', '/material/21')]),
      ],
    })
    expect(lastRecordedLectureSourceVersion(serializeDoc(unrelated))).toBe(18)
  })
  it('validates dates and note size before changing the note', () => {
    expect(() => recordLectureCoverage('', source, '2026-02-30', '1')).toThrow()
    expect(() => recordLectureCoverage(withText('x'.repeat(99_999)), source, '2026-10-14', '1')).toThrow()
  })
  it('creates an explicit source-bound prompt without claiming actual lecture explanations', () => {
    const prompt = lectureDraftPrompt(source, { date: '2026-10-14', pages: [5, 6, 12] })
    expect(prompt).toContain('/material/17?page=5')
    expect(prompt).not.toContain('/material/17?page=7')
    expect(prompt).toContain('Version 2')
    expect(prompt).toContain('ohne meinen Auftrag')
    expect(prompt).toContain(':::callout {kind="memory"')
    expect(prompt).toContain('ohne Folieninhalte wegzukürzen')
    expect(prompt).toContain('eigene Erklärung')
  })
})
