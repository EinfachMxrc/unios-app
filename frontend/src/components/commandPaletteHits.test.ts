// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import { selectCommandPaletteHits } from './commandPaletteHits'
import { paletteSearchFixture } from './commandPalette.testFixtures'

describe('fair command palette results', () => {
  it('gives all seven populated types a slot even with fifty PDF and annotation hits', () => {
    const response = paletteSearchFixture(50)
    const original = JSON.stringify(response)
    const hits = selectCommandPaletteHits(response)
    expect(hits.map((hit) => hit.kind)).toEqual([
      'document',
      'annotation',
      'announcement',
      'course_note',
      'note',
      'jot',
      'clip',
    ])
    expect(hits.map((hit) => hit.label)).toEqual([
      'synthetic-document-0',
      'synthetic-annotation-0',
      'synthetic-announcement-0',
      'synthetic-course-note-0',
      'synthetic-note-0',
      'synthetic-jot-0',
      'synthetic-clip-0',
    ])
    expect(JSON.stringify(response)).toBe(original)
  })

  it.each([
    ['results', 'document'],
    ['annotation_results', 'annotation'],
    ['announcement_results', 'announcement'],
    ['course_note_results', 'course_note'],
    ['note_results', 'note'],
    ['jot_results', 'jot'],
    ['clip_results', 'clip'],
  ] as const)('fills all seven slots from %s alone without changing ranking', (field, kind) => {
    const complete = paletteSearchFixture(15)
    const response = { ...paletteSearchFixture(0), [field]: complete[field] }
    const hits = selectCommandPaletteHits(response)
    expect(hits).toHaveLength(7)
    expect(hits.every((hit) => hit.kind === kind)).toBe(true)
    expect(hits.map((hit) => hit.excerpt)).toEqual(complete[field].slice(0, 7).map((hit) => hit.excerpt))
  })

  it('skips empty and exhausted categories and fills remaining slots in rounds', () => {
    const response = paletteSearchFixture(0)
    const complete = paletteSearchFixture(20)
    response.results = complete.results
    response.note_results = complete.note_results.slice(0, 2)
    expect(selectCommandPaletteHits(response).map((hit) => hit.key)).toEqual([
      'document-10-1',
      'note-synthetic-note-0',
      'document-11-2',
      'note-synthetic-note-1',
      'document-12-3',
      'document-13-4',
      'document-14-5',
    ])
  })

  it('returns every hit when fewer than seven exist and none for an empty response', () => {
    const response = paletteSearchFixture(0)
    expect(selectCommandPaletteHits(response)).toEqual([])
    response.note_results = paletteSearchFixture(2).note_results
    expect(selectCommandPaletteHits(response)).toHaveLength(2)
  })

  it('preserves PDF page, annotation anchor, course, note, jot, clip and external forum destinations', () => {
    const response = paletteSearchFixture()
    expect(selectCommandPaletteHits(response).map((hit) => hit.to)).toEqual([
      '/material/10?page=1',
      '/material/10#annotation-synthetic-annotation-0',
      'https://example.org/forum/0',
      '/courses/1',
      '/notes?id=synthetic-note-0',
      '/jots#jot-synthetic-jot-0',
      '/inbox#clip-synthetic-clip-0',
    ])
    response.announcement_results[0].url = null
    expect(selectCommandPaletteHits(response)[2].to).toBe('/courses/1')
    expect(selectCommandPaletteHits(response)[5].course).toBeNull()
  })
})

describe('filtered command palette results', () => {
  it('fills every slot from the chosen types instead of thinning the mixed list', () => {
    const hits = selectCommandPaletteHits(paletteSearchFixture(20), { kinds: ['document', 'note'] })
    expect(hits).toHaveLength(7)
    expect(new Set(hits.map((hit) => hit.kind))).toEqual(new Set(['document', 'note']))
  })

  it('keeps only hits from the chosen course, which drops course-less captures', () => {
    const hits = selectCommandPaletteHits(paletteSearchFixture(3), { course: 'synthetic-course' })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every((hit) => hit.course === 'synthetic-course')).toBe(true)
  })
})

it('shows search excerpts without the index markers around matches', () => {
  const response = paletteSearchFixture(0)
  response.results = paletteSearchFixture(1).results.map((item) => ({
    ...item,
    excerpt: '…die 【Schleifen】 und Python…',
  }))
  expect(selectCommandPaletteHits(response)[0].excerpt).toBe('…die Schleifen und Python…')
})
