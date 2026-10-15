// SPDX-License-Identifier: AGPL-3.0-or-later

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearNewNoteDraft,
  draftFor,
  keepNewNoteDraft,
  newNoteDraftFor,
  rememberVolatileNoteDraft,
  workingNoteDraftFor,
} from '@/noteDraft'
import type { Material, NoteDetail } from '@/types'
import { chooseSourceNoteTarget } from '@/lib/sourceNoteTarget'
import { clearWorkspace } from '@/lib/workspaceState'
import { queryClient } from '@/offlineCache'
import { appendReaderExcerpt, ReaderExcerptError, READER_NOTE_BODY_LIMIT, readerNoteTitle } from './readerExcerpt'

const material: Material = {
  version_id: 17,
  resource_id: 4,
  course_id: 2,
  resource_name: 'Vorlesung 3.pdf',
  course_name: 'Erfundener Kurs',
  version: 1,
  versions: [{ id: 17, version: 1 }],
  annotations: [],
}

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  clearWorkspace()
  queryClient.clear()
})

describe('source-linked reader excerpts', () => {
  it('appends against the current RAM recovery body rather than an older durable body', () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const detail: NoteDetail = {
      note: {
        id,
        course_id: 2,
        resource_id: 4,
        course_name: 'Synthetic course',
        title: 'Lecture',
        current_revision: 3,
        created_at: '2026-10-09T10:00:00Z',
        updated_at: '2026-10-09T10:00:00Z',
      },
      body: 'Saved baseline',
      selected_revision: 3,
      versions: [],
    }
    queryClient.setQueryData(['api', `/api/notes/${id}`], detail)
    chooseSourceNoteTarget(2, 4, id)
    const ram = rememberVolatileNoteDraft({
      noteId: id,
      baseRevision: 2,
      baseTitle: 'Previous title',
      baseBody: 'Earlier baseline',
      title: 'Own title only in RAM',
      body: 'Newest explanation only in RAM',
    })
    appendReaderExcerpt({ material, quote: 'Related source', page: 80 })
    const appended = workingNoteDraftFor(id)!
    expect(appended.body).toContain(ram.body)
    expect(appended.body).toContain('/material/17?page=80')
    expect(appended.body).not.toContain(detail.body)
    expect(appended.baseRevision).toBe(ram.baseRevision)
    expect(appended.baseBody).toBe(ram.baseBody)
    expect(appended.title).toBe(ram.title)
  })

  it('adds successive PDF pages to the same normal note draft, retaining its original CAS base', () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const detail: NoteDetail = {
      note: {
        id,
        course_id: 2,
        resource_id: 4,
        course_name: 'Invented course',
        title: 'One lecture',
        current_revision: 3,
        created_at: '2026-10-09T10:00:00Z',
        updated_at: '2026-10-09T10:00:00Z',
      },
      body: 'Already saved lecture section',
      selected_revision: 3,
      versions: [],
    }
    queryClient.setQueryData(['api', `/api/notes/${id}`], detail)
    chooseSourceNoteTarget(2, 4, id)
    appendReaderExcerpt({ material, quote: 'First concept', page: 12 })
    queryClient.setQueryData(['api', `/api/notes/${id}`], {
      ...detail,
      note: { ...detail.note, current_revision: 4 },
      body: 'Foreign newer text',
    })
    appendReaderExcerpt({ material, quote: 'Related concept', page: 13 })
    const draft = draftFor(id)!
    expect(draft.noteId).toBe(id)
    expect(draft.baseRevision).toBe(3)
    expect(draft.baseBody).toBe(detail.body)
    expect(draft.body).toContain(detail.body)
    expect(draft.body).toContain('/material/17?page=12')
    expect(draft.body).toContain('/material/17?page=13')
    expect(newNoteDraftFor(2, 4)).toBeNull()
  })

  it('refuses to append against an unavailable or foreign selected note without inventing a new document', () => {
    chooseSourceNoteTarget(2, 4, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    expect(() => appendReaderExcerpt({ material, quote: 'Do not lose this', page: 2 })).toThrowError(ReaderExcerptError)
    expect(newNoteDraftFor(2, 4)).toBeNull()
  })
  it('creates a recoverable draft with the document title and exact page link', () => {
    const draft = appendReaderExcerpt({ material, quote: 'Ein wichtiger Kerngedanke.', page: 120 })
    expect(draft.title).toBe('Vorlesung 3')
    expect(draft.body).toBe('> Ein wichtiger Kerngedanke\\.\n\n[Vorlesung 3\\.pdf · 120](/material/17?page=120)\n\n')
    expect(newNoteDraftFor(2, 4)).toEqual(draft)
  })

  it('remembers exactly where on the page the quote stood', () => {
    const draft = appendReaderExcerpt({ material, quote: 'Genau hier.', page: 3, rects: [[0.1, 0.4, 0.6, 0.42]] })
    expect(draft.body).toContain('(/material/17?page=3&mark=0.1,0.4,0.6,0.42)')
  })

  it('preserves the entire existing body and chosen title when appending another source', () => {
    const previous = keepNewNoteDraft(2, 4, 'Eigene Zusammenfassung', '## Mein Gedanke\n\nDie Erklärung.  ')
    const next = appendReaderExcerpt({ material, quote: 'Zweite Quelle', page: 2 })
    expect(next.title).toBe(previous.title)
    expect(next.body.startsWith(previous.body)).toBe(true)
    expect(next.body).toContain('Die Erklärung.  \n\n> Zweite Quelle')
    expect(next.writeId).not.toBe(previous.writeId)
  })

  it('keeps multiline quotation and filenames literal instead of executable Markdown', () => {
    const draft = appendReaderExcerpt({
      material: { ...material, resource_name: '[x](https://fake.invalid) <b>$x$.pdf' },
      quote: '**fett**\n<script>alert(1)</script>\n[x](javascript:alert(1))\n# heading\n$math$ & `code`',
      page: 3,
    })
    expect(draft.body).toContain('> \\*\\*fett\\*\\*\n> &lt;script&gt;alert\\(1\\)&lt;/script&gt;')
    expect(draft.body).toContain('> \\[x\\]\\(javascript:alert\\(1\\)\\)')
    expect(draft.body).toContain('> \\# heading\n> \\$math\\$ &amp; \\`code\\`')
    expect(draft.body).toContain(
      '[\\[x\\]\\(https://fake\\.invalid\\) &lt;b&gt;\\$x\\$\\.pdf · 3](/material/17?page=3)',
    )
    expect(draft.body).not.toContain('<script>')
  })

  it('isolates recovery copies by source and course', () => {
    keepNewNoteDraft(2, 9, 'Andere Quelle', 'Unverändert')
    keepNewNoteDraft(3, 4, 'Anderer Kurs', 'Unverändert')
    const draft = appendReaderExcerpt({ material, quote: 'Meine Quelle', page: 1 })
    expect(draft.body).not.toContain('Unverändert')
    expect(newNoteDraftFor(2, 9)?.body).toBe('Unverändert')
    expect(newNoteDraftFor(3, 4)?.body).toBe('Unverändert')
  })

  it('reports a quota failure without replacing the previously recoverable draft', () => {
    const previous = keepNewNoteDraft(2, 4, 'Vorhanden', 'Darf nicht verschwinden')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })
    expect(() => appendReaderExcerpt({ material, quote: 'Weitere Quelle', page: 1 })).toThrowError(
      expect.objectContaining({ code: 'storage' }),
    )
    expect(newNoteDraftFor(2, 4)).toEqual(previous)
  })

  it('reports inaccessible browser storage before treating an unreadable draft as empty', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Access denied', 'SecurityError')
    })
    expect(() => appendReaderExcerpt({ material, quote: 'Weitere Quelle', page: 1 })).toThrowError(
      expect.objectContaining({ code: 'storage' }),
    )
  })

  it('normalises whitespace in a filename so its source label cannot create a Markdown block', () => {
    const draft = appendReaderExcerpt({
      material: { ...material, resource_name: 'Datei\n\n# neuer Block.pdf' },
      quote: 'Eine Quelle',
      page: 2,
    })
    expect(draft.title).toBe('Datei # neuer Block')
    expect(draft.body).toContain('[Datei \\# neuer Block\\.pdf · 2](/material/17?page=2)')
    expect(draft.body).not.toContain('\n# neuer Block')
  })

  it('rejects an overflowing draft before writing, leaving its content and writeId intact', () => {
    const previous = keepNewNoteDraft(2, 4, 'Lang', 'x'.repeat(READER_NOTE_BODY_LIMIT - 5))
    expect(() => appendReaderExcerpt({ material, quote: 'Weitere Quelle', page: 1 })).toThrowError(
      expect.objectContaining({ code: 'tooLong' }),
    )
    expect(newNoteDraftFor(2, 4)).toEqual(previous)
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects an invalid page %s without writing', (page) => {
    expect(() => appendReaderExcerpt({ material, quote: 'Weitere Quelle', page })).toThrowError(ReaderExcerptError)
    expect(newNoteDraftFor(2, 4)).toBeNull()
  })

  it('does not clear edits appended while an earlier server save is in flight', () => {
    const captured = appendReaderExcerpt({ material, quote: 'Wird gespeichert', page: 1 })
    const newer = appendReaderExcerpt({ material, quote: 'Kam während des Speicherns dazu', page: 2 })
    if ('courseId' in captured) clearNewNoteDraft(captured)
    expect(newNoteDraftFor(2, 4)).toEqual(newer)
    if ('courseId' in newer) clearNewNoteDraft(newer)
    expect(newNoteDraftFor(2, 4)).toBeNull()
  })

  it('limits a derived title while preserving filenames without an extension', () => {
    expect(readerNoteTitle({ ...material, resource_name: 'Lernstoff' })).toBe('Lernstoff')
    expect(readerNoteTitle({ ...material, resource_name: `${'A'.repeat(250)}.pdf` })).toHaveLength(200)
  })
})
