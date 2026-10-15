// SPDX-License-Identifier: AGPL-3.0-or-later
import type { components } from '@/generated/api'
import type { ManualCardSource, ManualCardResponse } from '@/manualCardTypes'

export type NoteCardInput = components['schemas']['NoteCardInput']
export type NoteCardResponse = components['schemas']['NoteCardResponse']
export type NoteCardSource = components['schemas']['NoteCardSource']
export type OwnCardSource = ManualCardSource | NoteCardSource
export type OwnCardResponse = ManualCardResponse | NoteCardResponse
export type NoteCardContext = {
  noteId: string
  revision: number
  title: string
  courseId: number
  courseName: string
  quote: string
}
export function isNoteCardSource(source: OwnCardSource): source is NoteCardSource {
  return 'kind' in source && source.kind === 'note'
}
/** Ignore cached URLs: only validated internal routes can open a source. */
export function ownCardSourceUrl(source: OwnCardSource): string | null {
  if (isNoteCardSource(source))
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(source.note_id) &&
      Number.isSafeInteger(source.revision) &&
      source.revision > 0
      ? `/notes?id=${source.note_id}&revision=${source.revision}`
      : null
  return Number.isSafeInteger(source.version_id) &&
    source.version_id > 0 &&
    Number.isSafeInteger(source.page) &&
    source.page > 0
    ? `/material/${source.version_id}?page=${source.page}`
    : null
}
export function ownCardSourceTitle(source: OwnCardSource) {
  return isNoteCardSource(source) ? source.note_title : source.resource_name
}
