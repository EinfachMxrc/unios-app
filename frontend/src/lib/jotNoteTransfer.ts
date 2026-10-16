// SPDX-License-Identifier: AGPL-3.0-or-later

import { request } from '@/api'
import { appendBlocks, docText, linkInline, paragraph, parseBody } from '@/editor/doc'
import { documentPayload, withDraftBody } from '@/lib/noteBody'
import { keepNewNoteDraft, newNoteDraftFor, workingNoteDraftFor } from '@/noteDraft'
import { beginNewFreeNote, rememberSourceWorkingDraft, sourceWorkingDraft } from '@/lib/sourceNoteSave'
import type { Jot, NoteDetail } from '@/types'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BODY = 100_000

export class JotTransferBlocked extends Error {
  readonly reason: 'localDraft' | 'hostUnavailable' | 'wrongNote' | 'tooLong'
  constructor(reason: JotTransferBlocked['reason']) {
    super(reason)
    this.reason = reason
  }
}

export function jotSourceHref(id: string): string {
  if (!UUID.test(id)) throw new Error('Invalid jot identity')
  return `/jots#jot-${id.toLowerCase()}`
}

/** Exact source identity also makes an explicit retry safe after a lost ACK. */
export function includesJotSource(body: string, id: string): boolean {
  return body.includes(`"href":${JSON.stringify(jotSourceHref(id))}`)
}

function appendJot(body: string, jot: Pick<Jot, 'id' | 'body'>, sourceLabel: string): string {
  const paragraphs = jot.body.split(/\n{2,}/).filter((part) => part.trim())
  const next = appendBlocks(body, [
    ...paragraphs.map((part) => paragraph(part.trim())),
    paragraph([linkInline(sourceLabel, jotSourceHref(jot.id))]),
  ])
  if (docText(parseBody(next)).length > MAX_BODY) throw new JotTransferBlocked('tooLong')
  return next
}

function requireNoLocalDraft(id: string) {
  if (workingNoteDraftFor(id)) throw new JotTransferBlocked('localDraft')
}

/**
 * Copy is an explicit versioned note edit. Assignment remains a separate
 * metadata action; neither the original jot nor its existing relation changes.
 */
export async function transferJotToNote(
  jot: Pick<Jot, 'id' | 'body'>,
  noteId: string,
  courseId: number,
  sourceLabel: string,
  signal?: AbortSignal,
): Promise<{
  detail: NoteDetail
  alreadyLinked: boolean
}> {
  requireNoLocalDraft(noteId)
  const host = await request<{ mode: string; generation: number | null }>('/api/host', { cache: 'no-store', signal })
  if (host.mode !== 'host' || !Number.isSafeInteger(host.generation) || host.generation === null || host.generation < 1)
    throw new JotTransferBlocked('hostUnavailable')
  const detail = withDraftBody(await request<NoteDetail>(`/api/notes/${noteId}`, { cache: 'no-store', signal }))
  if (
    detail.note.id !== noteId ||
    detail.note.course_id !== courseId ||
    detail.selected_revision !== detail.note.current_revision
  )
    throw new JotTransferBlocked('wrongNote')
  requireNoLocalDraft(noteId)
  if (includesJotSource(detail.body, jot.id)) return { detail, alreadyLinked: true }
  const body = appendJot(detail.body, jot, sourceLabel)
  // request() may await host verification. A draft created during the request
  // stays untouched; a later draft save still has its own revision fence.
  // Concurrent server edits/host changes fail the existing revision/lease fence.
  const saved = await request<NoteDetail>(`/api/notes/${noteId}`, {
    method: 'PUT',
    signal,
    headers: { 'X-UniOS-Lease-Generation': String(host.generation) },
    body: JSON.stringify({
      title: detail.note.title,
      document: documentPayload(body),
      expected_revision: detail.note.current_revision,
    }),
  })
  return { detail: withDraftBody(saved), alreadyLinked: false }
}

/** Prepare the existing create form, keeping any earlier device draft intact. */
export function prepareJotNoteDraft(
  jot: Pick<Jot, 'id' | 'body'>,
  courseId: number,
  suggestedTitle: string,
  sourceLabel: string,
): string {
  const previous = newNoteDraftFor(courseId, null)
  const working = sourceWorkingDraft(courseId, null)
  const current = working && (!previous || previous.writeId === working.persisted?.writeId) ? working : previous
  const title = current?.title ?? suggestedTitle
  const currentBody = current?.body ?? ''
  const body = includesJotSource(currentBody, jot.id) ? currentBody : appendJot(currentBody, jot, sourceLabel)
  const prepared =
    previous?.title === title && previous.body === body ? previous : keepNewNoteDraft(courseId, null, title, body)
  if (working) rememberSourceWorkingDraft(courseId, null, { title, body, persisted: prepared, status: 'local' })
  // Only a clean completed composition may release its former UUID. Pending
  // creates or later RAM text still continue against their concrete receipt.
  // Preparation must succeed before the explicit new-document intent commits.
  beginNewFreeNote(courseId)
  return `/notes?new=1&course_id=${courseId}`
}
