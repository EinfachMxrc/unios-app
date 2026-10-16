// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  workingNoteDraftFor,
  keepDraft,
  keepNewNoteDraft,
  newNoteDraftFor,
  type NewNoteDraft,
  type NoteDraft,
} from '@/noteDraft'
import type { Material, NoteDetail } from '@/types'
import { request } from '@/api'
import { restoreSourceNoteTarget, sourceNoteTarget } from '@/lib/sourceNoteTarget'
import { queryClient } from '@/offlineCache'
import {
  appendBlocks,
  docText,
  linkInline,
  paragraph,
  parseBody,
  quote as quoteBlock,
  type NoteBlock,
} from '@/editor/doc'
import { withDraftBody } from '@/lib/noteBody'
import { encodeMark, type PassageRects } from './passageLink'

/** Matches the note creation contract in app/web/api.py. */
export const READER_NOTE_BODY_LIMIT = 100_000
export const READER_NOTE_TITLE_LIMIT = 200

export class ReaderExcerptError extends Error {
  readonly code: 'storage' | 'tooLong' | 'invalid'

  constructor(code: ReaderExcerptError['code']) {
    super(code)
    this.name = 'ReaderExcerptError'
    this.code = code
  }
}

export function readerNoteTitle(material: Pick<Material, 'resource_name' | 'resource_id'>): string {
  const name = material.resource_name.replace(/\s+/g, ' ').trim()
  return (name.replace(/\.[a-z0-9]{1,10}$/i, '') || name || String(material.resource_id)).slice(
    0,
    READER_NOTE_TITLE_LIMIT,
  )
}

/**
 * The notes drawer mounts the pieces that restore the saved target note and load it. A quote
 * or clip taken while the drawer is still closed needs both first, otherwise it lands in a
 * new draft (target unknown) or fails (target note not loaded).
 */
export async function prepareReaderTarget(material: Pick<Material, 'course_id' | 'resource_id'>): Promise<void> {
  try {
    await restoreSourceNoteTarget(material.course_id, material.resource_id)
  } catch {
    // Do not guess: writing into a new draft would hide the user's chosen note.
    throw new ReaderExcerptError('storage')
  }
  const noteId = sourceNoteTarget(material.course_id, material.resource_id)
  if (!noteId) return
  const queryKey = ['api', `/api/notes/${noteId}`]
  if (queryClient.getQueryData<NoteDetail>(queryKey) !== undefined) return
  try {
    await queryClient.fetchQuery({
      queryKey,
      queryFn: ({ signal }) => request<NoteDetail>(`/api/notes/${noteId}`, { signal }),
    })
  } catch {
    throw new ReaderExcerptError('storage')
  }
}

export function appendReaderExcerpt({
  material,
  quote,
  page,
  rects = [],
}: {
  material: Material
  quote: string
  page: number
  /** Where the quote sits on the page, so the source link can show exactly that spot. */
  rects?: PassageRects
}): NewNoteDraft | NoteDraft {
  const text = quote.replace(/\r\n?/g, '\n').trim()
  if (
    text.length < 2 ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    ![material.course_id, material.resource_id, material.version_id].every((id) => Number.isSafeInteger(id) && id > 0)
  )
    throw new ReaderExcerptError('invalid')

  // Quoted PDF text is literal content: each line becomes a quote block, never markup.
  const mark = encodeMark(rects)
  const label = `${material.resource_name.replace(/\s+/g, ' ').trim()} · ${page}`
  const href = `/material/${material.version_id}?page=${page}${mark ? `&mark=${mark}` : ''}`
  return appendReaderBlock(material, [
    ...text.split('\n').map((line) => quoteBlock(line)),
    paragraph([linkInline(label, href)]),
  ])
}

export function appendReaderBlock(material: Material, blocks: NoteBlock[]): NewNoteDraft | NoteDraft {
  if (
    !blocks.length ||
    ![material.course_id, material.resource_id, material.version_id].every((id) => Number.isSafeInteger(id) && id > 0)
  )
    throw new ReaderExcerptError('invalid')
  try {
    // draftFor intentionally tolerates unavailable storage. Do not append to an
    // apparently empty draft when the browser cannot read any recovery copies.
    void localStorage.getItem(`unios:new-note-draft:v1:${material.course_id}:${material.resource_id}`)
  } catch {
    throw new ReaderExcerptError('storage')
  }
  const noteId = sourceNoteTarget(material.course_id, material.resource_id)
  if (noteId) {
    const cached = queryClient.getQueryData<NoteDetail>(['api', `/api/notes/${noteId}`])
    if (!cached || cached.note.id !== noteId || cached.note.course_id !== material.course_id)
      throw new ReaderExcerptError('invalid')
    const baseline = withDraftBody(cached)
    const draft = workingNoteDraftFor(noteId)
    const body = appendBlocks(draft?.body ?? baseline.body, blocks)
    if (docText(parseBody(body)).length > READER_NOTE_BODY_LIMIT) throw new ReaderExcerptError('tooLong')
    try {
      return keepDraft({
        noteId,
        baseRevision: draft?.baseRevision ?? baseline.note.current_revision,
        baseTitle: draft?.baseTitle ?? baseline.note.title,
        baseBody: draft?.baseBody ?? baseline.body,
        title: draft?.title ?? baseline.note.title,
        body,
      })
    } catch {
      throw new ReaderExcerptError('storage')
    }
  }
  const existing = newNoteDraftFor(material.course_id, material.resource_id)
  const body = appendBlocks(existing?.body ?? '', blocks)
  if (docText(parseBody(body)).length > READER_NOTE_BODY_LIMIT) throw new ReaderExcerptError('tooLong')

  try {
    return keepNewNoteDraft(
      material.course_id,
      material.resource_id,
      existing?.title ?? readerNoteTitle(material),
      body,
    )
  } catch {
    throw new ReaderExcerptError('storage')
  }
}
