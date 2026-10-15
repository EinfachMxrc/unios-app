// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { editorExtensions } from '@/components/editor/extensions'
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
    expect(result.body).toContain('Vorlesung · 2026-10-14')
    expect(result.body).toContain('Synthetic.pdf · Version 2')
    for (const page of [5, 6, 7, 12]) expect(result.body).toContain(`/material/17?page=${page}`)
    expect(result.body).not.toContain('/material/17?page=8')
    expect(lectureCoverage(result.body, source, '2026-10-14')).toEqual({ date: '2026-10-14', pages: [5, 6, 7, 12] })
  })
  it('survives the real editor roundtrip and updates one day without removing personal text', () => {
    const original = recordLectureCoverage('Meine eigene Erklärung.', source, '2026-10-14', '5-7').body.replace(
      '\n\n:::',
      '\n\nMein Beispiel aus der Stunde.\n\n:::',
    )
    const editor = new Editor({ extensions: editorExtensions(), content: original, contentType: 'markdown' })
    try {
      const result = recordLectureCoverage(editor.getMarkdown(), source, '2026-10-14', '5-9')
      expect(result.body.match(/label="Vorlesung · 2026-10-14"/g)).toHaveLength(1)
      expect(result.body).toContain('Meine eigene Erklärung.')
      expect(result.body).toContain('Mein Beispiel aus der Stunde.')
      expect(lectureCoverage(result.body, source, '2026-10-14')?.pages).toEqual([5, 6, 7, 8, 9])
    } finally {
      editor.destroy()
    }
  })
  it('keeps older days and older PDF versions when adding a new lecture', () => {
    const old = recordLectureCoverage('', source, '2026-10-13', '1-3').body
    const result = recordLectureCoverage(old, { ...source, versionId: 18, version: 3 }, '2026-10-14', '5-7')
    expect(result.body).toContain('/material/17?page=2')
    expect(result.body).toContain('/material/18?page=6')
    expect(result.body).toContain('Vorlesung · 2026-10-13')
  })
  it('does not treat personal same-source page references as covered lecture pages', () => {
    const personal = 'Eigener Vergleich: [Seite 20](/material/17?page=20).'
    const body = recordLectureCoverage('', source, '2026-10-14', '5-7').body.replace(
      '\n\n:::',
      `\n\n${personal}\n\n:::`,
    )
    expect(lectureCoverage(body, source, '2026-10-14')?.pages).toEqual([5, 6, 7])
    const result = recordLectureCoverage(body, source, '2026-10-14', '5-9')
    expect(result.body).toContain(personal)
    expect(lectureCoverage(result.body, source, '2026-10-14')?.pages).toEqual([5, 6, 7, 8, 9])
  })
  it('keeps another PDF lecture block intact when its personal text links to the newly selected source', () => {
    const other: LectureSource = { ...source, resourceId: 6, versionId: 18, resourceName: 'Comparison.pdf' }
    const personal = 'Vergleich mit [anderem Skript](/material/18?page=20).'
    const original = recordLectureCoverage('', source, '2026-10-14', '5-7').body.replace(
      '\n\n:::',
      `\n\n${personal}\n\n:::`,
    )
    expect(lectureCoverage(original, other, '2026-10-14')).toBeNull()
    const result = recordLectureCoverage(original, other, '2026-10-14', '10-12')
    expect(result.body.startsWith(original)).toBe(true)
    expect(lectureCoverage(result.body, source, '2026-10-14')?.pages).toEqual([5, 6, 7])
    expect(lectureCoverage(result.body, other, '2026-10-14')?.pages).toEqual([10, 11, 12])
    const updated = recordLectureCoverage(result.body, other, '2026-10-14', '10-14')
    expect(updated.body.startsWith(original)).toBe(true)
    expect(updated.body).toContain(personal)
    expect(lectureCoverage(updated.body, other, '2026-10-14')?.pages).toEqual([10, 11, 12, 13, 14])
  })
  it('ignores source-like text inside an escaped filename when identifying the lecture source', () => {
    const named = { ...source, resourceName: 'Synthetic ](/material/18) script.pdf' }
    const result = recordLectureCoverage('', named, '2026-10-14', '5-7')
    expect(lectureCoverage(result.body, named, '2026-10-14')?.pages).toEqual([5, 6, 7])
    const updated = recordLectureCoverage(result.body, named, '2026-10-14', '5-9')
    expect(updated.body.match(/label="Vorlesung · 2026-10-14"/g)).toHaveLength(1)
  })
  it('selects only the last explicitly recorded lecture source despite appended personal references', () => {
    const first = recordLectureCoverage('', source, '2026-10-13', '5-7').body
    const second = recordLectureCoverage(first, { ...source, versionId: 18 }, '2026-10-14', '10-12').body
    const personal =
      '\nEigener Vergleich: [Skriptseite](/material/19?page=20).\n**Quelle:** [Eigene Quelle](/material/20)'
    expect(lastRecordedLectureSourceVersion(second + personal)).toBe(18)
    expect(lastRecordedLectureSourceVersion(personal)).toBeNull()
    const unrelated =
      '\n:::callout {kind="note" label="Eigene Erklärung"}\n\n**Quelle:** [Vergleich](/material/21)\n\n:::'
    expect(lastRecordedLectureSourceVersion(second + unrelated)).toBe(18)
  })
  it('validates dates and note size before changing the note', () => {
    expect(() => recordLectureCoverage('', source, '2026-02-30', '1')).toThrow()
    expect(() => recordLectureCoverage('x'.repeat(99_999), source, '2026-10-14', '1')).toThrow()
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
